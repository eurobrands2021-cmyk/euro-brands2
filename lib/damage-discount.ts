// تقسيم بيع الصنف على وحدات «يُباع بخصم» (الديفو) — مصدر واحد للحقيقة يستخدمه
// الخادم ووضع المعاينة. الوحدات المخفّضة تُباع أولاً (الأقدم فالأحدث) بسعرها،
// والباقي بالسعر العادي. الخادم هو المرجع في التسعير؛ الواجهة تعرض تقديراً مطابقاً.

import { calcItemNet, round2 } from "./sale-utils";
import type { DiscountTypeValue } from "./constants";

// ملاحظة تلقائية على بند البيع بخصم (تظهر في الفاتورة/الإيصال لتمييزه).
export const DAMAGE_DISCOUNT_NOTE = "تالف/خصم";

// سجل خصم نشط مبسّط (كمية متبقية للبيع بخصم + سعرها).
export interface DiscountRecordLite {
  id: string;
  discountPrice: number;
  remaining: number;
}

// بند بيع ناتج عن التقسيم (قد يكون بخصم أو بالسعر العادي).
export interface SaleLineSplit {
  quantity: number;
  unitPrice: number;
  itemDiscount: number;
  itemDiscountType: DiscountTypeValue;
  subtotal: number;
  isDamagedDiscount: boolean;
  note: string | null;
}

export interface SplitResult {
  splits: SaleLineSplit[];
  consumption: { id: string; take: number }[]; // كم يُخصَم من كل سجل خصم
  netTotal: number;
}

// يوزّع كمية بيع صنف على السجلات المخفّضة (الأقدم أولاً) ثم الباقي بالسعر العادي.
export function splitSaleLine(params: {
  fullPrice: number;
  quantity: number;
  itemDiscount: number;
  itemDiscountType: DiscountTypeValue;
  note: string | null;
  records: DiscountRecordLite[]; // نشطة (remaining>0)، مرتّبة الأقدم أولاً
}): SplitResult {
  const { fullPrice, quantity, itemDiscount, itemDiscountType, note, records } =
    params;
  const splits: SaleLineSplit[] = [];
  const consumption: { id: string; take: number }[] = [];
  let toSell = quantity;

  for (const rec of records) {
    if (toSell <= 0) break;
    if (rec.remaining <= 0) continue;
    const take = Math.min(toSell, rec.remaining);
    splits.push({
      quantity: take,
      unitPrice: rec.discountPrice,
      itemDiscount: 0, // لا يُضاف خصم يدوي فوق سعر الخصم
      itemDiscountType: "FIXED",
      subtotal: round2(rec.discountPrice * take),
      isDamagedDiscount: true,
      note: DAMAGE_DISCOUNT_NOTE,
    });
    consumption.push({ id: rec.id, take });
    toSell -= take;
  }

  if (toSell > 0) {
    const { net } = calcItemNet(
      fullPrice,
      toSell,
      itemDiscount,
      itemDiscountType
    );
    splits.push({
      quantity: toSell,
      unitPrice: fullPrice,
      itemDiscount,
      itemDiscountType,
      subtotal: net,
      isDamagedDiscount: false,
      note,
    });
  }

  const netTotal = round2(splits.reduce((s, x) => s + x.subtotal, 0));
  return { splits, consumption, netTotal };
}

// صافي سطر السلة في الواجهة — نفس منطق التقسيم لكن بالمجاميع (بلا معرّفات سجلات).
// يُستخدم لعرض إجمالي السطر ليطابق ما سيحسبه الخادم في الحالة الشائعة.
export function blendedLineNet(params: {
  fullPrice: number;
  quantity: number;
  discountPrice: number | null;
  discountQty: number;
  itemDiscount: number;
  itemDiscountType: DiscountTypeValue;
}): { discountedUnits: number; normalUnits: number; net: number } {
  const {
    fullPrice,
    quantity,
    discountPrice,
    discountQty,
    itemDiscount,
    itemDiscountType,
  } = params;
  const discountedUnits =
    discountPrice != null ? Math.min(quantity, Math.max(0, discountQty)) : 0;
  const normalUnits = quantity - discountedUnits;
  const discountedNet =
    discountPrice != null ? round2(discountPrice * discountedUnits) : 0;
  const normalNet =
    normalUnits > 0
      ? calcItemNet(fullPrice, normalUnits, itemDiscount, itemDiscountType).net
      : 0;
  return { discountedUnits, normalUnits, net: round2(discountedNet + normalNet) };
}
