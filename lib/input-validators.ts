// مساعدات تنظيف المدخلات للنماذج: أرقام، نصوص بدون أرقام، هواتف مصرية.

export const EGY_PHONE_PREFIXES = [
  { prefix: "010", label: "فودافون" },
  { prefix: "011", label: "اتصالات" },
  { prefix: "012", label: "أورنج" },
  { prefix: "015", label: "وي" },
] as const;

export type EgyPhonePrefix = (typeof EGY_PHONE_PREFIXES)[number]["prefix"];

export function egyPhoneLabel(prefix: string): string | null {
  const entry = EGY_PHONE_PREFIXES.find((p) => p.prefix === prefix);
  return entry ? entry.label : null;
}

// إبقاء الأرقام فقط (بما فيها تحويل الأرقام العربية إلى لاتينية).
export function digitsOnly(input: string): string {
  if (!input) return "";
  return input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\D+/g, "");
}

export interface SanitizeNumberOptions {
  decimal?: boolean;
  max?: number;
  maxLength?: number;
}

// تنظيف نص رقمي: يحتفظ بالأرقام، ونقطة عشرية واحدة اختياريا.
// لا يحوّل لرقم؛ يعيد سلسلة قابلة للعرض في input متحكَّم به.
export function sanitizeNumber(
  raw: string,
  opts: SanitizeNumberOptions = {}
): string {
  const { decimal = false, max, maxLength } = opts;
  if (!raw) return "";

  let s = raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/،/g, ".");

  if (decimal) {
    s = s.replace(/[^0-9.]/g, "");
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    }
  } else {
    s = s.replace(/\D+/g, "");
  }

  if (typeof maxLength === "number" && maxLength > 0) {
    s = s.slice(0, maxLength);
  }

  if (typeof max === "number" && s !== "" && s !== ".") {
    const n = Number(s);
    if (Number.isFinite(n) && n > max) {
      s = String(max);
    }
  }

  return s;
}

// مفاتيح يجب السماح بها دائما (تنقل/تحرير/اختصارات).
const ALLOWED_NAV_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Escape",
  "Enter",
  "Home",
  "End",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

export function isNumericKeyAllowed(
  e: React.KeyboardEvent<HTMLInputElement>,
  decimal: boolean
): boolean {
  if (ALLOWED_NAV_KEYS.has(e.key)) return true;
  if (e.ctrlKey || e.metaKey) return true;
  // أرقام غربية أو عربية-هندية أو فارسية (تُحوَّل لغربية في sanitizeNumber)
  if (/^[0-9٠-٩۰-۹]$/.test(e.key)) return true;
  if (decimal && e.key === ".") {
    const target = e.currentTarget;
    return !target.value.includes(".");
  }
  return false;
}

// أحرف عربية ولاتينية + مسافة و - ' . & فقط.
const TEXT_ONLY_RE = /[^A-Za-z؀-ۿݐ-ݿ\s\-'.&]+/g;

export function sanitizeTextOnly(raw: string): string {
  if (!raw) return "";
  return raw.replace(TEXT_ONLY_RE, "").replace(/\s{2,}/g, " ");
}

export function isTextOnlyKeyAllowed(
  e: React.KeyboardEvent<HTMLInputElement>
): boolean {
  if (ALLOWED_NAV_KEYS.has(e.key)) return true;
  if (e.ctrlKey || e.metaKey) return true;
  if (e.key.length > 1) return true; // مفاتيح خاصة (Shift, CapsLock...)
  return !TEXT_ONLY_RE.test(e.key);
}

// تقسيم رقم هاتف مصري كامل (11 رقم) إلى بادئة + 8 أرقام.
// يقبل وجود كود الدولة 20 أو +20 في البداية ويزيله.
// يعيد قيم افتراضية عند عدم المطابقة.
export function splitEgyPhone(
  full: string | null | undefined
): { prefix: EgyPhonePrefix; rest: string } {
  const digits = digitsOnly(full ?? "");
  let s = digits;
  if (s.startsWith("0020")) s = s.slice(4);
  else if (s.startsWith("20") && s.length >= 12) s = s.slice(2);

  for (const p of EGY_PHONE_PREFIXES) {
    if (s.startsWith(p.prefix)) {
      return { prefix: p.prefix, rest: s.slice(3, 11) };
    }
  }
  return { prefix: "010", rest: "" };
}

// دمج البادئة + الباقي (8 أرقام) إلى رقم كامل 11 رقم.
// لو الباقي ناقص يُعيد ما توفر فقط (مثلا "0101234" أثناء الكتابة).
export function composeEgyPhone(prefix: string, rest: string): string {
  const cleanPrefix = digitsOnly(prefix).slice(0, 3);
  const cleanRest = digitsOnly(rest).slice(0, 8);
  if (!cleanPrefix) return "";
  return cleanPrefix + cleanRest;
}

// هل اكتمل الرقم (11 رقم تبدأ ببادئة مصرية صحيحة)؟
export function isCompleteEgyPhone(full: string): boolean {
  const d = digitsOnly(full);
  if (d.length !== 11) return false;
  return EGY_PHONE_PREFIXES.some((p) => d.startsWith(p.prefix));
}
