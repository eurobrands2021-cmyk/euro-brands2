"use client";

import { useEffect, useState } from "react";

// يُرجع نسخة «مؤجَّلة» من القيمة تتحدّث بعد توقّف التغيير بمقدار delay مللي ثانية.
// مفيد لحقول البحث: يبقى الإدخال فورياً بينما تؤجَّل عمليات التصفية/الجلب
// الثقيلة حتى يتوقّف المستخدم عن الكتابة (افتراضياً 300ms).
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
