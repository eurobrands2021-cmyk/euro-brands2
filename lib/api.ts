import { NextResponse } from "next/server";

// قيم Cache-Control موحّدة لطرق الـ GET:
//   • البيانات بطيئة التغيّر (البراندات، أنواع المنتجات) تُخزَّن على الـ CDN
//     لخمس دقائق مع تقديم نسخة قديمة أثناء إعادة التحقق.
//   • البيانات المتغيّرة (المبيعات، المخزون، الإحصاءات) لا تُخزَّن إطلاقاً.
export const CACHE_STATIC = "public, s-maxage=300, stale-while-revalidate=600";
export const CACHE_LISTING =
  "public, s-maxage=60, stale-while-revalidate=300";
export const CACHE_NONE = "no-store";

// مساعدات موحّدة لاستجابات الـ API
export function ok<T>(data: T, status = 200, cacheControl?: string) {
  const res = NextResponse.json(data, { status });
  if (cacheControl) res.headers.set("Cache-Control", cacheControl);
  return res;
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// تغليف المعالج لالتقاط الأخطاء غير المتوقعة.
// نُسجّل التفاصيل الكاملة في الخادم فقط، ونُعيد للعميل رسالة عربية عامة
// حتى لا تتسرّب تفاصيل داخلية/رسائل قاعدة البيانات إلى الواجهة.
export function handleServerError(error: unknown) {
  console.error("[API ERROR]", error);
  return fail("حدث خطأ غير متوقع في الخادم، برجاء المحاولة مرة أخرى", 500);
}
