"use client";

import {
  InvoiceDocument,
  type InvoiceBranding,
} from "@/components/invoice-document";
import { ThermalReceipt } from "@/components/thermal-receipt";
import { isThermalSize, type PrintSettings } from "@/lib/print-settings";
import type { InvoiceTemplate } from "@/lib/invoice-templates";
import type { SaleDTO } from "@/lib/types";

// يعرض الفاتورة بالتخطيط المناسب للمقاس المختار:
//   80mm/58mm → إيصال حراري أحادي المسافة
//   A4/A5     → مستند الفاتورة بالقالب المختار
// المحتوى في الحالتين يخضع لمفاتيح إعدادات الطباعة.
export function InvoiceRender({
  sale,
  settings,
  template,
  branding,
  className,
}: {
  sale: SaleDTO;
  settings: PrintSettings;
  template: InvoiceTemplate;
  branding?: InvoiceBranding;
  className?: string;
}) {
  if (isThermalSize(settings.size)) {
    return (
      <ThermalReceipt
        sale={sale}
        settings={settings}
        branding={branding}
        className={className}
      />
    );
  }
  return (
    <InvoiceDocument
      sale={sale}
      template={template}
      size={settings.size === "a5" ? "a5" : "a4"}
      branding={branding}
      fields={settings.fields}
      thankYouMessage={settings.thankYouMessage}
      className={className}
    />
  );
}

// حاوية الطباعة المخفية خارج الشاشة — يطبعها triggerInvoicePrint فقط.
export function InvoicePrintSurface(props: {
  sale: SaleDTO;
  settings: PrintSettings;
  template: InvoiceTemplate;
  branding?: InvoiceBranding;
}) {
  return (
    <div className="eb-print-area" aria-hidden>
      <InvoiceRender {...props} />
    </div>
  );
}
