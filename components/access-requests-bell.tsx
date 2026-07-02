"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, X, Inbox } from "lucide-react";
import { apiGet, apiPut } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import type { AccessRequestDTO } from "@/lib/types";

const POLL_MS = 15000;

// جرس طلبات دخول الكاشير — للمدير فقط. يُظهر الطلبات المعلّقة ويسمح بالموافقة/الرفض.
export function AccessRequestsBell() {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<AccessRequestDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const rows = await apiGet<AccessRequestDTO[]>(
        "/api/access-requests?status=PENDING&limit=50"
      );
      setRequests(rows);
    } catch {
      /* تجاهل أخطاء الاستطلاع المؤقتة */
    }
  }, []);

  // استطلاع دوري + عند الفتح
  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }
  }, [open, load]);

  // إغلاق عند النقر خارج القائمة
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function resolve(id: string, status: "APPROVED" | "REJECTED") {
    setActing(id);
    try {
      await apiPut(`/api/access-requests/${id}`, { status });
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* تجاهل — سيُعاد الاستطلاع */
    } finally {
      setActing(null);
    }
  }

  const count = requests.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost relative h-11 w-11 !px-0"
        aria-label="طلبات دخول الكاشير"
        title="طلبات دخول الكاشير"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-bold text-text">طلبات دخول الكاشير</h3>
            {loading && <Spinner className="h-4 w-4" />}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {count === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
                <Inbox className="h-7 w-7 text-muted" />
                لا توجد طلبات معلّقة
              </div>
            ) : (
              requests.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-text">
                      طلب دخول جديد من كاشير
                    </p>
                    <p className="truncate text-sm text-text">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted nums">
                      {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => resolve(r.id, "APPROVED")}
                      disabled={acting === r.id}
                      className="btn btn-primary h-8 w-8 !px-0"
                      aria-label="موافقة"
                      title="موافقة"
                    >
                      {acting === r.id ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => resolve(r.id, "REJECTED")}
                      disabled={acting === r.id}
                      className="btn btn-ghost h-8 w-8 !px-0 text-danger"
                      aria-label="رفض"
                      title="رفض"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
