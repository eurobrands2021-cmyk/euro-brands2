import {
  startOfDay,
  endOfDay,
  subDays,
  eachDayOfInterval,
  format,
} from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError, CACHE_LISTING } from "@/lib/api";
import { cached } from "@/lib/cache";
import { round2 } from "@/lib/sale-utils";
import {
  groupReturnCashByBranch,
  sumReturnCash,
  computeNetCash,
  emptyCashRefunds,
  type ReturnCashRow,
} from "@/lib/returns-cash";
import { fetchLowStockVariants } from "@/lib/low-stock-query";
import {
  BRANCHES,
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

// صفوف تجميعات المخزون الخام (من groupBy/SQL بدل تحميل الجداول كاملة)
interface StockRollupRow {
  branch: string;
  category: string;
  brand: string | null;
  qty: number;
  value: number;
}
interface OutOfStockRow {
  id: string;
  name: string;
  brand: string;
  category: string;
}
interface SlowMovingRow {
  id: string;
  name: string;
  brand: string;
  quantity: number;
}

// GET /api/dashboard?from=&to= — إحصائيات لوحة التحكم الموحّدة
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockDashboard(searchParams));

    // تجميعات لوحة التحكم ثقيلة؛ نخزّن النتيجة مؤقتاً لمدة دقيقة لكل فترة
    // (from/to) لتفادي إعادة الحساب مع كل طلب خلال نفس النافذة الزمنية.
    const cacheKey = `dashboard:${searchParams.get("from") ?? ""}:${searchParams.get("to") ?? ""}`;
    const dashboardStats = await cached<DashboardStats>(
      cacheKey,
      60_000,
      async () => {
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
      stockRollup,
      variantsCount,
      productsCount,
      outOfStockRows,
      newProductRows,
      newCustomersCount,
      damagedRows,
      transferRows,
      todayReturnsRows,
      rangeReturnsRows,
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
      // أصناف منخفضة المخزون — التعريف الموحّد (alertOnLowStock + minQuantity)
      fetchLowStockVariants(100),
      // تجميعات المخزون على مستوى قاعدة البيانات (كمية + قيمة) مجمّعة حسب
      // الفرع/الفئة/البراند — بدل تحميل كل المنتجات وأصنافها إلى الذاكرة.
      prisma.$queryRaw<StockRollupRow[]>(Prisma.sql`
        SELECT v."branch"::text     AS branch,
               p."category"::text   AS category,
               p."brand"            AS brand,
               SUM(v."quantity")::int AS qty,
               SUM(v."quantity" * v."price")::double precision AS value
        FROM "ProductVariant" v
        JOIN "Product" p ON p."id" = v."productId"
        GROUP BY v."branch", p."category", p."brand"
      `),
      // عدد الأصناف (SKU) الكلي
      prisma.productVariant.count(),
      // عدد المنتجات الكلي
      prisma.product.count(),
      // المنفَد: منتجات إجمالي مخزونها صفر (بما فيها ما بلا أصناف)
      prisma.$queryRaw<OutOfStockRow[]>(Prisma.sql`
        SELECT p."id", p."name", p."brand", p."category"::text AS category
        FROM "Product" p
        LEFT JOIN "ProductVariant" v ON v."productId" = p."id"
        GROUP BY p."id", p."name", p."brand", p."category"
        HAVING COALESCE(SUM(v."quantity"), 0) <= 0
        ORDER BY p."name" ASC
        LIMIT 100
      `),
      // المنتجات الجديدة في الفترة — استعلام موجّه (لا مسح كامل الجدول)
      prisma.product.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          name: true,
          brand: true,
          category: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      // العملاء الجدد في الفترة — نعتمد على Customer.createdAt (الجدول يسجّله
      // أصلاً) بدلاً من مسح كل سجل المبيعات قبل بداية الفترة.
      prisma.customer.count({
        where: { createdAt: { gte: from, lte: to } },
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
      // مرتجعات اليوم (للنقدية اليومية) — استعلام دفاعي (الجدول قد لا يكون مفعّلاً)
      prisma.return
        .findMany({
          where: { createdAt: { gte: todayStart, lte: todayEnd } },
          select: {
            branch: true,
            type: true,
            refundTotal: true,
            exchangeDifference: true,
          },
        })
        .catch(() => []),
      // مرتجعات الفترة (لصافي نقدية كل فرع + ملخّص المرتجعات) — استعلام دفاعي
      prisma.return
        .findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: {
            branch: true,
            type: true,
            refundTotal: true,
            exchangeDifference: true,
            items: {
              select: {
                quantity: true,
                refundAmount: true,
                variant: {
                  select: { product: { select: { name: true, brand: true } } },
                },
              },
            },
          },
          take: 2000,
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

    // العملاء الجدد في الفترة محسوبون مباشرةً من عدّ Customer.createdAt أعلاه
    // (newCustomersCount) بدلاً من مسح كامل سجل المبيعات السابق.

    // أكثر براند مبيعاً
    let topBrand: DashboardStats["topBrand"] = null;
    for (const [brand, v] of brandMap) {
      if (v.qty > (topBrand?.qty ?? 0))
        topBrand = { brand, qty: v.qty, revenue: round2(v.revenue) };
    }

    // اليوم vs الأمس
    const todaySales = round2(todayAgg._sum.finalAmount ?? 0);
    const yesterdaySales = round2(yesterdayAgg._sum.finalAmount ?? 0);

    // الأثر النقدي للمرتجعات: اليوم (إجمالي) + الفترة موزّعة على الفروع
    const todayRefundCash = sumReturnCash(todayReturnsRows as ReturnCashRow[]);
    const refundsToday = todayRefundCash.refunds;
    const netCashToday = computeNetCash(todaySales, todayRefundCash);
    const rangeRefundByBranch = groupReturnCashByBranch(
      rangeReturnsRows as ReturnCashRow[]
    );

    // ملخّص المرتجعات خلال الفترة (عدد/قيمة + أكثر المنتجات إرجاعاً)
    const rangeRefundCash = sumReturnCash(rangeReturnsRows as ReturnCashRow[]);
    let returnCount = 0;
    let exchangeCount = 0;
    const returnedProdMap = new Map<
      string,
      { name: string; brand: string; qty: number; refund: number }
    >();
    for (const r of rangeReturnsRows) {
      if (r.type === "EXCHANGE") exchangeCount++;
      else returnCount++;
      for (const it of r.items ?? []) {
        const name = it.variant?.product?.name ?? "—";
        const brand = it.variant?.product?.brand ?? "";
        const k = `${name}|${brand}`;
        const e = returnedProdMap.get(k) ?? { name, brand, qty: 0, refund: 0 };
        e.qty += it.quantity;
        e.refund = round2(e.refund + it.refundAmount);
        returnedProdMap.set(k, e);
      }
    }
    const topReturnedProducts = [...returnedProdMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
    const returnsSummary = {
      returnCount,
      exchangeCount,
      refundTotal: rangeRefundCash.refunds,
      exchangeUpcharge: rangeRefundCash.exchangeUpcharge,
      netRefunded: round2(
        rangeRefundCash.refunds - rangeRefundCash.exchangeUpcharge
      ),
      topReturnedProducts,
    };
    const returnsTodayCard = {
      count: todayReturnsRows.length,
      value: refundsToday,
    };

    const todayChangePct =
      yesterdaySales > 0
        ? round2(((todaySales - yesterdaySales) / yesterdaySales) * 100)
        : todaySales > 0
          ? 100
          : 0;

    // منتجات راكدة (بلا مبيعات في الفترة) — منتجات لها مخزون ولم تُبَع في الفترة.
    // نستبعد المُباعة (معرّفات productMap) على مستوى SQL بدل مسح كل المنتجات.
    const soldIds = [...productMap.keys()];
    const slowRows = await prisma.$queryRaw<SlowMovingRow[]>(Prisma.sql`
      SELECT p."id", p."name", p."brand", SUM(v."quantity")::int AS quantity
      FROM "Product" p
      JOIN "ProductVariant" v ON v."productId" = p."id"
      ${
        soldIds.length
          ? Prisma.sql`WHERE p."id" NOT IN (${Prisma.join(soldIds)})`
          : Prisma.empty
      }
      GROUP BY p."id", p."name", p."brand"
      HAVING SUM(v."quantity") > 0
      ORDER BY p."name" ASC
      LIMIT 50
    `);
    const slowMoving = slowRows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      quantity: Number(r.quantity),
    }));

    // ---- تقارير المخزون والجرد (من تجميعات SQL بدل تحميل الجداول) ----
    const stockBranchMap = new Map<BranchValue, { quantity: number; value: number }>();
    for (const b of BRANCHES) stockBranchMap.set(b, { quantity: 0, value: 0 });
    const stockCategoryMap = new Map<
      CategoryValue,
      { quantity: number; value: number }
    >();
    const stockBrandMap = new Map<string, { quantity: number; value: number }>();

    let inventoryValue = 0;
    for (const row of stockRollup) {
      const qty = Number(row.qty);
      const value = Number(row.value);
      inventoryValue += value;

      const sb = stockBranchMap.get(row.branch as BranchValue);
      if (sb) {
        sb.quantity += qty;
        sb.value += value;
      }

      const sc = stockCategoryMap.get(row.category as CategoryValue) ?? {
        quantity: 0,
        value: 0,
      };
      sc.quantity += qty;
      sc.value += value;
      stockCategoryMap.set(row.category as CategoryValue, sc);

      if (row.brand) {
        const sbr = stockBrandMap.get(row.brand) ?? { quantity: 0, value: 0 };
        sbr.quantity += qty;
        sbr.value += value;
        stockBrandMap.set(row.brand, sbr);
      }
    }

    const outOfStock: DashboardStats["outOfStock"] = outOfStockRows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      category: r.category as CategoryValue,
    }));

    const newProducts = newProductRows.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category as CategoryValue,
      createdAt: p.createdAt.toISOString(),
    }));

    // أسماء منتجات الديفو تُجلب بمعرّفاتها فقط (استعلام موجّه) بدل خريطة كل المنتجات
    const damagedProductIds = [...new Set(damagedRows.map((d) => d.productId))];
    const infoRows = damagedProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: damagedProductIds } },
          select: { id: true, name: true, brand: true },
        })
      : [];
    const productInfo = new Map(
      infoRows.map((p) => [p.id, { name: p.name, brand: p.brand }])
    );

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
      refundsToday,
      netCashToday,
      returnsToday: returnsTodayCard,
      returnsSummary,
      rangeSales: round2(rangeTotal),
      rangeSalesCount: rangeSales.length,
      avgInvoice: rangeSales.length
        ? round2(rangeTotal / rangeSales.length)
        : 0,
      topDay,
      remainingTotal: round2(remainingAgg._sum.remainingAmount ?? 0),

      branchComparison: [...branchMap.entries()].map(([branch, v]) => {
        const rc = rangeRefundByBranch.get(branch) ?? emptyCashRefunds();
        const total = round2(v.total);
        return {
          branch,
          total,
          count: v.count,
          refunds: rc.refunds,
          netCash: computeNetCash(total, rc),
        };
      }),
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
        productName: v.productName,
        brand: v.brand,
        size: v.size,
        branch: v.branch,
        quantity: v.quantity,
      })),
      slowMoving,

      inventoryValue: round2(inventoryValue),
      productsCount,
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

    return stats;
      }
    );

    return ok(dashboardStats, 200, CACHE_LISTING);
  } catch (error) {
    return handleServerError(error);
  }
}
