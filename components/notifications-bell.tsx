"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  X,
  PackageCheck,
  AlertTriangle,
  UserPlus,
} from "lucide-react";
import { apiGet, apiPut } from "@/lib/client";
import { Spinner } from "@/components/ui/spinner";
import { useHistoryPagination } from "@/lib/use-history-pagination";
import {
  HistoryDateFilter,
  HistoryPager,
} from "@/components/ui/history-toolbar";
import { BRANCH_LABELS } from "@/lib/constants";
import { formatNumber, formatDateTime } from "@/lib/format";
import type {
  LowStockItem,
  LowStockResponse,
  AccessRequestDTO,
  Paginated,
} from "@/lib/types";

const LOW_STOCK_POLL_MS = 30000;
const ACCESS_POLL_MS = 15000;
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

// جرس إشعارات موحّد — يجمع في مكان واحد: طلبات دخول الكاشير المعلّقة،
// وتنبيهات قلة المخزون (للأصناف المُفعَّل لها التنبيه). للمدير فقط.
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ---- تنبيهات قلة المخزون ----
  const [stockItems, setStockItems] = useState<LowStockItem[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  // ---- طلبات دخول الكاشير ----
  const [requests, setRequests] = useState<AccessRequestDTO[]>([]);
  const [reqTotal, setReqTotal] = useState(0);
  const [reqLoading, setReqLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  // ترقيم/فلترة موحّدة لقائمة الطلبات (آخر 20 + السابق/التالي + نطاق زمني)
  const { from, to, setFrom, setTo, page, setPage, pageSize, params, hasDateFilter, clearDates } =
    useHistoryPagination();
  const reqQuery = params.toString();

  useEffect(() => setDismissed(loadDismissed()), []);

  const loadStock = useCallback(async () => {
    try {
      const res = await apiGet<LowStockResponse>("/api/low-stock");
      setStockItems(res.items.filter((i) => i.alertOnLowStock));
    } catch {
      /* تجاهل أخطاء الاستطلاع المؤقتة */
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await apiGet<Paginated<AccessRequestDTO>>(
        `/api/access-requests?status=PENDING&${reqQuery}`
      );
      setRequests(res.items);
      setReqTotal(res.total);
    } catch {
      /* تجاهل أخطاء الاستطلاع المؤقتة */
    }
  }, [reqQuery]);

  // استطلاع دوري لكل مصدر بمعدّله الخاص
  useEffect(() => {
    void loadStock();
    const timer = setInterval(loadStock, LOW_STOCK_POLL_MS);
    return () => clearInterval(timer);
  }, [loadStock]);

  useEffect(() => {
    void loadRequests();
    const timer = setInterval(loadRequests, ACCESS_POLL_MS);
    return () => clearInterval(timer);
  }, [loadRequests]);

  // تحديث فوري عند فتح القائمة
  useEffect(() => {
    if (!open) return;
    setStockLoading(true);
    setReqLoading(true);
    void loadStock().finally(() => setStockLoading(false));
    void loadRequests().finally(() => setReqLoading(false));
  }, [open, loadStock, loadRequests]);

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

  const visibleStock = stockItems.filter(
    (i) => !dismissed.includes(alertKey(i))
  );
  const stockCount = visibleStock.length;
  const reqCount = reqTotal;
  const total = stockCount + reqCount;

  function dismissStock(item: LowStockItem) {
    const next = [...dismissed, alertKey(item)];
    setDismissed(next);
    saveDismissed(next);
  }

  function clearAllStock() {
    const next = [...new Set([...dismissed, ...visibleStock.map(alertKey)])];
    setDismissed(next);
    saveDismissed(next);
  }

  async function resolve(id: string, status: "APPROVED" | "REJECTED") {
    setActing(id);
    try {
      await apiPut(`/api/access-requests/${id}`, { status });
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setReqTotal((t) => Math.max(0, t - 1));
      // أعِد جلب الصفحة الحالية لتعبئة الفراغ من الطلبات الأقدم
      void loadRequests();
    } catch {
      /* تجاهل — سيُعاد الاستطلاع */
    } finally {
      setActing(null);
    }
  }

  const loading = stockLoading || reqLoading;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost relative h-11 w-11 !px-0"
        aria-label="الإشعارات"
        title="الإشعارات"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white nums">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <Bell className="h-4 w-4 text-accent" />
              الإشعارات
              {total > 0 && (
                <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white nums">
                  {total}
                </span>
              )}
            </h3>
            {loading && <Spinner className="h-4 w-4" />}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {total === 0 && !hasDateFilter ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
                <PackageCheck className="h-7 w-7 text-success" />
                لا توجد إشعارات جديدة
              </div>
            ) : (
              <>
                {/* قسم: طلبات دخول الكاشير */}
                {(reqCount > 0 || hasDateFilter) && (
                  <section>
                    <div className="flex items-center gap-2 bg-[var(--surface-2)] px-4 py-2 text-xs font-bold text-muted">
                      <UserPlus className="h-3.5 w-3.5" />
                      طلبات دخول الكاشير
                      <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white nums">
                        {reqCount}
                      </span>
                    </div>
                    {/* فلتر النطاق الزمني الموحّد */}
                    <div className="border-b border-[var(--border)] px-4 py-2.5">
                      <HistoryDateFilter
                        from={from}
                        to={to}
                        onFrom={setFrom}
                        onTo={setTo}
                        onClear={clearDates}
                        hasDateFilter={hasDateFilter}
                      />
                    </div>
                    {requests.length === 0 && (
                      <p className="px-4 py-4 text-center text-xs text-muted">
                        لا توجد طلبات ضمن النطاق المحدد
                      </p>
                    )}
                    {requests.map((r) => (
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
                    ))}
                    <div className="px-4 pb-2">
                      <HistoryPager
                        page={page}
                        perPage={pageSize}
                        total={reqTotal}
                        onPage={setPage}
                      />
                    </div>
                  </section>
                )}

                {/* قسم: تنبيهات قلة المخزون */}
                {stockCount > 0 && (
                  <section>
                    <div className="flex items-center justify-between gap-2 bg-[var(--surface-2)] px-4 py-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-muted">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        تنبيهات قلة المخزون
                        <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white nums">
                          {stockCount}
                        </span>
                      </span>
                      <button
                        onClick={clearAllStock}
                        className="btn btn-ghost h-6 px-2 text-[11px] text-muted hover:text-text"
                      >
                        مسح الكل
                      </button>
                    </div>
                    {visibleStock.map((item) => {
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
                              <span className={cnBadge(out)}>
                                المتاح: {formatNumber(item.quantity)}
                              </span>
                              <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 font-medium text-muted nums">
                                الحد الأدنى: {formatNumber(item.minQuantity)}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => dismissStock(item)}
                            className="btn btn-ghost h-8 w-8 shrink-0 !px-0 text-muted hover:text-danger"
                            aria-label="تجاهل التنبيه"
                            title="تجاهل"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </section>
                )}
              </>
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
