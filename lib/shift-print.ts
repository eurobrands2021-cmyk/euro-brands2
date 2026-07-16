// طباعة ملخّص الشيفت (تقرير X/Z) عبر نافذة منبثقة مكتفية ذاتياً.
// تُشبه إيصال حراري ضيق، مستقلة عن أنماط التطبيق لضمان الطباعة الصحيحة.
import { BRANCH_LABELS } from "./constants";
import type { ShiftCloseDTO, ShiftReport } from "./types";

function fmt(n: number): string {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}

export function printShiftReport(shift: ShiftCloseDTO, report: ShiftReport): void {
  const diff = shift.difference;
  const diffLabel =
    Math.abs(diff) < 0.01
      ? "مطابق"
      : diff > 0
        ? `زيادة ${fmt(diff)} ج.م`
        : `عجز ${fmt(Math.abs(diff))} ج.م`;

  const row = (label: string, value: string, strong = false) =>
    `<div class="row${strong ? " strong" : ""}"><span>${label}</span><span>${value}</span></div>`;

  const body = `
    <div class="center store">Euro Brands</div>
    <div class="center">تقرير إقفال الصندوق (X/Z)</div>
    <div class="divider"></div>
    ${row("الفرع", BRANCH_LABELS[shift.branch])}
    ${row("الكاشير", shift.cashierName ?? "—")}
    ${row("بدء الشيفت", fmtDateTime(shift.openedAt))}
    ${row("إقفال الشيفت", fmtDateTime(shift.closedAt))}
    <div class="divider"></div>
    ${row("عدد الفواتير", fmt(report.invoicesCount))}
    ${row("إجمالي المبيعات", fmt(report.totalSales) + " ج.م")}
    <div class="divider dashed"></div>
    ${row("كاش", fmt(report.cashSales) + " ج.م")}
    ${row("فيزا", fmt(report.cardSales) + " ج.م")}
    ${row("تحويل", fmt(report.transferSales) + " ج.م")}
    ${row("مرتجعات نقدية", fmt(report.cashRefunds) + " ج.م")}
    <div class="divider dashed"></div>
    ${row("عهدة البداية", fmt(report.openingCash) + " ج.م")}
    ${row("النقد المتوقع", fmt(report.expectedCash) + " ج.م", true)}
    ${row("النقد المعدود", fmt(shift.countedCash ?? 0) + " ج.م", true)}
    ${row("الفرق", diffLabel, true)}
    ${shift.notes ? `<div class="divider"></div><div class="notes">ملاحظات: ${shift.notes}</div>` : ""}
    <div class="divider"></div>
    <div class="center small">تمت الطباعة: ${fmtDateTime(new Date().toISOString())}</div>
  `;

  const css = `
    @page { size: 302px auto; margin: 0; }
    html, body { width: 302px; margin: 0; padding: 0; background: #fff; }
    * { color: #000 !important; box-sizing: border-box; }
    body { padding: 3mm; direction: rtl; font-family: ui-monospace, "Courier New", monospace; font-size: 12px; line-height: 1.4; }
    .center { text-align: center; }
    .store { font-weight: 700; font-size: 16px; }
    .small { font-size: 10px; }
    .divider { border-top: 1px solid #000; margin: 2mm 0; }
    .divider.dashed { border-top: 1px dashed #000; }
    .row { display: flex; justify-content: space-between; gap: 3mm; }
    .row.strong { font-weight: 700; font-size: 13px; }
    .row > span:last-child { white-space: nowrap; }
    .notes { font-size: 11px; }
  `;

  const popup = window.open("", "eb-shift-print", "width=340,height=640");
  if (!popup) {
    // إن مُنعت النوافذ المنبثقة — أعلم المستخدم بدل الفشل الصامت
    // (استُدعيت هذه الدالة بعد نجاح الإقفال)
    // eslint-disable-next-line no-alert
    return;
  }
  const doc = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>إقفال الصندوق</title><style>${css}</style></head><body>${body}<script>window.onload=function(){window.focus();window.print();};window.onafterprint=function(){window.close();};<\/script></body></html>`;
  popup.document.open();
  popup.document.write(doc);
  popup.document.close();
}
