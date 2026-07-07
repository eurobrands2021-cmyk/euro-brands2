"use client";

import { forwardRef, useId, useMemo } from "react";
import {
  EGY_PHONE_PREFIXES,
  composeEgyPhone,
  digitsOnly,
  egyPhoneLabel,
  isNumericKeyAllowed,
  isTextOnlyKeyAllowed,
  sanitizeNumber,
  sanitizeTextOnly,
  splitEgyPhone,
} from "@/lib/input-validators";

type BaseInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "type"
>;

export interface NumberInputProps extends BaseInputProps {
  value: string;
  onChange: (value: string) => void;
  decimal?: boolean;
  max?: number;
  maxLength?: number;
}

// مدخل رقمي بتنظيف لحظي: أرقام فقط + (اختيارياً) نقطة عشرية + قصّ على max.
// يمنع الأحرف غير المسموح بها على onKeyDown ويعقّم اللصق.
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { value, onChange, decimal = false, max, maxLength, onKeyDown, onPaste, inputMode, ...rest },
    ref
  ) {
    return (
      <input
        ref={ref}
        type="text"
        inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
        value={value}
        onChange={(e) =>
          onChange(sanitizeNumber(e.target.value, { decimal, max, maxLength }))
        }
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (!isNumericKeyAllowed(e, decimal)) {
            e.preventDefault();
          }
        }}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          const text = e.clipboardData.getData("text");
          const cleaned = sanitizeNumber(text, { decimal, max, maxLength });
          if (cleaned !== text) {
            e.preventDefault();
            const target = e.currentTarget;
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? target.value.length;
            const next = sanitizeNumber(
              target.value.slice(0, start) + cleaned + target.value.slice(end),
              { decimal, max, maxLength }
            );
            onChange(next);
          }
        }}
        {...rest}
      />
    );
  }
);

export interface TextOnlyInputProps extends BaseInputProps {
  value: string;
  onChange: (value: string) => void;
}

// مدخل نصي: أحرف عربية ولاتينية + مسافة و - ' . & فقط.
export const TextOnlyInput = forwardRef<HTMLInputElement, TextOnlyInputProps>(
  function TextOnlyInput(
    { value, onChange, onKeyDown, onPaste, ...rest },
    ref
  ) {
    return (
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(sanitizeTextOnly(e.target.value))}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (!isTextOnlyKeyAllowed(e)) e.preventDefault();
        }}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          const text = e.clipboardData.getData("text");
          const cleaned = sanitizeTextOnly(text);
          if (cleaned !== text) {
            e.preventDefault();
            const target = e.currentTarget;
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? target.value.length;
            const next = sanitizeTextOnly(
              target.value.slice(0, start) + cleaned + target.value.slice(end)
            );
            onChange(next);
          }
        }}
        {...rest}
      />
    );
  }
);

export interface PhoneInputProps {
  value: string; // الرقم الكامل (حتى 11 رقم)
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  showHint?: boolean;
}

// مدخل هاتف مصري: قائمة منسدلة للبادئة + 8 أرقام.
// يدمج البادئة + الباقي إلى رقم كامل 11 رقم للتخزين.
export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  id,
  name,
  showHint = true,
}: PhoneInputProps) {
  const reactId = useId();
  const inputId = id ?? `phone-${reactId}`;

  const { prefix, rest } = useMemo(() => splitEgyPhone(value), [value]);
  const label = egyPhoneLabel(prefix);

  return (
    <div className={className}>
      <div className="flex gap-2">
        <select
          className="input w-auto flex-shrink-0 nums"
          value={prefix}
          disabled={disabled}
          onChange={(e) => onChange(composeEgyPhone(e.target.value, rest))}
          aria-label="بادئة الشبكة"
        >
          {EGY_PHONE_PREFIXES.map((p) => (
            <option key={p.prefix} value={p.prefix}>
              {p.prefix} {p.label}
            </option>
          ))}
        </select>
        <NumberInput
          id={inputId}
          name={name}
          className="input nums flex-1"
          placeholder={placeholder ?? "12345678"}
          value={rest}
          maxLength={8}
          disabled={disabled}
          onChange={(rest8) => onChange(composeEgyPhone(prefix, rest8))}
          onPaste={(e) => {
            // لصق رقم كامل (11 رقماً ببادئة مصرية) في خانة الأرقام → أعد
            // تقسيمه لبادئة + 8 أرقام بدل قصّه، حتى يُملأ الاسم تلقائياً.
            const digits = digitsOnly(e.clipboardData.getData("text"));
            if (
              digits.length >= 11 &&
              EGY_PHONE_PREFIXES.some((p) => digits.startsWith(p.prefix))
            ) {
              e.preventDefault();
              const parsed = splitEgyPhone(digits);
              onChange(composeEgyPhone(parsed.prefix, parsed.rest));
            }
          }}
        />
      </div>
      {showHint && (
        <p className="mt-1 text-xs text-muted nums">
          {label ? `${label} · ` : ""}
          {prefix}
          {rest.padEnd(8, "_")}
        </p>
      )}
    </div>
  );
}
