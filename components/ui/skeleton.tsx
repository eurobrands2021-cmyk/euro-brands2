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
