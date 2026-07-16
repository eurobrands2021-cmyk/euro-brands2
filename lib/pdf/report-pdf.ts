import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { BRANCH_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { DashboardStats } from "@/lib/types";
import { SECTION_LABELS, type ReportTab } from "@/lib/report-sections";

/* ============================================================
   نظام تصميم تقرير Euro Brands — ألوان وخطوط موحّدة (PDF)
   مستقل تماماً عن ثيم الواجهة حتى يخرج التقرير بشكل احترافي ثابت.
   ============================================================ */
const C = {
  accent: "#6c63ff",
  accentDark: "#4b45c9",
  accentSoft: "#eeecff",
  ink: "#1a1d2e",
  sub: "#4a4e63",
  muted: "#8a8ea3",
  line: "#e6e8f0",
  zebra: "#f7f8fc",
  green: "#3b9a6e",
  amber: "#c9851a",
  red: "#d0453f",
  track: "#eceef6",
};

// عرض الأرقام والعملة بالعربية (المتصفح يرسمها بشكل صحيح داخل html2canvas)
const num = (x: number) =>
  (x ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const money = (x: number) => `${num(x)} ج.م`;
const clampPct = (n: number) => Math.max(2, Math.min(100, n));

/* ---- جدول أساسي مع تخطيط مُخطّط (zebra) وحدود ناعمة ---- */
function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0)
    return `<p style="font-size:12px;color:${C.muted};margin-top:8px;">لا توجد بيانات.</p>`;
  const head = `<tr>${headers
    .map(
      (h) =>
        `<th style="padding:9px 12px;background:${C.accent};color:#fff;font-weight:700;font-size:11.5px;text-align:right;letter-spacing:.2px;">${h}</th>`
    )
    .join("")}</tr>`;
  const body = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? C.zebra : "#fff"};">${r
          .map(
            (c) =>
              `<td style="padding:8px 12px;border-bottom:1px solid ${C.line};text-align:right;font-size:12px;color:${C.sub};">${c}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<div style="margin-top:10px;border:1px solid ${C.line};border-radius:10px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

/* ---- جدول تصنيف مع شريط نسبة بصري لكل صف (mini bar) ---- */
function barTable(
  headers: string[],
  rows: string[][],
  weights: number[],
  color = C.accent
): string {
  if (rows.length === 0)
    return `<p style="font-size:12px;color:${C.muted};margin-top:8px;">لا توجد بيانات.</p>`;
  const max = Math.max(...weights, 0);
  const head = `<tr>${[...headers, "الحصة"]
    .map(
      (h) =>
        `<th style="padding:9px 12px;background:${C.accent};color:#fff;font-weight:700;font-size:11.5px;text-align:right;letter-spacing:.2px;">${h}</th>`
    )
    .join("")}</tr>`;
  const body = rows
    .map((r, i) => {
      const pct = max > 0 ? clampPct((weights[i] / max) * 100) : 0;
      const cells = r
        .map(
          (c) =>
            `<td style="padding:8px 12px;border-bottom:1px solid ${C.line};text-align:right;font-size:12px;color:${C.sub};">${c}</td>`
        )
        .join("");
      const bar = `<td style="padding:8px 12px;border-bottom:1px solid ${C.line};width:120px;">
        <div style="background:${C.track};border-radius:5px;height:8px;width:100%;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:5px;"></div>
        </div>
      </td>`;
      return `<tr style="background:${i % 2 ? C.zebra : "#fff"};">${cells}${bar}</tr>`;
    })
    .join("");
  return `<div style="margin-top:10px;border:1px solid ${C.line};border-radius:10px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

/* ---- بطاقة مؤشّر (KPI) ---- */
function summaryCard(label: string, value: string, color: string): string {
  return `<div style="flex:1;min-width:150px;background:#fff;border:1px solid ${C.line};border-radius:12px;padding:13px 15px;box-shadow:0 1px 2px rgba(26,29,46,.04);">
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
      <div style="font-size:11px;color:${C.muted};font-weight:600;">${label}</div>
    </div>
    <div style="font-size:19px;font-weight:800;color:${C.ink};margin-top:7px;">${value}</div>
  </div>`;
}

/* ---- شريط بطاقات المؤشّرات الرئيسية أعلى التقرير (ملخّص تنفيذي) ---- */
function heroStrip(tab: ReportTab, data: DashboardStats): string {
  const cards =
    tab === "sales"
      ? [
          summaryCard("صافي المبيعات", money(data.rangeSales), C.accent),
          summaryCard("عدد الفواتير", num(data.rangeSalesCount), C.green),
          summaryCard("القطع المباعة", num(data.itemsSold), C.amber),
          summaryCard("متوسط الفاتورة", money(data.avgInvoice), C.accentDark),
        ]
      : [
          summaryCard("قيمة المخزون", money(data.inventoryValue), C.green),
          summaryCard("عدد المنتجات", num(data.productsCount), C.accent),
          summaryCard("الأصناف (SKU)", num(data.variantsCount), C.accentDark),
          summaryCard("أصناف منخفضة", num(data.lowStock.length), C.amber),
        ];
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;margin:18px 0 4px;">${cards.join("")}</div>`;
}

