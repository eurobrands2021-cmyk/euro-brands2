import { Prisma, type Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toProductTypeDTO } from "@/lib/serializers";
import { parseProductTypeInput, ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockDeleteProductType,
  mockUpdateProductType,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// PUT /api/product-types/[id] — تعديل اسم/كود النوع
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const input = parseProductTypeInput(body);

    if (MOCK_MODE) {
      const res = mockUpdateProductType(params.id, input);
      return res.ok ? ok(res.type) : fail(res.error, res.status);
    }

    const existing = await prisma.productType.findUnique({
      where: { id: params.id },
    });
    if (!existing) return fail("النوع غير موجود", 404);

    try {
      const updated = await prisma.productType.update({
        where: { id: params.id },
        data: {
          name: input.name,
          code: input.code,
          category: input.category as Category,
        },
      });
      return ok(toProductTypeDTO(updated));
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      )
        return fail("يوجد نوع بنفس الاسم في هذه الفئة", 409);
      throw err;
    }
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}

// DELETE /api/product-types/[id] — حذف نوع المنتج (FK على المنتجات: SET NULL تلقائياً)
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const removed = mockDeleteProductType(params.id);
      return removed ? ok({ id: params.id }) : fail("النوع غير موجود", 404);
    }
    await prisma.productType.delete({ where: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return handleServerError(error);
  }
}
