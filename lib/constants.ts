// القيم الثابتة والمسميات العربية المشتركة

export const BRANCHES = ["HADAYEK", "ZAHRAA"] as const;
export type BranchValue = (typeof BRANCHES)[number];

export const BRANCH_LABELS: Record<BranchValue, string> = {
  HADAYEK: "حدائق المعادي",
  ZAHRAA: "زهراء المعادي",
};

export const CATEGORIES = ["CLOTHES", "SHOES", "PERFUMES", "PANTS"] as const;
export type CategoryValue = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CategoryValue, string> = {
  CLOTHES: "ملابس",
  SHOES: "أحذية",
  PERFUMES: "عطور",
  PANTS: "بناطيل",
};

export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;
export type DiscountTypeValue = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_TYPE_LABELS: Record<DiscountTypeValue, string> = {
  PERCENTAGE: "نسبة مئوية %",
  FIXED: "مبلغ ثابت (ج.م)",
};

export const PAYMENT_METHODS = ["CASH", "VISA", "TRANSFER"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CASH: "كاش",
  VISA: "فيزا",
  TRANSFER: "تحويل",
};

export const TRANSFER_METHODS = ["VODAFONE_CASH", "INSTAPAY"] as const;
export type TransferMethodValue = (typeof TRANSFER_METHODS)[number];

export const TRANSFER_METHOD_LABELS: Record<TransferMethodValue, string> = {
  VODAFONE_CASH: "فودافون كاش",
  INSTAPAY: "انستا باي",
};

export const SALE_STATUSES = ["COMPLETED", "CANCELLED"] as const;
export type SaleStatusValue = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABELS: Record<SaleStatusValue, string> = {
  COMPLETED: "مكتملة",
  CANCELLED: "ملغية",
};

// طريقة التوصيل
export const DELIVERY_METHODS = ["CUSTOM", "BOSTA"] as const;
export type DeliveryMethodValue = (typeof DELIVERY_METHODS)[number];

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethodValue, string> = {
  CUSTOM: "عامل خاص",
  BOSTA: "Bosta",
};

// حالة طلب التوصيل
export const DELIVERY_STATUSES = [
  "NEW",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
] as const;
export type DeliveryStatusValue = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatusValue, string> = {
  NEW: "جديد",
  PREPARING: "قيد التجهيز",
  READY: "جاهز للشحن",
  OUT_FOR_DELIVERY: "خرج للتوصيل",
  DELIVERED: "تم التوصيل",
  RETURNED: "مرتجع",
};

// مصادر طلب التوصيل — قيم enum ثابتة (الواجهة تعرض التسميات العربية فقط)
export const ORDER_SOURCES = [
  "PHONE",
  "FACEBOOK",
  "INSTAGRAM",
  "WHATSAPP",
  "MESSENGER",
] as const;
export type OrderSourceValue = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABELS: Record<OrderSourceValue, string> = {
  PHONE: "تليفون",
  FACEBOOK: "فيسبوك",
  INSTAGRAM: "انستجرام",
  WHATSAPP: "واتساب",
  MESSENGER: "ماسنجر",
};

// المقاسات المتاحة حسب الفئة
export const CLOTHING_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
] as const;

export const SHOE_SIZES = [
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
] as const;

// كل المقاسات المتاحة في القوائم المنسدلة
export const ALL_SIZES = [...CLOTHING_SIZES, ...SHOE_SIZES];

// المقاسات المقترحة بناءً على الفئة
export function sizesForCategory(category: CategoryValue): readonly string[] {
  if (category === "SHOES") return SHOE_SIZES;
  return CLOTHING_SIZES;
}

export const CURRENCY = "ج.م";
export const LOW_STOCK_THRESHOLD = 3; // عتبة تحذير قلة المخزون

// ----------------------------------------------------
//  أسباب التلف/العيب (الديفو)
// ----------------------------------------------------
export const DEFECT_REASONS = [
  "MANUFACTURING",
  "SHIPPING_DAMAGE",
  "BROKEN",
  "COLOR_FADING",
  "OTHER",
] as const;
export type DefectReasonValue = (typeof DEFECT_REASONS)[number];

