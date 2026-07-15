import { format } from "date-fns";
import {
  BRANCH_LABELS,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHOD_LABELS,
  SALE_STATUS_LABELS,
} from "@/lib/constants";
import type { SaleDTO, SalesSummary } from "@/lib/types";

export type { SalesSummary } from "@/lib/types";

export function computeSalesSummary(sales: SaleDTO[]): SalesSummary {
  let totalSales = 0;
  let count = 0;
  let discounts = 0;
  let remaining = 0;
  let cancelledCount = 0;
  let cancelledValue = 0;
  for (const s of sales) {
    if (s.status === "CANCELLED") {
      cancelledCount++;
      cancelledValue += s.finalAmount;
    } else {
      count++;
      totalSales += s.finalAmount;
      discounts += s.totalAmount - s.finalAmount;
      remaining += s.remainingAmount;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    totalSales: r2(totalSales),
    count,
    discounts: r2(discounts),
    remaining: r2(remaining),
    cancelledCount,
    cancelledValue: r2(cancelledValue),
  };
}

export function paymentLabel(s: SaleDTO): string {
  const base = PAYMENT_METHOD_LABELS[s.paymentMethod];
  if (s.paymentMethod === "TRANSFER" && s.transferMethod)
    return `${base} - ${TRANSFER_METHOD_LABELS[s.transferMethod]}`;
  return base;
}

const num = (x: number) =>
  (x ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const money = (x: number) => `${num(x)} ج.م`;

export async function generateSalesExcel(
  sales: SaleDTO[],
  summary: SalesSummary
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  const rows: (string | number)[][] = [
    [
      "رقم الفاتورة",
      "التاريخ",
      "الفرع",
      "العميل",
      "الهاتف",
      "طريقة الدفع",
      "الحالة",
      "الإجمالي",
      "الخصم",
      "الصافي",
      "المدفوع",
      "المتبقي",
    ],
    ...sales.map((s) => [
      s.saleNumber,
      format(new Date(s.createdAt), "yyyy/MM/dd HH:mm"),
      BRANCH_LABELS[s.branch],
      s.customerName ?? "",
      s.customerPhone ?? "",
      paymentLabel(s),
      SALE_STATUS_LABELS[s.status],
      s.totalAmount,
      s.totalAmount - s.finalAmount,
      s.finalAmount,
      s.paidAmount,
      s.remainingAmount,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "الفواتير");

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["ملخص الفترة", ""],
    ["إجمالي المبيعات", summary.totalSales],
    ["عدد الفواتير", summary.count],
    ["إجمالي الخصومات", summary.discounts],
    ["إجمالي الرصيد المتبقي", summary.remaining],
    ["عدد الفواتير الملغية", summary.cancelledCount],
    ["قيمة الفواتير الملغية", summary.cancelledValue],
  ]);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "ملخص");

  XLSX.writeFile(wb, `euro-brands-sales-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

export async function generateSalesPdf(sales: SaleDTO[], summary: SalesSummary) {
  const [{ jsPDF }, h2c] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = h2c.default;

  const el = document.createElement("div");
  el.setAttribute("dir", "rtl");
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;width:900px;background:#fff;color:#1a1d2e;" +
    "font-family:var(--font-tajawal),Tajawal,sans-serif;padding:28px;box-sizing:border-box;";

  const rowsHtml = sales
    .map(
      (s) => `<tr style="${
        s.status === "CANCELLED"
          ? "background:#fdeaea;"
          : s.remainingAmount > 0
            ? "background:#fdf5e6;"
            : ""
      }">
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">#${s.saleNumber}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${format(new Date(s.createdAt), "yyyy/MM/dd")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${BRANCH_LABELS[s.branch]}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${s.customerName ?? "—"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${paymentLabel(s)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${SALE_STATUS_LABELS[s.status]}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${money(s.finalAmount)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${s.remainingAmount > 0 ? money(s.remainingAmount) : "—"}</td>
    </tr>`
    )
    .join("");

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #6c63ff;padding-bottom:12px;margin-bottom:14px;">
      <div style="font-size:20px;font-weight:800;color:#6c63ff;">Euro Brands — سجل الفواتير</div>
      <div style="font-size:11px;color:#9295a8;">${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;margin-bottom:14px;">
      <span><b>إجمالي المبيعات:</b> ${money(summary.totalSales)}</span>
      <span><b>عدد الفواتير:</b> ${num(summary.count)}</span>
      <span><b>الخصومات:</b> ${money(summary.discounts)}</span>
      <span><b>الرصيد المتبقي:</b> ${money(summary.remaining)}</span>
      <span style="color:#d9534f;"><b>الملغية:</b> ${num(summary.cancelledCount)} (${money(summary.cancelledValue)})</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;text-align:right;">
      <thead><tr style="background:#6c63ff;color:#fff;">
        <th style="padding:7px 8px;">رقم</th><th style="padding:7px 8px;">التاريخ</th>
        <th style="padding:7px 8px;">الفرع</th><th style="padding:7px 8px;">العميل</th>
        <th style="padding:7px 8px;">الدفع</th><th style="padding:7px 8px;">الحالة</th>
        <th style="padding:7px 8px;">الصافي</th><th style="padding:7px 8px;">المتبقي</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
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
    pdf.save(`euro-brands-sales-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
