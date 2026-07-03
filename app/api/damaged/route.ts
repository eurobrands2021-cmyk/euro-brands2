import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { parseDamagedInput, ValidationError } from "@/lib/validate";
import { MOCK_MODE, mockCreateDamaged, mockListDamaged } from "@/lib/mock-store";
import type { BranchValue } from "@/lib/constants";
import type { DamagedDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/damaged — أحدث سجلات الديفو
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockListDamaged());
    const rows = await prisma.damagedItem.findMany({
      include: {
        product: { select: { name: true, brand: true } },
        variant: { select: { size: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const dto: DamagedDTO[] = rows.map((d) => ({
      id: d.id,
      productName: d.product.name,
      brand: d.product.brand,
      size: d.variant?.size ?? null,
      branch: d.branch as BranchValue,
      quantity: d.quantity,
      reason: d.reason ?? null,
      createdAt: d.createdAt.toISOString(),
    }));
    return ok(dto);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/damaged — تسجيل تالف/معيب وخصمه من مخزون الصنف
export async function POST(req: Request) {
  try {
    const input = parseDamagedInput(await req.json());
    if (MOCK_MODE) return ok(mockCreateDamaged(input), 201);

    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: input.variantId },
      });
      if (!variant || variant.productId !== input.productId)
        throw new ValidationError("الصنف غير موجود");
      if (input.quantity > variant.quantity)
        throw new ValidationError(
          `الكمية المتاحة في المخزون ${variant.quantity} فقط`
        );

      await tx.productVariant.update({
        where: { id: variant.id },
        data: { quantity: variant.quantity - input.quantity },
      });

      return tx.damagedItem.create({
        data: {
          productId: input.productId,
          variantId: variant.id,
          branch: variant.branch,
          quantity: input.quantity,
          reason: input.reason,
        },
      });
    });

    return ok(result, 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
