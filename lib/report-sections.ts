// تعريف أقسام التقارير المشتركة بين صفحة التقارير ووحدات التصدير (PDF/Excel)

export type ReportTab = "sales" | "inventory";

export interface ReportSectionMeta {
  key: string;
  label: string;
}

// تبويب «تقارير المبيعات» — 13 قسماً
export const SALES_SECTIONS: ReportSectionMeta[] = [
  { key: "totalSales", label: "إجمالي المبيعات في الفترة" },
  { key: "invoicesCount", label: "عدد الفواتير" },
  { key: "avgInvoice", label: "متوسط قيمة الفاتورة" },
  { key: "maxInvoice", label: "أعلى فاتورة" },
  { key: "byBranch", label: "المبيعات حسب الفرع (حدائق vs زهراء)" },
  { key: "byCategory", label: "المبيعات حسب الفئة (ملابس/أحذية/عطور/بناطيل)" },
  { key: "byBrand", label: "المبيعات حسب البراند (Top 10)" },
  { key: "topProducts", label: "أكثر المنتجات مبيعاً (Top 10)" },
  { key: "cashiers", label: "أداء الكاشيرين" },
  { key: "byPayment", label: "المبيعات حسب طريقة الدفع" },
  { key: "discounts", label: "الخصومات الممنوحة" },
  { key: "deliveryVsPickup", label: "مبيعات التوصيل vs الاستلام" },
  { key: "dailyTrend", label: "تريند المبيعات اليومي" },
];

// تبويب «تقارير المنتجات والجرد» — 13 قسماً
export const INVENTORY_SECTIONS: ReportSectionMeta[] = [
  { key: "inventoryValue", label: "إجمالي قيمة المخزون الحالي" },
  { key: "productsCount", label: "عدد المنتجات الكلي" },
  { key: "lowStock", label: "المنتجات منخفضة المخزون" },
  { key: "outOfStock", label: "المنتجات التي نفد مخزونها" },
  { key: "stockByBranch", label: "مقارنة مخزون الفرعين" },
  { key: "stockByCategory", label: "المخزون حسب الفئة" },
  { key: "stockByBrand", label: "المخزون حسب البراند" },
  { key: "slowMoving", label: "المنتجات الأبطأ حركة" },
  { key: "topProfit", label: "المنتجات الأكثر ربحية" },
  { key: "damaged", label: "تقرير الديفو (التالف/المعيب)" },
  { key: "transfers", label: "تحويلات المخزون بين الفرعين" },
  { key: "newProducts", label: "المنتجات الجديدة في الفترة" },
  { key: "sizeReport", label: "تقرير المقاسات (أكثر مقاس مبيع)" },
];

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  [...SALES_SECTIONS, ...INVENTORY_SECTIONS].map((s) => [s.key, s.label])
);

export const SALES_KEYS = SALES_SECTIONS.map((s) => s.key);
export const INVENTORY_KEYS = INVENTORY_SECTIONS.map((s) => s.key);
