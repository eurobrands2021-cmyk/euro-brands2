import { PRINT_SIZES, isThermalSize, type PrintSize } from "@/lib/print-settings";

// عرض ورق الطابعة الحرارية بالبكسل عند 96dpi:
//   80mm ≈ 302px  ·  58mm ≈ 219px
function thermalWidthPx(size: PrintSize): number {
  return size === "58mm" ? 219 : 302;
}

// أنماط الإيصال داخل نافذة الطباعة المنبثقة — مكتفية ذاتياً (بلا اعتماد على
// أنماط التطبيق) لتفادي تجاهل المتصفح لمقاس الورق. تُطابق أنماط ‎.eb-receipt‎.
function thermalPopupCss(width: number): string {
  return `
    @page { size: ${width}px auto; margin: 0; }
    html, body { width: ${width}px; margin: 0; padding: 0; background: #ffffff; }
    * { color: #000000 !important; background: transparent !important;
        box-shadow: none !important; text-shadow: none !important; }
    .eb-receipt { box-sizing: border-box; width: 100%; padding: 2mm;
      background: #ffffff; color: #000000; direction: rtl; line-height: 1.3;
      font-family: ui-monospace, "Courier New", "Courier", monospace;
      font-size: var(--rcpt-base, 12px); }
    .eb-receipt[data-font="small"] { --rcpt-base: 11px; }
    .eb-receipt[data-font="medium"] { --rcpt-base: 12px; }
    .eb-receipt[data-font="large"] { --rcpt-base: 14px; }
    .eb-rcpt-center { text-align: center; }
    .eb-rcpt-store { font-weight: 700; font-size: 1.34em; }
    .eb-rcpt-info { text-align: right; }
    .eb-rcpt-divider { border-top: 1px dashed #000000; margin: 1.5mm 0; }
    .eb-rcpt-row { display: flex; justify-content: space-between; gap: 3mm; }
    .eb-rcpt-row > span:last-child { white-space: nowrap; }
    .eb-rcpt-item { margin-bottom: 1.5mm; }
    .eb-rcpt-name { font-weight: 700; }
    .eb-rcpt-small { font-size: 0.84em; }
    .eb-rcpt-grand { font-weight: 700; font-size: 1.17em; }
    .eb-rcpt-thanks { margin-top: 1mm; }
    .eb-rcpt-qr { display: flex; justify-content: center; margin-top: 1.5mm; }
    .eb-rcpt-qr svg { max-width: 100%; height: auto; }
  `;
}

// طباعة حرارية عبر نافذة منبثقة بعرض ثابت بالبكسل (302px/219px). هذا يُجبر
// المتصفح على الطباعة بعرض الرول الصحيح بدل A4، حيث يتجاهل كثيرٌ من المتصفحات
// ‎@page { size: 80mm auto }‎ وحده. يعيد true عند النجاح.
function printThermalViaPopup(size: PrintSize): boolean {
  try {
    const el = document.querySelector<HTMLElement>(
      ".eb-print-area .eb-receipt"
    );
    if (!el) return false;
    const width = thermalWidthPx(size);
    const popup = window.open(
      "",
      "eb-thermal-print",
      `width=${width},height=640`
    );
    if (!popup) return false;
    const doc = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}"><title>طباعة الإيصال</title><style>${thermalPopupCss(
      width
    )}</style></head><body>${el.outerHTML}<script>window.onload=function(){window.focus();window.print();};window.onafterprint=function(){window.close();};<\/script></body></html>`;
    popup.document.open();
    popup.document.write(doc);
    popup.document.close();
    return true;
  } catch {
    return false;
  }
}

// طباعة داخل الصفحة عبر أنماط ‎@page‎ المسمّاة — تُستخدم لمقاسات A4/A5،
// وكحلٍّ بديل لو تعذّر فتح النافذة المنبثقة (مانع النوافذ).
function printInPage(size: PrintSize): void {
  const sizeClasses = PRINT_SIZES.map((s) => `eb-size-${s}`);
  document.body.classList.remove(...sizeClasses);
  document.body.classList.add("eb-print-on", `eb-size-${size}`);
  const cleanup = () => {
    document.body.classList.remove("eb-print-on", ...sizeClasses);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// نقطة الدخول الموحّدة للطباعة: نافذة منبثقة للمقاسات الحرارية (80mm/58mm)،
// وطباعة داخل الصفحة لمقاسات الورق (A4/A5).
export function triggerInvoicePrint(size: PrintSize): void {
  if (typeof window === "undefined") return;
  if (isThermalSize(size) && printThermalViaPopup(size)) return;
  printInPage(size);
}
