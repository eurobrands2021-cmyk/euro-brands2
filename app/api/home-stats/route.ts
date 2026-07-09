import { startOfDay, endOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError, CACHE_NONE } from "@/lib/api";
import { round2 } from "@/lib/sale-utils";
import { MOCK_MODE, mockHomeStats } from "@/lib/mock-store";
import type { HomeStats } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/home-stats — مبيعات اليوم مقابل الأمس
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockHomeStats());

    const now = new Date();
    const [today, yesterday] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          createdAt: { gte: startOfDay(now), lte: endOfDay(now) },
          status: { not: "CANCELLED" },
        },
        _sum: { finalAmount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: {
          createdAt: {
            gte: startOfDay(subDays(now, 1)),
            lte: endOfDay(subDays(now, 1)),
          },
          status: { not: "CANCELLED" },
        },
        _sum: { finalAmount: true },
        _count: true,
      }),
    ]);

    const res: HomeStats = {
      today: { sales: round2(today._sum.finalAmount ?? 0), count: today._count },
      yesterday: {
        sales: round2(yesterday._sum.finalAmount ?? 0),
        count: yesterday._count,
      },
    };
    return ok(res, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}
