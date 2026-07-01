import { format } from "date-fns";
import {
  BRANCH_LABELS,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHOD_LABELS,
  SALE_STATUS_LABELS,
} from "@/lib/constants";
import { addPageFooters } from "@/lib/pdf/report-pdf";
import type { SaleDTO } from "@/lib/types";

export interface SalesSummary {
  totalSales: number;
  count: number;
  discounts: number;
  remaining: number;
  cancelledCount: number;
  cancelledValue: number;
}

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
    .map((s, i) => {
      const tone =
        s.status === "CANCELLED"
          ? "background:#fdeaea;"
          : s.remainingAmount > 0
            ? "background:#fdf5e6;"
            : i % 2 === 1
              ? "background:#f6f6fb;"
              : "";
      return `<tr style="${tone}">
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">#${s.saleNumber}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${format(new Date(s.createdAt), "yyyy/MM/dd")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${BRANCH_LABELS[s.branch]}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${s.customerName ?? "—"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${paymentLabel(s)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${SALE_STATUS_LABELS[s.status]}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${money(s.finalAmount)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e4ec;">${s.remainingAmount > 0 ? money(s.remainingAmount) : "—"}</td>
    </tr>`;
    })
    .join("");

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #6c63ff;padding-bottom:14px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;border-radius:11px;background:#6c63ff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;">EB</div>
        <div>
          <div style="font-size:21px;font-weight:800;color:#1a1d2e;">Euro Brands</div>
          <div style="font-size:12px;color:#6c63ff;font-weight:700;">سجل الفواتير</div>
        </div>
      </div>
      <div style="font-size:11px;color:#9295a8;">تاريخ الإصدار: ${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
      <div style="flex:1;min-width:140px;border:1px solid #e2e4ec;border-top:3px solid #6c63ff;border-radius:10px;padding:10px 12px;">
        <div style="font-size:10.5px;color:#9295a8;">إجمالي المبيعات</div>
        <div style="font-size:15px;font-weight:800;color:#1a1d2e;margin-top:2px;">${money(summary.totalSales)}</div>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #e2e4ec;border-top:3px solid #3b9a6e;border-radius:10px;padding:10px 12px;">
        <div style="font-size:10.5px;color:#9295a8;">عدد الفواتير</div>
        <div style="font-size:15px;font-weight:800;color:#1a1d2e;margin-top:2px;">${num(summary.count)}</div>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #e2e4ec;border-top:3px solid #c9851a;border-radius:10px;padding:10px 12px;">
        <div style="font-size:10.5px;color:#9295a8;">إجمالي الخصومات</div>
        <div style="font-size:15px;font-weight:800;color:#1a1d2e;margin-top:2px;">${money(summary.discounts)}</div>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #e2e4ec;border-top:3px solid #c9851a;border-radius:10px;padding:10px 12px;">
        <div style="font-size:10.5px;color:#9295a8;">الرصيد المتبقي</div>
        <div style="font-size:15px;font-weight:800;color:#1a1d2e;margin-top:2px;">${money(summary.remaining)}</div>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #e2e4ec;border-top:3px solid #d9534f;border-radius:10px;padding:10px 12px;">
        <div style="font-size:10.5px;color:#9295a8;">فواتير ملغية</div>
        <div style="font-size:15px;font-weight:800;color:#d9534f;margin-top:2px;">${num(summary.cancelledCount)} (${money(summary.cancelledValue)})</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;text-align:right;border:1px solid #e2e4ec;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#1a1d2e;color:#fff;">
        <th style="padding:8px;">رقم</th><th style="padding:8px;">التاريخ</th>
        <th style="padding:8px;">الفرع</th><th style="padding:8px;">العميل</th>
        <th style="padding:8px;">الدفع</th><th style="padding:8px;">الحالة</th>
        <th style="padding:8px;">الصافي</th><th style="padding:8px;">المتبقي</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div style="margin-top:20px;border-top:2px solid #6c63ff;padding-top:8px;font-size:10px;color:#9295a8;text-align:center;">
      Euro Brands — تم إنشاء هذا التقرير آلياً
    </div>`;

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
    addPageFooters(pdf);
    pdf.save(`euro-brands-sales-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
