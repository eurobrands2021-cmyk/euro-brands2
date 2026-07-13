"use client";

import { useState } from "react";
import { Printer, Share2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { BranchBadge } from "@/components/ui/badge";
import { InvoicePrintSurface } from "@/components/invoice-print-surface";
import { useInvoiceBranding } from "@/lib/use-invoice-branding";
import { usePrintSettings } from "@/lib/use-print-settings";
import { triggerInvoicePrint } from "@/lib/print-trigger";
import { loadInvoiceTemplate } from "@/lib/invoice-templates";
import {
  BRANCH_LABELS,
  ORDER_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHOD_LABELS,
} from "@/lib/constants";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSaleNumber,
} from "@/lib/format";
import type { SaleDTO } from "@/lib/types";

function paymentLabel(sale: SaleDTO): string {
  const base = PAYMENT_METHOD_LABELS[sale.paymentMethod];
  if (sale.paymentMethod === "TRANSFER" && sale.transferMethod)
    return `${base} — ${TRANSFER_METHOD_LABELS[sale.transferMethod]}`;
  return base;
}

function receiptText(sale: SaleDTO): string {
  const discount = sale.totalAmount - sale.finalAmount;
  const lines = [
    "Euro Brands",
    `فاتورة ${formatSaleNumber(sale.saleNumber)}`,
    formatDateTime(sale.createdAt),
    `الفرع: ${BRANCH_LABELS[sale.branch]}`,
    "----------------------------",
    ...sale.items.flatMap((it) => {
      const gross = it.unitPrice * it.quantity;
      const itemDisc = gross - it.subtotal;
      const lines = [
        `${it.productName} (${it.size}${it.color ? `/${it.color}` : ""}) ×${it.quantity} = ${formatCurrency(it.subtotal)}`,
      ];
      if (itemDisc > 0)
        lines.push(`   خصم الصنف: - ${formatCurrency(itemDisc)}`);
      if (it.note) lines.push(`   ملاحظة: ${it.note}`);
      return lines;
    }),
    "----------------------------",
    `الإجمالي: ${formatCurrency(sale.totalAmount)}`,
    ...(discount > 0 ? [`الخصم: ${formatCurrency(discount)}`] : []),
    `الصافي: ${formatCurrency(sale.finalAmount)}`,
    `طريقة الدفع: ${paymentLabel(sale)}`,
    ...(sale.cashierName ? [`الكاشير: ${sale.cashierName}`] : []),
    `المدفوع: ${formatCurrency(sale.paidAmount)}`,
    ...(sale.remainingAmount > 0
      ? [`المتبقي: ${formatCurrency(sale.remainingAmount)}`]
      : []),
    ...(sale.changeAmount != null && sale.changeAmount > 0
      ? [`الباقي للعميل: ${formatCurrency(sale.changeAmount)}`]
      : []),
    ...(sale.customerName ? [`العميل: ${sale.customerName}`] : []),
    "شكراً لتسوقكم من Euro Brands",
  ];
  return lines.join("\n");
}

