import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError, CACHE_NONE } from "@/lib/api";
import { MOCK_MODE, mockLowStock } from "@/lib/mock-store";
import type { BranchValue } from "@/lib/constants";
import type { LowStockItem, LowStockResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// أقصى عدد أصناف تُعاد ضمن القائمة. القائمة تُعرض في تنبيهات صغيرة
// (شارة العدّ + قائمة منسدلة)، وهذا السقف يحمي من تحميل جدول الأصناف كاملاً.
const LOW_STOCK_LIMIT = 200;

// صف خام من استعلام الأصناف منخفضة المخزون
interface LowStockRow {
  id: string;
  productName: string;
  brand: string;
  branch: string;
  size: string;
  color: string | null;
  quantity: number;
  minQuantity: number;
  alertOnLowStock: boolean;
}

// GET /api/low-stock — المقاسات التي كميتها <= الحد الأدنى
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockLowStock());

    // مقارنة عمودين (quantity <= minQuantity) لا يدعمها Prisma مباشرة، لذا
    // نستخدم SQL خاماً بحدٍّ أقصى بدلاً من جلب كل الأصناف وتصفيتها في الذاكرة.
    // نجلب أيضاً العدّ الحقيقي كاملاً كي تبقى شارة التنبيه دقيقة تماماً.
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
        SELECT v."id",
               p."name"            AS "productName",
               p."brand"           AS "brand",
               v."branch"          AS "branch",
               v."size"            AS "size",
               v."color"           AS "color",
               v."quantity"        AS "quantity",
               v."minQuantity"     AS "minQuantity",
               v."alertOnLowStock" AS "alertOnLowStock"
        FROM "ProductVariant" v
        JOIN "Product" p ON p."id" = v."productId"
        WHERE v."quantity" <= v."minQuantity"
        ORDER BY (v."quantity" - v."minQuantity") ASC
        LIMIT ${LOW_STOCK_LIMIT}
      `),
      prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS count
        FROM "ProductVariant"
        WHERE "quantity" <= "minQuantity"
      `),
    ]);

    const items: LowStockItem[] = rows.map((v) => ({
      id: v.id,
      productName: v.productName,
      brand: v.brand,
      branch: v.branch as BranchValue,
      size: v.size,
      color: v.color ?? null,
      quantity: v.quantity,
      minQuantity: v.minQuantity,
      alertOnLowStock: v.alertOnLowStock ?? false,
    }));

    const res: LowStockResponse = {
      count: Number(countRows[0]?.count ?? items.length),
      items,
    };
    return ok(res, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}
