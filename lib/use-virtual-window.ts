"use client";

import { useLayoutEffect, useRef, useState } from "react";

// نافذة افتراضية خفيفة (بدون مكتبات خارجية) لعرض القوائم الطويلة.
// تعرض فقط الصفوف المرئية داخل حاوية قابلة للتمرير مع «حشو» علوي/سفلي يحافظ
// على ارتفاع القائمة وموضع شريط التمرير. تُفعَّل فقط عند تجاوز عدد العناصر
// الحدّ (enabled)، وإلا تُرجع المدى كاملاً فتُعرض كل الصفوف كالمعتاد.
export function useVirtualWindow(opts: {
  count: number;
  rowHeight: number;
  enabled: boolean;
  overscan?: number;
}) {
  const { count, rowHeight, enabled, overscan = 10 } = opts;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(640);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const measure = () => setViewport(el.clientHeight || 640);
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [enabled]);

  if (!enabled) {
    return { scrollRef, start: 0, end: count, padTop: 0, padBottom: 0 };
  }

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewport / rowHeight) + overscan * 2;
  const end = Math.min(count, start + visibleCount);
  return {
    scrollRef,
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
  };
}
