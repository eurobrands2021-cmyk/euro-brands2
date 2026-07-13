import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toBrandDTO } from "@/lib/serializers";
import { ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockUpdateBrand,
  mockDeleteBrand,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// PUT /api/brands/[id] — إعادة تسمية البراند مع تحديث المنتجات التي تستخدم الاسم
// القديم في نفس الفئة (حتى تبقى القوائم/الفلاتر متسقة).
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const name =
      typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ValidationError("اسم البراند مطلوب");

    if (MOCK_MODE) {
      const res = mockUpdateBrand(params.id, name);
      return res.ok ? ok(res.brand) : fail(res.error, res.status);
    }

    const existing = await prisma.brand.findUnique({
      where: { id: params.id },
    });
    if (!existing) return fail("البراند غير موجود", 404);

    // لا تغيير على الاسم — أعِد البراند كما هو
    if (existing.name === name) return ok(toBrandDTO(existing));

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const brand = await tx.brand.update({
          where: { id: params.id },
          data: { name },
        });
        // مزامنة المنتجات: نفس الفئة والاسم القديم → الاسم الجديد
        await tx.product.updateMany({
          where: { brand: existing.name, category: existing.category },
          data: { brand: name },
        });
        return brand;
      });
      return ok(toBrandDTO(updated));
    } catch (err) {
      // تعارض التفرّد (name, category) — الاسم مستخدم بالفعل في هذه الفئة
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      )
        return fail("يوجد براند بنفس الاسم في هذه الفئة", 409);
      throw err;
    }
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}

// DELETE /api/brands/[id] — حذف البراند من قائمة الاختيار فقط.
// المنتجات تحتفظ باسم البراند (حقل نصّي) ولا تتأثر.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const removed = mockDeleteBrand(params.id);
      return removed ? ok({ id: params.id }) : fail("البراند غير موجود", 404);
    }
    const existing = await prisma.brand.findUnique({
      where: { id: params.id },
    });
    if (!existing) return fail("البراند غير موجود", 404);
    await prisma.brand.delete({ where: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return handleServerError(error);
  }
}
