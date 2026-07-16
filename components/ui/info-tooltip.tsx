"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

// أيقونة «؟» صغيرة تعرض تلميحاً قصيراً: بالمرور بالفأرة (سطح المكتب) أو باللمس
// (الموبايل). نمط خفيف يعتمد على الحالة والتموضع دون أي مكتبة خارجية.
export function InfoTooltip({
  text,
  className,
  label = "شرح الحقل",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // إغلاق التلميح عند اللمس/النقر خارجه (مهم على الموبايل حيث لا يوجد مرور فأرة)
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full right-1/2 z-50 mb-1.5 w-max max-w-[220px] translate-x-1/2 rounded-[var(--radius-md)] border bg-surface px-2.5 py-1.5 text-xs font-normal leading-relaxed text-text shadow-card"
          style={{ borderColor: "var(--border)" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// عنوان حقل مع أيقونة تلميح اختيارية بجواره — يحافظ على نمط ‎.label‎ القائم.
export function FieldLabel({
  children,
  help,
  className,
}: {
  children: ReactNode;
  help?: string;
  className?: string;
}) {
  return (
    <div className={cn("label flex items-center gap-1", className)}>
      <span>{children}</span>
      {help && <InfoTooltip text={help} />}
    </div>
  );
}
