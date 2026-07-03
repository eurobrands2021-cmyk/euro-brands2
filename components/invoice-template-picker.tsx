"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  INVOICE_TEMPLATES,
  INVOICE_TEMPLATE_LABELS,
  INVOICE_TEMPLATE_DESC,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";

// منتقي قالب الفاتورة (كلاسيك/مينيمال/بولد) — يُستخدم في صفحة الفاتورة والإعدادات.
export function InvoiceTemplatePicker({
  value,
  onChange,
  className,
}: {
  value: InvoiceTemplate;
  onChange: (t: InvoiceTemplate) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-3", className)}>
      {INVOICE_TEMPLATES.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-3 text-right transition-colors",
            value === t
              ? "border-accent bg-accent-soft"
              : "border-[var(--border)] hover:bg-[var(--surface-2)]"
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm font-bold",
                value === t ? "text-accent" : "text-text"
              )}
            >
              {INVOICE_TEMPLATE_LABELS[t]}
            </span>
            {value === t && <Check className="h-4 w-4 shrink-0 text-accent" />}
          </span>
          <span className="text-[11px] leading-relaxed text-muted">
            {INVOICE_TEMPLATE_DESC[t]}
          </span>
        </button>
      ))}
    </div>
  );
}
