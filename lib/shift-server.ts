// جلب فواتير ومرتجعات نافذة الشيفت من قاعدة البيانات ثم حساب ملخّص X/Z.
import { prisma } from "./prisma";
import type { Branch } from "@prisma/client";
import { computeShiftReport } from "./shift-report";
import type { ReturnCashRow } from "./returns-cash";
import type { BranchValue } from "./constants";
import type { ShiftReport } from "./types";

// يحسب ملخّص الشيفت من فواتير/مرتجعات الفرع بين openedAt و (closedAt أو الآن)
export async function computeShiftReportFromDb(shift: {
  branch: Branch;
  openingCash: number;
  openedAt: Date;
  closedAt: Date | null;
}): Promise<ShiftReport> {
  const from = shift.openedAt;
  const to = shift.closedAt ?? new Date();

  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branch: shift.branch,
        status: { not: "CANCELLED" },
        createdAt: { gte: from, lte: to },
      },
      select: { paymentMethod: true, transferMethod: true, finalAmount: true },
    }),
    prisma.return.findMany({
      where: { branch: shift.branch, createdAt: { gte: from, lte: to } },
      select: { type: true, refundTotal: true, exchangeDifference: true },
    }),
  ]);

  const returnRows: ReturnCashRow[] = returns.map((r) => ({
    branch: shift.branch as BranchValue,
    type: r.type,
    refundTotal: r.refundTotal,
    exchangeDifference: r.exchangeDifference,
  }));

  return computeShiftReport(
    shift.openingCash,
    sales.map((s) => ({
      paymentMethod: s.paymentMethod,
      transferMethod: s.transferMethod as ShiftSaleTransfer,
      finalAmount: s.finalAmount,
    })),
    returnRows
  );
}

type ShiftSaleTransfer = import("./constants").TransferMethodValue | null;
