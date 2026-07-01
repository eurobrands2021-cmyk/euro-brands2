import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { BRANCH_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { DashboardStats } from "@/lib/types";

// عرض الأرقام والعملة بالعربية (المتصفح يرسمها بشكل صحيح داخل html2canvas)
const num = (x: number) =>
  (x ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const money = (x: number) => `${num(x)} ج.م`;

function row(
  cells: string[],
  opts: { head?: boolean; strong?: number; zebra?: boolean } = {}
) {
  const tag = opts.head ? "th" : "td";
  const base = opts.head
    ? "padding:9px 10px;background:#1a1d2e;color:#fff;font-weight:700;text-align:right;font-size:11.5px;letter-spacing:0.2px;"
    : `padding:7px 10px;border-bottom:1px solid #e2e4ec;text-align:right;${
        opts.zebra ? "background:#f6f6fb;" : ""
      }`;
  return `<tr>${cells
    .map(
      (c, i) =>
        `<${tag} style="${base}${
          opts.strong === i ? "font-weight:700;" : ""
        }">${c}</${tag}>`
    )
    .join("")}</tr>`;
}

function table(headers: string[], rows: string[][]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;border:1px solid #e2e4ec;border-radius:8px;overflow:hidden;">
    <thead>${row(headers, { head: true })}</thead>
    <tbody>${rows
      .map((r, i) => row(r, { zebra: i % 2 === 1 }))
      .join("")}</tbody>
  </table>`;
}

function summaryCard(label: string, value: string, color: string): string {
  return `<div style="flex:1;min-width:140px;border:1px solid #e2e4ec;border-top:3px solid ${color};border-radius:10px;padding:12px 14px;background:#fbfbfe;">
    <div style="font-size:11px;color:#9295a8;">${label}</div>
    <div style="font-size:18px;font-weight:800;color:#1a1d2e;margin-top:4px;">${value}</div>
  </div>`;
}

function sectionTitle(t: string): string {
  return `<h2 style="font-size:15px;font-weight:800;color:#1a1d2e;margin:24px 0 4px;border-right:4px solid #6c63ff;padding-right:8px;">${t}</h2>`;
}

function sectionDivider(): string {
  return `<div style="margin:22px 0 0;border-top:1px dashed #d8dae4;"></div>`;
}

// تذييل كل صفحة: رقم الصفحة وتاريخ الإصدار. يُستخدَم نصّ jsPDF الفعلي (لا صورة)
// لذا يُكتب بحروف/أرقام لاتينية فقط — الخط الافتراضي في jsPDF لا يدعم العربية.
export function addPageFooters(pdf: jsPDF) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const totalPages = pdf.getNumberOfPages();
  const stamp = format(new Date(), "yyyy-MM-dd HH:mm");

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(150, 152, 168);
    pdf.setDrawColor(226, 228, 236);
    pdf.line(28, pageH - 26, pageW - 28, pageH - 26);
    pdf.text(`Euro Brands  |  Generated ${stamp}`, 28, pageH - 14);
    pdf.text(`Page ${i} / ${totalPages}`, pageW - 28, pageH - 14, {
      align: "right",
    });
  }
}

