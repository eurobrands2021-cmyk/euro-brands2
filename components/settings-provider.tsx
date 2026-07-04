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
import { apiGet, apiPut } from "@/lib/client";
import {
  DEFAULT_SETTINGS,
  applyUiTheme,
  cacheSettings,
  loadCachedSettings,
  mergeSettings,
  type AppSettings,
} from "@/lib/settings";

interface SettingsContextValue {
  settings: AppSettings;
  // حفظ تعديل جزئي على الإعدادات (يدمج مع الحالي) — يعود بالإعدادات المحدَّثة
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined
);

// يطبّق ألوان الواجهة/الخط ويُعلم بقية التطبيق (يشمل إعادة حساب الوضع الليلي)
function applyAndNotify(s: AppSettings) {
  applyUiTheme(s);
  cacheSettings(s);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("eb-settings-changed"));
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const latest = useRef<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // 1) تطبيق فوري من التخبئة المحلية (بلا وميض)
    const cached = loadCachedSettings();
    latest.current = cached;
    setSettings(cached);
    applyUiTheme(cached);

    // 2) مزامنة مع الخادم (مصدر الحقيقة)
    let cancelled = false;
    apiGet<Partial<AppSettings>>("/api/settings")
      .then((remote) => {
        if (cancelled) return;
        const merged = mergeSettings(remote);
        latest.current = merged;
        setSettings(merged);
        applyAndNotify(merged);
      })
      .catch(() => {
        /* أبقِ على القيم المخبّأة عند تعذّر الجلب */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = mergeSettings({ ...latest.current, ...patch });
    // تفاؤلياً: طبّق محلياً فوراً
    latest.current = next;
    setSettings(next);
    applyAndNotify(next);
    // ثم احفظ على الخادم
    const saved = await apiPut<Partial<AppSettings>>("/api/settings", next);
    const merged = mergeSettings(saved);
    latest.current = merged;
    setSettings(merged);
    applyAndNotify(merged);
    return merged;
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, saveSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings يجب استخدامه داخل SettingsProvider");
  return ctx;
}
