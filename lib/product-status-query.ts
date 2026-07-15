// استعلامات حالة المخزون على مستوى المنتج (منخفض/نفد) لصفحة المخزون.
// «منخفض» و«نفد» يُعرّفان على مستوى الصنف (variant) ضمن نطاق الفرع/المقاس،
// والمنتج يُحسب ضمن الحالة إذا كان له صنف واحد على الأقل يحقّق الشرط.
//
// مقارنة عمودين (quantity <= minQuantity) لا يدعمها Prisma مباشرة، لذا نستخدم
// SQL خاماً بدل تحميل جدول الأصناف كاملاً وتصفيته في الذاكرة. التعريف مطابق
// لـ lib/low-stock (alertOnLowStock + quantity <= minQuantity) مع استثناء
// المنفَد (كمية صفر) من «منخفض» لأنه يُعرَض في تبويب «نفد» المستقل.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export interface StatusQueryFilters {
  category?: string | null;
  brand?: string | null;
  branch?: string | null;
  size?: string | null;
  drafts?: boolean;
}

function buildConditions(
  status: "low" | "out",
  f: StatusQueryFilters
): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  // مقارنة الـ enum كنص لتفادي الحاجة لاسم النوع الدقيق في Postgres
  if (f.category) conds.push(Prisma.sql`p."category"::text = ${f.category}`);
  if (f.brand) conds.push(Prisma.sql`p."brand" = ${f.brand}`);
  if (f.drafts) conds.push(Prisma.sql`p."isDraft" = true`);
  if (f.branch) conds.push(Prisma.sql`v."branch"::text = ${f.branch}`);
  if (f.size) conds.push(Prisma.sql`v."size" = ${f.size}`);
  conds.push(
    status === "out"
      ? Prisma.sql`v."quantity" = 0`
      : Prisma.sql`v."alertOnLowStock" = true AND v."quantity" > 0 AND v."quantity" <= v."minQuantity"`
  );
  return Prisma.join(conds, " AND ");
}

// معرّفات المنتجات التي لها صنف مطابق للحالة ضمن النطاق. تُستخدم لتصفية القائمة
// المرقّمة (where.id in) ولحساب عدد التبويب.
export async function selectStatusProductIds(
  status: "low" | "out",
  filters: StatusQueryFilters
): Promise<string[]> {
  const where = buildConditions(status, filters);
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT p."id"
    FROM "Product" p
    JOIN "ProductVariant" v ON v."productId" = p."id"
    WHERE ${where}
  `);
  return rows.map((r) => r.id);
}
