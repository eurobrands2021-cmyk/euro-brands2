// قوالب الفاتورة ومقاسات الطباعة — مصدر واحد للتسميات + حفظ الاختيار محلياً.

export const INVOICE_TEMPLATES = ["classic", "minimal", "bold"] as const;
export type InvoiceTemplate = (typeof INVOICE_TEMPLATES)[number];

export const INVOICE_TEMPLATE_LABELS: Record<InvoiceTemplate, string> = {
  classic: "كلاسيك",
  minimal: "مينيمال",
  bold: "بولد",
};

export const INVOICE_TEMPLATE_DESC: Record<InvoiceTemplate, string> = {
  classic: "تخطيط تقليدي، شعار كبير بالأعلى، إطارات كاملة",
  minimal: "أبيض نظيف، خطوط بسيطة، شعار صغير أعلى اليمين",
  bold: "ترويسة داكنة بنص أبيض ولون مميّز، تصميم عصري جريء",
};

export const INVOICE_SIZES = ["a4", "thermal", "a5"] as const;
export type InvoiceSize = (typeof INVOICE_SIZES)[number];

export const INVOICE_SIZE_LABELS: Record<InvoiceSize, string> = {
  a4: "A4 (فاتورة رسمية)",
  thermal: "80mm (طابعة كاشير)",
  a5: "A5 (مدمجة)",
};

const TEMPLATE_KEY = "eb_invoice_template";

export function loadInvoiceTemplate(): InvoiceTemplate {
  if (typeof window === "undefined") return "classic";
  const v = window.localStorage.getItem(TEMPLATE_KEY);
  return INVOICE_TEMPLATES.includes(v as InvoiceTemplate)
    ? (v as InvoiceTemplate)
    : "classic";
}

export function saveInvoiceTemplate(t: InvoiceTemplate): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMPLATE_KEY, t);
}
