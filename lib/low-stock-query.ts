// استعلامات قاعدة البيانات للأصناف منخفضة المخزون — مبنية على نفس التعريف
// الموحّد في lib/low-stock (alertOnLowStock + quantity <= minQuantity).
// مقارنة عمودين (quantity <= minQuantity) لا يدعمها Prisma مباشرة، لذا نستخدم
// SQL خاماً بحدٍّ أقصى بدل تحميل كل الأصناف وتصفيتها في الذاكرة.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { LowStockRow } from "./low-stock";

export type { LowStockRow } from "./low-stock";

export function fetchLowStockVariants(limit: number): Promise<LowStockRow[]> {
  return prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
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
    WHERE v."alertOnLowStock" = true AND v."quantity" <= v."minQuantity"
    ORDER BY (v."quantity" - v."minQuantity") ASC
    LIMIT ${limit}
  `);
}

// العدّ الكامل للأصناف منخفضة المخزون بنفس التعريف (لشارة التنبيه).
export async function countLowStockVariants(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM "ProductVariant"
    WHERE "alertOnLowStock" = true AND "quantity" <= "minQuantity"
  `);
  return Number(rows[0]?.count ?? 0);
}
