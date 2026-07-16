import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { MOCK_MODE, mockDeleteExpense } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// DELETE /api/expenses/[id] — حذف مصروف
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const res = mockDeleteExpense(params.id);
      if (!res) return fail("المصروف غير موجود", 404);
      return ok({ id: params.id });
    }

    const exists = await prisma.expense.findUnique({ where: { id: params.id } });
    if (!exists) return fail("المصروف غير موجود", 404);

    await prisma.expense.delete({ where: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return handleServerError(error);
  }
}
