// ⚠️ ملاحظة أمنية مهمة:
// هذه الحماية مبنية على localStorage فقط — وهي عقبة بسيطة وليست أمناً فعلياً.
// أي شخص لديه أدوات المطوّر في المتصفح يستطيع تجاوزها في ثوانٍ.
// للأمان الفعلي يلزم تسجيل دخول حقيقي عبر الخادم وكوكيز HttpOnly.

import { apiPost } from "./client";

const SESSION_KEY = "eb-auth-session";
const SESSION_HOURS = 24;

export const LOGO_PATH = "/logo.svg"; // غيّر لـ "/logo.png" بعد رفع الصورة

// ----------------------------------------------------
//  الأدوار
// ----------------------------------------------------
export type Role = "ADMIN" | "CASHIER";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "مدير",
  CASHIER: "كاشير",
};

// كلمة مرور الكاشير (دور محدود) تبقى على العميل. أمّا كلمة مرور المدير فلم
// تعُد ثابتة في حزمة المتصفح — يتحقّق منها الخادم عبر /api/auth/verify-admin.
export const CASHIER_PASSWORD = "0000";

export interface Session {
  name: string;
  role: Role;
  expiresAt: number;
}

// ----------------------------------------------------
//  إدارة الجلسة
// ----------------------------------------------------
export function startSession(name: string, role: Role) {
  const session: Session = {
    name,
    role,
    expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function endSession() {
  localStorage.removeItem(SESSION_KEY);
}

// قراءة الجلسة الحالية (أو null عند غيابها/انتهائها)
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (
      typeof s.expiresAt !== "number" ||
      Date.now() >= s.expiresAt ||
      typeof s.name !== "string" ||
      (s.role !== "ADMIN" && s.role !== "CASHIER")
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { name: s.name, role: s.role, expiresAt: s.expiresAt };
  } catch {
    return null;
  }
}

// هل توجد جلسة صالحة الآن؟
export function isSessionValid(): boolean {
  return getSession() !== null;
}

// ----------------------------------------------------
//  تسجيل الدخول
// ----------------------------------------------------
export interface LoginResult {
  ok: boolean;
  role?: Role;
  error?: string;
}

// تسجيل الدخول بالاسم وكلمة المرور. عند نجاح المطابقة تُنشأ جلسة ويُعاد الدور.
// الكاشير يُتحقَّق منه محلياً (دور محدود)، والمدير يُتحقَّق منه على الخادم كي لا
// نثق بالعميل في قيمة كلمة المرور ولا نُضمّنها في حزمة المتصفح.
export async function tryLogin(
  name: string,
  password: string
): Promise<LoginResult> {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: "الاسم مطلوب" };
  if (!password) return { ok: false, error: "كلمة المرور غير صحيحة" };

  if (password === CASHIER_PASSWORD) {
    startSession(trimmedName, "CASHIER");
    return { ok: true, role: "CASHIER" };
  }

  try {
    const res = await apiPost<{ ok: boolean }>("/api/auth/verify-admin", {
      password,
    });
    if (res.ok) {
      startSession(trimmedName, "ADMIN");
      return { ok: true, role: "ADMIN" };
    }
  } catch {
    /* فشل الشبكة/التحقّق — نُعيد رسالة عامة أدناه */
  }
  return { ok: false, error: "كلمة المرور غير صحيحة" };
}

// ----------------------------------------------------
//  منح استرجاع قصير الأجل (تدفّق «نسيت كلمة المرور»)
// ----------------------------------------------------
// بعد التحقّق من سؤال الأمان (مدير) أو موافقة الأدمن (كاشير) نمنح إذناً قصير
// الأجل يسمح ببدء الجلسة دون كشف كلمة المرور على الشاشة. يُستهلَك مرة واحدة.
const RECOVERY_KEY = "eb-recovery-grant";
const RECOVERY_MINUTES = 5;

export function grantRecovery(role: Role) {
  try {
    sessionStorage.setItem(
      RECOVERY_KEY,
      JSON.stringify({
        role,
        expiresAt: Date.now() + RECOVERY_MINUTES * 60 * 1000,
      })
    );
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

// يستهلك الإذن ويؤكّد أنه للدور المتوقّع وما زال صالحاً.
export function consumeRecovery(expectedRole: Role): boolean {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(RECOVERY_KEY);
    const g = JSON.parse(raw) as { role?: Role; expiresAt?: number };
    return (
      g.role === expectedRole &&
      typeof g.expiresAt === "number" &&
      Date.now() < g.expiresAt
    );
  } catch {
    return false;
  }
}
