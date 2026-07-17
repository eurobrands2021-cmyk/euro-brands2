"use client";

import { useEffect, useState } from "react";
import {
  Target,
  Pencil,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberInput } from "@/components/ui/inputs";
import { BRANCH_LABELS } from "@/lib/constants";
import type { HomeStats } from "@/lib/types";

const GOAL_KEY = "dailyGoal";

export default function HomePage() {
  const { data, loading } = useFetch<HomeStats>("/api/home-stats");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <DailyGoalCard todayNet={data?.today.netCash ?? 0} loading={loading} />
      <DailyCashCard data={data} loading={loading} />
    </div>
  );
}

/* ============================================================
   بطاقة الهدف اليومي — تحديد هدف مبيعات وعرض التقدّم
   ============================================================ */
function DailyGoalCard({
  todayNet,
  loading,
}: {
  todayNet: number;
  loading: boolean;
}) {
  // التقدّم يُقاس بصافي النقدية (بعد خصم المرتجعات)
  const todaySales = todayNet;
  const [goal, setGoal] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // قراءة الهدف المحفوظ محلياً
  useEffect(() => {
    const raw = localStorage.getItem(GOAL_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) setGoal(n);
  }, []);

  function save() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n <= 0) return;
    localStorage.setItem(GOAL_KEY, String(n));
    setGoal(n);
    setEditing(false);
  }

  function startEdit() {
    setDraft(goal ? String(goal) : "");
    setEditing(true);
  }

  const pct = goal && goal > 0 ? (todaySales / goal) * 100 : 0;
  const clamped = Math.min(pct, 100);

  // اللون حسب نسبة الإنجاز: أخضر ≥١٠٠٪، كهرماني ٥٠–٩٩٪، أحمر <٥٠٪
  const barColor = pct >= 100 ? "#3b9a6e" : pct >= 50 ? "#c9851a" : "#d9534f";

  return (
    <div className="card card-accent p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Target className="h-5 w-5" />
          </span>
          <h2 className="text-base font-bold text-text">الهدف اليومي</h2>
        </div>

        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="btn btn-ghost px-3 py-1.5 text-sm"
          >
            <Pencil className="h-4 w-4" />
            تعديل الهدف
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-5 flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="goal-input">
              هدف مبيعات اليوم (ج.م)
            </label>
            <NumberInput
              id="goal-input"
              autoFocus
              value={draft}
              onChange={setDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="input nums"
              placeholder="مثال: ١٠٠٠٠"
            />
          </div>
          <button
            type="button"
            onClick={save}
            className="btn btn-primary px-3"
            aria-label="حفظ"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn btn-secondary px-3"
            aria-label="إلغاء"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : goal ? (
        <div className="mt-5">
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-extrabold text-text nums">
              {formatCurrency(todaySales)}
              <span className="mx-1.5 text-base font-medium text-muted">من</span>
              {formatCurrency(goal)}
            </p>
            <span
              className="text-lg font-extrabold nums"
              style={{ color: barColor }}
            >
              {formatNumber(Math.round(pct))}%
            </span>
          </div>

          {/* شريط التقدّم */}
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: loading ? "0%" : `${clamped}%`,
                backgroundColor: barColor,
              }}
            />
          </div>

          <p className="mt-2.5 text-sm text-muted">
            {pct >= 100
              ? "🎉 تم تحقيق الهدف اليوم"
              : `متبقٍّ ${formatCurrency(Math.max(goal - todaySales, 0))} للوصول للهدف`}
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed py-8 text-center">
          <p className="text-sm text-muted">لم يُحدَّد هدف يومي بعد</p>
          <button
            type="button"
            onClick={startEdit}
            className="btn btn-primary mt-3 px-4 py-2 text-sm"
          >
            <Target className="h-4 w-4" />
            تحديد الهدف
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   نقدية اليوم — المبيعات ناقص المرتجعات = الصافي، موزّعة على الفروع
   ============================================================ */
function DailyCashCard({
  data,
  loading,
}: {
  data: HomeStats | null;
  loading: boolean;
}) {
  const today = data?.today;
  const netToday = today?.netCash ?? 0;
  const netYesterday = data?.yesterday.netCash ?? 0;
  const diff = netToday - netYesterday;
  const pct =
    netYesterday > 0 ? (diff / netYesterday) * 100 : netToday > 0 ? 100 : 0;
  const up = diff >= 0;
  const hasRefunds = (today?.refunds ?? 0) > 0 || (today?.exchangeUpcharge ?? 0) > 0;

  return (
    <div className="card card-accent p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Wallet className="h-5 w-5" />
        </span>
        <h2 className="text-base font-bold text-text">نقدية اليوم</h2>
      </div>

      {/* الصافي البارز */}
      <div className="mt-5 rounded-xl bg-[var(--surface-2)] p-4 text-center">
        <p className="text-sm text-muted">صافي النقدية اليوم</p>
        {loading ? (
          <Skeleton className="mx-auto mt-2 h-8 w-32" />
        ) : (
          <p className="mt-1.5 text-2xl font-extrabold text-text nums sm:text-3xl">
            {formatCurrency(netToday)}
          </p>
        )}
        {!loading && (
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold nums",
              up
                ? "bg-[rgba(59,154,110,0.14)] text-success"
                : "bg-[rgba(217,83,79,0.14)] text-danger"
            )}
          >
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {formatNumber(Math.abs(Math.round(pct)))}% مقارنة بالأمس
          </span>
        )}
      </div>

      {/* التفصيل: مبيعات + ناقص مرتجعات = صافي */}
      {!loading && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">إجمالي المبيعات</span>
            <span className="font-bold text-text nums">
              {formatCurrency(today?.sales ?? 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted">
              <RotateCcw className="h-3.5 w-3.5" />
              المرتجعات والمستردات
            </span>
            <span className="font-bold text-danger nums">
              − {formatCurrency(today?.refunds ?? 0)}
            </span>
          </div>
          {(today?.exchangeUpcharge ?? 0) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted">فروق استبدال محصّلة</span>
              <span className="font-bold text-success nums">
                + {formatCurrency(today?.exchangeUpcharge ?? 0)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-medium text-text">الصافي</span>
            <span className="text-base font-extrabold text-accent nums">
              {formatCurrency(netToday)}
            </span>
          </div>
        </div>
      )}

      {/* التوزيع على الفروع */}
      {!loading && data && data.byBranch.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-xs font-medium text-muted">حسب الفرع</p>
          <div className="grid grid-cols-2 gap-3">
            {data.byBranch.map((b) => (
              <div
                key={b.branch}
                className="rounded-xl border p-3 text-center"
              >
                <p className="truncate text-xs text-muted">
                  {BRANCH_LABELS[b.branch]}
                </p>
                <p className="mt-1 text-lg font-extrabold text-text nums">
                  {formatCurrency(b.today.netCash)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted nums">
                  مبيعات {formatCurrency(b.today.sales)}
                  {b.today.refunds > 0
                    ? ` · مرتجع ${formatCurrency(b.today.refunds)}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasRefunds && !loading && (
        <p className="mt-3 text-center text-xs text-muted">
          لا توجد مرتجعات اليوم — الصافي يساوي المبيعات.
        </p>
      )}
    </div>
  );
}
