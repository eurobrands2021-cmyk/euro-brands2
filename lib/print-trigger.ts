import { PRINT_SIZES, type PrintSize } from "@/lib/print-settings";

// يشغّل طباعة المتصفح لحاوية «.eb-print-area» فقط، مع ربط المقاس بصفحته المسمّاة.
// يعتمد على أنماط الطباعة في globals.css (‎body.eb-print-on / body.eb-size-*‎).
export function triggerInvoicePrint(size: PrintSize): void {
  if (typeof window === "undefined") return;
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
