// أنواع/ثوابت إدارة البيانات المشتركة بين الخادم والواجهة (بدون prisma).
// يستوردها كل من lib/data-management.ts (خادم) ومكوّنات الواجهة بأمان.

export const ARCHIVE_RETENTION_HOURS = 72;
export const ARCHIVE_RETENTION_MS = ARCHIVE_RETENTION_HOURS * 60 * 60 * 1000;

export type DataTypeKey =
  | "sales"
  | "products"
  | "customers"
  | "defects"
  | "activity"
  | "transfers"
  | "returns";

export const DATA_TYPE_KEYS: DataTypeKey[] = [
  "sales",
  "products",
  "customers",
  "defects",
  "activity",
  "transfers",
  "returns",
];

export const DATA_TYPE_LABELS: Record<DataTypeKey, string> = {
  sales: "الفواتير",
  products: "المنتجات",
  customers: "العملاء",
  defects: "الديفو",
  activity: "سجل النشاط",
  transfers: "التحويلات",
  returns: "المرتجعات والاستبدال",
};

// الأنواع التي يوجد بها عمود archivedAt (أرشفة/حذف مؤجّل).
export const ARCHIVABLE_TYPES: DataTypeKey[] = [
  "sales",
  "products",
  "customers",
  "activity",
];

export function isDataType(v: unknown): v is DataTypeKey {
  return typeof v === "string" && DATA_TYPE_KEYS.includes(v as DataTypeKey);
}

export function isArchivable(k: DataTypeKey): boolean {
  return ARCHIVABLE_TYPES.includes(k);
}

export type RangePreset = "1m" | "3m" | "6m" | "custom";

// صفوف نوع واحد جاهزة للتصدير (رأس + صفوف)
export interface ExportSheet {
  type: DataTypeKey;
  label: string;
  columns: string[];
  rows: (string | number)[][];
}

// ملخّص المؤرشفات المتبقّية (للعدّاد التنازلي في الإعدادات)
export interface ArchivedGroup {
  type: DataTypeKey;
  label: string;
  count: number;
  earliestArchivedAt: string;
  deleteAt: string;
}

export interface ImportTypeResult {
  type: DataTypeKey;
  created: number;
  updated: number;
  skipped: number;
}
