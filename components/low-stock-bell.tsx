"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X, PackageCheck, AlertTriangle } from "lucide-react";
import { apiGet } from "@/lib/client";
import { Spinner } from "@/components/ui/spinner";
import { BRANCH_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type { LowStockItem, LowStockResponse } from "@/lib/types";

const POLL_MS = 30000;
const DISMISSED_KEY = "dismissed_alerts";

function loadDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveDismissed(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

// معرّف ثابت للتنبيه يجمع الصنف مع كميته الحالية — لو تغيّرت الكمية يظهر التنبيه
// من جديد حتى لو سبق تجاهله على مستوى قديم.
function alertKey(item: LowStockItem): string {
  return `${item.id}:${item.quantity}`;
}

// جرس تنبيهات قلة المخزون — يعرض فقط الأصناف التي فُعِّل لها التنبيه (alertOnLowStock)
// وبلغت الحد الأدنى. يسمح بتجاهل كل تنبيه (localStorage) و«مسح الكل».
export function LowStockBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDismissed(loadDismissed()), []);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<LowStockResponse>("/api/low-stock");
      // فقط الأصناف المُفعَّل لها التنبيه صراحةً
      setItems(res.items.filter((i) => i.alertOnLowStock));
    } catch {
      /* تجاهل أخطاء الاستطلاع المؤقتة */
    }
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const visible = items.filter((i) => !dismissed.includes(alertKey(i)));
  const count = visible.length;

  function dismiss(item: LowStockItem) {
    const next = [...dismissed, alertKey(item)];
    setDismissed(next);
    saveDismissed(next);
  }

  function clearAll() {
    const next = [...new Set([...dismissed, ...visible.map(alertKey)])];
    setDismissed(next);
    saveDismissed(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost relative h-11 w-11 !px-0"
        aria-label="تنبيهات قلة المخزون"
        title="تنبيهات قلة المخزون"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white nums">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <AlertTriangle className="h-4 w-4 text-warning" />
              تنبيهات قلة المخزون
              {count > 0 && (
                <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white nums">
                  {count}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {loading && <Spinner className="h-4 w-4" />}
              {count > 0 && (
                <button
                  onClick={clearAll}
                  className="btn btn-ghost h-7 px-2 text-xs text-muted hover:text-text"
                >
                  مسح الكل
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {count === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
                <PackageCheck className="h-7 w-7 text-success" />
                لا توجد تنبيهات — كل الأصناف المُراقَبة فوق الحد الأدنى
              </div>
            ) : (
              visible.map((item) => {
                const out = item.quantity <= 0;
                return (
                  <div
                    key={alertKey(item)}
                    className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-text">
                        {item.productName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {item.brand} · مقاس {item.size}
                        {item.color ? ` / ${item.color}` : ""} ·{" "}
                        {BRANCH_LABELS[item.branch]}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span
                          className={cnBadge(out)}
                        >
                          المتاح: {formatNumber(item.quantity)}
                        </span>
                        <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 font-medium text-muted nums">
                          الحد الأدنى: {formatNumber(item.minQuantity)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => dismiss(item)}
                      className="btn btn-ghost h-8 w-8 shrink-0 !px-0 text-muted hover:text-danger"
                      aria-label="تجاهل التنبيه"
                      title="تجاهل"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// شارة الكمية المتاحة — حمراء عند النفاد، صفراء عند الانخفاض
function cnBadge(out: boolean): string {
  return out
    ? "rounded-md bg-[rgba(217,83,79,0.14)] px-1.5 py-0.5 font-bold text-danger nums"
    : "rounded-md bg-[rgba(230,162,60,0.16)] px-1.5 py-0.5 font-bold text-warning nums";
}
