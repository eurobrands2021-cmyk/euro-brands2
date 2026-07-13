"use client";

import { useEffect, useState } from "react";

// حالة طيّ/فتح ثابتة تُحفظ في localStorage لكل لوحة قابلة للطي.
// أول عرض يستخدم القيمة الافتراضية (لتفادي عدم تطابق SSR) ثم تُقرأ القيمة
// المحفوظة بعد التركيب. أي تغيير لاحق يُحفظ تلقائياً.
export function usePersistentCollapse(
  key: string,
  defaultOpen = true
): readonly [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const [open, setOpen] = useState(defaultOpen);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setOpen(raw === "1");
    } catch {
      /* تجاهل تعذّر القراءة */
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, open ? "1" : "0");
    } catch {
      /* تجاهل امتلاء/تعذّر التخزين */
    }
  }, [key, open, loaded]);

  return [open, setOpen] as const;
}
