import { ok, handleServerError } from "@/lib/api";
import { readServerSettings, writeServerSettings } from "@/lib/server-settings";

export const dynamic = "force-dynamic";

// GET /api/settings — إعدادات التطبيق (ألوان/خط/وضع/قفل الفواتير/بيانات الشركة)
export async function GET() {
  try {
    return ok(await readServerSettings());
  } catch (error) {
    return handleServerError(error);
  }
}

// PUT /api/settings — حفظ تعديل جزئي على الإعدادات (يُدمج مع الحالي)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    return ok(await writeServerSettings(body));
  } catch (error) {
    return handleServerError(error);
  }
}
