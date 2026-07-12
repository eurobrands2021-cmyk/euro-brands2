"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PRINT_SETTINGS,
  loadPrintSettings,
  savePrintSettings,
  type PrintSettings,
} from "@/lib/print-settings";

const CHANGED_EVENT = "eb-print-settings-changed";

// حالة تفاعلية لإعدادات الطباعة، متزامنة عبر كل المكوّنات في نفس التبويب.
// تُحمَّل من localStorage بعد التركيب لتفادي اختلاف SSR.
export function usePrintSettings() {
  const [settings, setSettings] = useState<PrintSettings>(
    DEFAULT_PRINT_SETTINGS
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(loadPrintSettings());
    setLoaded(true);
    const onChange = () => setSettings(loadPrintSettings());
    window.addEventListener(CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((next: PrintSettings) => {
    setSettings(next);
    savePrintSettings(next);
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }, []);

  return { settings, setSettings: update, loaded };
}
