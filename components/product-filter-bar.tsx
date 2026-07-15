"use client";

import { useMemo } from "react";
import { useFetch } from "@/lib/use-fetch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/cn";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type CategoryValue,
} from "@/lib/constants";
import type { BrandDTO } from "@/lib/types";

// تبويبات الفئة الثابتة: «الكل» + الفئات الأربع
export const CATEGORY_TABS: { value: CategoryValue | "ALL"; label: string }[] = [
  { value: "ALL", label: "الكل" },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
];

// هل تبدأ الكلمة بحرف عربي؟ (لترتيب العربية قبل الإنجليزية)
function isArabicWord(s: string) {
  return /[؀-ۿ]/.test(s.trim().charAt(0));
}

// ترتيب البراندات: العربية (أ-ي) أولاً ثم الإنجليزية (A-Z)
export function compareBrands(a: string, b: string) {
  const aArabic = isArabicWord(a);
  const bArabic = isArabicWord(b);
  if (aArabic !== bArabic) return aArabic ? -1 : 1;
  return a.localeCompare(b, aArabic ? "ar" : "en");
}

// شريط الفلترة الموحّد للمنتجات: تبويبات الفئة + قائمة البراند القابلة للبحث
// (تظهر بعد اختيار فئة). يُستخدم في نقطة البيع وصفحة تعديل الفاتورة لتوفير
// «تصفّح بالبراند أولاً»: اختر فئة ثم براند لعرض كل منتجاته دون كتابة.
export function ProductFilterBar({
  category,
  brand,
  onCategory,
  onBrand,
  className,
}: {
  category: CategoryValue | "ALL";
  brand: string | null;
  onCategory: (c: CategoryValue | "ALL") => void;
  onBrand: (b: string | null) => void;
  className?: string;
}) {
  // شرائح البراند تظهر فقط بعد اختيار فئة (لا تُعرض عند «الكل»)
  const showBrands = category !== "ALL";
  const { data: brandsData } = useFetch<BrandDTO[]>(
    showBrands ? `/api/brands?category=${category}` : null
  );
  const brands = useMemo(() => {
    const names = Array.from(new Set((brandsData ?? []).map((b) => b.name)));
    return names.sort(compareBrands);
  }, [brandsData]);

  return (
    <div className={cn("space-y-2", className)}>
      {/* الصف الأول: تبويبات الفئة */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onCategory(t.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              category === t.value
                ? "border-accent bg-accent-soft text-accent"
                : "text-muted hover:text-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* الصف الثاني: فلتر البراند — قائمة قابلة للبحث (بعد اختيار فئة فقط).
          اختيار براند يعرض كل منتجاته فوراً (تصفّح بالبراند أولاً). */}
      {showBrands && brands.length > 0 && (
        <SearchableSelect
          className="sm:max-w-xs"
          value={brand ?? ""}
          onChange={(v) => onBrand(v || null)}
          options={brands.map((b) => ({ value: b, label: b }))}
          placeholder="كل البراندات"
          searchPlaceholder="ابحث عن براند…"
          ariaLabel="فلترة بالبراند"
          emptyMessage="لا توجد براندات"
        />
      )}
    </div>
  );
}