export const DEFECT_REASON_LABELS: Record<DefectReasonValue, string> = {
  MANUFACTURING: "عيب تصنيع",
  SHIPPING_DAMAGE: "تلف أثناء الشحن",
  BROKEN: "مكسور",
  COLOR_FADING: "بهتان اللون",
  OTHER: "أخرى",
};

// قائمة ألوان شائعة للاختيار السريع (قائمة منسدلة في نافذة الإضافة السريعة)
export const COMMON_COLORS = [
  "أسود",
  "أبيض",
  "رمادي",
  "كحلي",
  "أزرق",
  "أحمر",
  "أخضر",
  "أصفر",
  "برتقالي",
  "بني",
  "بيج",
  "وردي",
  "بنفسجي",
  "ذهبي",
  "فضي",
  "نبيتي",
] as const;

// ----------------------------------------------------
//  أنواع المنتجات الافتراضية (القائمة الموحّدة)
// ----------------------------------------------------
// لكل نوع اسم عربي وكود لاتيني قصير يُستخدم بادئةً في توليد SKU.
// تُزرع هذه الأنواع تلقائياً (idempotent): تُضاف الناقصة ويُحدَّث الكود إن
// تغيّر، دون حذف أي أنواع أضافها المستخدم.
export interface DefaultProductType {
  category: CategoryValue;
  name: string;
  code: string;
}

export const DEFAULT_PRODUCT_TYPES: DefaultProductType[] = [
  // ملابس
  { category: "CLOTHES", name: "تيشرت", code: "TSH" },
  { category: "CLOTHES", name: "بولو", code: "POL" },
  { category: "CLOTHES", name: "هودي", code: "HOD" },
  { category: "CLOTHES", name: "سويت شيرت", code: "SWT" },
  { category: "CLOTHES", name: "جاكيت", code: "JKT" },
  { category: "CLOTHES", name: "بليزر", code: "BLZ" },
  { category: "CLOTHES", name: "قميص", code: "SHRT" },
  { category: "CLOTHES", name: "اخرى", code: "OTH" },
  // بناطيل
  { category: "PANTS", name: "جينز", code: "JNS" },
  { category: "PANTS", name: "سوت بانتس", code: "SWP" },
  { category: "PANTS", name: "شورت", code: "SHO" },
  { category: "PANTS", name: "كارجو", code: "CRG" },
  { category: "PANTS", name: "ميوه", code: "MIW" },
  { category: "PANTS", name: "اخرى", code: "OTH" },
  // أحذية
  { category: "SHOES", name: "سنيكرز", code: "SNK" },
  { category: "SHOES", name: "صندل", code: "SND" },
  { category: "SHOES", name: "بوت", code: "BOT" },
  { category: "SHOES", name: "كلاسيك", code: "CLS" },
  { category: "SHOES", name: "شبشب", code: "SHB" },
  { category: "SHOES", name: "سليبر", code: "SLP" },
  { category: "SHOES", name: "اخرى", code: "OTH" },
  // عطور
  { category: "PERFUMES", name: "عطر رجالي", code: "PFMM" },
  { category: "PERFUMES", name: "عطر حريمي", code: "PFMW" },
  { category: "PERFUMES", name: "عطر مشترك", code: "PFMU" },
  { category: "PERFUMES", name: "اخرى", code: "OTH" },
];

// أنواع أُزيلت من القائمة الافتراضية: يُعاد توجيه منتجاتها إلى نوع بديل ثم
// يُحذف النوع القديم (هجرة بيانات لمرة واحدة، وليست حذفاً لنوع أضافه المستخدم).
export interface RenamedProductType {
  category: CategoryValue;
  from: string;
  to: string;
}

export const RENAMED_PRODUCT_TYPES: RenamedProductType[] = [
  { category: "CLOTHES", from: "بلوزة", to: "قميص" },
];
