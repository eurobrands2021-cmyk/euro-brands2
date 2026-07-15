// أدوات بحث نصي عربي على مستوى SQL (Postgres) — مشتركة بين المسارات.
// تطبيع خام داخل Postgres يوازي normalizeArabic (توحيد الهمزة/الأرقام، حذف
// التطويل/التشكيل، تقليص الفراغات) لكنه *لا* يزيل «ال» التعريف. هذا يجعله
// مجموعة فائقة (superset): يطابق كل ما تطابقه الدالة في JS وربما أكثر، فنُضيّق
// المرشّحين على مستوى SQL بدل تحميل الجدول كاملاً ثم (اختيارياً) نُطبّق
// normalizeArabic الدقيق في JS لضمان تطابق تام.
import { Prisma } from "@prisma/client";

const FOLD_FROM = "آأإؤئى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ـء";
const FOLD_TO = "اااويي01234567890123456789";

// تعبير SQL يطبّع نصاً معطى (يُمرَّر كتعبير عمود خام)
export function foldSql(columnExpr: string) {
  return Prisma.raw(
    `regexp_replace(regexp_replace(translate(lower(${columnExpr}), '${FOLD_FROM}', '${FOLD_TO}'), '[ً-ْٰ]', '', 'g'), '\\s+', ' ', 'g')`
  );
}

// يبني نمط ILIKE آمناً (تهريب الرموز الخاصة % _ \)
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
