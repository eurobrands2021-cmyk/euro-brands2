import {
  startOfDay,
  endOfDay,
  subDays,
  eachDayOfInterval,
  startOfWeek,
  format,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError } from "@/lib/api";
import { round2 } from "@/lib/sale-utils";
import {
  BRANCHES,
  CATEGORIES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type BranchValue,
  type CategoryValue,
  type PaymentMethodValue,
} from "@/lib/constants";
import type { ReportsData } from "@/lib/types";
import { MOCK_MODE, mockReports } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/reports?from=&to= — بيانات شاملة لمُنشئ التقارير (المبيعات + الجرد)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockReports(searchParams));
    const now = new Date();
    const from = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(startOfDay(now), 29);
    const to = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : endOfDay(now);

    const [sales, variants, productsCount, newProductRows, damagedRows, transferRows] =
      await Promise.all([
        prisma.sale.findMany({
          where: {
            createdAt: { gte: from, lte: to },
            status: { not: "CANCELLED" },
          },
          include: {
            items: {
              include: {
                product: {
                  select: { name: true, brand: true, category: true, images: true },
                },
                variant: { select: { size: true, cost: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.productVariant.findMany({
          include: {
            product: { select: { name: true, brand: true, category: true } },
          },
        }),
        prisma.product.count(),
        prisma.product.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
            createdAt: true,
            variants: { select: { quantity: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.damagedItem.findMany({
          where: { createdAt: { gte: from, lte: to } },
          include: {
            product: { select: { name: true, brand: true } },
            variant: { select: { size: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.stockTransfer.findMany({
          where: { createdAt: { gte: from, lte: to } },
          include: {
            product: { select: { name: true, brand: true } },
            variant: { select: { size: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // ---------------------------------------------------------------
    //  المبيعات
    // ---------------------------------------------------------------
    const branchMap = new Map<BranchValue, { total: number; count: number }>();
    for (const b of BRANCHES) branchMap.set(b, { total: 0, count: 0 });

    const categoryMap = new Map<CategoryValue, { total: number; qty: number }>();
    const brandSalesMap = new Map<string, { qty: number; revenue: number }>();
    const productMap = new Map<
      string,
      { name: string; brand: string; qty: number; revenue: number; cost: number; image: string | null }
    >();
    const cashierMap = new Map<string, { count: number; total: number; max: number }>();
    const paymentMap = new Map<PaymentMethodValue, { total: number; count: number }>();
    for (const m of PAYMENT_METHODS) paymentMap.set(m, { total: 0, count: 0 });
    // أكثر مقاس مبيعاً لكل فئة
    const sizeMap = new Map<CategoryValue, Map<string, number>>();
    for (const c of CATEGORIES) sizeMap.set(c, new Map());

    const dayBuckets = new Map<string, { total: number; count: number }>();
    for (const d of eachDayOfInterval({ start: from, end: to }))
      dayBuckets.set(format(d, "yyyy-MM-dd"), { total: 0, count: 0 });
    const weekBuckets = new Map<string, { total: number; count: number }>();

    let totalSales = 0;
    let grossSales = 0;
    let discountCount = 0;
    let itemsSold = 0;
    let deliveryCount = 0;
    let deliveryTotal = 0;
    let pickupCount = 0;
    let pickupTotal = 0;
    let maxInvoice: ReportsData["maxInvoice"] = null;

    for (const sale of sales) {
      totalSales += sale.finalAmount;
      grossSales += sale.totalAmount;
      if (sale.totalAmount - sale.finalAmount > 0.001) discountCount++;

      if (!maxInvoice || sale.finalAmount > maxInvoice.amount) {
        maxInvoice = {
          saleNumber: sale.saleNumber,
          amount: round2(sale.finalAmount),
          branch: sale.branch as BranchValue,
          date: sale.createdAt.toISOString(),
          cashierName: sale.cashierName ?? null,
        };
      }

      const b = branchMap.get(sale.branch as BranchValue)!;
      b.total += sale.finalAmount;
      b.count += 1;

      const cashier = (sale.cashierName ?? "").trim();
      if (cashier) {
        const cs = cashierMap.get(cashier) ?? { count: 0, total: 0, max: 0 };
        cs.count += 1;
        cs.total += sale.finalAmount;
        if (sale.finalAmount > cs.max) cs.max = sale.finalAmount;
        cashierMap.set(cashier, cs);
      }

      const pm = paymentMap.get(sale.paymentMethod as PaymentMethodValue);
      if (pm) {
        pm.total += sale.finalAmount;
        pm.count += 1;
      }

      if (sale.isDelivery) {
        deliveryCount += 1;
        deliveryTotal += sale.finalAmount;
      } else {
        pickupCount += 1;
        pickupTotal += sale.finalAmount;
      }

      const dayKey = format(sale.createdAt, "yyyy-MM-dd");
      const day = dayBuckets.get(dayKey);
      if (day) {
        day.total += sale.finalAmount;
        day.count += 1;
      }
      const weekKey = format(startOfWeek(sale.createdAt, { weekStartsOn: 6 }), "yyyy-MM-dd");
      const week = weekBuckets.get(weekKey) ?? { total: 0, count: 0 };
      week.total += sale.finalAmount;
      week.count += 1;
      weekBuckets.set(weekKey, week);

      for (const item of sale.items) {
        itemsSold += item.quantity;

        const cat = item.product.category as CategoryValue;
        const c = categoryMap.get(cat) ?? { total: 0, qty: 0 };
        c.total += item.subtotal;
        c.qty += item.quantity;
        categoryMap.set(cat, c);

        const brandName = item.product.brand ?? "";
        if (brandName) {
          const br = brandSalesMap.get(brandName) ?? { qty: 0, revenue: 0 };
          br.qty += item.quantity;
          br.revenue += item.subtotal;
          brandSalesMap.set(brandName, br);
        }

        const unitCost = item.variant?.cost ?? 0;
        const p = productMap.get(item.productId) ?? {
          name: item.product.name,
          brand: item.product.brand,
          qty: 0,
          revenue: 0,
          cost: 0,
          image: item.product.images?.[0] ?? null,
        };
        p.qty += item.quantity;
        p.revenue += item.subtotal;
        p.cost += unitCost * item.quantity;
        productMap.set(item.productId, p);

        const size = item.variant?.size;
        if (size) {
          const catSizes = sizeMap.get(cat)!;
          catSizes.set(size, (catSizes.get(size) ?? 0) + item.quantity);
        }
      }
    }

    // ---------------------------------------------------------------
    //  الجرد / المخزون
    // ---------------------------------------------------------------
    const soldProductIds = new Set(productMap.keys());
    const stockBranchMap = new Map<BranchValue, { units: number; retail: number }>();
    for (const b of BRANCHES) stockBranchMap.set(b, { units: 0, retail: 0 });
    const stockCategoryMap = new Map<CategoryValue, { units: number; retail: number }>();
    const stockBrandMap = new Map<string, { units: number; retail: number }>();
    const productStock = new Map<string, { name: string; brand: string; quantity: number }>();

    let invCost = 0;
    let invRetail = 0;
    let invUnits = 0;
    const lowStock: ReportsData["lowStock"] = [];
    const outOfStock: ReportsData["outOfStock"] = [];

    for (const v of variants) {
      const q = v.quantity;
      invUnits += q;
      invCost += q * v.cost;
      invRetail += q * v.price;

      const sb = stockBranchMap.get(v.branch as BranchValue)!;
      sb.units += q;
      sb.retail += q * v.price;

      const cat = v.product.category as CategoryValue;
      const sc = stockCategoryMap.get(cat) ?? { units: 0, retail: 0 };
      sc.units += q;
      sc.retail += q * v.price;
      stockCategoryMap.set(cat, sc);

      const brandName = v.product.brand ?? "";
      if (brandName) {
        const sbr = stockBrandMap.get(brandName) ?? { units: 0, retail: 0 };
        sbr.units += q;
        sbr.retail += q * v.price;
        stockBrandMap.set(brandName, sbr);
      }

      const ps = productStock.get(v.productId) ?? {
        name: v.product.name,
        brand: v.product.brand,
        quantity: 0,
      };
      ps.quantity += q;
      productStock.set(v.productId, ps);

      if (q === 0) {
        outOfStock.push({
          id: v.id,
          productName: v.product.name,
          brand: v.product.brand,
          size: v.size,
          branch: v.branch as BranchValue,
        });
      } else if (q <= v.minQuantity) {
        lowStock.push({
          id: v.id,
          productName: v.product.name,
          brand: v.product.brand,
          size: v.size,
          branch: v.branch as BranchValue,
          quantity: q,
          minQuantity: v.minQuantity,
        });
      }
    }
    lowStock.sort((a, b) => a.quantity - b.quantity);

    // منتجات راكدة: في المخزون (كمية > 0) وبلا مبيعات في الفترة
    const slowMoving = [...productStock.entries()]
      .filter(([id, s]) => !soldProductIds.has(id) && s.quantity > 0)
      .map(([id, s]) => ({ id, name: s.name, brand: s.brand, quantity: s.quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 50);

    // الأكثر ربحية = الإيراد − التكلفة (سعر الشراء × الكمية المباعة)
    const mostProfitable = [...productMap.values()]
      .map((p) => ({
        name: p.name,
        brand: p.brand,
        qty: p.qty,
        revenue: round2(p.revenue),
        profit: round2(p.revenue - p.cost),
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    const damagedUnits = damagedRows.reduce((s, d) => s + d.quantity, 0);
    const transferUnits = transferRows.reduce((s, t) => s + t.quantity, 0);

    const result: ReportsData = {
      range: { from: from.toISOString(), to: to.toISOString() },

      totalSales: round2(totalSales),
      grossSales: round2(grossSales),
      invoicesCount: sales.length,
      avgInvoice: sales.length ? round2(totalSales / sales.length) : 0,
      itemsSold,
      maxInvoice,
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
      byBrand: [...brandSalesMap.entries()]
        .map(([brand, v]) => ({ brand, qty: v.qty, revenue: round2(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      topProducts: [...productMap.values()]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)
        .map((p) => ({
          name: p.name,
          brand: p.brand,
          qty: p.qty,
          revenue: round2(p.revenue),
          image: p.image,
        })),
      cashiers: [...cashierMap.entries()]
        .map(([name, v]) => ({
          name,
          count: v.count,
          total: round2(v.total),
          avgInvoice: v.count ? round2(v.total / v.count) : 0,
          maxInvoice: round2(v.max),
        }))
        .sort((a, b) => b.total - a.total),
      byPayment: PAYMENT_METHODS.map((key) => {
        const v = paymentMap.get(key)!;
        return {
          key,
          label: PAYMENT_METHOD_LABELS[key],
          total: round2(v.total),
          count: v.count,
        };
      }),
      discount: {
        total: round2(grossSales - totalSales),
        count: discountCount,
        pct: grossSales ? round2(((grossSales - totalSales) / grossSales) * 100) : 0,
      },
      deliveryVsPickup: {
        deliveryCount,
        deliveryTotal: round2(deliveryTotal),
        pickupCount,
        pickupTotal: round2(pickupTotal),
      },
      dailySales: [...dayBuckets.entries()].map(([date, v]) => ({
        date,
        total: round2(v.total),
        count: v.count,
      })),
      weeklySales: [...weekBuckets.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, v]) => ({ label, total: round2(v.total), count: v.count })),

      inventoryValue: {
        cost: round2(invCost),
        retail: round2(invRetail),
        units: invUnits,
      },
      productsCount: { products: productsCount, variants: variants.length },
      lowStock: lowStock.slice(0, 200),
      outOfStock: outOfStock.slice(0, 200),
      stockByBranch: [...stockBranchMap.entries()].map(([branch, v]) => ({
        branch,
        units: v.units,
        retail: round2(v.retail),
      })),
      stockByCategory: [...stockCategoryMap.entries()].map(([category, v]) => ({
        category,
        units: v.units,
        retail: round2(v.retail),
      })),
      stockByBrand: [...stockBrandMap.entries()]
        .map(([brand, v]) => ({ brand, units: v.units, retail: round2(v.retail) }))
        .sort((a, b) => b.retail - a.retail)
        .slice(0, 10),
      slowMoving,
      mostProfitable,
      damaged: damagedRows.map((d) => ({
        productName: d.product.name,
        brand: d.product.brand,
        size: d.variant?.size ?? null,
        branch: d.branch as BranchValue,
        quantity: d.quantity,
        reason: d.reason ?? null,
        date: d.createdAt.toISOString(),
      })),
      damagedSummary: { count: damagedRows.length, units: damagedUnits },
      transfers: transferRows.map((t) => ({
        productName: t.product.name,
        brand: t.product.brand,
        size: t.variant?.size ?? null,
        fromBranch: t.fromBranch as BranchValue,
        toBranch: t.toBranch as BranchValue,
        quantity: t.quantity,
        date: t.createdAt.toISOString(),
      })),
      transfersSummary: { count: transferRows.length, units: transferUnits },
      newProducts: newProductRows.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category as CategoryValue,
        createdAt: p.createdAt.toISOString(),
        units: p.variants.reduce((s, v) => s + v.quantity, 0),
      })),
      sizeReport: [...sizeMap.entries()].map(([category, sizes]) => {
        const arr = [...sizes.entries()]
          .map(([size, qty]) => ({ size, qty }))
          .sort((a, b) => b.qty - a.qty);
        return {
          category,
          topSize: arr.length ? arr[0].size : null,
          sizes: arr,
        };
      }),
    };

    return ok(result);
  } catch (error) {
    return handleServerError(error);
  }
}
