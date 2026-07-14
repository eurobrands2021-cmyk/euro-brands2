// التحقّق من كلمة مرور المدير — على الخادم فقط.
//
// قيمة كلمة المرور تُقرأ من متغيّر البيئة ADMIN_PASSWORD (يُنصح بضبطه في
// الإنتاج)، مع قيمة افتراضية للتطوير. هذا الملف يُستورَد من كود الخادم فقط
// (مسارات الـ API)، فلا تُصدَّر القيمة إلى العميل ولا تُضمَّن في حزمة المتصفح.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "2021";

// هل كلمة المرور المُدخلة تطابق كلمة مرور المدير؟
export function verifyAdminPassword(password: unknown): boolean {
  return (
    typeof password === "string" &&
    password.length > 0 &&
    password === ADMIN_PASSWORD
  );
}
