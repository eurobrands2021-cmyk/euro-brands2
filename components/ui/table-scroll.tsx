"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// غلاف تمرير أفقي للجداول على الشاشات الصغيرة مع تلميح مرئي «← اسحب للمزيد».
// يظهر التلميح فقط عندما يتجاوز عرض المحتوى الحاوية (أي هناك ما يُسحب)
// ويختفي بمجرد أن يبدأ المستخدم التمرير أو على الشاشات الأكبر.
export function TableScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const overflowing = el.scrollWidth - el.clientWidth > 8;
      // scrollLeft قد يكون سالباً في اتجاه RTL — نأخذ القيمة المطلقة
      const atStart = Math.abs(el.scrollLeft) < 6;
      setShowHint(overflowing && atStart);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div ref={ref} className={cn("overflow-x-auto", className)}>
        {children}
      </div>
      <div
        className={cn(
          "pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-white shadow-card transition-opacity duration-200 sm:hidden",
          showHint ? "opacity-95" : "opacity-0"
        )}
        aria-hidden
      >
        <span>←</span>
        اسحب للمزيد
      </div>
    </div>
  );
}
