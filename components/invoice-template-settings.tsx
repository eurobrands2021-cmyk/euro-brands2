"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { InvoiceTemplatePicker } from "@/components/invoice-template-picker";
import { InvoiceDocument } from "@/components/invoice-document";
import { useInvoiceBranding } from "@/lib/use-invoice-branding";
import {
  loadInvoiceTemplate,
  saveInvoiceTemplate,
  INVOICE_TEMPLATE_LABELS,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";
import type { SaleDTO } from "@/lib/types";

// فاتورة عيّنة لمعاينة القوالب في الإعدادات
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
  paidAmount: 1305,
  remainingAmount: 0,
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

// بطاقة إعدادات قالب الفاتورة — تختار القالب الافتراضي وتعرض معاينة حيّة.
export function InvoiceTemplateSettingsCard() {
  const [template, setTemplate] = useState<InvoiceTemplate>("classic");
  const branding = useInvoiceBranding();

  useEffect(() => {
    setTemplate(loadInvoiceTemplate());
  }, []);

  function change(t: InvoiceTemplate) {
    setTemplate(t);
    saveInvoiceTemplate(t);
    toast.success(`تم اختيار قالب «${INVOICE_TEMPLATE_LABELS[t]}»`);
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
        <FileText className="h-5 w-5 text-accent" />
        قالب الفاتورة الافتراضي
      </h2>
      <InvoiceTemplatePicker value={template} onChange={change} />
      <p className="mb-2 mt-4 text-sm font-medium text-text">معاينة</p>
      <div className="max-h-[420px] overflow-auto rounded-lg border bg-[var(--surface-2)] p-4">
        <InvoiceDocument
          sale={SAMPLE_SALE}
          template={template}
          size="a4"
          branding={branding}
        />
      </div>
    </Card>
  );
}