function buildReportHtml(
  data: DashboardStats,
  range: { from: string; to: string }
) {
  const el = document.createElement("div");
  el.setAttribute("dir", "rtl");
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;color:#1a1d2e;" +
    "font-family:var(--font-tajawal),Tajawal,'Segoe UI',sans-serif;padding:34px;box-sizing:border-box;";

  const fromD = format(new Date(range.from), "yyyy/MM/dd");
  const toD = format(new Date(range.to), "yyyy/MM/dd");
  const discountPct = data.grossSales
    ? (data.discountTotal / data.grossSales) * 100
    : 0;
  const topProduct = data.topProducts[0] ?? null;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6c63ff;padding-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:48px;height:48px;border-radius:12px;background:#6c63ff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">EB</div>
        <div>
          <div style="font-size:23px;font-weight:800;color:#1a1d2e;">Euro Brands</div>
          <div style="font-size:12.5px;color:#6c63ff;font-weight:700;margin-top:1px;">تقرير المبيعات والمخزون</div>
        </div>
      </div>
      <div style="text-align:left;font-size:12px;color:#5b5e6e;line-height:1.6;">
        <div><strong style="color:#1a1d2e;">الفرع:</strong> كل الفروع</div>
        <div><strong style="color:#1a1d2e;">الفترة:</strong> ${fromD} — ${toD}</div>
        <div><strong style="color:#1a1d2e;">تاريخ التقرير:</strong> ${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
      </div>
    </div>

    ${sectionTitle("الملخّص")}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
      ${summaryCard("إجمالي المبيعات (الصافي)", money(data.rangeSales), "#6c63ff")}
      ${summaryCard("قبل الخصم", money(data.grossSales), "#6c63ff")}
      ${summaryCard("عدد الفواتير", num(data.rangeSalesCount), "#3b9a6e")}
      ${summaryCard("القطع المباعة", num(data.itemsSold), "#3b9a6e")}
      ${summaryCard("متوسط الفاتورة", money(data.avgInvoice), "#6c63ff")}
      ${summaryCard("الرصيد المتبقي", money(data.remainingTotal), "#c9851a")}
      ${
        topProduct
          ? summaryCard("المنتج الأكثر مبيعاً", `${topProduct.name} (${num(topProduct.qty)})`, "#3b9a6e")
          : ""
      }
    </div>

    ${sectionTitle("ملخّص الخصومات")}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
      ${summaryCard("إجمالي الخصومات", money(data.discountTotal), "#c9851a")}
      ${summaryCard("فواتير عليها خصم", num(data.discountedCount), "#c9851a")}
      ${summaryCard("نسبة الخصم من المبيعات", `${num(discountPct)}%`, "#c9851a")}
    </div>

    ${sectionDivider()}
    ${sectionTitle("مقارنة الفروع")}
    ${table(
      ["الفرع", "عدد الفواتير", "الإجمالي"],
      data.branchComparison.map((b) => [
        BRANCH_LABELS[b.branch],
        num(b.count),
        money(b.total),
      ])
    )}

    ${sectionTitle("توزيع طرق الدفع")}
    ${table(
      ["الطريقة", "عدد الفواتير", "الإجمالي"],
      data.paymentBreakdown.map((p) => [p.label, num(p.count), money(p.total)])
    )}

    ${
      data.byCategory.length
        ? sectionTitle("المبيعات حسب الفئة") +
          table(
            ["الفئة", "الكمية", "الإيراد"],
            data.byCategory.map((c) => [
              CATEGORY_LABELS[c.category],
              num(c.qty),
              money(c.total),
            ])
          )
        : ""
    }

    ${sectionDivider()}
    ${sectionTitle("أفضل 5 منتجات مبيعاً")}
    ${
      data.topProducts.length
        ? table(
            ["المنتج", "البراند", "الكمية", "الإيراد"],
            data.topProducts
              .slice(0, 5)
              .map((p) => [p.name, p.brand, num(p.qty), money(p.revenue)])
          )
        : `<p style="font-size:12px;color:#9295a8;">لا توجد مبيعات في الفترة.</p>`
    }

    ${
      data.topBrand
        ? sectionTitle("أكثر براند مبيعاً") +
          `<p style="font-size:13px;color:#1a1d2e;margin-top:8px;">
            <strong>${data.topBrand.brand}</strong> · ${num(data.topBrand.qty)} قطعة · ${money(data.topBrand.revenue)}
          </p>`
        : ""
    }

    ${sectionDivider()}
    ${sectionTitle("إحصائيات التوصيل")}
    ${table(
      ["البيان", "القيمة"],
      [
        ["طلبات التوصيل", num(data.deliveryStats.deliveryCount)],
        ["استلام من المحل", num(data.deliveryStats.pickupCount)],
        ["مرتجعات", num(data.deliveryStats.returnedCount)],
        ["نسبة المرتجعات", `${num(data.deliveryStats.returnedPct)}%`],
      ]
    )}

    ${sectionTitle("أصناف تحتاج تزويد")}
    ${
      data.lowStock.length
        ? table(
            ["المنتج", "الفرع", "المقاس", "الكمية"],
            data.lowStock
              .slice(0, 25)
              .map((v) => [
                v.productName,
                BRANCH_LABELS[v.branch],
                v.size,
                num(v.quantity),
              ])
          )
        : `<p style="font-size:12px;color:#9295a8;">لا توجد أصناف منخفضة الكمية.</p>`
    }

    <div style="margin-top:26px;border-top:2px solid #6c63ff;padding-top:10px;font-size:10px;color:#9295a8;text-align:center;">
      Euro Brands — تم إنشاء هذا التقرير آلياً
    </div>
  `;

  document.body.appendChild(el);
  return el;
}

export async function generateReportPdf(
  data: DashboardStats,
  range: { from: string; to: string }
) {
  const el = buildReportHtml(data, range);
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

    addPageFooters(pdf);
    pdf.save(`euro-brands-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