function sectionTitle(t: string, n: number): string {
  return `<h2 style="display:flex;align-items:center;gap:9px;font-size:14.5px;font-weight:800;color:${C.ink};margin:24px 0 2px;">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:${C.accentSoft};color:${C.accent};font-size:11px;font-weight:800;">${num(n)}</span>
    ${t}
  </h2>`;
}

// بناء HTML لكل قسم منفرد حسب المفتاح
function sectionHtml(key: string, data: DashboardStats, n: number): string {
  const title = SECTION_LABELS[key] ?? key;
  const cards = (items: string) =>
    sectionTitle(title, n) +
    `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;">${items}</div>`;
  const card = (label: string, value: string, color = C.accent) =>
    cards(summaryCard(label, value, color));

  switch (key) {
    case "totalSales":
      return cards(
        summaryCard("الصافي بعد الخصم", money(data.rangeSales), C.accent) +
          summaryCard("قبل الخصم", money(data.grossSales), C.green)
      );
    case "invoicesCount":
      return cards(
        summaryCard("عدد الفواتير", num(data.rangeSalesCount), C.accent) +
          summaryCard("القطع المباعة", num(data.itemsSold), C.green)
      );
    case "avgInvoice":
      return card("متوسط قيمة الفاتورة", money(data.avgInvoice));
    case "maxInvoice":
      return card("أعلى فاتورة", money(data.maxInvoice), C.amber);
    case "byBranch":
      return (
        sectionTitle(title, n) +
        barTable(
          ["الفرع", "عدد الفواتير", "الإجمالي"],
          data.branchComparison.map((b) => [
            BRANCH_LABELS[b.branch],
            num(b.count),
            money(b.total),
          ]),
          data.branchComparison.map((b) => b.total)
        )
      );
    case "byCategory":
      return (
        sectionTitle(title, n) +
        barTable(
          ["الفئة", "الكمية", "الإيراد"],
          data.byCategory.map((c) => [
            CATEGORY_LABELS[c.category],
            num(c.qty),
            money(c.total),
          ]),
          data.byCategory.map((c) => c.total)
        )
      );
    case "byBrand":
      return (
        sectionTitle(title, n) +
        barTable(
          ["البراند", "الكمية", "الإيراد"],
          data.topBrands.map((b) => [b.brand, num(b.qty), money(b.revenue)]),
          data.topBrands.map((b) => b.revenue)
        )
      );
    case "topProducts":
      return (
        sectionTitle(title, n) +
        barTable(
          ["المنتج", "البراند", "الكمية", "الإيراد"],
          data.topProducts.map((p) => [
            p.name,
            p.brand,
            num(p.qty),
            money(p.revenue),
          ]),
          data.topProducts.map((p) => p.revenue)
        )
      );
    case "cashiers":
      return (
        sectionTitle(title, n) +
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
        sectionTitle(title, n) +
        barTable(
          ["الطريقة", "عدد الفواتير", "الإجمالي"],
          data.paymentBreakdown.map((p) => [
            p.label,
            num(p.count),
            money(p.total),
          ]),
          data.paymentBreakdown.map((p) => p.total)
        )
      );
    case "discounts": {
      const pct = data.grossSales
        ? (data.discountTotal / data.grossSales) * 100
        : 0;
      return cards(
        summaryCard("إجمالي الخصومات", money(data.discountTotal), C.amber) +
          summaryCard("فواتير عليها خصم", num(data.discountedCount), C.amber) +
          summaryCard("نسبة الخصم من المبيعات", `${num(pct)}%`, C.amber)
      );
    }
    case "deliveryVsPickup":
      return (
        sectionTitle(title, n) +
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
        sectionTitle(title, n) +
        barTable(
          ["اليوم", "المبيعات"],
          data.dailySales.map((d) => [
            format(new Date(d.date), "yyyy/MM/dd"),
            money(d.total),
          ]),
          data.dailySales.map((d) => d.total)
        )
      );
    case "returnsToday":
      return cards(
        summaryCard("عدد المرتجعات اليوم", num(data.returnsToday.count), C.amber) +
          summaryCard("القيمة المُستردة", money(data.returnsToday.value), C.amber)
      );
    case "returnsSummary": {
      const rs = data.returnsSummary;
      return (
        sectionTitle(title, n) +
        `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;">
          ${summaryCard("عمليات إرجاع", num(rs.returnCount), C.accent)}
          ${summaryCard("عمليات استبدال", num(rs.exchangeCount), C.accentDark)}
          ${summaryCard("صافي المُسترَد", money(rs.netRefunded), C.amber)}
          ${summaryCard("فروق استبدال محصّلة", money(rs.exchangeUpcharge), C.green)}
        </div>` +
        (rs.topReturnedProducts.length
          ? barTable(
              ["المنتج", "البراند", "الكمية المُرتجعة", "قيمة الإرجاع"],
              rs.topReturnedProducts.map((p) => [
                p.name,
                p.brand,
                num(p.qty),
                money(p.refund),
              ]),
              rs.topReturnedProducts.map((p) => p.qty),
              C.amber
            )
          : "")
      );
    }

    // ---- المخزون والجرد ----
    case "inventoryValue":
      return card("إجمالي قيمة المخزون", money(data.inventoryValue), C.green);
    case "productsCount":
      return cards(
        summaryCard("عدد المنتجات", num(data.productsCount), C.accent) +
          summaryCard("عدد الأصناف (SKU)", num(data.variantsCount), C.green)
      );
    case "lowStock":
      return (
        sectionTitle(title, n) +
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
        sectionTitle(title, n) +
        table(
          ["المنتج", "البراند", "الفئة"],
          data.outOfStock
            .slice(0, 40)
            .map((p) => [p.name, p.brand, CATEGORY_LABELS[p.category]])
        )
      );
    case "stockByBranch":
      return (
        sectionTitle(title, n) +
        barTable(
          ["الفرع", "الكمية", "القيمة"],
          data.stockByBranch.map((s) => [
            BRANCH_LABELS[s.branch],
            num(s.quantity),
            money(s.value),
          ]),
          data.stockByBranch.map((s) => s.value),
          C.green
        )
      );
    case "stockByCategory":
      return (
        sectionTitle(title, n) +
        barTable(
          ["الفئة", "الكمية", "القيمة"],
          data.stockByCategory.map((s) => [
            CATEGORY_LABELS[s.category],
            num(s.quantity),
            money(s.value),
          ]),
          data.stockByCategory.map((s) => s.value),
          C.green
        )
      );
    case "stockByBrand":
      return (
        sectionTitle(title, n) +
        barTable(
          ["البراند", "الكمية", "القيمة"],
          data.stockByBrand.map((s) => [
            s.brand,
            num(s.quantity),
            money(s.value),
          ]),
          data.stockByBrand.map((s) => s.value),
          C.green
        )
      );
    case "slowMoving":
      return (
        sectionTitle(title, n) +
        table(
          ["المنتج", "البراند", "المخزون"],
          data.slowMoving
            .slice(0, 40)
            .map((p) => [p.name, p.brand, num(p.quantity)])
        )
      );
    case "topProfit":
      return (
        sectionTitle(title, n) +
        barTable(
          ["المنتج", "البراند", "الكمية", "الإيراد", "التكلفة", "مجمل الربح"],
          data.topProfit.map((p) => [
            p.name,
            p.brand,
            num(p.qty),
            money(p.revenue),
            money(p.cost),
            money(p.profit),
          ]),
          data.topProfit.map((p) => p.profit)
        )
      );
    case "netProfit":
      return cards(
        summaryCard("إيراد الفترة", money(data.rangeSales), C.accent) +
          summaryCard("تكلفة البضاعة", money(data.cogs), C.amber) +
          summaryCard("مجمل الربح", money(data.grossProfit), C.green) +
          summaryCard("المصروفات", money(data.expensesTotal), C.amber) +
          summaryCard("صافي الربح", money(data.netProfit), C.green)
      );
    case "damaged":
      return (
        sectionTitle(title, n) +
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
        sectionTitle(title, n) +
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
        sectionTitle(title, n) +
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
        sectionTitle(title, n) +
        barTable(
          ["المقاس", "الكمية المباعة", "الإيراد"],
          data.bySize.map((s) => [s.size, num(s.qty), money(s.revenue)]),
          data.bySize.map((s) => s.revenue)
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
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;color:" +
    C.ink +
    ";font-family:var(--font-tajawal),Tajawal,'Segoe UI',sans-serif;padding:0 0 40px;box-sizing:border-box;";

  const fromD = format(new Date(range.from), "yyyy/MM/dd");
  const toD = format(new Date(range.to), "yyyy/MM/dd");
  const tabTitle =
    opts.tab === "sales" ? "تقرير المبيعات" : "تقرير المنتجات والجرد";

  const body = opts.selected
    .map((k, i) => sectionHtml(k, data, i + 1))
    .join("");

  el.innerHTML = `
    <!-- ترويسة ملوّنة كاملة العرض -->
    <div style="background:linear-gradient(135deg,${C.accent},${C.accentDark});color:#fff;padding:28px 40px 24px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="display:flex;align-items:center;gap:13px;">
          <div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:.5px;">EB</div>
          <div>
            <div style="font-size:22px;font-weight:800;letter-spacing:.3px;">Euro Brands</div>
            <div style="font-size:12.5px;color:rgba(255,255,255,.82);margin-top:2px;">${tabTitle}</div>
          </div>
        </div>
        <div style="text-align:left;font-size:11.5px;color:rgba(255,255,255,.9);background:rgba(255,255,255,.12);border-radius:10px;padding:9px 13px;line-height:1.9;">
          <div><span style="color:rgba(255,255,255,.65);">الفترة:</span> ${fromD} — ${toD}</div>
          <div><span style="color:rgba(255,255,255,.65);">تاريخ التقرير:</span> ${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
        </div>
      </div>
    </div>

    <!-- جسم التقرير -->
    <div style="padding:6px 40px 0;">
      ${heroStrip(opts.tab, data)}
      ${body || `<p style="font-size:13px;color:${C.muted};margin-top:24px;">لم يتم تحديد أي أقسام للتصدير.</p>`}
    </div>

    <!-- تذييل -->
    <div style="margin:34px 40px 0;border-top:1px solid ${C.line};padding-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${C.muted};">
      <span>Euro Brands · نظام إدارة المخزون والمبيعات</span>
      <span>تم إنشاء هذا التقرير آلياً</span>
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
    let pageCount = 1;
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    remaining -= pageH;
    while (remaining > 0) {
      position -= pageH;
      pdf.addPage();
      pageCount += 1;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      remaining -= pageH;
    }

    // ترقيم الصفحات على كل صفحة (لاتيني حتى يرسمه jsPDF بوضوح)
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(138, 142, 163);
    for (let p = 1; p <= pageCount; p++) {
      pdf.setPage(p);
      pdf.text(`Euro Brands  ·  ${p} / ${pageCount}`, pageW / 2, pageH - 14, {
        align: "center",
      });
    }

    pdf.save(`euro-brands-${opts.tab}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
