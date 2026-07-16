import { Prisma, type Branch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { parseReturnInput, ValidationError } from "@/lib/validate";
import { round2 } from "@/lib/sale-utils";
import { toReturnDTO } from "@/lib/serializers";
import {
  MOCK_MODE,
  mockCreateReturn,
  mockListReturns,
} from "@/lib/mock-store";
import type { ReturnDTO, ReturnsListResponse } from "@/lib/types";
import { RETURN_TYPE_LABELS, type ReturnTypeValue } from "@/lib/constants";

export const dynamic = "force-dynamic";

// تضمين موحّد لإثراء بنود المرتجع بأسماء المنتجات والصنف البديل + رقم الفاتورة
const returnInclude = {
  sale: { select: { saleNumber: true } },
  items: {
    include: {
      variant: {
        include: { product: { select: { name: true, brand: true } } },
      },
      exchangeVariant: {
        select: { size: true, color: true, price: true },
      },
    },
  },
} satisfies Prisma.ReturnInclude;

// نصيب الوحدة من الصافي بعد توزيع خصم الفاتورة العام على البنود
function unitNet(subtotal: number, quantity: number, ratio: number): number {
  if (quantity <= 0) return 0;
  return (subtotal / quantity) * ratio;
}

// GET /api/returns — قائمة المرتجعات مع فلاتر (branch / from / to / type / saleId)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListReturns(searchParams), 200, CACHE_NONE);

    const branch = searchParams.get("branch");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");
    const saleId = searchParams.get("saleId");

    const where: Prisma.ReturnWhereInput = {};
    if (branch) where.branch = branch as Branch;
    if (saleId) where.saleId = saleId;
    if (type === "RETURN" || type === "EXCHANGE") where.type = type;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const rows = await prisma.return.findMany({
      where,
      include: returnInclude,
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const returns: ReturnDTO[] = rows.map(toReturnDTO);
    const summary = returns.reduce(
      (acc, r) => {
        acc.count += 1;
        if (r.type === "EXCHANGE") acc.exchangeCount += 1;
        else acc.returnCount += 1;
        acc.refundTotal = round2(acc.refundTotal + r.refundTotal);
        return acc;
      },
      { count: 0, returnCount: 0, exchangeCount: 0, refundTotal: 0 }
    );

    const payload: ReturnsListResponse = {
      returns,
      total: returns.length,
      summary,
    };
    return ok(payload, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/returns — تنفيذ إرجاع/استبدال داخل معاملة واحدة:
//   • تعود كمية المُرتجَع إلى مخزون فرع الفاتورة
//   • للاستبدال: تُخصَم كمية الصنف البديل (تحقّق ذري من التوفّر)
//   • تُحسب قيمة الاسترداد/فرق السعر وتُسجَّل، مع قيد في سجل النشاط
export async function POST(req: Request) {
  try {
    const input = parseReturnInput(await req.json());

    if (MOCK_MODE) {
      const res = mockCreateReturn(input);
      return res.ok ? ok(res.data, 201) : fail(res.error, res.status);
    }

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: input.saleId },
        include: { items: true },
      });
      if (!sale)
        return { ok: false as const, error: "الفاتورة غير موجودة", status: 404 };
      if (sale.status === "CANCELLED")
        return {
          ok: false as const,
          error: "لا يمكن إرجاع فاتورة ملغية",
          status: 409,
        };

      const itemById = new Map(sale.items.map((it) => [it.id, it]));

      // الكميات المُرتجعة سابقاً لكل بند (لمنع تجاوز الكمية الأصلية)
      const prior = await tx.returnItem.groupBy({
        by: ["saleItemId"],
        where: { saleItemId: { in: sale.items.map((it) => it.id) } },
        _sum: { quantity: true },
      });
      const returnedBefore = new Map(
        prior.map((p) => [p.saleItemId, p._sum.quantity ?? 0])
      );

      const ratio =
        sale.totalAmount > 0 ? sale.finalAmount / sale.totalAmount : 1;

      let refundTotal = 0;
      let returnedValue = 0;
      let replacementValue = 0;
      const itemRows: {
        saleItemId: string;
        variantId: string;
        quantity: number;
        refundAmount: number;
        exchangeVariantId: string | null;
      }[] = [];

      for (const line of input.items) {
        const saleItem = itemById.get(line.saleItemId);
        if (!saleItem)
          return {
            ok: false as const,
            error: "بند غير موجود في هذه الفاتورة",
            status: 422,
          };

        const already = returnedBefore.get(saleItem.id) ?? 0;
        if (already + line.quantity > saleItem.quantity)
          return {
            ok: false as const,
            error: `الكمية المطلوب إرجاعها تتجاوز المتاح (المتبقي: ${saleItem.quantity - already})`,
            status: 422,
          };

        const refundAmount = round2(
          unitNet(saleItem.subtotal, saleItem.quantity, ratio) * line.quantity
        );
        returnedValue = round2(returnedValue + refundAmount);

        // إعادة الكمية المُرتجعة إلى مخزون الصنف الأصلي
        await tx.productVariant.update({
          where: { id: saleItem.variantId },
          data: { quantity: { increment: line.quantity } },
        });

        // استبدال: خصم كمية الصنف البديل بشكل ذري + احتساب قيمته
        if (input.type === "EXCHANGE") {
          const exVariant = await tx.productVariant.findUnique({
            where: { id: line.exchangeVariantId! },
            include: { product: { select: { name: true } } },
          });
          if (!exVariant)
            return {
              ok: false as const,
              error: "الصنف البديل غير موجود",
              status: 422,
            };
          const dec = await tx.productVariant.updateMany({
            where: {
              id: exVariant.id,
              quantity: { gte: line.quantity },
            },
            data: { quantity: { decrement: line.quantity } },
          });
          if (dec.count === 0)
            return {
              ok: false as const,
              error: `الكمية غير كافية من الصنف البديل "${exVariant.product.name}" مقاس ${exVariant.size} (المتاح: ${exVariant.quantity})`,
              status: 422,
            };
          replacementValue = round2(
            replacementValue + exVariant.price * line.quantity
          );
        }

        itemRows.push({
          saleItemId: saleItem.id,
          variantId: saleItem.variantId,
          quantity: line.quantity,
          refundAmount,
          exchangeVariantId:
            input.type === "EXCHANGE" ? line.exchangeVariantId! : null,
        });
      }

      // إجماليات القيمة: إرجاع = استرداد كامل؛ استبدال = فرق السعر
      const exchangeDifference =
        input.type === "EXCHANGE"
          ? round2(replacementValue - returnedValue)
          : 0;
      refundTotal = input.type === "RETURN" ? returnedValue : 0;

      const created = await tx.return.create({
        data: {
          saleId: sale.id,
          branch: sale.branch,
          type: input.type,
          reason: input.reason,
          refundMethod: input.refundMethod,
          refundTotal,
          exchangeDifference,
          createdBy: input.createdBy,
          items: { create: itemRows },
        },
        include: returnInclude,
      });

      // تعديل إجمالي إنفاق العميل (إن كان مرتبطاً بالفاتورة عبر الهاتف)
      if (sale.customerPhone) {
        const delta =
          input.type === "RETURN" ? -refundTotal : exchangeDifference;
        if (delta !== 0) {
          await tx.customer.updateMany({
            where: { phone: sale.customerPhone },
            data: { totalSpent: { increment: round2(delta) } },
          });
        }
      }

      // قيد في سجل النشاط (تدقيق)
      const label = RETURN_TYPE_LABELS[input.type as ReturnTypeValue];
      const money =
        input.type === "RETURN"
          ? `استرداد ${refundTotal} ج.م`
          : exchangeDifference >= 0
            ? `فرق للدفع ${exchangeDifference} ج.م`
            : `يُرد للعميل ${Math.abs(exchangeDifference)} ج.م`;
      await tx.activityLog.create({
        data: {
          userName: input.createdBy || "النظام",
          userRole: "ADMIN",
          action: "إرجاع/استبدال",
          details: `${label} — فاتورة #${sale.saleNumber} — ${money}`,
        },
      });

      return { ok: true as const, data: created };
    });

    if (!result.ok) return fail(result.error, result.status);
    return ok(toReturnDTO(result.data), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
