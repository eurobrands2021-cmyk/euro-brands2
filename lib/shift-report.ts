// حساب ملخّص الشيفت (تقرير X/Z): إجمالي المبيعات، تقسيم كاش/فيزا/تحويل،
// عدد الفواتير، والنقد المتوقع = عهدة + كاش مبيعات − صافي نقد المرتجعات.
// مشترك بين المسار الحقيقي ووضع المعاينة.
import { round2 } from "./sale-utils";
import { sumReturnCash, type ReturnCashRow } from "./returns-cash";
import type { ShiftReport } from "./types";
import type { PaymentMethodValue, TransferMethodValue } from "./constants";

// صف فاتورة مبسّط يكفي لحساب الملخّص
export interface ShiftSaleRow {
  paymentMethod: PaymentMethodValue;
  transferMethod: TransferMethodValue | null;
  finalAmount: number;
}

export function computeShiftReport(
  openingCash: number,
  sales: ShiftSaleRow[],
  returnRows: ReturnCashRow[]
): ShiftReport {
  let totalSales = 0;
  let cashSales = 0;
  let cardSales = 0;
  let transferSales = 0;

  for (const s of sales) {
    totalSales += s.finalAmount;
    if (s.paymentMethod === "VISA") cardSales += s.finalAmount;
    else if (s.paymentMethod === "TRANSFER") transferSales += s.finalAmount;
    else cashSales += s.finalAmount; // CASH
  }

  // صافي النقد الخارج من المرتجعات = المُسترَد نقداً − فروق الاستبدال المُحصَّلة
  const rc = sumReturnCash(returnRows);
  const cashRefunds = round2(rc.refunds - rc.exchangeUpcharge);

  const expectedCash = round2(openingCash + cashSales - cashRefunds);

  return {
    totalSales: round2(totalSales),
    invoicesCount: sales.length,
    cashSales: round2(cashSales),
    cardSales: round2(cardSales),
    transferSales: round2(transferSales),
    cashRefunds,
    openingCash: round2(openingCash),
    expectedCash,
  };
}
