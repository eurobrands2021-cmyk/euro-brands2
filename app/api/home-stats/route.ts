import { startOfDay, endOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError, CACHE_NONE } from "@/lib/api";
import { round2 } from "@/lib/sale-utils";
import {
  groupReturnCashByBranch,
  sumReturnCash,
  computeNetCash,
  emptyCashRefunds,
  type ReturnCashRow,
} from "@/lib/returns-cash";
import { BRANCHES, type BranchValue } from "@/lib/constants";
import { MOCK_MODE, mockHomeStats } from "@/lib/mock-store";
import type { DailyCash, HomeStats } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/home-stats — نقدية اليوم/الأمس (مبيعات − مرتجعات) موزّعة على الفروع
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockHomeStats(), 200, CACHE_NONE);

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const yStart = startOfDay(subDays(now, 1));
    const yEnd = endOfDay(subDays(now, 1));

    const salesWhere = (from: Date, to: Date) => ({
      createdAt: { gte: from, lte: to },
      status: { not: "CANCELLED" as const },
    });
    const returnsSelect = {
      branch: true,
      type: true,
      refundTotal: true,
      exchangeDifference: true,
    };

    const [todaySales, ydaySales, todayReturns, ydayReturns] =
      await Promise.all([
        prisma.sale.groupBy({
          by: ["branch"],
          where: salesWhere(todayStart, todayEnd),
          _sum: { finalAmount: true },
          _count: true,
        }),
        prisma.sale.groupBy({
          by: ["branch"],
          where: salesWhere(yStart, yEnd),
          _sum: { finalAmount: true },
          _count: true,
        }),
        prisma.return.findMany({
          where: { createdAt: { gte: todayStart, lte: todayEnd } },
          select: returnsSelect,
        }),
        prisma.return.findMany({
          where: { createdAt: { gte: yStart, lte: yEnd } },
          select: returnsSelect,
        }),
      ]);

    const salesByBranch = (
      rows: {
        branch: string;
        _sum: { finalAmount: number | null };
        _count: number;
      }[]
    ) => {
      const m = new Map<BranchValue, { sales: number; count: number }>();
      for (const r of rows)
        m.set(r.branch as BranchValue, {
          sales: r._sum.finalAmount ?? 0,
          count: r._count,
        });
      return m;
    };

    const buildDaily = (
      sales: { sales: number; count: number } | undefined,
      rc: ReturnType<typeof sumReturnCash>
    ): DailyCash => {
      const s = round2(sales?.sales ?? 0);
      return {
        sales: s,
        count: sales?.count ?? 0,
        refunds: rc.refunds,
        exchangeUpcharge: rc.exchangeUpcharge,
        netCash: computeNetCash(s, rc),
      };
    };

    const todaySalesMap = salesByBranch(todaySales);
    const ydaySalesMap = salesByBranch(ydaySales);
    const todayReturnsByBranch = groupReturnCashByBranch(
      todayReturns as ReturnCashRow[]
    );

    const totalOf = (m: Map<BranchValue, { sales: number; count: number }>) => ({
      sales: [...m.values()].reduce((a, v) => a + v.sales, 0),
      count: [...m.values()].reduce((a, v) => a + v.count, 0),
    });

    const res: HomeStats = {
      today: buildDaily(
        totalOf(todaySalesMap),
        sumReturnCash(todayReturns as ReturnCashRow[])
      ),
      yesterday: buildDaily(
        totalOf(ydaySalesMap),
        sumReturnCash(ydayReturns as ReturnCashRow[])
      ),
      byBranch: BRANCHES.map((branch) => ({
        branch,
        today: buildDaily(
          todaySalesMap.get(branch),
          todayReturnsByBranch.get(branch) ?? emptyCashRefunds()
        ),
      })),
    };
    return ok(res, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}
