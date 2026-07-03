"use client";

import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import JsBarcode from "jsbarcode";

// مكوّنات توليد الأكواد على العميل بالكامل (بدون أي طلب للخادم):
//   QrCode        → يشفّر رابط صفحة المنتج العامة (/p/[sku])
//   Barcode128    → باركود Code 128 يشفّر الـ SKU للكاشير

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
