import {
  startOfDay,
  endOfDay,
  subDays,
  eachDayOfInterval,
  format,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError } from "@/lib/api";
import { round2 } from "@/lib/sale-utils";
import {
  BRANCHES,
  LOW_STOCK_THRESHOLD,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHOD_LABELS,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";
import type { DashboardStats } from "@/lib/types";
import { MOCK_MODE, mockDashboard } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

type PaymentKey = "CASH" | "VISA" | "VODAFONE_CASH" | "INSTAPAY";
const PAYMENT_LABELS: Record<PaymentKey, string> = {
  CASH: PAYMENT_METHOD_LABELS.CASH,
  VISA: PAYMENT_METHOD_LABELS.VISA,
  VODAFONE_CASH: TRANSFER_METHOD_LABELS.VODAFONE_CASH,
  INSTAPAY: TRANSFER_METHOD_LABELS.INSTAPAY,
};

// GET /api/dashboard?from=&to= — إحصائيات لوحة التحكم الموحّدة
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockDashboard(searchParams));
    const now = new Date();

    const from = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(startOfDay(now), 6);
    const to = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : endOfDay(now);

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const yStart = startOfDay(subDays(now, 1));
    const yEnd = endOfDay(subDays(now, 1));

    // أسبوع حالي (7 أيام تنتهي باليوم) وأسبوع سابق (7 أيام قبله)
    const thisWeekStart = startOfDay(subDays(now, 6));
    const lastWeekStart = startOfDay(subDays(now, 13));
    const lastWeekEnd = endOfDay(subDays(now, 7));

    const [
      rangeSales,
      todayAgg,
      yesterdayAgg,
      remainingAgg,
      weeklySales,
      lowStockVariants,
      allProducts,
      priorCustomers,
      damagedRows,
      transferRows,
    ] = await Promise.all([
      // كل فواتير الفترة المختارة
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
              variant: { select: { size: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.sale.aggregate({
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
          status: { not: "CANCELLED" },
        },
        _sum: { finalAmount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: {
          createdAt: { gte: yStart, lte: yEnd },
          status: { not: "CANCELLED" },
        },
        _sum: { finalAmount: true },
        _count: true,
      }),
      // إجمالي الرصيد المتبقي عند العملاء (كل الوقت)
      prisma.sale.aggregate({
        where: { status: { not: "CANCELLED" }, remainingAmount: { gt: 0 } },
        _sum: { remainingAmount: true },
      }),
      // فواتير آخر 14 يوماً (للمقارنة الأسبوعية)
      prisma.sale.findMany({
        where: {
          createdAt: { gte: lastWeekStart, lte: todayEnd },
          status: { not: "CANCELLED" },
        },
        select: { createdAt: true, finalAmount: true },
      }),
      prisma.productVariant.findMany({
        where: { quantity: { lte: LOW_STOCK_THRESHOLD } },
        include: { product: { select: { name: true, brand: true } } },
        orderBy: { quantity: "asc" },
        take: 100,
      }),
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          brand: true,
          category: true,
          createdAt: true,
          variants: {
            select: { quantity: true, price: true, branch: true },
          },
        },
      }),
      // عملاء سابقون (قبل بداية الفترة) — لتحديد العملاء الجدد
      prisma.sale.findMany({
        where: {
          createdAt: { lt: from },
          status: { not: "CANCELLED" },
          OR: [
            { customerName: { not: null } },
            { customerPhone: { not: null } },
          ],
        },
        select: { customerName: true, customerPhone: true },
      }),
      // الديفو (التالف/المعيب) خلال الفترة — استعلام دفاعي (الجدول قد لا يكون مفعّلاً)
      prisma.damagedItem
        .findMany({
          where: { createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
        .catch(() => []),
      // تحويلات المخزون خلال الفترة — استعلام دفاعي
      prisma.stockTransfer
        .findMany({
          where: { createdAt: { gte: from, lte: to } },
          include: { items: { select: { quantity: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
        .catch(() => []),
    ]);

    const branchMap = new Map<BranchValue, { total: number; count: number }>();
    for (const b of BRANCHES) branchMap.set(b, { total: 0, count: 0 });

    const dayBuckets = new Map<string, number>();
    for (const d of eachDayOfInterval({ start: from, end: to })) {
      dayBuckets.set(format(d, "yyyy-MM-dd"), 0);
    }

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
    const brandMap = new Map<string, { qty: number; revenue: number }>();
    const sizeMap = new Map<string, { qty: number; revenue: number }>();
    const customerMap = new Map<
      string,
      { name: string; phone: string | null; total: number; count: number }
    >();
    const paymentMap = new Map<PaymentKey, { total: number; count: number }>();
    const cashierMap = new Map<
      string,
      { count: number; total: number; max: number }
    >();

    let rangeTotal = 0;
    let grossSales = 0;
    let discountedCount = 0;
    let itemsSold = 0;
    let maxInvoice = 0;
    let deliveryCount = 0;
    let pickupCount = 0;
    let returnedCount = 0;

    const customerKey = (name: string | null, phone: string | null) =>
      `${(name ?? "").trim()}|${(phone ?? "").trim()}`;

    for (const sale of rangeSales) {
      rangeTotal += sale.finalAmount;
      grossSales += sale.totalAmount;
      if (sale.finalAmount > maxInvoice) maxInvoice = sale.finalAmount;
      if (sale.totalAmount - sale.finalAmount > 0.001) discountedCount++;

      const cname = (sale.customerName ?? "").trim();
      if (cname || sale.customerPhone) {
        const ck = customerKey(sale.customerName, sale.customerPhone);
        const cust = customerMap.get(ck) ?? {
          name: cname || "—",
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

      // أداء الكاشير
      const cashier = (sale.cashierName ?? "").trim();
      if (cashier) {
        const cs = cashierMap.get(cashier) ?? { count: 0, total: 0, max: 0 };
        cs.count += 1;
        cs.total += sale.finalAmount;
        if (sale.finalAmount > cs.max) cs.max = sale.finalAmount;
        cashierMap.set(cashier, cs);
      }

      const key = format(sale.createdAt, "yyyy-MM-dd");
      if (dayBuckets.has(key))
        dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + sale.finalAmount);

      // طريقة الدفع
      let pk: PaymentKey;
      if (sale.paymentMethod === "TRANSFER") {
        pk =
          sale.transferMethod === "INSTAPAY"
            ? "INSTAPAY"
            : "VODAFONE_CASH";
      } else {
        pk = sale.paymentMethod === "VISA" ? "VISA" : "CASH";
      }
      const pm = paymentMap.get(pk) ?? { total: 0, count: 0 };
      pm.total += sale.finalAmount;
      pm.count += 1;
      paymentMap.set(pk, pm);

      // التوصيل
      if (sale.isDelivery) {
        deliveryCount += 1;
        if (sale.deliveryStatus === "RETURNED") returnedCount += 1;
      } else {
        pickupCount += 1;
      }

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

        const brandName = item.product.brand ?? "";
        if (brandName) {
          const br = brandMap.get(brandName) ?? { qty: 0, revenue: 0 };
          br.qty += item.quantity;
          br.revenue += item.subtotal;
          brandMap.set(brandName, br);
        }

        const size = item.variant?.size ?? "";
        if (size) {
          const sz = sizeMap.get(size) ?? { qty: 0, revenue: 0 };
          sz.qty += item.quantity;
          sz.revenue += item.subtotal;
          sizeMap.set(size, sz);
        }
      }
    }

    // أعلى يوم مبيعات في الفترة
    let topDay: DashboardStats["topDay"] = null;
    for (const [date, total] of dayBuckets) {
      if (total > (topDay?.total ?? 0)) topDay = { date, total: round2(total) };
    }

    // مقارنة الأسبوع الحالي بالأسبوع السابق (7 أيام نهاية اليوم vs 7 أيام قبلها)
    const thisWeekBuckets = new Map<string, number>();
    const lastWeekBuckets = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      thisWeekBuckets.set(format(subDays(now, i), "yyyy-MM-dd"), 0);
      lastWeekBuckets.set(format(subDays(now, i + 7), "yyyy-MM-dd"), 0);
    }
    for (const s of weeklySales) {
      const key = format(s.createdAt, "yyyy-MM-dd");
      if (thisWeekBuckets.has(key))
        thisWeekBuckets.set(key, (thisWeekBuckets.get(key) ?? 0) + s.finalAmount);
      else if (lastWeekBuckets.has(key))
        lastWeekBuckets.set(key, (lastWeekBuckets.get(key) ?? 0) + s.finalAmount);
    }

    // عملاء جدد في الفترة
    const priorKeys = new Set(
      priorCustomers.map((c) => customerKey(c.customerName, c.customerPhone))
    );
    let newCustomersCount = 0;
    for (const k of customerMap.keys()) {
      if (!priorKeys.has(k)) newCustomersCount += 1;
    }

    // أكثر براند مبيعاً
    let topBrand: DashboardStats["topBrand"] = null;
    for (const [brand, v] of brandMap) {
      if (v.qty > (topBrand?.qty ?? 0))
        topBrand = { brand, qty: v.qty, revenue: round2(v.revenue) };
    }

    // اليوم vs الأمس
    const todaySales = round2(todayAgg._sum.finalAmount ?? 0);
    const yesterdaySales = round2(yesterdayAgg._sum.finalAmount ?? 0);
    const todayChangePct =
      yesterdaySales > 0
        ? round2(((todaySales - yesterdaySales) / yesterdaySales) * 100)
        : todaySales > 0
          ? 100
          : 0;

    // منتجات راكدة (بلا مبيعات في الفترة)
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

    // ---- تقارير المخزون والجرد ----
    const productInfo = new Map<string, { name: string; brand: string }>();
    const stockBranchMap = new Map<BranchValue, { quantity: number; value: number }>();
    for (const b of BRANCHES) stockBranchMap.set(b, { quantity: 0, value: 0 });
    const stockCategoryMap = new Map<
      CategoryValue,
      { quantity: number; value: number }
    >();
    const stockBrandMap = new Map<string, { quantity: number; value: number }>();

    let inventoryValue = 0;
    let variantsCount = 0;
    const outOfStock: DashboardStats["outOfStock"] = [];

    for (const p of allProducts) {
      productInfo.set(p.id, { name: p.name, brand: p.brand });
      let productStock = 0;
      for (const v of p.variants) {
        variantsCount += 1;
        productStock += v.quantity;
        const value = v.quantity * v.price;
        inventoryValue += value;

        const sb = stockBranchMap.get(v.branch as BranchValue);
        if (sb) {
          sb.quantity += v.quantity;
          sb.value += value;
        }

        const sc = stockCategoryMap.get(p.category as CategoryValue) ?? {
          quantity: 0,
          value: 0,
        };
        sc.quantity += v.quantity;
        sc.value += value;
        stockCategoryMap.set(p.category as CategoryValue, sc);

        if (p.brand) {
          const sbr = stockBrandMap.get(p.brand) ?? { quantity: 0, value: 0 };
          sbr.quantity += v.quantity;
          sbr.value += value;
          stockBrandMap.set(p.brand, sbr);
        }
      }
      if (productStock <= 0) {
        outOfStock.push({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category as CategoryValue,
        });
      }
    }

    const newProducts = allProducts
      .filter((p) => p.createdAt >= from && p.createdAt <= to)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category as CategoryValue,
        createdAt: p.createdAt.toISOString(),
      }))
      .slice(0, 100);

    // الديفو — ربط اسم المنتج من خريطة المنتجات
    const damagedItems: DashboardStats["damagedItems"] = damagedRows.map((d) => {
      const info = productInfo.get(d.productId);
      return {
        id: d.id,
        productName: info?.name ?? "—",
        brand: info?.brand ?? "",
        branch: (d.branch as BranchValue) ?? null,
        quantity: d.quantity,
        reason: d.reason ?? null,
        createdAt: d.createdAt.toISOString(),
      };
    });

    // تحويلات المخزون — تجميع عدد الأصناف والكميات لكل تحويل
    const stockTransfers: DashboardStats["stockTransfers"] = transferRows.map(
      (t) => ({
        id: t.id,
        fromBranch: t.fromBranch as BranchValue,
        toBranch: t.toBranch as BranchValue,
        status: t.status,
        itemsCount: t.items.length,
        quantity: t.items.reduce((s, it) => s + it.quantity, 0),
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      })
    );

    const stats: DashboardStats = {
      todaySales,
      todaySalesCount: todayAgg._count,
      yesterdaySales,
      yesterdaySalesCount: yesterdayAgg._count,
      todayChangePct,
      rangeSales: round2(rangeTotal),
      rangeSalesCount: rangeSales.length,
      avgInvoice: rangeSales.length
        ? round2(rangeTotal / rangeSales.length)
        : 0,
      topDay,
      remainingTotal: round2(remainingAgg._sum.remainingAmount ?? 0),

      branchComparison: [...branchMap.entries()].map(([branch, v]) => ({
        branch,
        total: round2(v.total),
        count: v.count,
      })),
      weekComparison: {
        thisWeek: [...thisWeekBuckets.entries()].map(([date, total]) => ({
          date,
          total: round2(total),
        })),
        lastWeek: [...lastWeekBuckets.entries()].map(([date, total]) => ({
          date,
          total: round2(total),
        })),
      },
      paymentBreakdown: (
        ["CASH", "VISA", "VODAFONE_CASH", "INSTAPAY"] as PaymentKey[]
      ).map((key) => {
        const v = paymentMap.get(key) ?? { total: 0, count: 0 };
        return {
          key,
          label: PAYMENT_LABELS[key],
          total: round2(v.total),
          count: v.count,
        };
      }),

      topProducts: [...productMap.values()]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)
        .map((p) => ({ ...p, revenue: round2(p.revenue) })),
      topBrand,
      newCustomersCount,

      deliveryStats: {
        deliveryCount,
        pickupCount,
        returnedCount,
        returnedPct: deliveryCount
          ? round2((returnedCount / deliveryCount) * 100)
          : 0,
      },

      cashierStats: [...cashierMap.entries()]
        .map(([name, v]) => ({
          name,
          count: v.count,
          total: round2(v.total),
          avgInvoice: v.count ? round2(v.total / v.count) : 0,
          maxInvoice: round2(v.max),
        }))
        .sort((a, b) => b.total - a.total),

      grossSales: round2(grossSales),
      discountTotal: round2(grossSales - rangeTotal),
      discountedCount,
      itemsSold,
      maxInvoice: round2(maxInvoice),
      dailySales: [...dayBuckets.entries()].map(([date, total]) => ({
        date,
        total: round2(total),
      })),
      byCategory: [...categoryMap.entries()].map(([category, v]) => ({
        category,
        total: round2(v.total),
        qty: v.qty,
      })),
      topBrands: [...brandMap.entries()]
        .map(([brand, v]) => ({
          brand,
          qty: v.qty,
          revenue: round2(v.revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      bySize: [...sizeMap.entries()]
        .map(([size, v]) => ({ size, qty: v.qty, revenue: round2(v.revenue) }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 15),
      topCustomers: [...customerMap.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((c) => ({ ...c, total: round2(c.total) })),
      lowStock: lowStockVariants.map((v) => ({
        id: v.id,
        productName: v.product.name,
        brand: v.product.brand,
        size: v.size,
        branch: v.branch as BranchValue,
        quantity: v.quantity,
      })),
      slowMoving,

      inventoryValue: round2(inventoryValue),
      productsCount: allProducts.length,
      variantsCount,
      outOfStock: outOfStock.slice(0, 100),
      stockByBranch: [...stockBranchMap.entries()].map(([branch, v]) => ({
        branch,
        quantity: v.quantity,
        value: round2(v.value),
      })),
      stockByCategory: [...stockCategoryMap.entries()].map(([category, v]) => ({
        category,
        quantity: v.quantity,
        value: round2(v.value),
      })),
      stockByBrand: [...stockBrandMap.entries()]
        .map(([brand, v]) => ({
          brand,
          quantity: v.quantity,
          value: round2(v.value),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15),
      topProfit: [...productMap.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((p) => ({
          name: p.name,
          brand: p.brand,
          qty: p.qty,
          revenue: round2(p.revenue),
        })),
      newProducts,
      damagedItems,
      stockTransfers,
    };

    return ok(stats);
  } catch (error) {
    return handleServerError(error);
  }
}
