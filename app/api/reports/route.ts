import {
  startOfDay,
  endOfDay,
  subDays,
  eachDayOfInterval,
  format,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError, CACHE_LISTING } from "@/lib/api";
import { cached } from "@/lib/cache";
import { round2 } from "@/lib/sale-utils";
import { fetchLowStockVariants } from "@/lib/low-stock-query";
import {
  BRANCHES,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";
import type { ReportsData } from "@/lib/types";
import { MOCK_MODE, mockReports } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/reports?from=&to= — تقارير تفصيلية
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockReports(searchParams));

    // تقارير تفصيلية ثقيلة الحساب — نخزّنها مؤقتاً لدقيقة لكل فترة.
    const cacheKey = `reports:${searchParams.get("from") ?? ""}:${searchParams.get("to") ?? ""}`;
    const reportsData = await cached<ReportsData>(cacheKey, 60_000, async () => {
    const now = new Date();
    const from = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(startOfDay(now), 29);
    const to = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : endOfDay(now);

    const [sales, lowStockVariants, allProducts] = await Promise.all([
      prisma.sale.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        include: {
          items: {
            include: {
              product: {
                select: {
                  name: true,
                  brand: true,
                  category: true,
                  images: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      // أصناف منخفضة المخزون — التعريف الموحّد (alertOnLowStock + minQuantity)
      fetchLowStockVariants(100),
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          brand: true,
          variants: { select: { quantity: true } },
        },
      }),
    ]);

    const branchMap = new Map<BranchValue, { total: number; count: number }>();
    for (const b of BRANCHES) branchMap.set(b, { total: 0, count: 0 });

    const categoryMap = new Map<
      CategoryValue,
      { total: number; qty: number }
    >();
    const productMap = new Map<
      string,
      {
        name: string;
        brand: string;
        qty: number;
        revenue: number;
        image: string | null;
      }
    >();
    const customerMap = new Map<
      string,
      { name: string; phone: string | null; total: number; count: number }
    >();

    const dayBuckets = new Map<string, number>();
    for (const d of eachDayOfInterval({ start: from, end: to })) {
      dayBuckets.set(format(d, "yyyy-MM-dd"), 0);
    }

    let totalSales = 0;
    let grossSales = 0;
    let discountedCount = 0;
    let itemsSold = 0;

    for (const sale of sales) {
      totalSales += sale.finalAmount;
      grossSales += sale.totalAmount;
      if (sale.totalAmount - sale.finalAmount > 0.001) discountedCount++;

      const cname = (sale.customerName ?? "").trim();
      if (cname) {
        const ck = `${cname}|${sale.customerPhone ?? ""}`;
        const cust = customerMap.get(ck) ?? {
          name: cname,
          phone: sale.customerPhone ?? null,
          total: 0,
          count: 0,
        };
        cust.total += sale.finalAmount;
        cust.count += 1;
        customerMap.set(ck, cust);
      }

      const b = branchMap.get(sale.branch as BranchValue)!;
      b.total += sale.finalAmount;
      b.count += 1;

      const key = format(sale.createdAt, "yyyy-MM-dd");
      if (dayBuckets.has(key))
        dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + sale.finalAmount);

      for (const item of sale.items) {
        itemsSold += item.quantity;

        const cat = item.product.category as CategoryValue;
        const c = categoryMap.get(cat) ?? { total: 0, qty: 0 };
        c.total += item.subtotal;
        c.qty += item.quantity;
        categoryMap.set(cat, c);

        const p = productMap.get(item.productId) ?? {
          name: item.product.name,
          brand: item.product.brand,
          qty: 0,
          revenue: 0,
          image: item.product.images?.[0] ?? null,
        };
        p.qty += item.quantity;
        p.revenue += item.subtotal;
        productMap.set(item.productId, p);
      }
    }

    const slowMoving = allProducts
      .filter((p) => {
        const stock = p.variants.reduce((s, v) => s + v.quantity, 0);
        return !productMap.has(p.id) && stock > 0;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        quantity: p.variants.reduce((s, v) => s + v.quantity, 0),
      }))
      .slice(0, 50);

    const result: ReportsData = {
      totalSales: round2(totalSales),
      grossSales: round2(grossSales),
      discountTotal: round2(grossSales - totalSales),
      discountedCount,
      invoicesCount: sales.length,
      itemsSold,
      avgInvoice: sales.length ? round2(totalSales / sales.length) : 0,
      byBranch: [...branchMap.entries()].map(([branch, v]) => ({
        branch,
        total: round2(v.total),
        count: v.count,
      })),
      byCategory: [...categoryMap.entries()].map(([category, v]) => ({
        category,
        total: round2(v.total),
        qty: v.qty,
      })),
      dailySales: [...dayBuckets.entries()].map(([date, total]) => ({
        date,
        total: round2(total),
      })),
      topProducts: [...productMap.values()]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)
        .map((p) => ({ ...p, revenue: round2(p.revenue) })),
      topCustomers: [...customerMap.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((c) => ({ ...c, total: round2(c.total) })),
      slowMoving,
      lowStock: lowStockVariants.map((v) => ({
        id: v.id,
        productName: v.productName,
        brand: v.brand,
        size: v.size,
        branch: v.branch,
        quantity: v.quantity,
      })),
    };

    return result;
    });

    return ok(reportsData, 200, CACHE_LISTING);
  } catch (error) {
    return handleServerError(error);
  }
}
