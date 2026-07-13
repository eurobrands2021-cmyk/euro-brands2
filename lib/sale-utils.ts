import type { DiscountTypeValue } from "./constants";

// حساب قيمة الخصم والمبلغ النهائي — مصدر واحد للحقيقة (الواجهة + الـ API)
export function calcDiscount(
  totalAmount: number,
  discountType: DiscountTypeValue | null,
  discountValue: number
): { discountAmount: number; finalAmount: number } {
  let discountAmount = 0;

  if (discountType === "PERCENTAGE") {
    const pct = Math.min(Math.max(discountValue, 0), 100);
    discountAmount = (totalAmount * pct) / 100;
  } else if (discountType === "FIXED") {
    discountAmount = Math.max(discountValue, 0);
  }

  // لا يتجاوز الخصم قيمة الفاتورة
  discountAmount = Math.min(discountAmount, totalAmount);
  const finalAmount = Math.max(totalAmount - discountAmount, 0);

  return {
    discountAmount: round2(discountAmount),
    finalAmount: round2(finalAmount),
  };
}

// خصم على مستوى الصنف — يُخصم من إجمالي الصنف وحده (unitPrice × quantity).
// يعيد الإجمالي قبل الخصم، قيمة الخصم، والصافي بعده. مصدر واحد للحقيقة
// (الواجهة + الـ API) تماماً مثل calcDiscount على مستوى الفاتورة.
export function calcItemNet(
  unitPrice: number,
  quantity: number,
  itemDiscount: number,
  itemDiscountType: DiscountTypeValue | null
): { gross: number; discountAmount: number; net: number } {
  const gross = round2(unitPrice * quantity);
  let discountAmount = 0;

  if (itemDiscount > 0) {
    if (itemDiscountType === "PERCENTAGE") {
      const pct = Math.min(Math.max(itemDiscount, 0), 100);
      discountAmount = (gross * pct) / 100;
    } else if (itemDiscountType === "FIXED") {
      discountAmount = Math.max(itemDiscount, 0);
    }
  }

  // لا يتجاوز خصم الصنف قيمة الصنف
  discountAmount = Math.min(discountAmount, gross);
  const net = Math.max(gross - discountAmount, 0);

  return {
    gross,
    discountAmount: round2(discountAmount),
    net: round2(net),
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
