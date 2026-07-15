"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { normalizeArabic } from "@/lib/normalize";
import { Spinner } from "./spinner";

// خيار واحد داخل القائمة: القيمة المخزّنة + النص المعروض + تلميح اختياري.
export interface SearchableOption {
  value: string;
  label: string;
  hint?: string;
}

interface BaseProps {
  value: string;
  onChange: (value: string) => void;
  // نص الزر عندما لا يوجد اختيار (يُعامل كخيار «الكل» في الفلاتر)
  placeholder?: string;
  // نص حقل البحث داخل القائمة
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  // إظهار زر مسح (×) عند وجود اختيار — الافتراضي true
  clearable?: boolean;
  // عنصر «+ إضافة جديد» أسفل النتائج
  onAddNew?: () => void;
  addNewLabel?: string;
  // رسالة عند غياب النتائج
  emptyMessage?: string;
}

// وضع القائمة المحمّلة مسبقاً (تصفية في المتصفح) — مناسب للقوائم الصغيرة
// (الألوان/المقاسات) والكبيرة (٥٠٠+ براند) لأن التصفية تحدث محلياً بلا طلبات.
interface ClientProps extends BaseProps {
  options: SearchableOption[];
  loadOptions?: never;
  minChars?: never;
  selectedLabel?: never;
}

// وضع الجلب غير المتزامن (fetch عند الكتابة) — للقوائم الضخمة التي لا يُراد
// تحميلها كاملة. يُمرَّر selectedLabel لعرض القيمة المختارة دون تحميل القائمة.
interface AsyncProps extends BaseProps {
  loadOptions: (query: string) => Promise<SearchableOption[]>;
  options?: never;
  minChars?: number;
  selectedLabel?: string;
}

export type SearchableSelectProps = ClientProps | AsyncProps;

// أقصى عدد نتائج تُعرَض دفعةً واحدة في وضع القائمة المحمّلة مسبقاً — يحمي من
// رسم ٥٠٠+ عقدة DOM دفعة واحدة. البحث بالكتابة يُضيّق النتائج بسرعة.
const MAX_RENDERED = 100;
const SEARCH_DEBOUNCE_MS = 250;

export function SearchableSelect(props: SearchableSelectProps) {
  const {
    value,
    onChange,
    placeholder = "اختر…",
    searchPlaceholder = "بحث…",
    disabled = false,
    className,
    id,
    ariaLabel,
    clearable = true,
    onAddNew,
    addNewLabel = "+ إضافة جديد",
    emptyMessage = "لا توجد نتائج",
  } = props;
  const isAsync = "loadOptions" in props && typeof props.loadOptions === "function";
  const minChars = isAsync ? (props as AsyncProps).minChars ?? 1 : 0;

  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [asyncOptions, setAsyncOptions] = useState<SearchableOption[]>([]);
  const [asyncLoading, setAsyncLoading] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  // النتائج المعروضة: تصفية محلية (client) أو نتائج الجلب (async)
  const clientResults = useMemo(() => {
    if (isAsync) return [];
    const opts = (props as ClientProps).options;
    const nq = normalizeArabic(query.trim());
    const list = nq
      ? opts.filter((o) => {
          const hay = `${normalizeArabic(o.label)} ${normalizeArabic(o.value)}`;
          return hay.includes(nq);
        })
      : opts;
    return list.slice(0, MAX_RENDERED);
  }, [isAsync, props, query]);

  const results = isAsync ? asyncOptions : clientResults;

  // النص المعروض للقيمة المختارة على الزر
  const selectedLabel = useMemo(() => {
    if (!value) return null;
    if (isAsync) return (props as AsyncProps).selectedLabel ?? value;
    const found = (props as ClientProps).options.find((o) => o.value === value);
    return found?.label ?? value;
  }, [value, isAsync, props]);

  // جلب غير متزامن مع تأجيل ومقاومة السباق
  useEffect(() => {
    if (!isAsync || !open) return;
    const q = query.trim();
    if (q.length < minChars) {
      setAsyncOptions([]);
      setAsyncLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setAsyncLoading(true);
    const timer = setTimeout(() => {
      (props as AsyncProps)
        .loadOptions(q)
        .then((opts) => {
          if (requestIdRef.current !== requestId) return;
          setAsyncOptions(opts);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setAsyncOptions([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setAsyncLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isAsync, open, query, minChars, props]);

  // إعادة ضبط التظليل عند تغيّر النتائج
  useEffect(() => setHighlight(0), [query, open]);

  // حساب موضع اللوحة المنبثقة (portal) بالنسبة للزر — يتبع التمرير/تغيير الحجم
  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      160,
      Math.min(360, (openUp ? spaceAbove : spaceBelow) - 12)
    );
    setPos({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    // تركيز حقل البحث عند الفتح
    searchRef.current?.focus();
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  // إغلاق عند النقر خارج الزر واللوحة
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openPanel() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (
      !open &&
      (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      openPanel();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = results[highlight];
      if (opt) select(opt.value);
    }
  }

  const showAddNew = typeof onAddNew === "function";
  const showPrompt = isAsync && query.trim().length < minChars;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
        className={cn(
          "input flex items-center justify-between gap-2 text-right",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selectedLabel ? "text-text" : "text-muted"
          )}
        >
          {selectedLabel ?? placeholder}
        </span>
        {clearable && value && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="مسح"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-text"
          >
            <X className="h-4 w-4" />
          </span>
        ) : (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[60] overflow-hidden rounded-lg border bg-surface shadow-card animate-fade-in"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
            }}
          >
            {/* حقل البحث */}
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  ref={searchRef}
                  className="input h-9 pr-8 text-sm"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                />
              </div>
            </div>

            {/* النتائج */}
            <ul
              id={listboxId}
              role="listbox"
              className="overflow-y-auto py-1"
              style={{ maxHeight: pos.maxHeight - 56 }}
            >
              {asyncLoading ? (
                <li className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted">
                  <Spinner className="h-4 w-4" />
                  جارٍ البحث…
                </li>
              ) : showPrompt ? (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  اكتب حرفين على الأقل للبحث…
                </li>
              ) : results.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  {emptyMessage}
                </li>
              ) : (
                results.map((opt, idx) => {
                  const active = idx === highlight;
                  const selected = opt.value === value;
                  return (
                    <li key={opt.value} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => select(opt.value)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-right text-sm transition-colors",
                          active ? "bg-accent-soft text-accent" : "text-text",
                          selected && "font-bold"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {opt.label}
                          {opt.hint && (
                            <span className="mr-1.5 text-xs text-muted">
                              {opt.hint}
                            </span>
                          )}
                        </span>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-accent" />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {/* «+ إضافة جديد» */}
            {showAddNew && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAddNew?.();
                }}
                className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
              >
                <Plus className="h-4 w-4" />
                {addNewLabel.replace(/^\+\s*/, "")}
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
