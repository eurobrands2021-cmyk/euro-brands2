"use client";

import { useEffect, useMemo, useState } from "react";

// حجم الدفعة الموحّد لكل القوائم الطويلة (سجل النشاط، الديفو، تاريخ العميل،
// طلبات الدخول): آخر 20 عنصراً، والأحدث أولاً.
export const HISTORY_PAGE_SIZE = 20;

// خطّاف موحّد لترقيم القوائم الطويلة: يدير نطاق التاريخ (من/إلى) ورقم الدفعة،
// ويبني معاملات الاستعلام (page/perPage/from/to) التي يضيفها كل مستدعٍ لرابطه.
// الدفعة رقم 1 = الأحدث؛ «السابق» يزيد الرقم (أقدم)، «التالي» يُنقصه (أحدث).
export function useHistoryPagination(pageSize: number = HISTORY_PAGE_SIZE) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // أي تغيير في نطاق التاريخ يُعيدنا لأحدث دفعة
  useEffect(() => {
    setPage(1);
  }, [from, to]);

  // سلسلة معاملات مشتركة — تُدمج في رابط كل قائمة
  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("perPage", String(pageSize));
    if (from) p.set("from", new Date(from).toISOString());
    if (to) {
      // شامل نهاية اليوم المحدد
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      p.set("to", end.toISOString());
    }
    return p;
  }, [page, pageSize, from, to]);

  const hasDateFilter = !!(from || to);

  function clearDates() {
    setFrom("");
    setTo("");
  }

  return {
    from,
    to,
    setFrom,
    setTo,
    page,
    setPage,
    pageSize,
    params,
    hasDateFilter,
    clearDates,
  };
}
