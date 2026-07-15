"use client";

import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

// شريط فلترة النطاق الزمني الموحّد للقوائم الطويلة (من/إلى + مسح). يظهر أعلى
// كل قائمة (سجل نشاط، ديفو، تاريخ العميل، طلبات الدخول) بنفس الشكل.
export function HistoryDateFilter({
  from,
  to,
  onFrom,
  onTo,
  onClear,
  hasDateFilter,
  className,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onClear: () => void;
  hasDateFilter: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div>
        <label className="label flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted" />
          من تاريخ
        </label>
        <input
          type="date"
          className="input nums w-auto"
          value={from}
          max={to || undefined}
          onChange={(e) => onFrom(e.target.value)}
          aria-label="من تاريخ"
        />
      </div>
      <div>
        <label className="label">إلى تاريخ</label>
        <input
          type="date"
          className="input nums w-auto"
          value={to}
          min={from || undefined}
          onChange={(e) => onTo(e.target.value)}
          aria-label="إلى تاريخ"
        />
      </div>
      {hasDateFilter && (
        <button
          onClick={onClear}
          className="btn btn-ghost h-9 gap-1 px-2 text-xs text-muted"
        >
          <X className="h-3.5 w-3.5" />
          مسح النطاق
        </button>
      )}
    </div>
  );
}

// أزرار التصفّح الموحّدة: «السابق» (دفعة أقدم) و«التالي» (دفعة أحدث — يظهر فقط
// بعد الرجوع للخلف)، مع عدّاد «عرض س–ص من ن». مبنية على الترقيم بالإزاحة
// (page يبدأ من 1 = الأحدث). تُخفى تماماً حين تكفي دفعة واحدة كل العناصر.
export function HistoryPager({
  page,
  perPage,
  total,
  onPage,
  className,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (total <= perPage && page === 1) return null;

  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const hasOlder = page * perPage < total; // مزيد من الأقدم عبر «السابق»
  const hasNewer = page > 1; // «التالي» يعود للأحدث

  return (
    <div
      className={cn(
        "mt-3 flex items-center justify-between gap-2 border-t pt-3 text-sm",
        className
      )}
    >
      <span className="text-muted nums">
        عرض {formatNumber(start)}–{formatNumber(end)} من {formatNumber(total)}
      </span>
      <div className="flex gap-2">
        {hasNewer && (
          <button
            className="btn btn-secondary h-9 gap-1 px-3 text-xs"
            onClick={() => onPage(page - 1)}
          >
            <ChevronRight className="h-4 w-4" />
            التالي
          </button>
        )}
        <button
          className="btn btn-secondary h-9 gap-1 px-3 text-xs"
          disabled={!hasOlder}
          onClick={() => onPage(page + 1)}
        >
          السابق
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
