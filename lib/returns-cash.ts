// حساب الأثر النقدي للمرتجعات/الاستبدال على النقدية اليومية.
// يُستخدم في home-stats و dashboard (الحقيقي والمعاينة) وتقارير المرتجعات.
import { round2 } from "./sale-utils";
import { BRANCHES, type BranchValue } from "./constants";

// صف مرتجع مبسّط (يكفي لحساب النقدية) — متوافق مع الحقيقي والمعاينة
export interface ReturnCashRow {
  branch: BranchValue;
  type: string; // "RETURN" | "EXCHANGE"
  refundTotal: number;
  exchangeDifference: number; // + يدفع العميل / − يُرد له
}

export interface CashRefunds {
  refunds: number; // إجمالي النقد المُعاد للعميل (يُطرح من النقدية)
  exchangeUpcharge: number; // فرق استبدال حصّله المحل (يُضاف للنقدية)
  count: number;
}

export function emptyCashRefunds(): CashRefunds {
  return { refunds: 0, exchangeUpcharge: 0, count: 0 };
}

// إضافة صف مرتجع إلى مُجمِّع:
//  • إرجاع: النقد المُعاد = refundTotal
//  • استبدال: فرق سالب ⇒ نقد يُرد للعميل، فرق موجب ⇒ نقد يُحصَّل
export function addReturnCash(acc: CashRefunds, r: ReturnCashRow): void {
  acc.count += 1;
  if (r.type === "EXCHANGE") {
    if (r.exchangeDifference < 0)
      acc.refunds = round2(acc.refunds - r.exchangeDifference);
    else acc.exchangeUpcharge = round2(acc.exchangeUpcharge + r.exchangeDifference);
  } else {
    acc.refunds = round2(acc.refunds + r.refundTotal);
  }
}

export function sumReturnCash(rows: ReturnCashRow[]): CashRefunds {
  const acc = emptyCashRefunds();
  for (const r of rows) addReturnCash(acc, r);
  return acc;
}

// تجميع النقدية حسب الفرع (يُهيّئ كل الفروع بأصفار حتى تظهر جميعها)
export function groupReturnCashByBranch(
  rows: ReturnCashRow[]
): Map<BranchValue, CashRefunds> {
  const m = new Map<BranchValue, CashRefunds>();
  for (const b of BRANCHES) m.set(b, emptyCashRefunds());
  for (const r of rows) {
    let acc = m.get(r.branch);
    if (!acc) {
      acc = emptyCashRefunds();
      m.set(r.branch, acc);
    }
    addReturnCash(acc, r);
  }
  return m;
}

// صافي النقدية = المبيعات − المُسترَد + فرق الاستبدال المُحصَّل
export function computeNetCash(sales: number, rc: CashRefunds): number {
  return round2(sales - rc.refunds + rc.exchangeUpcharge);
}
