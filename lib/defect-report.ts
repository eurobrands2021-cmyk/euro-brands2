// تجميع تقرير الديفو — مصدر واحد يُستخدم على الخادم وفي وضع المعاينة.
// يحسب: إجمالي الخسارة (Σ الكمية × التكلفة)، وإجمالي القطع،
// والسبب الأكثر تكراراً (بحسب عدد السجلات لكل سبب).

import type { DamagedItemDTO, DefectReport } from "./types";
import type { DefectReasonValue } from "./constants";
import { round2 } from "./sale-utils";

export function buildDefectReport(items: DamagedItemDTO[]): DefectReport {
  let totalLoss = 0;
  let totalQuantity = 0;
  const agg = new Map<DefectReasonValue, { count: number; loss: number }>();

  for (const it of items) {
    totalLoss += it.loss;
    totalQuantity += it.quantity;
    const cur = agg.get(it.reasonCode) ?? { count: 0, loss: 0 };
    cur.count += 1; // تكرار السبب = عدد سجلات التلف بهذا السبب
    cur.loss += it.loss;
    agg.set(it.reasonCode, cur);
  }

  const reasonBreakdown = [...agg.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, loss: round2(v.loss) }))
    .sort((a, b) => b.count - a.count);

  const top = reasonBreakdown[0];

  return {
    items,
    totalLoss: round2(totalLoss),
    totalQuantity,
    topReason: top ? top.reason : null,
    topReasonCount: top ? top.count : 0,
    reasonBreakdown,
  };
}
