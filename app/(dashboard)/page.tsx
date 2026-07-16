"use client";

import { useEffect, useState } from "react";
import { Target, Pencil, Check, X, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import type { HomeStats } from "@/lib/types";

const GOAL_KEY = "dailyGoal";

export default function HomePage() {
  const { data, loading } = useFetch<HomeStats>("/api/home-stats");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <DailyGoalCard todaySales={data?.today.sales ?? 0} loading={loading} />
      <TodayVsYesterdayCard data={data} loading={loading} />
    </div>
  );
}

/* ============================================================
   بطاقة الهدف اليومي — تحديد هدف مبيعات وعرض التقدّم
   ============================================================ */
function DailyGoalCard({
  todaySales,
  loading,
}: {
  todaySales: number;
  loading: boolean;
}) {
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
            <input
              id="goal-input"
              type="number"
              inputMode="numeric"
              min={0}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
   مبيعات اليوم مقابل الأمس
   ============================================================ */
function TodayVsYesterdayCard({
  data,
  loading,
}: {
  data: HomeStats | null;
  loading: boolean;
}) {
  const today = data?.today.sales ?? 0;
  const yesterday = data?.yesterday.sales ?? 0;
  const diff = today - yesterday;
  const pct = yesterday > 0 ? (diff / yesterday) * 100 : today > 0 ? 100 : 0;
  const up = diff >= 0;

  return (
    <div className="card p-6">
      <h2 className="text-base font-bold text-text">اليوم مقابل الأمس</h2>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-[var(--surface-2)] p-4 text-center">
          <p className="text-sm text-muted">اليوم</p>
          {loading ? (
            <Skeleton className="mx-auto mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1.5 text-xl font-extrabold text-text nums sm:text-2xl">
              {formatCurrency(today)}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-[var(--surface-2)] p-4 text-center">
          <p className="text-sm text-muted">أمس</p>
          {loading ? (
            <Skeleton className="mx-auto mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1.5 text-xl font-extrabold text-text nums sm:text-2xl">
              {formatCurrency(yesterday)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold nums",
            up
              ? "bg-[rgba(59,154,110,0.14)] text-success"
              : "bg-[rgba(217,83,79,0.14)] text-danger"
          )}
        >
          {up ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownRight className="h-4 w-4" />
          )}
          {formatNumber(Math.abs(Math.round(pct)))}%
          <span className="font-medium text-muted">مقارنة بالأمس</span>
        </span>
      </div>
    </div>
  );
}
