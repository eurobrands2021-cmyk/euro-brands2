// ⚠️ ملاحظة أمنية مهمة:
// هذه الحماية مبنية على localStorage فقط — وهي عقبة بسيطة وليست أمناً فعلياً.
// أي شخص لديه أدوات المطوّر في المتصفح يستطيع تجاوزها في ثوانٍ.
// للأمان الفعلي يلزم تسجيل دخول حقيقي عبر الخادم وكوكيز HttpOnly.

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

// كلمات المرور الثابتة → الدور. (2021 = مدير، 0000 = كاشير)
export const ADMIN_PASSWORD = "2021";
export const CASHIER_PASSWORD = "0000";

const PASSWORD_ROLES: Record<string, Role> = {
  [ADMIN_PASSWORD]: "ADMIN",
  [CASHIER_PASSWORD]: "CASHIER",
};

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
export function tryLogin(name: string, password: string): LoginResult {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: "الاسم مطلوب" };
  const role = PASSWORD_ROLES[password];
  if (!role) return { ok: false, error: "كلمة المرور غير صحيحة" };
  startSession(trimmedName, role);
  return { ok: true, role };
}
