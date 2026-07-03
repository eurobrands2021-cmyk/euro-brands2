import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { parseTransferInput, ValidationError } from "@/lib/validate";
import { buildVariantSku, uniquifySku } from "@/lib/sku";
import {
  MOCK_MODE,
  mockCreateTransfer,
  mockListTransfers,
} from "@/lib/mock-store";
import type { BranchValue } from "@/lib/constants";
import type { TransferDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/transfers — أحدث تحويلات المخزون
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockListTransfers());
    const rows = await prisma.stockTransfer.findMany({
      include: {
        product: { select: { name: true, brand: true } },
        variant: { select: { size: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const dto: TransferDTO[] = rows.map((t) => ({
      id: t.id,
      productName: t.product.name,
      brand: t.product.brand,
      size: t.variant?.size ?? null,
      fromBranch: t.fromBranch as BranchValue,
      toBranch: t.toBranch as BranchValue,
      quantity: t.quantity,
      notes: t.notes ?? null,
      createdAt: t.createdAt.toISOString(),
    }));
    return ok(dto);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/transfers — نقل كمية من صنف بفرع المصدر إلى نفس المقاس/اللون بفرع الوجهة
export async function POST(req: Request) {
  try {
    const input = parseTransferInput(await req.json());
    if (MOCK_MODE) return ok(mockCreateTransfer(input), 201);

    const result = await prisma.$transaction(async (tx) => {
      const source = await tx.productVariant.findUnique({
        where: { id: input.variantId },
        include: {
          product: { select: { productType: { select: { code: true } } } },
        },
      });
      if (!source || source.productId !== input.productId)
        throw new ValidationError("الصنف غير موجود");
      if (source.branch === input.toBranch)
        throw new ValidationError("لا يمكن التحويل إلى نفس الفرع");
      if (input.quantity > source.quantity)
        throw new ValidationError(
          `الكمية المتاحة في فرع المصدر ${source.quantity} فقط`
        );

      const fromBranch = source.branch;

      await tx.productVariant.update({
        where: { id: source.id },
        data: { quantity: source.quantity - input.quantity },
      });

      // نفس المقاس واللون في فرع الوجهة: نزيد كميته أو ننشئه إن لم يوجد
      const dest = await tx.productVariant.findFirst({
        where: {
          productId: input.productId,
          size: source.size,
          color: source.color,
          branch: input.toBranch,
        },
      });
      if (dest) {
        await tx.productVariant.update({
          where: { id: dest.id },
          data: { quantity: dest.quantity + input.quantity },
        });
      } else {
        const existing = await tx.productVariant.findMany({
          select: { sku: true },
        });
        const taken = new Set(
          existing.map((v) => v.sku).filter((s): s is string => !!s)
        );
        const sku = uniquifySku(
          buildVariantSku({
            productId: input.productId,
            typeCode: source.product.productType?.code ?? null,
            size: source.size,
            branch: input.toBranch,
            color: source.color,
          }),
          taken
        );
        await tx.productVariant.create({
          data: {
            productId: input.productId,
            size: source.size,
            color: source.color,
            branch: input.toBranch,
            quantity: input.quantity,
            minQuantity: source.minQuantity,
            price: source.price,
            cost: source.cost,
            sku,
          },
        });
      }

      return tx.stockTransfer.create({
        data: {
          productId: input.productId,
          variantId: source.id,
          fromBranch,
          toBranch: input.toBranch,
          quantity: input.quantity,
          notes: input.notes,
        },
      });
    });

    return ok(result, 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
