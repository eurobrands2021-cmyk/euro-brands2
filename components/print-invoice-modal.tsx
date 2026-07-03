"use client";

import { useState } from "react";
import { Printer, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InvoiceDocument } from "@/components/invoice-document";
import { cn } from "@/lib/cn";
import {
  INVOICE_SIZES,
  INVOICE_SIZE_LABELS,
  type InvoiceSize,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";
import type { SaleDTO } from "@/lib/types";

// نافذة اختيار مقاس الطباعة مع معاينة حيّة قبل الطباعة.
export function PrintInvoiceModal({
  sale,
  template,
  open,
  onClose,
}: {
  sale: SaleDTO;
  template: InvoiceTemplate;
  open: boolean;
  onClose: () => void;
}) {
  const [size, setSize] = useState<InvoiceSize>("a4");

  function handlePrint() {
    const sizeClasses = INVOICE_SIZES.map((s) => `inv-size-${s}`);
    document.body.classList.remove(...sizeClasses);
    document.body.classList.add("inv-print", `inv-size-${size}`);
    const cleanup = () => {
      document.body.classList.remove("inv-print", ...sizeClasses);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="طباعة الفاتورة"
      size="lg"
      footer={
        <>
          <button onClick={handlePrint} className="btn btn-primary w-full sm:w-auto">
            <Printer className="h-4 w-4" />
            طباعة {INVOICE_SIZE_LABELS[size]}
          </button>
          <button onClick={onClose} className="btn btn-ghost w-full sm:w-auto">
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-text">مقاس الطباعة</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {INVOICE_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border p-3 text-right text-sm transition-colors",
                  size === s
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-[var(--border)] text-text hover:bg-[var(--surface-2)]"
                )}
              >
                <span className="font-medium">{INVOICE_SIZE_LABELS[s]}</span>
                {size === s && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* معاينة حيّة */}
        <div>
          <p className="mb-2 text-sm font-medium text-text">معاينة</p>
          <div className="max-h-[46vh] overflow-auto rounded-lg border bg-[var(--surface-2)] p-4">
            <InvoiceDocument sale={sale} template={template} size={size} />
          </div>
        </div>
      </div>

      {/* حاوية الطباعة الفعلية (خارج الشاشة) */}
      <div className="inv-print-area" aria-hidden>
        <InvoiceDocument sale={sale} template={template} size={size} />
      </div>
    </Modal>
  );
}
