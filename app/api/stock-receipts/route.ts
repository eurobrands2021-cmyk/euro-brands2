import { Prisma, type Branch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { parseStockReceiptInput, ValidationError } from "@/lib/validate";
import { round2 } from "@/lib/sale-utils";
import { toStockReceiptDTO } from "@/lib/serializers";
import {
  MOCK_MODE,
  mockListStockReceipts,
  mockCreateStockReceipt,
} from "@/lib/mock-store";
import type { StockReceiptDTO, StockReceiptsListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const receiptInclude = {
  supplier: { select: { name: true } },
  items: {
    include: {
      variant: {
        include: { product: { select: { name: true, brand: true } } },
      },
    },
  },
} satisfies Prisma.StockReceiptInclude;

// GET /api/stock-receipts — سجل الاستلام (فلاتر: supplierId / branch / from / to)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE)
      return ok(mockListStockReceipts(searchParams), 200, CACHE_NONE);

    const supplierId = searchParams.get("supplierId");
    const branch = searchParams.get("branch");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.StockReceiptWhereInput = {};
    if (supplierId) where.supplierId = supplierId;
    if (branch) where.branch = branch as Branch;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const rows = await prisma.stockReceipt.findMany({
      where,
      include: receiptInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const receipts: StockReceiptDTO[] = rows.map(toStockReceiptDTO);
    const summary = receipts.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.totalCost = round2(acc.totalCost + r.totalCost);
        acc.totalQuantity += r.quantity;
        return acc;
      },
      { count: 0, totalCost: 0, totalQuantity: 0 }
    );

    const payload: StockReceiptsListResponse = {
      receipts,
      total: receipts.length,
      summary,
    };
    return ok(payload, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/stock-receipts — تنفيذ استلام بضاعة داخل معاملة:
//   • تُزاد كمية كل صنف في مخزونه
//   • تُحدَّث تكلفة الوحدة (متوسط مرجّح) لكل صنف
//   • يُسجَّل رأس الاستلام وبنوده + قيد في سجل النشاط
export async function POST(req: Request) {
  try {
    const input = parseStockReceiptInput(await req.json());

    if (MOCK_MODE) {
      const res = mockCreateStockReceipt(input);
      return res.ok ? ok(res.data, 201) : fail(res.error ?? "خطأ", res.status);
    }

    const result = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: input.supplierId },
      });
      if (!supplier)
        return { ok: false as const, error: "المورد غير موجود", status: 404 };

      let totalCost = 0;

      for (const line of input.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: line.variantId },
        });
        if (!variant)
          return {
            ok: false as const,
            error: "أحد الأصناف غير موجود في المخزون",
            status: 422,
          };

        // متوسط مرجّح للتكلفة: (كمية قديمة×تكلفة قديمة + كمية مستلمة×تكلفة) / الإجمالي
        const oldQty = variant.quantity;
        const oldCost = variant.cost ?? 0;
        const newQty = oldQty + line.quantity;
        const weightedCost =
          newQty > 0
            ? round2((oldQty * oldCost + line.quantity * line.unitCost) / newQty)
            : round2(line.unitCost);

        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            quantity: { increment: line.quantity },
            cost: weightedCost,
          },
        });

        totalCost = round2(totalCost + line.unitCost * line.quantity);
      }

      const created = await tx.stockReceipt.create({
        data: {
          supplierId: input.supplierId,
          branch: input.branch as Branch,
          invoiceNumber: input.invoiceNumber,
          totalCost,
          notes: input.notes,
          createdBy: input.createdBy,
          items: {
            create: input.items.map((it) => ({
              variantId: it.variantId,
              quantity: it.quantity,
              unitCost: it.unitCost,
            })),
          },
        },
        include: receiptInclude,
      });

      const totalQty = input.items.reduce((s, it) => s + it.quantity, 0);
      await tx.activityLog.create({
        data: {
          userName: input.createdBy || "النظام",
          userRole: "ADMIN",
          action: "استلام بضاعة",
          details: `${supplier.name} — ${totalQty} قطعة — تكلفة ${totalCost} ج.م`,
        },
      });

      return { ok: true as const, data: created };
    });

    if (!result.ok) return fail(result.error, result.status);
    return ok(toStockReceiptDTO(result.data), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
