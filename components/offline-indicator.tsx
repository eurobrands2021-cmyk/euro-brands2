"use client";

import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOffline } from "@/components/offline-provider";

// مؤشر حالة الاتصال في الشريط العلوي — نقطة خضراء (متصل) أو حمراء (غير متصل)
// مع عدّاد الفواتير المعلّقة في الطابور. عند عدم الاتصال يظهر النص كاملاً.
export function OfflineIndicator() {
  const { online, pendingCount } = useOffline();

  // متصل بلا فواتير معلّقة: نقطة صغيرة هادئة فقط
  if (online && pendingCount === 0) {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-1 sm:inline-flex"
        title="متصل"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <Wifi className="h-3.5 w-3.5 text-success" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold",
        online
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-danger/40 bg-[rgba(217,83,79,0.12)] text-danger"
      )}
      title={online ? "جارٍ المزامنة" : "وضع عدم الاتصال"}
    >
      {online ? (
        <Wifi className="h-3.5 w-3.5" />
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-danger" />
          <WifiOff className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">وضع عدم الاتصال</span>
        </>
      )}
      {pendingCount > 0 && (
        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white nums">
          {pendingCount}
        </span>
      )}
    </span>
  );
}
