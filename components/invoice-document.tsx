import {
  BRANCH_LABELS,
  DISCOUNT_TYPE_LABELS,
  ORDER_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHOD_LABELS,
  type DiscountTypeValue,
} from "@/lib/constants";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSaleNumber,
} from "@/lib/format";
import { LOGO_PATH } from "@/lib/auth";
import type { InvoiceSize, InvoiceTemplate } from "@/lib/invoice-templates";
import type { SaleDTO } from "@/lib/types";

function paymentLabel(sale: SaleDTO): string {
  const base = PAYMENT_METHOD_LABELS[sale.paymentMethod];
  if (sale.paymentMethod === "TRANSFER" && sale.transferMethod)
    return `${base} — ${TRANSFER_METHOD_LABELS[sale.transferMethod]}`;
  return base;
}

const DEFAULT_STORE_NAME = "Euro Brands";

// بيانات العلامة على الفاتورة/الـ PDF — مستقلة تماماً عن ألوان الواجهة.
export interface InvoiceBranding {
  storeName?: string;
  address?: string;
  phone?: string;
  logo?: string | null;
  accent?: string; // لون تمييز المستند (PDF & Invoice)
}

// مستند الفاتورة القابل للطباعة — يعرض الفاتورة بأحد القوالب الثلاثة وبمقاس محدد.
// التنسيق كله عبر CSS في globals.css (‎.inv-doc[data-template]/[data-size]‎)
// حتى تتطابق المعاينة على الشاشة مع الطباعة تماماً.
export function InvoiceDocument({
  sale,
  template = "classic",
  size = "a4",
  className,
  branding,
}: {
  sale: SaleDTO;
  template?: InvoiceTemplate;
  size?: InvoiceSize;
  className?: string;
  branding?: InvoiceBranding;
}) {
  const discount = sale.totalAmount - sale.finalAmount;
  const storeName = branding?.storeName?.trim() || DEFAULT_STORE_NAME;
  const logo = branding?.logo || LOGO_PATH;
  const contact = [branding?.phone, branding?.address]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" · ");
  // لون تمييز المستند يُطبَّق على المتغيّر المحلي --inv-accent (لا يمس الواجهة)
  const style = branding?.accent
    ? ({ "--inv-accent": branding.accent } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`inv-doc${className ? ` ${className}` : ""}`}
      data-template={template}
      data-size={size}
      dir="rtl"
      style={style}
    >
      {/* الترويسة */}
      <header className="inv-header">
        <div className="inv-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={storeName} className="inv-logo" />
          <div className="inv-brand-text">
            <span className="inv-store">{storeName}</span>
            <span className="inv-tagline">
              {contact || "فاتورة بيع"}
            </span>
          </div>
        </div>
        <div className="inv-meta">
          <span className="inv-num nums">{formatSaleNumber(sale.saleNumber)}</span>
          <span className="inv-date nums">{formatDateTime(sale.createdAt)}</span>
          <span className="inv-branch">{BRANCH_LABELS[sale.branch]}</span>
        </div>
      </header>

      {/* بيانات العميل */}
      {(sale.customerName || sale.customerPhone || sale.customerNotes) && (
        <section className="inv-customer">
          {sale.customerName && (
            <span>
              <b>العميل:</b> {sale.customerName}
            </span>
          )}
          {sale.customerPhone && (
            <span className="nums">
              <b>الهاتف:</b> {sale.customerPhone}
            </span>
          )}
          {sale.customerNotes && (
            <span>
              <b>ملاحظات:</b> {sale.customerNotes}
            </span>
          )}
        </section>
      )}

      {/* العناصر */}
      <table className="inv-table">
        <thead>
          <tr>
            <th className="inv-col-name">المنتج</th>
            <th>المقاس</th>
            <th>السعر</th>
            <th>الكمية</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id}>
              <td className="inv-col-name">
                <span className="inv-item-name">{it.productName}</span>
                {it.brand && <span className="inv-item-brand">{it.brand}</span>}
              </td>
              <td className="nums">
                {it.size}
                {it.color ? ` / ${it.color}` : ""}
              </td>
              <td className="nums">{formatCurrency(it.unitPrice)}</td>
              <td className="nums">{formatNumber(it.quantity)}</td>
              <td className="nums">{formatCurrency(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* الإجماليات */}
      <section className="inv-totals">
        <div className="inv-total-row">
          <span>الإجمالي قبل الخصم</span>
          <span className="nums">{formatCurrency(sale.totalAmount)}</span>
        </div>
        {discount > 0 && (
          <div className="inv-total-row inv-discount">
            <span>
              الخصم
              {sale.discountType && (
                <span className="inv-dim">
                  {" "}
                  (
                  {sale.discountType === "PERCENTAGE"
                    ? `${formatNumber(sale.discountValue)}%`
                    : DISCOUNT_TYPE_LABELS[sale.discountType as DiscountTypeValue]}
                  )
                </span>
              )}
            </span>
            <span className="nums">- {formatCurrency(discount)}</span>
          </div>
        )}
        <div className="inv-total-row inv-grand">
          <span>الصافي</span>
          <span className="nums">{formatCurrency(sale.finalAmount)}</span>
        </div>
        <div className="inv-total-row">
          <span>طريقة الدفع</span>
          <span>{paymentLabel(sale)}</span>
        </div>
        <div className="inv-total-row">
          <span>المدفوع</span>
          <span className="nums">{formatCurrency(sale.paidAmount)}</span>
        </div>
        {sale.remainingAmount > 0 && (
          <div className="inv-total-row inv-remaining">
            <span>المتبقي</span>
            <span className="nums">{formatCurrency(sale.remainingAmount)}</span>
          </div>
        )}
      </section>

      {/* توصيل */}
      {sale.isDelivery && (
        <section className="inv-delivery">
          <b>📦 طلب توصيل</b>
          {sale.orderSource && (
            <span> · المصدر: {ORDER_SOURCE_LABELS[sale.orderSource]}</span>
          )}
          {sale.deliveryAddress && <span> · {sale.deliveryAddress}</span>}
          {sale.trackingNumber && (
            <span className="nums"> · Bosta: {sale.trackingNumber}</span>
          )}
        </section>
      )}

      {sale.invoiceNotes && (
        <p className="inv-notes">ملاحظات: {sale.invoiceNotes}</p>
      )}

      <footer className="inv-footer">
        {sale.cashierName && (
          <span className="inv-cashier">الكاشير: {sale.cashierName}</span>
        )}
        <span>شكراً لتسوقكم من {storeName} 🤍</span>
      </footer>
    </div>
  );
}
