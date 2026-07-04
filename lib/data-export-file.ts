// بناء ملف التصدير في المتصفح من صفوف الخادم (Excel متعدّد الأوراق / PDF بأقسام).
// كل نوع بيانات = ورقة مستقلة في Excel أو قسم مستقل في PDF (لا خلط بيانات).
import type { ExportSheet } from "./data-management-types";

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// اسم ورقة صالح في Excel (≤ 31 حرفاً، بلا محارف ممنوعة)
function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "بيانات";
}

export async function buildExcelFile(sheets: ExportSheet[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const used = new Set<string>();
  for (const sheet of sheets) {
    const aoa: (string | number)[][] = [sheet.columns, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = sheet.columns.map((c) => ({
      wch: Math.min(Math.max(c.length + 4, 10), 28),
    }));
    let name = safeSheetName(sheet.label);
    let i = 2;
    while (used.has(name)) name = safeSheetName(`${sheet.label} ${i++}`);
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  if (sheets.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["لا توجد بيانات"]]);
    XLSX.utils.book_append_sheet(wb, ws, "بيانات");
  }
  XLSX.writeFile(wb, `euro-brands-archive-${stamp()}.xlsx`);
}

export async function buildPdfFile(sheets: ExportSheet[]): Promise<void> {
  const [{ jsPDF }, h2c] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = h2c.default;

  const esc = (v: string | number) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const sectionHtml = (sheet: ExportSheet) => {
    const head = sheet.columns
      .map(
        (c) =>
          `<th style="padding:6px 8px;border:1px solid #c9ccd8;">${esc(c)}</th>`
      )
      .join("");
    const body =
      sheet.rows.length === 0
        ? `<tr><td colspan="${sheet.columns.length}" style="padding:8px;text-align:center;color:#9295a8;">لا توجد بيانات</td></tr>`
        : sheet.rows
            .map(
              (r) =>
                `<tr>${r
                  .map(
                    (v) =>
                      `<td style="padding:5px 8px;border:1px solid #e2e4ec;">${esc(
                        v
                      )}</td>`
                  )
                  .join("")}</tr>`
            )
            .join("");
    return `
      <div style="margin-bottom:22px;">
        <div style="font-size:15px;font-weight:800;color:#6c63ff;margin-bottom:6px;">
          ${esc(sheet.label)} <span style="font-size:11px;color:#9295a8;font-weight:600;">(${
            sheet.rows.length
          })</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;text-align:right;">
          <thead><tr style="background:#6c63ff;color:#fff;">${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  };

  const el = document.createElement("div");
  el.setAttribute("dir", "rtl");
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1000px;background:#fff;color:#1a1d2e;" +
    "font-family:var(--font-tajawal),Tajawal,sans-serif;padding:28px;box-sizing:border-box;";
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #6c63ff;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:20px;font-weight:800;color:#6c63ff;">Euro Brands — أرشيف البيانات</div>
      <div style="font-size:11px;color:#9295a8;">${stamp()}</div>
    </div>
    ${sheets.map(sectionHtml).join("")}`;

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
    pdf.save(`euro-brands-archive-${stamp()}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
