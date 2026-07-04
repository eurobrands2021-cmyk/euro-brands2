import { ok, fail, handleServerError } from "@/lib/api";
import { MOCK_MODE } from "@/lib/mock-store";
import { prisma } from "@/lib/prisma";
import {
  archiveTypes,
  resolveRange,
  verifyAdmin,
  isDataType,
  isArchivable,
  ARCHIVE_RETENTION_HOURS,
  type DataTypeKey,
} from "@/lib/data-management";

export const dynamic = "force-dynamic";

// POST /api/data-management/archive — أرشفة (حذف مؤجّل 72 ساعة). للمدير فقط.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!verifyAdmin(body.password))
      return fail("هذه العملية للمدير فقط.", 403);

    const types: DataTypeKey[] = (
      Array.isArray(body.types) ? body.types.filter(isDataType) : []
    ).filter(isArchivable);
    if (types.length === 0)
      return fail("لا توجد أنواع قابلة للأرشفة ضمن الاختيار.", 422);
    const range = resolveRange(body.preset, body.from, body.to);

    if (MOCK_MODE)
      return fail("الأرشفة غير متاحة في وضع المعاينة.", 400);

    const counts = await archiveTypes(types, range);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const user = typeof body.user === "string" && body.user ? body.user : "المدير";
    await prisma.activityLog
      .create({
        data: {
          userName: user,
          userRole: "ADMIN",
          action: `أرشفة بيانات بواسطة ${user}`,
          details: `أُرشِف ${total} سجلاً (سيُحذف تلقائياً بعد ${ARCHIVE_RETENTION_HOURS} ساعة): ${JSON.stringify(
            counts
          )}`,
        },
      })
      .catch(() => {});

    return ok({ counts, total });
  } catch (error) {
    return handleServerError(error);
  }
}
