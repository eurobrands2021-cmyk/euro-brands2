"use client";

import {
  BRANCH_LABELS,
  DISCOUNT_TYPE_LABELS,
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
import { QrCode, Barcode128 } from "@/components/code-visuals";
import type { InvoiceBranding } from "@/components/invoice-document";
import type { PrintSettings } from "@/lib/print-settings";
import type { SaleDTO } from "@/lib/types";

const DEFAULT_STORE_NAME = "Euro Brands";

function paymentLabel(sale: SaleDTO): string {
  const base = PAYMENT_METHOD_LABELS[sale.paymentMethod];
  if (sale.paymentMethod === "TRANSFER" && sale.transferMethod)
    return `${base} — ${TRANSFER_METHOD_LABELS[sale.transferMethod]}`;
  return base;
}

// إيصال حراري 80mm/58mm — تخطيط أحادي المسافة (monospace) بالأسود فقط، RTL،
// بفواصل متقطّعة بسيطة. المحتوى يخضع لمفاتيح الإظهار/الإخفاء في إعدادات الطباعة.
export function ThermalReceipt({
  sale,
  settings,
  branding,
  className,
}: {
  sale: SaleDTO;
  settings: PrintSettings;
  branding?: InvoiceBranding;
  className?: string;
}) {
  const f = settings.fields;
  const discount = sale.totalAmount - sale.finalAmount;
  const storeName = branding?.storeName?.trim() || DEFAULT_STORE_NAME;
  const phone = branding?.phone?.trim();
  const address = branding?.address?.trim();
  const change =
    sale.changeAmount != null && sale.changeAmount > 0 ? sale.changeAmount : 0;

  const Divider = () => <div className="eb-rcpt-divider" aria-hidden />;

  const showHeader = f.storeName || f.branch || f.contact;
  const showInfo =
    f.invoiceNumber || f.dateTime || f.cashier || f.customer;
  const showTotals =
    f.subtotal || f.discount || f.total || f.paymentMethod || f.cashChange;
  const showFooter = f.thankYou || f.qr || f.barcode;

  return (
    <div
      className={`eb-receipt${className ? ` ${className}` : ""}`}
      data-size={settings.size}
      data-font={settings.fontSize}
      dir="rtl"
    >
      {/* 1) الترويسة — كلها في المنتصف */}
      {showHeader && (
        <div className="eb-rcpt-center">
          {f.storeName && <div className="eb-rcpt-store">{storeName}</div>}
          {f.branch && <div>{BRANCH_LABELS[sale.branch]}</div>}
          {f.contact && phone && <div className="nums">{phone}</div>}
          {f.contact && address && <div>{address}</div>}
        </div>
      )}

      {/* 2) فاصل */}
      {showHeader && showInfo && <Divider />}

      {/* 3) بيانات الفاتورة — محاذاة لليمين */}
      {showInfo && (
        <div className="eb-rcpt-info">
          {f.invoiceNumber && (
            <div className="eb-rcpt-row">
              <span>رقم الفاتورة</span>
              <span className="nums">{formatSaleNumber(sale.saleNumber)}</span>
            </div>
          )}
          {f.dateTime && (
            <div className="eb-rcpt-row">
              <span>التاريخ</span>
              <span className="nums">{formatDateTime(sale.createdAt)}</span>
            </div>
          )}
          {f.cashier && sale.cashierName && (
            <div className="eb-rcpt-row">
              <span>الكاشير</span>
              <span>{sale.cashierName}</span>
            </div>
          )}
          {f.customer && sale.customerName && (
            <div className="eb-rcpt-row">
              <span>العميل</span>
              <span>{sale.customerName}</span>
            </div>
          )}
          {f.customer && sale.customerPhone && (
            <div className="eb-rcpt-row">
              <span>الهاتف</span>
              <span className="nums">{sale.customerPhone}</span>
            </div>
          )}
        </div>
      )}

      {/* 4) فاصل */}
      {showInfo && <Divider />}

      {/* 5) العناصر — الاسم يمين والسعر يسار، المقاس/اللون بخط صغير أسفله */}
      <div className="eb-rcpt-items">
        {sale.items.map((it) => (
          <div key={it.id} className="eb-rcpt-item">
            <div className="eb-rcpt-row">
              <span className="eb-rcpt-name">{it.productName}</span>
              {f.qtyPrice && (
                <span className="nums">{formatCurrency(it.subtotal)}</span>
              )}
            </div>
            {f.itemDetails && (
              <div className="eb-rcpt-small nums">
                {it.size}
                {it.color ? ` / ${it.color}` : ""}
              </div>
            )}
            {f.qtyPrice && (
              <div className="eb-rcpt-small nums">
                {formatNumber(it.quantity)} × {formatCurrency(it.unitPrice)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 6) فاصل */}
      {showTotals && <Divider />}

      {/* 7) الإجماليات */}
      {showTotals && (
        <div className="eb-rcpt-totals">
          {f.subtotal && (
            <div className="eb-rcpt-row">
              <span>المجموع</span>
              <span className="nums">{formatCurrency(sale.totalAmount)}</span>
            </div>
          )}
          {f.discount && discount > 0 && (
            <div className="eb-rcpt-row">
              <span>
                الخصم
                {sale.discountType && (
                  <>
                    {" "}
                    (
                    {sale.discountType === "PERCENTAGE"
                      ? `${formatNumber(sale.discountValue)}%`
                      : DISCOUNT_TYPE_LABELS[
                          sale.discountType as DiscountTypeValue
                        ]}
                    )
                  </>
                )}
              </span>
              <span className="nums">- {formatCurrency(discount)}</span>
            </div>
          )}
          {f.total && (
            <div className="eb-rcpt-row eb-rcpt-grand">
              <span>الإجمالي</span>
              <span className="nums">{formatCurrency(sale.finalAmount)}</span>
            </div>
          )}
          {f.paymentMethod && (
            <div className="eb-rcpt-row">
              <span>طريقة الدفع</span>
              <span>{paymentLabel(sale)}</span>
            </div>
          )}
          {f.cashChange && (
            <>
              <div className="eb-rcpt-row">
                <span>المدفوع</span>
                <span className="nums">{formatCurrency(sale.paidAmount)}</span>
              </div>
              {change > 0 && (
                <div className="eb-rcpt-row">
                  <span>الباقي</span>
                  <span className="nums">{formatCurrency(change)}</span>
                </div>
              )}
              {sale.remainingAmount > 0 && (
                <div className="eb-rcpt-row">
                  <span>المتبقي</span>
                  <span className="nums">
                    {formatCurrency(sale.remainingAmount)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 8) فاصل */}
      {showFooter && <Divider />}

      {/* 9) التذييل — رسالة الشكر + QR + باركود، كلها في المنتصف */}
      {showFooter && (
        <div className="eb-rcpt-footer eb-rcpt-center">
          {f.thankYou && settings.thankYouMessage.trim() && (
            <div className="eb-rcpt-thanks">{settings.thankYouMessage}</div>
          )}
          {f.qr && (
            <div className="eb-rcpt-qr">
              <QrCode
                value={`${storeName} ${formatSaleNumber(
                  sale.saleNumber
                )} ${formatCurrency(sale.finalAmount)}`}
                size={60}
              />
            </div>
          )}
          {f.barcode && (
            <div className="eb-rcpt-qr">
              <Barcode128
                value={String(sale.saleNumber)}
                height={38}
                width={1.2}
                fontSize={10}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
