import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { parseSupplierInput, ValidationError } from "@/lib/validate";
import { toSupplierDTO } from "@/lib/serializers";
import {
  MOCK_MODE,
  mockUpdateSupplier,
  mockDeleteSupplier,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// PUT /api/suppliers/[id] — تعديل مورد
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const input = parseSupplierInput(await req.json());
    if (MOCK_MODE) {
      const res = mockUpdateSupplier(params.id, input);
      if (!res) return fail("المورد غير موجود", 404);
      return ok(res);
    }

    const exists = await prisma.supplier.findUnique({ where: { id: params.id } });
    if (!exists) return fail("المورد غير موجود", 404);

    const updated = await prisma.supplier.update({
      where: { id: params.id },
      data: input,
    });
    return ok(toSupplierDTO(updated));
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}

// DELETE /api/suppliers/[id] — حذف مورد (يُمنع إن كانت له عمليات استلام)
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const res = mockDeleteSupplier(params.id);
      if (!res.ok) return fail(res.error ?? "خطأ", res.status);
      return ok({ id: params.id });
    }

    const count = await prisma.stockReceipt.count({
      where: { supplierId: params.id },
    });
    if (count > 0)
      return fail("لا يمكن حذف مورد له عمليات استلام مسجّلة", 409);

    await prisma.supplier.delete({ where: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return handleServerError(error);
  }
}
