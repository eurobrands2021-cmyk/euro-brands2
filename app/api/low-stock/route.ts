import { ok, handleServerError, CACHE_NONE } from "@/lib/api";
import { MOCK_MODE, mockLowStock } from "@/lib/mock-store";
import { fetchLowStockVariants, countLowStockVariants } from "@/lib/low-stock-query";
import type { LowStockItem, LowStockResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// أقصى عدد أصناف تُعاد ضمن القائمة. القائمة تُعرض في تنبيهات صغيرة
// (شارة العدّ + قائمة منسدلة)، وهذا السقف يحمي من تحميل جدول الأصناف كاملاً.
const LOW_STOCK_LIMIT = 200;

// GET /api/low-stock — الأصناف منخفضة المخزون (التعريف الموحّد في lib/low-stock)
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockLowStock());

    // نجلب القائمة المحدودة والعدّ الكامل معاً كي تبقى شارة التنبيه دقيقة.
    const [rows, count] = await Promise.all([
      fetchLowStockVariants(LOW_STOCK_LIMIT),
      countLowStockVariants(),
    ]);

    const items: LowStockItem[] = rows.map((v) => ({
      id: v.id,
      productName: v.productName,
      brand: v.brand,
      branch: v.branch,
      size: v.size,
      color: v.color ?? null,
      quantity: v.quantity,
      minQuantity: v.minQuantity,
      alertOnLowStock: v.alertOnLowStock ?? false,
    }));

    const res: LowStockResponse = { count, items };
    return ok(res, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}
