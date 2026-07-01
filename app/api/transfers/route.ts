import { Prisma, type Branch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toStockTransferDTO } from "@/lib/serializers";
import { parseStockTransferInput, ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockListTransfers,
  mockCreateTransfer,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

const transferInclude = {
  items: {
    include: {
      product: { select: { name: true, brand: true } },
      variant: { select: { sku: true, quantity: true } },
    },
  },
} satisfies Prisma.StockTransferInclude;

// GET /api/transfers — قائمة تحويلات المخزون مع الفلاتر (فرع/حالة/تاريخ)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListTransfers(searchParams));

    const branch = searchParams.get("branch");
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.StockTransferWhereInput = {};
    if (branch) where.OR = [{ fromBranch: branch as Branch }, { toBranch: branch as Branch }];
    if (status) where.status = status as Prisma.StockTransferWhereInput["status"];
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: transferInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return ok(transfers.map(toStockTransferDTO));
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/transfers — إنشاء تحويل جديد (حالة قيد الانتظار، دون خصم من المخزون)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseStockTransferInput(body);

    if (MOCK_MODE) return ok(mockCreateTransfer(input), 201);

    const variantIds = input.items.map((it) => it.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { name: true } } },
    });
    const vmap = new Map(variants.map((v) => [v.id, v]));

    const itemsData = input.items.map((it) => {
      const v = vmap.get(it.variantId);
      if (!v) throw new ValidationError("أحد الأصناف لم يعد متاحاً في المخزون");
      if (v.branch !== (input.fromBranch as Branch))
        throw new ValidationError(
          `الصنف "${v.product.name}" لا ينتمي لفرع المصدر`
        );
      if (v.quantity < it.quantity)
        throw new ValidationError(
          `الكمية غير كافية من "${v.product.name}" مقاس ${v.size} (المتاح: ${v.quantity})`
        );
      return {
        productId: v.productId,
        variantId: v.id,
        size: v.size,
        color: v.color,
        quantity: it.quantity,
      };
    });

    const transfer = await prisma.stockTransfer.create({
      data: {
        fromBranch: input.fromBranch as Branch,
        toBranch: input.toBranch as Branch,
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? null,
        items: { create: itemsData },
      },
      include: transferInclude,
    });

    return ok(toStockTransferDTO(transfer), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
