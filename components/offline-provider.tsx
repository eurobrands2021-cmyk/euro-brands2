"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import {
  getPendingSales,
  deletePendingSale,
  countPendingSales,
} from "@/lib/offline-db";

interface OfflineContextValue {
  online: boolean;
  pendingCount: number;
  refreshPending: () => void;
  syncNow: () => void;
}

const OfflineContext = createContext<OfflineContextValue>({
  online: true,
  pendingCount: 0,
  refreshPending: () => {},
  syncNow: () => {},
});

// حدث يُطلَق بعد نجاح المزامنة كي تحدّث الصفحات بياناتها (مثل نقطة البيع).
export const OFFLINE_SYNCED_EVENT = "eb-offline-synced";
// حدث يطلبه أي مكوّن بعد إضافة فاتورة للطابور لتحديث العدّاد فوراً.
export const OFFLINE_QUEUE_CHANGED_EVENT = "eb-offline-queue-changed";

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const syncing = useRef(false);

  const refreshPending = useCallback(() => {
    countPendingSales()
      .then(setPendingCount)
      .catch(() => {});
  }, []);

  // مزامنة الطابور مع الخادم — تُستدعى عند عودة الاتصال.
  const syncNow = useCallback(async () => {
    if (syncing.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    syncing.current = true;
    try {
      const pending = await getPendingSales();
      if (pending.length === 0) return;
      let synced = 0;
      for (const sale of pending) {
        try {
          const res = await fetch("/api/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sale.payload),
          });
          if (res.ok) {
            await deletePendingSale(sale.id);
            synced++;
          } else if (res.status >= 400 && res.status < 500 && res.status !== 409) {
            // خطأ تحقّق دائم (مثل نفاد المخزون) — أزِل الفاتورة حتى لا تعلق الطابور
            await deletePendingSale(sale.id);
          }
        } catch {
          // انقطع الاتصال مجدداً — أوقف المحاولة وأبقِ الباقي في الطابور
          break;
        }
      }
      if (synced > 0) {
        toast.success(`تمت مزامنة ${synced} فاتورة بنجاح`);
        window.dispatchEvent(new Event(OFFLINE_SYNCED_EVENT));
      }
    } finally {
      syncing.current = false;
      refreshPending();
    }
  }, [refreshPending]);

  // تسجيل عامل الخدمة
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* تجاهل فشل التسجيل (مثلاً في بيئات لا تدعمه) */
    });
  }, []);

  // حالة الاتصال + المزامنة التلقائية عند العودة
  useEffect(() => {
    setOnline(navigator.onLine);
    refreshPending();

    const onOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const onOffline = () => setOnline(false);
    const onQueueChanged = () => refreshPending();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged);

    // حاول المزامنة مرة عند الإقلاع إن كان هناك طابور معلّق
    if (navigator.onLine) void syncNow();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged);
    };
  }, [refreshPending, syncNow]);

  return (
    <OfflineContext.Provider
      value={{ online, pendingCount, refreshPending, syncNow }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
