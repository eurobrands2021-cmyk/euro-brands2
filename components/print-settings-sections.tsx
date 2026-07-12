"use client";

import { useEffect, useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { InvoiceRender } from "@/components/invoice-print-surface";
import { useInvoiceBranding } from "@/lib/use-invoice-branding";
import { usePrintSettings } from "@/lib/use-print-settings";
import {
  loadInvoiceTemplate,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";
import {
  DEFAULT_PRINT_SETTINGS,
  PRINT_FIELD_ORDER,
  PRINT_FONT_SIZES,
  PRINT_FONT_SIZE_LABELS,
  PRINT_SIZES,
  PRINT_SIZE_LABELS,
  isThermalSize,
  type PrintFields,
  type PrintSettings,
} from "@/lib/print-settings";
import { cn } from "@/lib/cn";
import type { SaleDTO } from "@/lib/types";

// فاتورة عيّنة لمعاينة إعدادات الطباعة حيّاً.
const SAMPLE_SALE: SaleDTO = {
  id: "sample",
  saleNumber: 1234,
  branch: "HADAYEK",
  totalAmount: 1450,
  discountType: "PERCENTAGE",
  discountValue: 10,
  finalAmount: 1305,
  customerName: "محمد أحمد",
  customerPhone: "01000000000",
  customerNotes: null,
  paymentMethod: "CASH",
  transferMethod: null,
  invoiceNotes: null,
  paidAmount: 1500,
  remainingAmount: 0,
  changeAmount: 195,
  cashierName: "الكاشير",
  status: "COMPLETED",
  cancellationReason: null,
  isDelivery: false,
  orderSource: null,
  deliveryMethod: null,
  deliveryAddress: null,
  addressNotes: null,
  trackingNumber: null,
  deliveryStatus: null,
  createdAt: new Date().toISOString(),
  unlockedAt: null,
  unlockReason: null,
  items: [
    {
      id: "s1",
      productId: "p1",
      variantId: "v1",
      quantity: 1,
      unitPrice: 850,
      subtotal: 850,
      productName: "تيشرت قطن",
      brand: "Adidas",
      size: "L",
      color: "أسود",
      sku: null,
    },
    {
      id: "s2",
      productId: "p2",
      variantId: "v2",
      quantity: 2,
      unitPrice: 300,
      subtotal: 600,
      productName: "شورت رياضي",
      brand: "Nike",
      size: "M",
      color: "كحلي",
      sku: null,
    },
  ],
};

// بطاقة «إعدادات الطباعة» — تحكّم كامل في محتوى الفاتورة ومقاسها وخطها،
// مع معاينة حيّة تتحدّث فوراً وزر إعادة ضبط للافتراضيات.
export function PrintSettingsCard() {
  const { settings, setSettings } = usePrintSettings();
  const branding = useInvoiceBranding();
  const [template, setTemplate] = useState<InvoiceTemplate>("classic");

  useEffect(() => {
    setTemplate(loadInvoiceTemplate());
  }, []);

  function patch(next: Partial<PrintSettings>) {
    setSettings({ ...settings, ...next });
  }
  function toggleField(key: keyof PrintFields) {
    patch({
      fields: { ...settings.fields, [key]: !settings.fields[key] },
    });
  }
  function reset() {
    setSettings(DEFAULT_PRINT_SETTINGS);
    toast.success("تمت إعادة إعدادات الطباعة للوضع الافتراضي");
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <Printer className="h-5 w-5 text-accent" />
          إعدادات الطباعة
        </h2>
        <button
          onClick={reset}
          className="btn btn-ghost h-8 gap-1 px-2 text-xs text-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          إعادة الضبط
        </button>
      </div>

      {/* مقاس الطباعة */}
      <p className="mb-2 text-sm font-medium text-text">مقاس الطباعة</p>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRINT_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => patch({ size: s })}
            className={cn(
              "rounded-lg border p-2.5 text-center text-sm font-medium transition-colors",
              settings.size === s
                ? "border-accent bg-accent-soft text-accent"
                : "border-[var(--border)] text-text hover:bg-[var(--surface-2)]"
            )}
          >
            {PRINT_SIZE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* حجم الخط */}
      <p className="mb-2 text-sm font-medium text-text">حجم الخط</p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {PRINT_FONT_SIZES.map((fs) => (
          <button
            key={fs}
            onClick={() => patch({ fontSize: fs })}
            className={cn(
              "rounded-lg border p-2.5 text-center text-sm font-medium transition-colors",
              settings.fontSize === fs
                ? "border-accent bg-accent-soft text-accent"
                : "border-[var(--border)] text-text hover:bg-[var(--surface-2)]"
            )}
          >
            {PRINT_FONT_SIZE_LABELS[fs]}
          </button>
        ))}
      </div>

      {/* مفاتيح المحتوى */}
      <p className="mb-2 text-sm font-medium text-text">محتوى الفاتورة</p>
      <div className="mb-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PRINT_FIELD_ORDER.map(({ key, label }) => (
          <label
            key={key}
            className={cn(
              "flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              settings.fields[key]
                ? "border-accent/40 bg-accent-soft text-text"
                : "border-[var(--border)] text-muted hover:text-text"
            )}
          >
            <input
              type="checkbox"
              checked={settings.fields[key]}
              onChange={() => toggleField(key)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {label}
          </label>
        ))}
      </div>

      {/* رسالة الشكر — نص قابل للتعديل */}
      <div className="mb-4">
        <label className="label">رسالة الشكر</label>
        <input
          className="input"
          value={settings.thankYouMessage}
          onChange={(e) => patch({ thankYouMessage: e.target.value })}
          placeholder={DEFAULT_PRINT_SETTINGS.thankYouMessage}
          disabled={!settings.fields.thankYou}
        />
      </div>

      {/* معاينة حيّة */}
      <p className="mb-2 text-sm font-medium text-text">معاينة مباشرة</p>
      <div className="flex max-h-[460px] justify-center overflow-auto rounded-lg border bg-[var(--surface-2)] p-4">
        {isThermalSize(settings.size) ? (
          <div
            className="eb-paper-sim"
            style={{ width: settings.size === "58mm" ? 219 : 302 }}
          >
            <InvoiceRender
              sale={SAMPLE_SALE}
              settings={settings}
              template={template}
              branding={branding}
            />
          </div>
        ) : (
          <InvoiceRender
            sale={SAMPLE_SALE}
            settings={settings}
            template={template}
            branding={branding}
          />
        )}
      </div>
    </Card>
  );
}
