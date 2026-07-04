"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loadCachedSettings } from "@/lib/settings";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const EXPLICIT_KEY = "eb-theme"; // اختيار المستخدم الصريح (يتجاوز الوضع الافتراضي)

// يحسب الوضع الفعلي: اختيار المستخدم الصريح إن وُجد، وإلا الوضع الافتراضي
// من الإعدادات (dark/light/system) حيث «system» يتبع نظام التشغيل.
function resolveTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const explicit = localStorage.getItem(EXPLICIT_KEY);
  if (explicit === "dark" || explicit === "light") return explicit;
  const def = loadCachedSettings().themeMode;
  if (def === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return def;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(resolveTheme());

    // أعد الحساب عند تغيّر تفضيل النظام (يؤثر فقط في وضع «system» دون اختيار صريح)
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (!localStorage.getItem(EXPLICIT_KEY)) setTheme(resolveTheme());
    };
    mq.addEventListener("change", onSystem);

    // أعد الحساب عند حفظ إعدادات جديدة (تغيير الوضع الافتراضي من صفحة الإعدادات)
    const onSettings = () => setTheme(resolveTheme());
    window.addEventListener("eb-settings-changed", onSettings);

    return () => {
      mq.removeEventListener("change", onSystem);
      window.removeEventListener("eb-settings-changed", onSettings);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      // اختيار صريح من المستخدم يتجاوز الوضع الافتراضي
      localStorage.setItem(EXPLICIT_KEY, next);
      return next;
    });

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme يجب استخدامه داخل ThemeProvider");
  return ctx;
}
