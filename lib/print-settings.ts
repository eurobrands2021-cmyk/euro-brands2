// إعدادات الطباعة القابلة للتخصيص — تُحفَظ محلياً فقط (بدون قاعدة بيانات) وتُطبَّق
// على كل عمليات الطباعة في التطبيق (فاتورة تفصيلية، إيصال نقطة البيع، طباعة مباشرة).

export const PRINT_SIZES = ["80mm", "58mm", "a4", "a5"] as const;
export type PrintSize = (typeof PRINT_SIZES)[number];

export const PRINT_SIZE_LABELS: Record<PrintSize, string> = {
  "80mm": "80mm (حراري - افتراضي)",
  "58mm": "58mm (حراري صغير)",
  a4: "A4 (رسمية)",
  a5: "A5 (مدمجة)",
};

// المقاسات الحرارية تُطبَع بمكوّن الإيصال أحادي المسافة؛ الورقية بمستند الفاتورة.
export function isThermalSize(size: PrintSize): boolean {
  return size === "80mm" || size === "58mm";
}

export const PRINT_FONT_SIZES = ["small", "medium", "large"] as const;
export type PrintFontSize = (typeof PRINT_FONT_SIZES)[number];

export const PRINT_FONT_SIZE_LABELS: Record<PrintFontSize, string> = {
  small: "صغير",
  medium: "متوسط",
  large: "كبير",
};

// مفاتيح إظهار/إخفاء محتوى الفاتورة — كل مفتاح مستقل.
export interface PrintFields {
  storeName: boolean; // اسم المتجر وشعاره
  branch: boolean; // اسم الفرع
  contact: boolean; // رقم التليفون والعنوان
  invoiceNumber: boolean; // رقم الفاتورة
  dateTime: boolean; // التاريخ والوقت
  cashier: boolean; // اسم الكاشير
  customer: boolean; // اسم العميل ورقمه
  itemDetails: boolean; // المنتج والمقاس واللون
  qtyPrice: boolean; // الكمية والسعر
  subtotal: boolean; // المجموع قبل الخصم
  discount: boolean; // الخصم
  total: boolean; // الإجمالي النهائي
  paymentMethod: boolean; // طريقة الدفع
  cashChange: boolean; // دفع العميل والباقي
  thankYou: boolean; // رسالة الشكر
  qr: boolean; // رمز QR
  barcode: boolean; // باركود الفاتورة
}

export interface PrintSettings {
  size: PrintSize;
  fontSize: PrintFontSize;
  fields: PrintFields;
  thankYouMessage: string;
}

export const DEFAULT_THANK_YOU = "شكراً لتعاملكم مع Euro Brands";

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  size: "80mm",
  fontSize: "medium",
  thankYouMessage: DEFAULT_THANK_YOU,
  fields: {
    storeName: true,
    branch: true,
    contact: true,
    invoiceNumber: true,
    dateTime: true,
    cashier: true,
    customer: true,
    itemDetails: true,
    qtyPrice: true,
    subtotal: true,
    discount: true,
    total: true,
    paymentMethod: true,
    cashChange: true,
    thankYou: true,
    qr: true,
    barcode: true,
  },
};

// ترتيب حقول المحتوى وتسمياتها للعرض في شاشة الإعدادات.
export const PRINT_FIELD_ORDER: { key: keyof PrintFields; label: string }[] = [
  { key: "storeName", label: "اسم المتجر وشعار" },
  { key: "branch", label: "اسم الفرع" },
  { key: "contact", label: "رقم التليفون والعنوان" },
  { key: "invoiceNumber", label: "رقم الفاتورة" },
  { key: "dateTime", label: "التاريخ والوقت" },
  { key: "cashier", label: "اسم الكاشير" },
  { key: "customer", label: "اسم العميل ورقمه" },
  { key: "itemDetails", label: "المنتج والمقاس واللون" },
  { key: "qtyPrice", label: "الكمية والسعر" },
  { key: "subtotal", label: "المجموع قبل الخصم" },
  { key: "discount", label: "الخصم" },
  { key: "total", label: "الإجمالي النهائي" },
  { key: "paymentMethod", label: "طريقة الدفع" },
  { key: "cashChange", label: "دفع العميل والباقي" },
  { key: "thankYou", label: "رسالة الشكر" },
  { key: "qr", label: "QR code" },
  { key: "barcode", label: "باركود الفاتورة" },
];

const PRINT_SETTINGS_KEY = "print_settings";
const PREFERRED_SIZE_KEY = "preferred_print_size";

// يدمج إعدادات مخزّنة (قد تكون ناقصة) مع الافتراضيات لضمان اكتمال كل الحقول.
function merge(raw: unknown): PrintSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_PRINT_SETTINGS;
  const r = raw as Partial<PrintSettings>;
  const size = PRINT_SIZES.includes(r.size as PrintSize)
    ? (r.size as PrintSize)
    : DEFAULT_PRINT_SETTINGS.size;
  const fontSize = PRINT_FONT_SIZES.includes(r.fontSize as PrintFontSize)
    ? (r.fontSize as PrintFontSize)
    : DEFAULT_PRINT_SETTINGS.fontSize;
  return {
    size,
    fontSize,
    thankYouMessage:
      typeof r.thankYouMessage === "string"
        ? r.thankYouMessage
        : DEFAULT_THANK_YOU,
    fields: { ...DEFAULT_PRINT_SETTINGS.fields, ...(r.fields ?? {}) },
  };
}

export function loadPrintSettings(): PrintSettings {
  if (typeof window === "undefined") return DEFAULT_PRINT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(PRINT_SETTINGS_KEY);
    if (raw) return merge(JSON.parse(raw));
    // توافق: لو لم تُحفظ إعدادات كاملة بعد، احترم مقاس الطباعة المفضّل إن وُجد.
    const pref = window.localStorage.getItem(PREFERRED_SIZE_KEY);
    if (PRINT_SIZES.includes(pref as PrintSize)) {
      return { ...DEFAULT_PRINT_SETTINGS, size: pref as PrintSize };
    }
  } catch {
    /* تجاهل تخزيناً تالفاً */
  }
  return DEFAULT_PRINT_SETTINGS;
}

export function savePrintSettings(s: PrintSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(s));
    // نُبقي مفتاح المقاس المفضّل متزامناً لطباعة مباشرة سريعة.
    window.localStorage.setItem(PREFERRED_SIZE_KEY, s.size);
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

// مقاس الطباعة المفضّل للطباعة المباشرة (بدون فتح النافذة).
export function loadPreferredPrintSize(): PrintSize {
  return loadPrintSettings().size;
}
