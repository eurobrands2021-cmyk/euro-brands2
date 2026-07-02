// تصدير الأقسام المختارة إلى PDF عربي RTL بترويسة Euro Brands (html2canvas → jsPDF).
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import type { ReportsData } from "@/lib/types";
import {
  buildSectionContent,
  displayCell,
  type SectionContent,
} from "./export-data";
import type { SectionId } from "./sections";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"
  );
}

function metricCard(label: string, value: string): string {
  return `<div style="flex:1;min-width:150px;border:1px solid #e2e4ec;border-top:3px solid #6c63ff;border-radius:10px;padding:12px 14px;">
    <div style="font-size:11px;color:#9295a8;">${esc(label)}</div>
    <div style="font-size:17px;font-weight:800;color:#1a1d2e;margin-top:4px;">${esc(value)}</div>
  </div>`;
}

function tableHtml(columns: string[], rows: string[][]): string {
  const head = `<tr>${columns
    .map(
      (c) =>
        `<th style="padding:8px 10px;background:#6c63ff;color:#fff;font-weight:700;text-align:right;font-size:12px;">${esc(
          c
        )}</th>`
    )
    .join("")}</tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c) =>
              `<td style="padding:7px 10px;border-bottom:1px solid #e2e4ec;text-align:right;font-size:12px;">${esc(
                c
              )}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
    <thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function sectionHtml(sec: SectionContent): string {
  let html = `<h2 style="font-size:15px;font-weight:800;color:#1a1d2e;margin:22px 0 4px;border-right:4px solid #6c63ff;padding-right:8px;">${esc(
    sec.title
  )}</h2>`;
  if (sec.metrics?.length) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">${sec.metrics
      .map((m) => metricCard(m.label, m.value))
      .join("")}</div>`;
  }
  if (sec.note) {
    html += `<p style="font-size:12px;color:#9295a8;margin-top:8px;">${esc(
      sec.note
    )}</p>`;
  }
  if (sec.table && sec.table.rows.length) {
    const rows = sec.table.rows.map((r) =>
      r.map((cell, i) => displayCell(cell, sec.table!.columns[i]))
    );
    html += tableHtml(sec.table.columns, rows);
  }
  return html;
}

function buildHtml(
  data: ReportsData,
  range: { from: string; to: string },
  ids: SectionId[]
): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("dir", "rtl");
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;color:#1a1d2e;" +
    "font-family:var(--font-tajawal),Tajawal,'Segoe UI',sans-serif;padding:34px;box-sizing:border-box;";

  const fromD = format(new Date(range.from), "yyyy/MM/dd");
  const toD = format(new Date(range.to), "yyyy/MM/dd");

  const header = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6c63ff;padding-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:42px;height:42px;border-radius:10px;background:#6c63ff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;">EB</div>
        <div>
          <div style="font-size:20px;font-weight:800;color:#6c63ff;">Euro Brands</div>
          <div style="font-size:12px;color:#9295a8;">تقرير مُخصّص — المبيعات والمخزون</div>
        </div>
      </div>
      <div style="text-align:left;font-size:12px;color:#9295a8;">
        <div>الفترة: ${fromD} — ${toD}</div>
        <div>تاريخ التقرير: ${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
      </div>
    </div>`;

  const body = ids
    .map((id) => sectionHtml(buildSectionContent(data, id)))
    .join("");

  const empty = ids.length
    ? ""
    : `<p style="font-size:13px;color:#9295a8;margin-top:20px;">لم يتم اختيار أي أقسام.</p>`;

  el.innerHTML = `${header}${body}${empty}
    <div style="margin-top:26px;border-top:1px solid #e2e4ec;padding-top:10px;font-size:10px;color:#9295a8;text-align:center;">
      Euro Brands — تم إنشاء هذا التقرير آلياً
    </div>`;

  document.body.appendChild(el);
  return el;
}

export async function generateReportsPdf(
  data: ReportsData,
  range: { from: string; to: string },
  ids: SectionId[]
) {
  const el = buildHtml(data, range, ids);
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

    pdf.save(`euro-brands-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
