import { ok, fail, handleServerError } from "@/lib/api";
import { MOCK_MODE } from "@/lib/mock-store";
import { prisma } from "@/lib/prisma";
import {
  deleteTypes,
  resolveRange,
  verifyAdmin,
  isDataType,
  type DataTypeKey,
} from "@/lib/data-management";

export const dynamic = "force-dynamic";

// POST /api/data-management/delete — حذف نهائي فوري. للمدير فقط + كلمة مرور تأكيد.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // كلمة مرور المدير مطلوبة كتأكيد صريح للحذف النهائي
    if (!verifyAdmin(body.password))
      return fail("كلمة مرور التأكيد غير صحيحة. الحذف للمدير فقط.", 403);

    const types: DataTypeKey[] = Array.isArray(body.types)
      ? body.types.filter(isDataType)
      : [];
    if (types.length === 0)
      return fail("اختر نوعاً واحداً على الأقل للحذف.", 422);
    const range = resolveRange(body.preset, body.from, body.to);

    if (MOCK_MODE) return fail("الحذف غير متاح في وضع المعاينة.", 400);

    const { counts, skippedProducts } = await deleteTypes(types, range);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const user = typeof body.user === "string" && body.user ? body.user : "المدير";
    await prisma.activityLog
      .create({
        data: {
          userName: user,
          userRole: "ADMIN",
          action: `حذف بيانات نهائي بواسطة ${user}`,
          details: `حُذِف ${total} سجلاً${
            skippedProducts
              ? ` (تُخطّي ${skippedProducts} منتجاً مرتبطاً بفواتير)`
              : ""
          }: ${JSON.stringify(counts)}`,
        },
      })
      .catch(() => {});

    return ok({ counts, total, skippedProducts });
  } catch (error) {
    return handleServerError(error);
  }
}
