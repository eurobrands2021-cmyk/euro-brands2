import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { BRANCH_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { DashboardStats } from "@/lib/types";
import { SECTION_LABELS, type ReportTab } from "@/lib/report-sections";

// عرض الأرقام والعملة بالعربية (المتصفح يرسمها بشكل صحيح داخل html2canvas)
const num = (x: number) =>
  (x ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const money = (x: number) => `${num(x)} ج.م`;

function row(cells: string[], opts: { head?: boolean } = {}) {
  const tag = opts.head ? "th" : "td";
  const base = opts.head
    ? "padding:8px 10px;background:#6c63ff;color:#fff;font-weight:700;text-align:right;"
    : "padding:7px 10px;border-bottom:1px solid #e2e4ec;text-align:right;";
  return `<tr>${cells
    .map((c) => `<${tag} style="${base}">${c}</${tag}>`)
    .join("")}</tr>`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0)
    return `<p style="font-size:12px;color:#9295a8;">لا توجد بيانات.</p>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
    <thead>${row(headers, { head: true })}</thead>
    <tbody>${rows.map((r) => row(r)).join("")}</tbody>
  </table>`;
}

function summaryCard(label: string, value: string, color: string): string {
  return `<div style="flex:1;min-width:150px;border:1px solid #e2e4ec;border-top:3px solid ${color};border-radius:10px;padding:12px 14px;">
    <div style="font-size:11px;color:#9295a8;">${label}</div>
    <div style="font-size:18px;font-weight:800;color:#1a1d2e;margin-top:4px;">${value}</div>
  </div>`;
}

function sectionTitle(t: string): string {
  return `<h2 style="font-size:15px;font-weight:800;color:#1a1d2e;margin:20px 0 4px;border-right:4px solid #6c63ff;padding-right:8px;">${t}</h2>`;
}

// بناء HTML لكل قسم منفرد حسب المفتاح
function sectionHtml(key: string, data: DashboardStats): string {
  const title = SECTION_LABELS[key] ?? key;
  const card = (label: string, value: string, color = "#6c63ff") =>
    sectionTitle(title) +
    `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">${summaryCard(label, value, color)}</div>`;

  switch (key) {
    case "totalSales":
      return (
        sectionTitle(title) +
        `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
          ${summaryCard("الصافي بعد الخصم", money(data.rangeSales), "#6c63ff")}
          ${summaryCard("قبل الخصم", money(data.grossSales), "#3b9a6e")}
        </div>`
      );
    case "invoicesCount":
      return (
        sectionTitle(title) +
        `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
          ${summaryCard("عدد الفواتير", num(data.rangeSalesCount), "#6c63ff")}
          ${summaryCard("القطع المباعة", num(data.itemsSold), "#3b9a6e")}
        </div>`
      );
    case "avgInvoice":
      return card("متوسط قيمة الفاتورة", money(data.avgInvoice));
    case "maxInvoice":
      return card("أعلى فاتورة", money(data.maxInvoice), "#c9851a");
    case "byBranch":
      return (
        sectionTitle(title) +
        table(
          ["الفرع", "عدد الفواتير", "الإجمالي"],
          data.branchComparison.map((b) => [
            BRANCH_LABELS[b.branch],
            num(b.count),
            money(b.total),
          ])
        )
      );
    case "byCategory":
      return (
        sectionTitle(title) +
        table(
          ["الفئة", "الكمية", "الإيراد"],
          data.byCategory.map((c) => [
            CATEGORY_LABELS[c.category],
            num(c.qty),
            money(c.total),
          ])
        )
      );
    case "byBrand":
      return (
        sectionTitle(title) +
        table(
          ["البراند", "الكمية", "الإيراد"],
          data.topBrands.map((b) => [b.brand, num(b.qty), money(b.revenue)])
        )
      );
    case "topProducts":
      return (
        sectionTitle(title) +
        table(
          ["المنتج", "البراند", "الكمية", "الإيراد"],
          data.topProducts.map((p) => [
            p.name,
            p.brand,
            num(p.qty),
            money(p.revenue),
          ])
        )
      );
    case "cashiers":
      return (
        sectionTitle(title) +
        table(
          ["الكاشير", "الفواتير", "الإجمالي", "المتوسط", "الأعلى"],
          data.cashierStats.map((c) => [
            c.name,
            num(c.count),
            money(c.total),
            money(c.avgInvoice),
            money(c.maxInvoice),
          ])
        )
      );
    case "byPayment":
      return (
        sectionTitle(title) +
        table(
          ["الطريقة", "عدد الفواتير", "الإجمالي"],
          data.paymentBreakdown.map((p) => [
            p.label,
            num(p.count),
            money(p.total),
          ])
        )
      );
    case "discounts": {
      const pct = data.grossSales
        ? (data.discountTotal / data.grossSales) * 100
        : 0;
      return (
        sectionTitle(title) +
        `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
          ${summaryCard("إجمالي الخصومات", money(data.discountTotal), "#c9851a")}
          ${summaryCard("فواتير عليها خصم", num(data.discountedCount), "#c9851a")}
          ${summaryCard("نسبة الخصم من المبيعات", `${num(pct)}%`, "#c9851a")}
        </div>`
      );
    }
    case "deliveryVsPickup":
      return (
        sectionTitle(title) +
        table(
          ["البيان", "القيمة"],
          [
            ["طلبات التوصيل", num(data.deliveryStats.deliveryCount)],
            ["استلام من المحل", num(data.deliveryStats.pickupCount)],
            ["مرتجعات", num(data.deliveryStats.returnedCount)],
            ["نسبة المرتجعات", `${num(data.deliveryStats.returnedPct)}%`],
          ]
        )
      );
    case "dailyTrend":
      return (
        sectionTitle(title) +
        table(
          ["اليوم", "المبيعات"],
          data.dailySales.map((d) => [
            format(new Date(d.date), "yyyy/MM/dd"),
            money(d.total),
          ])
        )
      );

    // ---- المخزون والجرد ----
    case "inventoryValue":
      return card("إجمالي قيمة المخزون", money(data.inventoryValue), "#3b9a6e");
    case "productsCount":
      return (
        sectionTitle(title) +
        `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
          ${summaryCard("عدد المنتجات", num(data.productsCount), "#6c63ff")}
          ${summaryCard("عدد الأصناف (SKU)", num(data.variantsCount), "#3b9a6e")}
        </div>`
      );
    case "lowStock":
      return (
        sectionTitle(title) +
        table(
          ["المنتج", "الفرع", "المقاس", "الكمية"],
          data.lowStock
            .slice(0, 40)
            .map((v) => [
              v.productName,
              BRANCH_LABELS[v.branch],
              v.size,
              num(v.quantity),
            ])
        )
      );
    case "outOfStock":
      return (
        sectionTitle(title) +
        table(
          ["المنتج", "البراند", "الفئة"],
          data.outOfStock
            .slice(0, 40)
            .map((p) => [p.name, p.brand, CATEGORY_LABELS[p.category]])
        )
      );
    case "stockByBranch":
      return (
        sectionTitle(title) +
        table(
          ["الفرع", "الكمية", "القيمة"],
          data.stockByBranch.map((s) => [
            BRANCH_LABELS[s.branch],
            num(s.quantity),
            money(s.value),
          ])
        )
      );
    case "stockByCategory":
      return (
        sectionTitle(title) +
        table(
          ["الفئة", "الكمية", "القيمة"],
          data.stockByCategory.map((s) => [
            CATEGORY_LABELS[s.category],
            num(s.quantity),
            money(s.value),
          ])
        )
      );
    case "stockByBrand":
      return (
        sectionTitle(title) +
        table(
          ["البراند", "الكمية", "القيمة"],
          data.stockByBrand.map((s) => [
            s.brand,
            num(s.quantity),
            money(s.value),
          ])
        )
      );
    case "slowMoving":
      return (
        sectionTitle(title) +
        table(
          ["المنتج", "البراند", "المخزون"],
          data.slowMoving
            .slice(0, 40)
            .map((p) => [p.name, p.brand, num(p.quantity)])
        )
      );
    case "topProfit":
      return (
        sectionTitle(title) +
        table(
          ["المنتج", "البراند", "الكمية المباعة", "الإيراد المحقّق"],
          data.topProfit.map((p) => [
            p.name,
            p.brand,
            num(p.qty),
            money(p.revenue),
          ])
        )
      );
    case "damaged":
      return (
        sectionTitle(title) +
        table(
          ["المنتج", "الفرع", "الكمية", "السبب", "التاريخ"],
          data.damagedItems.map((d) => [
            d.productName,
            d.branch ? BRANCH_LABELS[d.branch] : "—",
            num(d.quantity),
            d.reason ?? "—",
            format(new Date(d.createdAt), "yyyy/MM/dd"),
          ])
        )
      );
    case "transfers":
      return (
        sectionTitle(title) +
        table(
          ["من", "إلى", "الحالة", "الأصناف", "الكمية", "التاريخ"],
          data.stockTransfers.map((t) => [
            BRANCH_LABELS[t.fromBranch],
            BRANCH_LABELS[t.toBranch],
            t.status,
            num(t.itemsCount),
            num(t.quantity),
            format(new Date(t.createdAt), "yyyy/MM/dd"),
          ])
        )
      );
    case "newProducts":
      return (
        sectionTitle(title) +
        table(
          ["المنتج", "البراند", "الفئة", "تاريخ الإضافة"],
          data.newProducts.map((p) => [
            p.name,
            p.brand,
            CATEGORY_LABELS[p.category],
            format(new Date(p.createdAt), "yyyy/MM/dd"),
          ])
        )
      );
    case "sizeReport":
      return (
        sectionTitle(title) +
        table(
          ["المقاس", "الكمية المباعة", "الإيراد"],
          data.bySize.map((s) => [s.size, num(s.qty), money(s.revenue)])
        )
      );
    default:
      return "";
  }
}

function buildReportHtml(
  data: DashboardStats,
  range: { from: string; to: string },
  opts: { tab: ReportTab; selected: string[] }
) {
  const el = document.createElement("div");
  el.setAttribute("dir", "rtl");
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;color:#1a1d2e;" +
    "font-family:var(--font-tajawal),Tajawal,'Segoe UI',sans-serif;padding:34px;box-sizing:border-box;";

  const fromD = format(new Date(range.from), "yyyy/MM/dd");
  const toD = format(new Date(range.to), "yyyy/MM/dd");
  const tabTitle =
    opts.tab === "sales" ? "تقارير المبيعات" : "تقارير المنتجات والجرد";

  const body = opts.selected.map((k) => sectionHtml(k, data)).join("");

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6c63ff;padding-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:42px;height:42px;border-radius:10px;background:#6c63ff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;">EB</div>
        <div>
          <div style="font-size:20px;font-weight:800;color:#6c63ff;">Euro Brands</div>
          <div style="font-size:12px;color:#9295a8;">${tabTitle}</div>
        </div>
      </div>
      <div style="text-align:left;font-size:12px;color:#9295a8;">
        <div>الفترة: ${fromD} — ${toD}</div>
        <div>تاريخ التقرير: ${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
      </div>
    </div>
    ${body || `<p style="font-size:13px;color:#9295a8;margin-top:20px;">لم يتم تحديد أي أقسام للتصدير.</p>`}
    <div style="margin-top:26px;border-top:1px solid #e2e4ec;padding-top:10px;font-size:10px;color:#9295a8;text-align:center;">
      Euro Brands — تم إنشاء هذا التقرير آلياً
    </div>
  `;

  document.body.appendChild(el);
  return el;
}

export async function generateReportPdf(
  data: DashboardStats,
  range: { from: string; to: string },
  opts: { tab: ReportTab; selected: string[] }
) {
  const el = buildReportHtml(data, range, opts);
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let position = 0;
    let remaining = imgH;
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    remaining -= pageH;
    while (remaining > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      remaining -= pageH;
    }

    pdf.save(`euro-brands-${opts.tab}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
