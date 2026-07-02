// مصدر واحد لتعريف أقسام مُنشئ التقارير (المعرّفات + التسميات + الترتيب)
// تستهلكه صفحة التقارير (للعرض) ومصدّرا PDF/Excel (لضمان تطابق العناوين).

export type SalesSectionId =
  | "totalSales"
  | "invoicesCount"
  | "avgInvoice"
  | "maxInvoice"
  | "byBranch"
  | "byCategory"
  | "byBrand"
  | "topProducts"
  | "cashiers"
  | "byPayment"
  | "discount"
  | "deliveryVsPickup"
  | "salesTrend";

export type InventorySectionId =
  | "inventoryValue"
  | "productsCount"
  | "lowStock"
  | "outOfStock"
  | "stockByBranch"
  | "stockByCategory"
  | "stockByBrand"
  | "slowMoving"
  | "mostProfitable"
  | "damaged"
  | "transfers"
  | "newProducts"
  | "sizeReport";

export type SectionId = SalesSectionId | InventorySectionId;
export type ReportTab = "sales" | "inventory";

export interface SectionDef {
  id: SectionId;
  label: string;
}

export const SALES_SECTIONS: SectionDef[] = [
  { id: "totalSales", label: "إجمالي المبيعات في الفترة" },
  { id: "invoicesCount", label: "عدد الفواتير" },
  { id: "avgInvoice", label: "متوسط قيمة الفاتورة" },
  { id: "maxInvoice", label: "أعلى فاتورة" },
  { id: "byBranch", label: "المبيعات حسب الفرع" },
  { id: "byCategory", label: "المبيعات حسب الفئة" },
  { id: "byBrand", label: "المبيعات حسب البراند (أعلى 10)" },
  { id: "topProducts", label: "أكثر المنتجات مبيعاً (أعلى 10)" },
  { id: "cashiers", label: "أداء الكاشيرين" },
  { id: "byPayment", label: "المبيعات حسب طريقة الدفع" },
  { id: "discount", label: "الخصومات الممنوحة" },
  { id: "deliveryVsPickup", label: "مبيعات التوصيل مقابل الاستلام" },
  { id: "salesTrend", label: "تريند المبيعات اليومي" },
];

export const INVENTORY_SECTIONS: SectionDef[] = [
  { id: "inventoryValue", label: "إجمالي قيمة المخزون الحالي" },
  { id: "productsCount", label: "عدد المنتجات الكلي" },
  { id: "lowStock", label: "المنتجات منخفضة المخزون" },
  { id: "outOfStock", label: "المنتجات التي نفد مخزونها" },
  { id: "stockByBranch", label: "مقارنة مخزون الفرعين" },
  { id: "stockByCategory", label: "المخزون حسب الفئة" },
  { id: "stockByBrand", label: "المخزون حسب البراند" },
  { id: "slowMoving", label: "المنتجات الأبطأ حركة" },
  { id: "mostProfitable", label: "المنتجات الأكثر ربحية" },
  { id: "damaged", label: "تقرير الديفو (التالف/المعيب)" },
  { id: "transfers", label: "تحويلات المخزون بين الفرعين" },
  { id: "newProducts", label: "المنتجات الجديدة في الفترة" },
  { id: "sizeReport", label: "تقرير المقاسات (أكثر مقاس مبيعاً لكل فئة)" },
];

export const ALL_SECTIONS: SectionDef[] = [
  ...SALES_SECTIONS,
  ...INVENTORY_SECTIONS,
];

export const SECTION_LABEL: Record<SectionId, string> = Object.fromEntries(
  ALL_SECTIONS.map((s) => [s.id, s.label])
) as Record<SectionId, string>;

export function sectionsForTab(tab: ReportTab): SectionDef[] {
  return tab === "sales" ? SALES_SECTIONS : INVENTORY_SECTIONS;
}
