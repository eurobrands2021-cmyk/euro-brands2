import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toSaleDTO } from "@/lib/serializers";
import { MOCK_MODE, mockCancelSale } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

const saleInclude = {
  items: {
    include: {
      product: { select: { name: true, brand: true } },
      variant: { select: { size: true, color: true, sku: true } },
    },
  },
} satisfies Prisma.SaleInclude;

// POST /api/sales/[id]/cancel — إلغاء الفاتورة وإعادة الكميات للمخزون
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "—";

    if (MOCK_MODE) {
      const res = mockCancelSale(params.id, reason);
      return res.ok ? ok(res.sale) : fail(res.error, res.status);
    }

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: params.id },
        include: { items: true },
      });
      if (!sale)
        return { ok: false as const, error: "الفاتورة غير موجودة", status: 404 };
      if (sale.status === "CANCELLED")
        return { ok: false as const, error: "الفاتورة ملغية بالفعل", status: 409 };

      // منع إلغاء فاتورة لها مرتجعات/استبدالات: الإلغاء يُعيد كامل كميات
      // البنود الأصلية للمخزون، بينما المرتجع أعاد الكميات المُرتجعة سلفاً —
      // فيتضاعف الرصيد المُعاد، إضافةً إلى أن مبلغ الاسترداد صُرف بالفعل.
      // يُعالَج المرتجع أولاً (أو تُلغى عمليات الإرجاع) قبل إلغاء الفاتورة.
      const returnsCount = await tx.return.count({
        where: { saleId: params.id },
      });
      if (returnsCount > 0)
        return {
          ok: false as const,
          error:
            "لا يمكن إلغاء فاتورة لها مرتجعات أو استبدالات مسجّلة — عالِج المرتجعات أولاً",
          status: 409,
        };

      // تحويل الحالة إلى «ملغية» بشكل ذري مشروط بأنها ما زالت مكتملة.
      // يضمن هذا أن إلغاءين متزامنين لا ينجح منهما إلا واحد، فلا تُعاد
      // الكميات للمخزون مرتين.
      const flip = await tx.sale.updateMany({
        where: { id: params.id, status: "COMPLETED" },
        data: { status: "CANCELLED", cancellationReason: reason },
      });
      if (flip.count === 0)
        return { ok: false as const, error: "الفاتورة ملغية بالفعل", status: 409 };

      // إعادة الكميات للمخزون (مرة واحدة مضمونة بعد نجاح تحويل الحالة)
      for (const it of sale.items) {
        await tx.productVariant.update({
          where: { id: it.variantId },
          data: { quantity: { increment: it.quantity } },
        });
      }

      const updated = await tx.sale.findUnique({
        where: { id: params.id },
        include: saleInclude,
      });
      return { ok: true as const, sale: updated! };
    });

    if (!result.ok) return fail(result.error, result.status);
    return ok(toSaleDTO(result.sale));
  } catch (error) {
    return handleServerError(error);
  }
}
