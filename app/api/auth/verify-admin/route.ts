import { ok, handleServerError } from "@/lib/api";
import { verifyAdminPassword } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// POST /api/auth/verify-admin — تحقّق من كلمة مرور المدير على الخادم.
// يُعيد { ok } دائماً بحالة 200 (لا يكشف تفاصيل)، والقيمة السرية تبقى على الخادم
// ولا تصل العميل إطلاقاً. تُستخدم لتسجيل دخول المدير وتأكيد العمليات المؤثِّرة.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = (body as { password?: unknown })?.password;
    return ok({ ok: verifyAdminPassword(password) });
  } catch (error) {
    return handleServerError(error);
  }
}
