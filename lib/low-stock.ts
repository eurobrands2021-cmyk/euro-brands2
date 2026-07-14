// تعريف موحّد لـ«قلة المخزون» يُستخدم في كل مكان (لوحة التحكم، التقارير،
// تنبيهات المخزون، صفحة المخزون) حتى تتطابق الأرقام المعروضة للمستخدم.
//
// التعريف الواحد: الصنف منخفض المخزون إذا كان التنبيه مُفعَّلاً له
// (alertOnLowStock) وكانت كميته بلغت الحد الأدنى أو أقل (quantity <= minQuantity).
//
// هذا الملف نقيّ (بلا اعتماد على الخادم) كي يصلح للاستيراد في مكوّنات العميل
// أيضاً. استعلامات قاعدة البيانات المبنية على نفس التعريف في lib/low-stock-query.
import type { BranchValue } from "./constants";

export interface LowStockCandidate {
  quantity: number;
  minQuantity: number;
  alertOnLowStock: boolean;
}

// المُحدِّد المرجعي (يُستخدم على العميل والخادم على السواء).
export function isLowStockVariant(v: LowStockCandidate): boolean {
  return v.alertOnLowStock && v.quantity <= v.minQuantity;
}

// صف صنف منخفض المخزون (نتيجة الاستعلام الخام على الخادم).
export interface LowStockRow {
  id: string;
  productName: string;
  brand: string;
  branch: BranchValue;
  size: string;
  color: string | null;
  quantity: number;
  minQuantity: number;
  alertOnLowStock: boolean;
}
