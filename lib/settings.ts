// إعدادات التطبيق القابلة للتخصيص — مصدر واحد للأنواع والقيم الافتراضية.
//
// تُخزَّن على الخادم في جدول AppSetting (مفتاح واحد app.settings يحمل JSON)،
// وتُخبَّأ محلياً في localStorage حتى تُطبَّق الألوان/الخط/الوضع فوراً قبل
// وصول استجابة الخادم (منع الوميض). الواجهة تقرأ عبر /api/settings وتزامن.

// ----------------------------------------------------
//  الخطوط والوضع
// ----------------------------------------------------
export const FONTS = ["tajawal", "cairo", "ibm-plex-arabic"] as const;
export type FontValue = (typeof FONTS)[number];

export const FONT_LABELS: Record<FontValue, string> = {
  tajawal: "Tajawal",
  cairo: "Cairo",
  "ibm-plex-arabic": "IBM Plex Arabic",
};

// عائلة الخط الفعلية المستخدمة في CSS (تُطبَّق على متغيّر --app-font)
// كل خط مُحمَّل في app/layout.tsx عبر next/font ويعرِّف متغيّره الخاص.
export const FONT_STACKS: Record<FontValue, string> = {
  tajawal: 'var(--font-tajawal), "Tajawal", sans-serif',
  cairo: 'var(--font-cairo), "Cairo", sans-serif',
  "ibm-plex-arabic":
    'var(--font-ibm-plex-arabic), "IBM Plex Sans Arabic", sans-serif',
};

// حجم الخط الأساسي — يُطبَّق على متغيّر ‎--font-size-base‎ على ‎<html>‎
// فتتغيّر كل الأحجام النسبية (rem) في الواجهة تبعاً له.
export const FONT_SIZES = ["small", "medium", "large"] as const;
export type FontSizeValue = (typeof FONT_SIZES)[number];

export const FONT_SIZE_LABELS: Record<FontSizeValue, string> = {
  small: "صغير",
  medium: "متوسط",
  large: "كبير",
};

// القيمة الفعلية (px) لكل خيار — أساس حساب وحدات rem في المتصفح
export const FONT_SIZE_PX: Record<FontSizeValue, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

// ----------------------------------------------------
//  أطقم ألوان جاهزة (Presets) — كل طقم يضبط لون الواجهة والـ PDF معاً
// ----------------------------------------------------
export interface ThemePreset {
  id: string;
  label: string;
  color: string; // لون التمييز (يُطبَّق على uiAccent و pdfAccent معاً)
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "purple", label: "بنفسجي", color: "#6c63ff" },
  { id: "gold", label: "ذهبي فاخر", color: "#b8860b" },
  { id: "royal", label: "أزرق ملكي", color: "#1e40af" },
  { id: "emerald", label: "أخضر زمردي", color: "#059669" },
  { id: "crimson", label: "أحمر ناري", color: "#dc2626" },
  { id: "slate", label: "رمادي فضي", color: "#475569" },
  { id: "rose", label: "وردي راقي", color: "#e11d48" },
  { id: "amber", label: "برتقالي دافئ", color: "#d97706" },
];

export const THEME_MODES = ["dark", "light", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  dark: "داكن",
  light: "فاتح",
  system: "حسب النظام",
};

// مدة قفل الفواتير (بالأيام) — بعدها تصبح الفاتورة غير قابلة للتعديل
export const LOCK_DAYS_OPTIONS = [7, 14, 30, 60] as const;
export type LockDaysValue = (typeof LOCK_DAYS_OPTIONS)[number];

// ----------------------------------------------------
//  نموذج الإعدادات
// ----------------------------------------------------
export interface CompanyInfo {
  storeName: string;
  address: string;
  phone: string;
  logo: string | null; // رابط الشعار (يظهر على الفواتير والـ PDF فقط)
}

export interface AppSettings {
  // ألوان واجهة الاستخدام — تؤثر على الأزرار والشريط العلوي
  uiAccent: string;
  // ألوان الفواتير والـ PDF (مستقلة تماماً) + شعار مخصص للمستندات
  pdfAccent: string;
  // ألوان صفحة الهبوط/الموقع المنفصل (إن وُجد)
  websiteAccent: string;
  // الخط والوضع الافتراضي
  font: FontValue;
  fontSize: FontSizeValue;
  themeMode: ThemeMode;
  // قفل الفواتير
  lockDays: LockDaysValue;
  // بيانات الشركة (تظهر على الفواتير والـ PDF فقط)
  company: CompanyInfo;
}

export const DEFAULT_SETTINGS: AppSettings = {
  uiAccent: "#6c63ff",
  pdfAccent: "#6c63ff",
  websiteAccent: "#6c63ff",
  font: "tajawal",
  fontSize: "medium",
  themeMode: "dark",
  lockDays: 30,
  company: {
    storeName: "Euro Brands",
    address: "",
    phone: "",
    logo: null,
  },
};

// دمج آمن مع القيم الافتراضية (يتحمّل الحقول الناقصة/القديمة)
export function mergeSettings(partial: unknown): AppSettings {
  const p = (partial ?? {}) as Partial<AppSettings>;
  const company = (p.company ?? {}) as Partial<CompanyInfo>;
  const font = FONTS.includes(p.font as FontValue)
    ? (p.font as FontValue)
    : DEFAULT_SETTINGS.font;
  const fontSize = FONT_SIZES.includes(p.fontSize as FontSizeValue)
    ? (p.fontSize as FontSizeValue)
    : DEFAULT_SETTINGS.fontSize;
  const themeMode = THEME_MODES.includes(p.themeMode as ThemeMode)
    ? (p.themeMode as ThemeMode)
    : DEFAULT_SETTINGS.themeMode;
  const lockDays = LOCK_DAYS_OPTIONS.includes(p.lockDays as LockDaysValue)
    ? (p.lockDays as LockDaysValue)
    : DEFAULT_SETTINGS.lockDays;
  const hex = (v: unknown, fallback: string) =>
    typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  return {
    uiAccent: hex(p.uiAccent, DEFAULT_SETTINGS.uiAccent),
    pdfAccent: hex(p.pdfAccent, DEFAULT_SETTINGS.pdfAccent),
    websiteAccent: hex(p.websiteAccent, DEFAULT_SETTINGS.websiteAccent),
    font,
    fontSize,
    themeMode,
    lockDays,
    company: {
      storeName:
        typeof company.storeName === "string" && company.storeName.trim()
          ? company.storeName
          : DEFAULT_SETTINGS.company.storeName,
      address: typeof company.address === "string" ? company.address : "",
      phone: typeof company.phone === "string" ? company.phone : "",
      logo:
        typeof company.logo === "string" && company.logo ? company.logo : null,
    },
  };
}

// ----------------------------------------------------
//  التخبئة المحلية (localStorage) — لتطبيق فوري بلا وميض
// ----------------------------------------------------
export const SETTINGS_CACHE_KEY = "eb-settings";

export function loadCachedSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return mergeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function cacheSettings(s: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

// اشتقاق درجة «ناعمة» شفافة من لون التمييز (لخلفيات الشارات/التحديد)
export function accentSoft(hex: string): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return "rgba(108, 99, 255, 0.12)";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

// تطبيق ألوان الواجهة والخط على مستوى الجذر (‏:root)
export function applyUiTheme(s: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--accent", s.uiAccent);
  root.style.setProperty("--accent-soft", accentSoft(s.uiAccent));
  root.style.setProperty("--app-font", FONT_STACKS[s.font]);
  root.style.setProperty("--font-size-base", FONT_SIZE_PX[s.fontSize]);
}
