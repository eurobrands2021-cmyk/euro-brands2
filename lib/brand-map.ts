// خريطة أسماء البراندات بين العربية والإنجليزية — بحث موحّد بأي لغة.
// البحث بـ "نايك" أو "Nike" يعطي نفس النتائج. تُستخدم في بحث المخزون
// (خادماً وعميلاً) عبر توسعة عبارة البحث لتشمل المقابل بالّلغة الأخرى.

import { normalizeArabic } from "./normalize";

// كل مجموعة: [الاسم الإنجليزي, ...المرادفات العربية]
export const BRAND_ALIASES: string[][] = [
  ["Nike", "نايك"],
  ["Adidas", "أديداس", "اديداس"],
  ["Zara", "زارا"],
  ["H&M", "اتش اند ام", "إتش آند إم", "hm"],
  ["Puma", "بوما"],
  ["Gucci", "جوتشي", "غوتشي"],
  ["Prada", "برادا"],
  ["Versace", "فيرزاتشي", "فيرساتشي"],
  ["Lacoste", "لاكوست"],
  ["Tommy Hilfiger", "تومي", "تومي هيلفيغر"],
  ["Calvin Klein", "كالفن كلاين", "سي كي", "ck"],
  ["Levis", "ليفايز", "ليفيس", "levi's"],
  ["Reebok", "ريبوك"],
  ["New Balance", "نيو بالانس"],
  ["Under Armour", "اندر ارمور", "أندر آرمور"],
  ["Balenciaga", "بالنسياغا", "بالنسياجا"],
  ["Louis Vuitton", "لويس فيتون", "louis vuitton", "lv"],
  ["Dior", "ديور"],
  ["Chanel", "شانيل"],
  ["Burberry", "بربري"],
  ["Guess", "جيس", "غيس"],
  ["Timberland", "تمبرلاند"],
  ["Vans", "فانز"],
  ["Converse", "كونفرس"],
  ["Fila", "فيلا"],
  ["Zac", "زاك"],
  ["Polo", "بولو"],
  ["Massimo Dutti", "ماسيمو", "ماسيمو دوتي"],
  ["Bershka", "بيرشكا"],
  ["Pull & Bear", "بول اند بير"],
  ["Stradivarius", "ستراديفاريوس"],
  ["Defacto", "ديفاكتو"],
  ["LC Waikiki", "ال سي وايكيكي", "وايكيكي"],
];

// فهرس معكوس: من الشكل المطبَّع لأي مرادف → كل مرادفات المجموعة (مطبَّعة)
const ALIAS_INDEX: Map<string, string[]> = (() => {
  const idx = new Map<string, string[]>();
  for (const group of BRAND_ALIASES) {
    const normed = group.map((g) => normalizeArabic(g)).filter(Boolean);
    for (const form of normed) {
      const existing = idx.get(form) ?? [];
      idx.set(form, [...new Set([...existing, ...normed])]);
    }
  }
  return idx;
})();

// توسعة عبارة البحث المطبَّعة لتشمل مقابلاتها بالّلغة الأخرى (إن كانت اسم براند).
// تُعيد دائماً العبارة الأصلية ضمن النتيجة.
export function expandBrandQuery(normalizedQuery: string): string[] {
  const q = normalizedQuery.trim();
  if (!q) return [];
  const terms = new Set<string>([q]);
  // مطابقة كاملة أو جزئية: أي مجموعة مرادفات يظهر فيها أحد أشكالها ضمن العبارة
  for (const [form, group] of ALIAS_INDEX.entries()) {
    if (q === form || q.includes(form) || form.includes(q)) {
      for (const g of group) terms.add(g);
    }
  }
  return [...terms];
}

// هل يطابق النص المُدخل (اسم/براند) عبارةَ البحث مع اعتبار مرادفات البراند؟
export function matchesWithBrandAliases(
  fields: (string | null | undefined)[],
  rawQuery: string
): boolean {
  const nq = normalizeArabic(rawQuery);
  if (!nq) return true;
  const terms = expandBrandQuery(nq);
  const normFields = fields.map((f) => normalizeArabic(f));
  return terms.some((t) => normFields.some((nf) => nf.includes(t)));
}
