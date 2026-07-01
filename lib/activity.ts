// مساعد تسجيل النشاط من جهة المتصفح.
// يقرأ المستخدم الحالي من الجلسة ويرسل سجلاً إلى /api/activity.
// fire-and-forget: لا يُفشل العملية الأساسية إن تعذّر التسجيل.
import { apiPost } from "./client";
import { getSession } from "./auth";
import type { ActivityLogDTO } from "./types";

// الإجراءات المسجَّلة (نصوص عربية ثابتة تظهر في عارض السجل)
export const ACTIVITY_ACTIONS = {
  LOGIN: "تسجيل دخول",
  CREATE_SALE: "إنشاء فاتورة",
  CANCEL_SALE: "إلغاء فاتورة",
  CREATE_PRODUCT: "إضافة منتج",
  UPDATE_PRODUCT: "تعديل منتج",
  DELETE_PRODUCT: "حذف منتج",
  DELIVERY_STATUS: "تغيير حالة توصيل",
  CREATE_TRANSFER: "إنشاء تحويل مخزون",
  COMPLETE_TRANSFER: "إتمام تحويل مخزون",
  CANCEL_TRANSFER: "إلغاء تحويل مخزون",
} as const;

export type ActivityAction =
  (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];

// تسجيل نشاط للمستخدم الحالي. آمن للاستدعاء دون await.
export async function logActivity(
  action: ActivityAction | string,
  details?: string | null
): Promise<void> {
  const session = getSession();
  if (!session) return; // لا تسجيل دون جلسة
  try {
    await apiPost<ActivityLogDTO>("/api/activity", {
      userName: session.name,
      userRole: session.role,
      action,
      details: details ?? null,
    });
  } catch {
    // تجاهل أخطاء التسجيل عمداً حتى لا تُربك العملية الأساسية
  }
}
