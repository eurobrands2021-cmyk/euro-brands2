import { ok, fail, handleServerError } from "@/lib/api";
import { MOCK_MODE } from "@/lib/mock-store";
import { prisma } from "@/lib/prisma";
import { verifyAdmin, isDataType, type DataTypeKey } from "@/lib/data-management";
import { importByType, type ImportTypeResult } from "@/lib/data-import";

export const dynamic = "force-dynamic";

interface ImportGroup {
  type: DataTypeKey;
  rows: Record<string, string | number | null>[];
}

// POST /api/data-management/import — إعادة استيراد (upsert) من ملف مؤرشف. للمدير فقط.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!verifyAdmin(body.password))
      return fail("الاستيراد للمدير فقط.", 403);

    const groups: ImportGroup[] = Array.isArray(body.groups)
      ? body.groups.filter(
          (g: unknown): g is ImportGroup =>
            !!g &&
            typeof g === "object" &&
            isDataType((g as ImportGroup).type) &&
            Array.isArray((g as ImportGroup).rows)
        )
      : [];
    if (groups.length === 0)
      return fail("لا توجد بيانات صالحة للاستيراد.", 422);

    if (MOCK_MODE) return fail("الاستيراد غير متاح في وضع المعاينة.", 400);

    const results: ImportTypeResult[] = [];
    for (const g of groups) {
      results.push(await importByType(g.type, g.rows));
    }

    const totalCreated = results.reduce((a, r) => a + r.created, 0);
    const totalUpdated = results.reduce((a, r) => a + r.updated, 0);

    const user = typeof body.user === "string" && body.user ? body.user : "المدير";
    await prisma.activityLog
      .create({
        data: {
          userName: user,
          userRole: "ADMIN",
          action: `استيراد بيانات مؤرشفة بواسطة ${user}`,
          details: `أُنشئ ${totalCreated} وحُدِّث ${totalUpdated}: ${JSON.stringify(
            results.map((r) => ({ [r.type]: { created: r.created, updated: r.updated, skipped: r.skipped } }))
          )}`,
        },
      })
      .catch(() => {});

    return ok({ results });
  } catch (error) {
    return handleServerError(error);
  }
}