export function ReceiptModal({
  sale,
  onClose,
}: {
  sale: SaleDTO | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const branding = useInvoiceBranding();
  const { settings: printSettings } = usePrintSettings();

  if (!sale) return null;
  const discount = sale.totalAmount - sale.finalAmount;

  async function share() {
    try {
      await navigator.clipboard.writeText(receiptText(sale!));
      setCopied(true);
      toast.success("تم نسخ الفاتورة");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر النسخ");
    }
  }

  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      title="فاتورة البيع"
      footer={
        <>
          <button
            onClick={() => triggerInvoicePrint(printSettings.size)}
            className="btn btn-primary w-full sm:w-auto"
          >
            <Printer className="h-4 w-4" />
            طباعة
          </button>
          <button onClick={share} className="btn btn-secondary w-full sm:w-auto">
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            مشاركة (نسخ)
          </button>
          <button onClick={onClose} className="btn btn-ghost w-full sm:w-auto">
            إغلاق
          </button>
        </>
      }
    >
      <div className="print-receipt">
        <div className="flex items-start justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-extrabold text-white">
              EB
            </span>
            <span className="text-lg font-extrabold text-text">Euro Brands</span>
          </div>
          <div className="text-left">
            <p className="text-xl font-extrabold text-accent nums">
              {formatSaleNumber(sale.saleNumber)}
            </p>
            <p className="text-xs text-muted nums">
              {formatDateTime(sale.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between py-3 text-sm">
          <BranchBadge branch={sale.branch} />
          {sale.customerName && (
            <span className="text-text">{sale.customerName}</span>
          )}
        </div>

        <div className="space-y-1.5 border-y py-3">
          {sale.items.map((it) => {
            const gross = it.unitPrice * it.quantity;
            const itemDisc = gross - it.subtotal;
            return (
              <div key={it.id} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 truncate text-text">
                    {it.productName}{" "}
                    <span className="text-muted">
                      (<span className="nums">{it.size}</span>
                      {it.color ? `/${it.color}` : ""}) ×
                      <span className="nums">{it.quantity}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-text nums">
                    {formatCurrency(it.subtotal)}
                  </span>
                </div>
                {itemDisc > 0 && (
                  <div className="flex justify-between gap-2 text-xs text-warning">
                    <span>
                      خصم الصنف
                      {it.itemDiscountType === "PERCENTAGE" && it.itemDiscount > 0
                        ? ` (${formatNumber(it.itemDiscount)}%)`
                        : ""}
                    </span>
                    <span className="nums">- {formatCurrency(itemDisc)}</span>
                  </div>
                )}
                {it.note && (
                  <p className="text-xs text-muted">📝 {it.note}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5 pt-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>الإجمالي</span>
            <span className="nums">{formatCurrency(sale.totalAmount)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-warning">
              <span>الخصم</span>
              <span className="nums">- {formatCurrency(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-extrabold text-text">
            <span>الصافي</span>
            <span className="nums">{formatCurrency(sale.finalAmount)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>طريقة الدفع</span>
            <span>{paymentLabel(sale)}</span>
          </div>
          {sale.cashierName && (
            <div className="flex justify-between text-muted">
              <span>الكاشير</span>
              <span>{sale.cashierName}</span>
            </div>
          )}
          <div className="flex justify-between text-success">
            <span>المدفوع</span>
            <span className="nums">{formatCurrency(sale.paidAmount)}</span>
          </div>
          {sale.remainingAmount > 0 && (
            <div className="flex justify-between font-bold text-warning">
              <span>المتبقي</span>
              <span className="nums">{formatCurrency(sale.remainingAmount)}</span>
            </div>
          )}
          {sale.changeAmount != null && sale.changeAmount > 0 && (
            <div className="flex justify-between font-bold text-success">
              <span>الباقي للعميل</span>
              <span className="nums">{formatCurrency(sale.changeAmount)}</span>
            </div>
          )}
          {sale.invoiceNotes && (
            <p className="border-t pt-2 text-xs text-muted">
              ملاحظات: {sale.invoiceNotes}
            </p>
          )}
        </div>

        {sale.isDelivery && (
          <div className="mt-3 rounded-lg border bg-accent-soft p-3 text-sm">
            <p className="mb-1 font-bold text-accent">📦 طلب توصيل</p>
            {sale.orderSource && (
              <p className="text-xs text-muted">
                المصدر: {ORDER_SOURCE_LABELS[sale.orderSource]}
              </p>
            )}
            {sale.deliveryAddress && (
              <p className="text-xs text-text">
                العنوان: {sale.deliveryAddress}
              </p>
            )}
            {sale.trackingNumber && (
              <p className="text-xs text-muted nums">
                Bosta: {sale.trackingNumber}
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-muted">
          شكراً لتسوقكم من Euro Brands
        </p>
      </div>

      {/* حاوية الطباعة المخفية — تطبع الإيصال بإعدادات الطباعة المحفوظة */}
      <InvoicePrintSurface
        sale={sale}
        template={loadInvoiceTemplate()}
        branding={branding}
        settings={printSettings}
      />
    </Modal>
  );
}
