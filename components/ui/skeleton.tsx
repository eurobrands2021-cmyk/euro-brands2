import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

// عنصر هيكل تحميل بلمعان متحرّك — يُستخدم بدل الدوّارة أثناء جلب البيانات
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden />;
}

// هيكل بديل للرسوم البيانية أثناء تحميلها الكسول (lazy load)
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex h-72 w-full items-end gap-2 p-4", className)}
      aria-hidden
    >
      {[40, 65, 50, 80, 55, 70, 45, 60].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

// هيكل بديل لصفحات القوائم/الجداول أثناء الجلب — بطاقة بصفوف متلألئة
// بديل موحّد لِـ PageLoader على صفحات: العملاء، الطلبات، المخزون، الفواتير
export function TableSkeleton({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("card overflow-hidden", className)} aria-hidden>
      {/* ترويسة الجدول */}
      <div className="flex items-center gap-4 border-b bg-[var(--surface-2)] px-4 py-3">
        <Skeleton className="h-3.5 flex-1 max-w-[40%]" />
        <Skeleton className="hidden h-3.5 w-24 sm:block" />
        <Skeleton className="hidden h-3.5 w-20 sm:block" />
        <Skeleton className="h-3.5 w-16" />
      </div>
      {/* الصفوف */}
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-4 flex-1 max-w-[40%]" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="hidden h-4 w-20 sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// هيكل صفوف بسيط بلا بطاقة — يُوضَع داخل حاوية قائمة موجودة (سجل النشاط، نتائج البحث)
export function RowsSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
