"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Check, Settings2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InvoiceRender } from "@/components/invoice-print-surface";
import { useInvoiceBranding } from "@/lib/use-invoice-branding";
import { usePrintSettings } from "@/lib/use-print-settings";
import { cn } from "@/lib/cn";
import {
  PRINT_SIZES,
  PRINT_SIZE_LABELS,
  PRINT_FONT_SIZES,
  PRINT_FONT_SIZE_LABELS,
  isThermalSize,
  type PrintFontSize,
  type PrintSize,
} from "@/lib/print-settings";
import type { InvoiceTemplate } from "@/lib/invoice-templates";
import type { SaleDTO } from "@/lib/types";

// نافذة الطباعة: اختيار المقاس/حجم الخط مع معاينة حيّة، ورابط للتخصيص الكامل.
// الطباعة الفعلية يشغّلها الأب عبر onPrint (الذي يوجّه الحاوية المخفية).
export function PrintInvoiceModal({
  sale,
  template,
  open,
  onClose,
  onPrint,
}: {
  sale: SaleDTO;
  template: InvoiceTemplate;
  open: boolean;
  onClose: () => void;
  onPrint: (size: PrintSize, fontSize: PrintFontSize) => void;
}) {
  const router = useRouter();
  const branding = useInvoiceBranding();
  const { settings } = usePrintSettings();
  const [size, setSize] = useState<PrintSize>(settings.size);
  const [fontSize, setFontSize] = useState<PrintFontSize>(settings.fontSize);

  // كلما فُتحت النافذة، ابدأ من المقاس/الخط المحفوظين.
  useEffect(() => {
    if (open) {
      setSize(settings.size);
      setFontSize(settings.fontSize);
    }
  }, [open, settings.size, settings.fontSize]);

  const draft = { ...settings, size, fontSize };

  function goCustomize() {
    onClose();
    router.push("/settings?tab=print");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="طباعة الفاتورة"
      size="lg"
      footer={
        <>
          <button
            onClick={() => onPrint(size, fontSize)}
            className="btn btn-primary w-full sm:w-auto"
          >
            <Printer className="h-4 w-4" />
            طباعة {PRINT_SIZE_LABELS[size]}
          </button>
          <button onClick={onClose} className="btn btn-ghost w-full sm:w-auto">
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text">مقاس الطباعة</p>
          <button
            type="button"
            onClick={goCustomize}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <Settings2 className="h-3.5 w-3.5" />
            تخصيص
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRINT_SIZES.map((s) => (
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
              <span className="font-medium">{PRINT_SIZE_LABELS[s]}</span>
              {size === s && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-text">حجم الخط</p>
          <div className="grid grid-cols-3 gap-2">
            {PRINT_FONT_SIZES.map((fs) => (
              <button
                key={fs}
                onClick={() => setFontSize(fs)}
                className={cn(
                  "rounded-lg border p-2.5 text-center text-sm font-medium transition-colors",
                  fontSize === fs
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-[var(--border)] text-text hover:bg-[var(--surface-2)]"
                )}
              >
                {PRINT_FONT_SIZE_LABELS[fs]}
              </button>
            ))}
          </div>
        </div>

        {/* معاينة حيّة — للمقاسات الحرارية تُعرض بعرض الرول الفعلي (ضيّق) */}
        <div>
          <p className="mb-2 text-sm font-medium text-text">معاينة</p>
          <div className="flex max-h-[46vh] justify-center overflow-auto rounded-lg border bg-[var(--surface-2)] p-4">
            {isThermalSize(size) ? (
              <div
                className="eb-paper-sim"
                style={{ width: size === "58mm" ? 219 : 302 }}
              >
                <InvoiceRender
                  sale={sale}
                  settings={draft}
                  template={template}
                  branding={branding}
                />
              </div>
            ) : (
              <InvoiceRender
                sale={sale}
                settings={draft}
                template={template}
                branding={branding}
              />
            )}
          </div>
        </div>

        {/* تنبيه إعداد الطابعة الحرارية — يظهر قبل الطباعة للمقاسات الحرارية */}
        {isThermalSize(size) && (
          <p className="text-center text-xs leading-relaxed text-muted">
            تأكد من اختيار الطابعة XP-80C وتعطيل خيار «Fit to page».
            <br />
            في Firefox: More Settings ← Paper size ← اختر Roll paper 80mm.
          </p>
        )}
      </div>
    </Modal>
  );
}
