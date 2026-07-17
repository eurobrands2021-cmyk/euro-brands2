// تجميع تقرير الديفو — مصدر واحد يُستخدم على الخادم وفي وضع المعاينة.
// يحسب: إجمالي الخسارة (Σ الكمية × التكلفة)، وإجمالي القطع،
// والسبب الأكثر تكراراً (بحسب عدد السجلات لكل سبب).

import type {
  DamagedItemDTO,
  DefectConditionStat,
  DefectReport,
} from "./types";
import {
  DEFECT_CONDITIONS,
  type DefectConditionValue,
  type DefectReasonValue,
} from "./constants";
import { round2 } from "./sale-utils";

export function buildDefectReport(items: DamagedItemDTO[]): DefectReport {
  let totalQuantity = 0;
  let trueLoss = 0; // خسارة صافية — حالة «تالف بالكامل» فقط
  let recoveredValue = 0; // قيمة البيع بخصم (سعر الخصم × الكمية)
  let supplierReturnValue = 0; // قيمة المرتجع للمورد (التكلفة × الكمية)

  const reasonAgg = new Map<
    DefectReasonValue,
    { count: number; loss: number }
  >();
  const condAgg = new Map<
    DefectConditionValue,
    { count: number; quantity: number; value: number }
  >();

  for (const it of items) {
    totalQuantity += it.quantity;

    // تجميع السبب (مستقل عن الحالة) — التوزيع بالقيمة الاسمية
    const r = reasonAgg.get(it.reasonCode) ?? { count: 0, loss: 0 };
    r.count += 1;
    r.loss += it.loss;
    reasonAgg.set(it.reasonCode, r);

    // القيمة المالية حسب الحالة
    let value = 0;
    if (it.condition === "TOTAL_LOSS") {
      value = it.loss;
      trueLoss += it.loss;
    } else if (it.condition === "SELL_AT_DISCOUNT") {
      value = round2((it.discountPrice ?? 0) * it.quantity);
      recoveredValue += value;
    } else if (it.condition === "RETURN_TO_SUPPLIER") {
      value = it.loss;
      supplierReturnValue += value;
    }

    const c = condAgg.get(it.condition) ?? { count: 0, quantity: 0, value: 0 };
    c.count += 1;
    c.quantity += it.quantity;
    c.value += value;
    condAgg.set(it.condition, c);
  }

  const reasonBreakdown = [...reasonAgg.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, loss: round2(v.loss) }))
    .sort((a, b) => b.count - a.count);

  // ثابت الترتيب لكل الحالات (تظهر بصفر لو لا سجلات لها)
  const conditionBreakdown: DefectConditionStat[] = DEFECT_CONDITIONS.map(
    (condition) => {
      const v = condAgg.get(condition) ?? { count: 0, quantity: 0, value: 0 };
      return {
        condition,
        count: v.count,
        quantity: v.quantity,
        value: round2(v.value),
      };
    }
  );

  const top = reasonBreakdown[0];

  return {
    items,
    totalLoss: round2(trueLoss),
    totalQuantity,
    topReason: top ? top.reason : null,
    topReasonCount: top ? top.count : 0,
    reasonBreakdown,
    conditionBreakdown,
    trueLoss: round2(trueLoss),
    recoveredValue: round2(recoveredValue),
    supplierReturnValue: round2(supplierReturnValue),
  };
}
