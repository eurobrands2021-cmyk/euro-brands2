"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

// مكوّنات توليد الأكواد على العميل بالكامل (بدون أي طلب للخادم):
//   QrCode        → SVG (يُستخدم في الطباعة/التيكيت) يشفّر رابط صفحة المنتج العامة
//   QrImage       → Canvas عالي الأداء: يولّد PNG (base64) كسولاً ويخزّنه، للعرض في الفورم
//   Barcode128    → باركود Code 128 يشفّر الـ SKU للكاشير

// نسخة Canvas سريعة من الـ QR:
//   • تُولَّد عبر مكتبة `qrcode` (canvas → PNG base64) بدل SVG لأداء أفضل.
//   • كسولة: لا تُولَّد إلا عندما يظهر العنصر في الشاشة (IntersectionObserver).
//   • تُخزَّن الصورة الناتجة في الحالة فلا يُعاد توليدها إلا لو تغيّرت القيمة.
//   • تعرض هيكلاً (skeleton) نابضاً أثناء التوليد.
export function QrImage({
  value,
  size = 120,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // كسول: لا نبدأ التوليد إلا عند ظهور العنصر (أو فوراً لو لا يوجد دعم للمراقب).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // التوليد + التخزين المؤقت: يعمل فقط عند الظهور وعند تغيّر القيمة/الحجم.
  useEffect(() => {
    if (!visible || !value) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    setDataUrl(null);
    QRCode.toDataURL(value, {
      width: size,
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        /* قيمة لا تصلح للترميز — نترك الهيكل ظاهراً */
      });
    return () => {
      cancelled = true;
    };
  }, [visible, value, size]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size }}
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="رمز QR"
          width={size}
          height={size}
          className="block h-full w-full"
        />
      ) : (
        <div
          className="h-full w-full animate-pulse rounded bg-[var(--surface-2)]"
          aria-label="جارٍ توليد الرمز…"
        />
      )}
    </div>
  );
}

export function QrCode({
  value,
  size = 96,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      marginSize={0}
      bgColor="#ffffff"
      fgColor="#000000"
      className={className}
    />
  );
}

export function Barcode128({
  value,
  height = 48,
  width = 1.6,
  fontSize = 12,
  displayValue = true,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width,
        fontSize,
        displayValue,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
        font: "monospace",
      });
    } catch {
      // قيمة لا تصلح للترميز — نترك الـ SVG فارغاً
    }
  }, [value, height, width, fontSize, displayValue]);

  return <svg ref={ref} className={className} />;
}
