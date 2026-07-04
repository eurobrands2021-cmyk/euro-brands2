"use client";

import { useState } from "react";
import { QrCode, Layers } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { TicketPrintModal, type TicketItem } from "@/components/ticket-print-modal";
import { BRANCH_LABELS } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ProductDTO, VariantDTO } from "@/lib/types";

// زر «طباعة QR» على بطاقة/صف المنتج في المخزون — يفتح نافذة اختيار الصنف
// ثم نافذة طباعة التيكيت القائمة مباشرةً (مع تفعيل QR افتراضياً).
export function PrintQrButton({
  product,
  className,
}: {
  product: ProductDTO;
  className?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ticketItems, setTicketItems] = useState<TicketItem[] | null>(null);

  // الأصناف القابلة للطباعة (لها كود SKU)
  const printable = product.variants.filter((v) => v.sku && v.sku.trim());

  function itemFor(v: VariantDTO): TicketItem {
    return {
      sku: v.sku!,
      productName: product.name,
      brand: product.brand,
      size: v.size,
      color: v.color,
      price: v.price,
    };
  }

  function handleClick() {
    if (printable.length === 0) {
      toast.error("لا توجد أصناف لها كود SKU للطباعة. احفظ المنتج أولاً.");
      return;
    }
    // صنف واحد فقط → افتح نافذة الطباعة مباشرةً دون اختيار
    if (printable.length === 1) {
      setTicketItems([itemFor(printable[0])]);
      return;
    }
    setPickerOpen(true);
  }

  function pickAll() {
    setTicketItems(printable.map(itemFor));
    setPickerOpen(false);
  }

  function pickVariant(v: VariantDTO) {
    setTicketItems([itemFor(v)]);
    setPickerOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "btn btn-ghost !px-0 text-accent hover:bg-accent-soft",
          className
        )}
        aria-label="طباعة QR"
        title="طباعة QR"
      >
        <QrCode className="h-4 w-4" />
      </button>

      {/* اختيار الصنف المراد طباعته */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={`طباعة QR — ${product.name}`}
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            اختر الصنف الذي تريد طباعة QR له، أو اطبع كل الأصناف.
          </p>

          <button
            type="button"
            onClick={pickAll}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-accent bg-accent-soft p-3 text-sm font-bold text-text transition-colors hover:bg-accent/10"
          >
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-accent" />
              كل الأصناف
            </span>
            <span className="nums text-xs text-muted">
              {formatNumber(printable.length)} صنف
            </span>
          </button>

          <div className="max-h-[52vh] space-y-2 overflow-auto">
            {printable.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => pickVariant(v)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-right text-sm transition-colors hover:border-accent hover:bg-accent-soft"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-text">
                    <span>المقاس: {v.size}</span>
                    {v.color && <span>· اللون: {v.color}</span>}
                    <span className="text-muted">· {BRANCH_LABELS[v.branch]}</span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted">
                    {v.sku}
                  </span>
                </span>
                <span className="nums shrink-0 text-xs font-bold text-accent">
                  {formatCurrency(v.price)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* نافذة طباعة التيكيت القائمة — QR مفعّل افتراضياً */}
      <TicketPrintModal
        open={ticketItems !== null}
        items={ticketItems ?? []}
        onClose={() => setTicketItems(null)}
        ensureQr
      />
    </>
  );
}
