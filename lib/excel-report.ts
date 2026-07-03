import { format } from "date-fns";
import { BRANCH_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { DashboardStats } from "@/lib/types";
import { SECTION_LABELS, type ReportTab } from "@/lib/report-sections";

type Row = (string | number)[];

// بناء صفوف كل قسم على حدة (عنوان + جدول) لتصديرها إلى Excel
function sectionRows(key: string, data: DashboardStats): Row[] {
  const title = SECTION_LABELS[key] ?? key;
  const head = (cells: string[]): Row[] => [[title], cells];

  switch (key) {
    // ---- المبيعات ----
    case "totalSales":
      return [
        [title, data.rangeSales],
        ["قبل الخصم", data.grossSales],
      ];
    case "invoicesCount":
      return [
        [title, data.rangeSalesCount],
        ["القطع المباعة", data.itemsSold],
      ];
    case "avgInvoice":
      return [[title, data.avgInvoice]];
    case "maxInvoice":
      return [[title, data.maxInvoice]];
    case "byBranch":
      return [
        ...head(["الفرع", "عدد الفواتير", "الإجمالي"]),
        ...data.branchComparison.map((b) => [
          BRANCH_LABELS[b.branch],
          b.count,
          b.total,
        ]),
      ];
    case "byCategory":
      return [
        ...head(["الفئة", "الكمية", "الإيراد"]),
        ...data.byCategory.map((c) => [
          CATEGORY_LABELS[c.category],
          c.qty,
          c.total,
        ]),
      ];
    case "byBrand":
      return [
        ...head(["البراند", "الكمية", "الإيراد"]),
        ...data.topBrands.map((b) => [b.brand, b.qty, b.revenue]),
      ];
    case "topProducts":
      return [
        ...head(["المنتج", "البراند", "الكمية المباعة", "الإيراد"]),
        ...data.topProducts.map((p) => [p.name, p.brand, p.qty, p.revenue]),
      ];
    case "cashiers":
      return [
        ...head(["الكاشير", "عدد الفواتير", "الإجمالي", "المتوسط", "أعلى فاتورة"]),
        ...data.cashierStats.map((c) => [
          c.name,
          c.count,
          c.total,
          c.avgInvoice,
          c.maxInvoice,
        ]),
      ];
    case "byPayment":
      return [
        ...head(["الطريقة", "عدد الفواتير", "الإجمالي"]),
        ...data.paymentBreakdown.map((p) => [p.label, p.count, p.total]),
      ];
    case "discounts":
      return [
        [title, data.discountTotal],
        ["فواتير عليها خصم", data.discountedCount],
        [
          "نسبة الخصم %",
          data.grossSales
            ? Math.round((data.discountTotal / data.grossSales) * 10000) / 100
            : 0,
        ],
      ];
    case "deliveryVsPickup":
      return [
        [title],
        ["طلبات التوصيل", data.deliveryStats.deliveryCount],
        ["استلام من المحل", data.deliveryStats.pickupCount],
        ["مرتجعات", data.deliveryStats.returnedCount],
        ["نسبة المرتجعات %", data.deliveryStats.returnedPct],
      ];
    case "dailyTrend":
      return [
        ...head(["اليوم", "المبيعات"]),
        ...data.dailySales.map((d) => [d.date, d.total]),
      ];

    // ---- المخزون والجرد ----
    case "inventoryValue":
      return [[title, data.inventoryValue]];
    case "productsCount":
      return [
        [title, data.productsCount],
        ["عدد الأصناف (SKU)", data.variantsCount],
      ];
    case "lowStock":
      return [
        ...head(["المنتج", "البراند", "الفرع", "المقاس", "الكمية"]),
        ...data.lowStock.map((v) => [
          v.productName,
          v.brand,
          BRANCH_LABELS[v.branch],
          v.size,
          v.quantity,
        ]),
      ];
    case "outOfStock":
      return [
        ...head(["المنتج", "البراند", "الفئة"]),
        ...data.outOfStock.map((p) => [
          p.name,
          p.brand,
          CATEGORY_LABELS[p.category],
        ]),
      ];
    case "stockByBranch":
      return [
        ...head(["الفرع", "الكمية", "القيمة"]),
        ...data.stockByBranch.map((s) => [
          BRANCH_LABELS[s.branch],
          s.quantity,
          s.value,
        ]),
      ];
    case "stockByCategory":
      return [
        ...head(["الفئة", "الكمية", "القيمة"]),
        ...data.stockByCategory.map((s) => [
          CATEGORY_LABELS[s.category],
          s.quantity,
          s.value,
        ]),
      ];
    case "stockByBrand":
      return [
        ...head(["البراند", "الكمية", "القيمة"]),
        ...data.stockByBrand.map((s) => [s.brand, s.quantity, s.value]),
      ];
    case "slowMoving":
      return [
        ...head(["المنتج", "البراند", "المخزون"]),
        ...data.slowMoving.map((p) => [p.name, p.brand, p.quantity]),
      ];
    case "topProfit":
      return [
        ...head(["المنتج", "البراند", "الكمية المباعة", "الإيراد المحقّق"]),
        ...data.topProfit.map((p) => [p.name, p.brand, p.qty, p.revenue]),
      ];
    case "damaged":
      return [
        ...head(["المنتج", "البراند", "الفرع", "المقاس", "الكمية", "السبب", "التاريخ"]),
        ...data.damagedItems.map((d) => [
          d.productName,
          d.brand,
          d.branch ? BRANCH_LABELS[d.branch] : "—",
          d.size ?? "—",
          d.quantity,
          d.reason ?? "—",
          format(new Date(d.createdAt), "yyyy/MM/dd"),
        ]),
      ];
    case "transfers":
      return [
        ...head(["من", "إلى", "الحالة", "عدد الأصناف", "الكمية", "التاريخ"]),
        ...data.stockTransfers.map((t) => [
          BRANCH_LABELS[t.fromBranch],
          BRANCH_LABELS[t.toBranch],
          t.status,
          t.itemsCount,
          t.quantity,
          format(new Date(t.createdAt), "yyyy/MM/dd"),
        ]),
      ];
    case "newProducts":
      return [
        ...head(["المنتج", "البراند", "الفئة", "تاريخ الإضافة"]),
        ...data.newProducts.map((p) => [
          p.name,
          p.brand,
          CATEGORY_LABELS[p.category],
          format(new Date(p.createdAt), "yyyy/MM/dd"),
        ]),
      ];
    case "sizeReport":
      return [
        ...head(["المقاس", "الكمية المباعة", "الإيراد"]),
        ...data.bySize.map((s) => [s.size, s.qty, s.revenue]),
      ];
    default:
      return [];
  }
}

// تصدير الأقسام المحددة من التبويب النشط إلى Excel
export async function generateReportExcel(
  data: DashboardStats,
  range: { from: string; to: string },
  opts: { tab: ReportTab; selected: string[] }
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  const fromD = format(new Date(range.from), "yyyy/MM/dd");
  const toD = format(new Date(range.to), "yyyy/MM/dd");
  const tabTitle =
    opts.tab === "sales" ? "تقارير المبيعات" : "تقارير المنتجات والجرد";

  const aoa: Row[] = [
    ["تقرير Euro Brands"],
    [tabTitle],
    ["الفترة", `${fromD} - ${toD}`],
    ["تاريخ التقرير", format(new Date(), "yyyy/MM/dd HH:mm")],
    [],
  ];

  for (const key of opts.selected) {
    const rows = sectionRows(key, data);
    if (rows.length === 0) continue;
    aoa.push(...rows, []);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, opts.tab === "sales" ? "المبيعات" : "الجرد");

  XLSX.writeFile(
    wb,
    `euro-brands-${opts.tab}-${format(new Date(), "yyyy-MM-dd")}.xlsx`
  );
}
