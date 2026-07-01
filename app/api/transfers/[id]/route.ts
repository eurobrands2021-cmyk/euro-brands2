import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toStockTransferDTO } from "@/lib/serializers";
import { parseStockTransferStatusInput, ValidationError } from "@/lib/validate";
import { buildVariantSku, uniquifySku } from "@/lib/sku";
import {
  MOCK_MODE,
  mockGetTransfer,
  mockUpdateTransferStatus,
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

// GET /api/transfers/[id] — تفاصيل تحويل كاملة
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const dto = mockGetTransfer(params.id);
      return dto ? ok(dto) : fail("التحويل غير موجود", 404);
    }
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: params.id },
      include: transferInclude,
    });
    if (!transfer) return fail("التحويل غير موجود", 404);
    return ok(toStockTransferDTO(transfer));
  } catch (error) {
    return handleServerError(error);
  }
}

// PUT /api/transfers/[id] — إتمام التحويل (خصم/إضافة للمخزون) أو إلغاؤه
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const newStatus = parseStockTransferStatusInput(body);

    if (MOCK_MODE) {
      const res = mockUpdateTransferStatus(params.id, newStatus);
      return res.ok ? ok(res.transfer) : fail(res.error, res.status);
    }

    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id: params.id },
        include: {
          items: { include: { product: { select: { productTypeId: true } } } },
        },
      });
      if (!transfer)
        return { ok: false as const, error: "التحويل غير موجود", status: 404 };
      if (transfer.status !== "PENDING")
        return {
          ok: false as const,
          error: "لا يمكن تعديل تحويل تم إتمامه أو إلغاؤه من قبل",
          status: 409,
        };

      if (newStatus === "COMPLETED") {
        // إعادة فحص الكميات المتاحة لحظة الإتمام (قد تتغيّر منذ الإنشاء)
        const sourceVariants = await tx.productVariant.findMany({
          where: { id: { in: transfer.items.map((it) => it.variantId) } },
          include: { product: { select: { name: true } } },
        });
        const sourceMap = new Map(sourceVariants.map((v) => [v.id, v]));

        for (const item of transfer.items) {
          const v = sourceMap.get(item.variantId);
          if (!v || v.quantity < item.quantity) {
            return {
              ok: false as const,
              error: `الكمية غير كافية من "${v?.product.name ?? "صنف"}" مقاس ${item.size} في فرع المصدر (المتاح: ${v?.quantity ?? 0})`,
              status: 422,
            };
          }
        }

        // تُجمَّع أكواد الـ SKU المستخدَمة مرة واحدة لتجنّب التكرار عند إنشاء أصناف جديدة
        const takenSku = new Set<string>(
          (
            await tx.productVariant.findMany({ select: { sku: true } })
          )
            .map((v) => v.sku)
            .filter((s): s is string => !!s)
        );

        for (const item of transfer.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { quantity: { decrement: item.quantity } },
          });

          const targetVariant = await tx.productVariant.findFirst({
            where: {
              productId: item.productId,
              size: item.size,
              color: item.color,
              branch: transfer.toBranch,
            },
          });

          if (targetVariant) {
            await tx.productVariant.update({
              where: { id: targetVariant.id },
              data: { quantity: { increment: item.quantity } },
            });
          } else {
            const source = sourceMap.get(item.variantId)!;
            const sku = uniquifySku(
              buildVariantSku({
                productId: item.productId,
                typeCode: null,
                size: item.size,
                branch: transfer.toBranch,
                color: item.color,
              }),
              takenSku
            );
            await tx.productVariant.create({
              data: {
                productId: item.productId,
                size: item.size,
                color: item.color,
                branch: transfer.toBranch,
                quantity: item.quantity,
                minQuantity: source.minQuantity,
                price: source.price,
                sku,
                skuManual: false,
              },
            });
          }
        }
      }

      const updated = await tx.stockTransfer.update({
        where: { id: params.id },
        data: {
          status: newStatus,
          completedAt: newStatus === "COMPLETED" ? new Date() : null,
        },
        include: transferInclude,
      });
      return { ok: true as const, transfer: updated };
    });

    if (!result.ok) return fail(result.error, result.status);
    return ok(toStockTransferDTO(result.transfer));
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
