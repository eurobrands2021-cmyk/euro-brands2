"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { COMMON_COLORS, COLOR_HEX } from "@/lib/constants";

const OTHER = "__other__";

// قائمة مقاسات منسدلة موحّدة: تعرض القيم القياسية للفئة + خيار «أخرى…» لإدخال
// مقاس مخصّص (مثل حجم عطر غير قياسي). القيم المحفوظة خارج القائمة تبقى ظاهرة.
export function SizeSelect({
  value,
  onChange,
  options,
  className,
  selectClassName,
  placeholder = "اختر المقاس",
  customPlaceholder = "مقاس مخصّص",
  autoFocusCustom = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  className?: string;
  // لتجاوز نمط ‎.input‎ الافتراضي (مثلاً خلية جدول مضغوطة)
  selectClassName?: string;
  placeholder?: string;
  customPlaceholder?: string;
  autoFocusCustom?: boolean;
}) {
  // وضع الإدخال المخصّص: يبدأ مفعّلاً لو القيمة الحالية خارج القائمة القياسية.
  const [custom, setCustom] = useState(
    value !== "" && !options.includes(value)
  );

  // لو صارت القيمة ضمن القائمة (مثلاً بعد تغيّر الفئة) اخرج من وضع المخصّص.
  useEffect(() => {
    if (options.includes(value)) setCustom(false);
  }, [options, value]);

  const showCustomOption = value === "" || options.includes(value) || custom;

  return (
    <>
      <select
        className={selectClassName ?? cn("input", className)}
        value={custom ? OTHER : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        {/* قيمة محفوظة خارج القائمة القياسية تبقى ظاهرة (وليست في وضع المخصّص) */}
        {!custom && value && !options.includes(value) && (
          <option value={value}>{value}</option>
        )}
        {showCustomOption && <option value={OTHER}>أخرى…</option>}
      </select>
      {custom && (
        <input
          className={selectClassName ? cn("mt-1", selectClassName) : cn("input mt-2", className)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={customPlaceholder}
          autoFocus={autoFocusCustom}
        />
      )}
    </>
  );
}

// نقطة لون صغيرة كمعاينة بصرية بجوار القائمة المنسدلة.
export function ColorDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  const hex = COLOR_HEX[color];
  return (
    <span
      aria-hidden
      className={cn(
        "block h-4 w-4 shrink-0 rounded-full border",
        !hex && "opacity-40",
        className
      )}
      style={{
        backgroundColor: hex ?? "transparent",
        borderColor: "var(--border)",
      }}
    />
  );
}

// قائمة ألوان منسدلة موحّدة مع نقطة معاينة اللون. تُستخدم في كل الأماكن بدل
// الإدخال الحر لضمان قيم موحّدة (فورم المنتج، الإضافة السريعة، استيراد Excel).
export function ColorSelect({
  value,
  onChange,
  className,
  selectClassName,
  emptyLabel = "— بدون لون —",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  // لتجاوز نمط ‎.input‎ الافتراضي (مثلاً خلية جدول مضغوطة)
  selectClassName?: string;
  emptyLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <ColorDot color={value} />
      <select
        className={selectClassName ?? cn("input", className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {COMMON_COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        {/* لون محفوظ/مستورد خارج القائمة يبقى ظاهراً */}
        {value && !COMMON_COLORS.includes(value as (typeof COMMON_COLORS)[number]) && (
          <option value={value}>{value}</option>
        )}
      </select>
    </div>
  );
}
