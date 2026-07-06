"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  RefreshCcw,
  AlertTriangle,
  PackageX,
  TrendingUp,
  TrendingDown,
  Trophy,
  Clock,
  Calendar,
  Megaphone,
  Tag,
  Percent,
  Pencil,
  FileText,
  Lightbulb,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchBadge, StockBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/format";
import { BRANCH_LABELS } from "@/lib/constants";
import type { InsightsData } from "@/lib/types";

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link href={href} className="btn btn-secondary h-8 shrink-0 gap-1 text-xs">
      {icon}
      {label}
    </Link>
  );
}

function SectionCard({
  title,
  icon,
  tone,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone?: "accent" | "warning" | "success";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5" tone={tone}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

// زر إخفاء تنبيه واحد
function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-ghost h-8 w-8 shrink-0 !px-0 text-muted hover:text-danger"
      aria-label="إخفاء التنبيه"
      title="إخفاء التنبيه"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

// تخزين التنبيهات المُخفاة محلياً (لا حاجة لقاعدة البيانات)
const DISMISSED_KEY = "dismissed_insights";

function loadDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

// مفاتيح ثابتة لكل نوع تنبيه (تبقى ثابتة بين التحديثات)
const alertKey = {
  low: (id: string) => `low:${id}`,
  dead: (id: string) => `dead:${id}`,
  drop: (branch: string) => `drop:${branch}`,
};

function Skeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5">
          <div className="mb-4 h-5 w-40 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="space-y-3">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="h-14 animate-pulse rounded-lg bg-[var(--surface-2)]"
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

const HOUR = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // حمّل التنبيهات المُخفاة من التخزين المحلي عند أول تحميل
  useEffect(() => {
    setDismissed(new Set(loadDismissed()));
  }, []);

  const persistDismissed = useCallback((next: Set<string>) => {
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      /* تجاهل امتلاء التخزين */
    }
  }, []);

  const dismissOne = useCallback(
    (key: string) => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(key);
        try {
          window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
        } catch {
          /* تجاهل */
        }
        return next;
      });
    },
    []
  );

  const restoreAll = useCallback(() => {
    persistDismissed(new Set());
  }, [persistDismissed]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "تعذّر إجراء التحليل");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // القوائم الظاهرة فعلياً بعد استبعاد المُخفاة (مع الحدود القصوى للعرض)
  const shownBranchDrops = (data?.alerts.branchDrops ?? []).filter(
    (b) => !dismissed.has(alertKey.drop(b.branch))
  );
  const shownLowStock = (data?.alerts.lowStock ?? [])
    .slice(0, 12)
    .filter((it) => !dismissed.has(alertKey.low(it.id)));
  const shownDeadStock = (data?.alerts.deadStock ?? [])
    .slice(0, 8)
    .filter((p) => !dismissed.has(alertKey.dead(p.id)));

  const alertsCount =
    shownBranchDrops.length + shownLowStock.length + shownDeadStock.length;

  // إخفاء كل التنبيهات الظاهرة حالياً دفعةً واحدة
  const dismissAll = () => {
    const next = new Set(dismissed);
    shownBranchDrops.forEach((b) => next.add(alertKey.drop(b.branch)));
    shownLowStock.forEach((it) => next.add(alertKey.low(it.id)));
    shownDeadStock.forEach((p) => next.add(alertKey.dead(p.id)));
    persistDismissed(next);
  };

  return (
    <div>
      <PageHeader
        title="الذكاء"
        description="مستشار ذكي لمبيعاتك ومخزونك مدعوم بالذكاء الاصطناعي"
        actions={
          <button onClick={load} disabled={loading} className="btn btn-primary">
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            تحديث التحليل
          </button>
        }
      />

      {loading && (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm text-muted">
            <Sparkles className="h-5 w-5 animate-pulse text-accent" />
            الذكاء يحلّل بياناتك...
          </div>
          <Skeleton />
        </>
      )}

      {error && !loading && (
        <Card className="p-6 text-center text-danger">
          تعذّر إجراء التحليل: {error}
        </Card>
      )}

      {data && !loading && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="nums">آخر تحديث: {formatDateTime(data.generatedAt)}</span>
          </div>

          {/* 1) تنبيهات فورية */}
          <SectionCard
            tone="warning"
            title={`تنبيهات فورية${alertsCount ? ` (${alertsCount})` : ""}`}
            icon={<AlertTriangle className="h-5 w-5 text-warning" />}
            action={
              (alertsCount > 0 || dismissed.size > 0) && (
                <div className="flex items-center gap-3">
                  {dismissed.size > 0 && (
                    <button
                      onClick={restoreAll}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      استعادة التنبيهات
                    </button>
                  )}
                  {alertsCount > 0 && (
                    <button
                      onClick={dismissAll}
                      className="btn btn-ghost h-8 shrink-0 gap-1 px-2 text-xs"
                    >
                      <X className="h-4 w-4" />
                      مسح الكل
                    </button>
                  )}
                </div>
              )
            }
          >
            {alertsCount === 0 ? (
              <p className="text-sm text-muted">لا توجد تنبيهات حرجة حالياً. 👌</p>
            ) : (
              <div className="space-y-2">
                {shownBranchDrops.map((b) => (
                  <div
                    key={b.branch}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/30 bg-[rgba(217,83,79,0.06)] p-3"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingDown className="h-4 w-4 text-danger" />
                      <span className="text-text">
                        تراجع مبيعات {BRANCH_LABELS[b.branch]} بنسبة{" "}
                        <span className="font-bold text-danger nums">
                          {formatNumber(b.dropPct)}%
                        </span>{" "}
                        عن الأسبوع الماضي
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <QuickAction
                        href="/dashboard"
                        icon={<FileText className="h-4 w-4" />}
                        label="طباعة تقرير"
                      />
                      <DismissButton
                        onClick={() => dismissOne(alertKey.drop(b.branch))}
                      />
                    </div>
                  </div>
                ))}

                {shownLowStock.map((it) => (
                  <div
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0 text-sm">
                      <span className="font-medium text-text">
                        {it.productName}
                      </span>{" "}
                      <span className="text-xs text-muted">({it.brand})</span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <BranchBadge branch={it.branch} />
                        <span className="badge bg-[var(--surface-2)] text-muted nums">
                          مقاس {it.size}
                        </span>
                        <StockBadge quantity={it.quantity} />
                        <span className="text-xs text-muted nums">
                          الحد الأدنى {formatNumber(it.minQuantity)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <QuickAction
                        href={`/inventory/${it.productId}/edit`}
                        icon={<Pencil className="h-4 w-4" />}
                        label="تعديل المخزون"
                      />
                      <DismissButton
                        onClick={() => dismissOne(alertKey.low(it.id))}
                      />
                    </div>
                  </div>
                ))}

                {shownDeadStock.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0 text-sm">
                      <span className="flex items-center gap-1.5">
                        <PackageX className="h-4 w-4 text-muted" />
                        <span className="font-medium text-text">{p.name}</span>
                        <span className="text-xs text-muted">({p.brand})</span>
                      </span>
                      <p className="mt-1 text-xs text-muted nums">
                        بلا مبيعات منذ 14 يوماً · المخزون {formatNumber(p.quantity)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <QuickAction
                        href={`/inventory/${p.id}/edit`}
                        icon={<Tag className="h-4 w-4" />}
                        label="عمل خصم"
                      />
                      <DismissButton
                        onClick={() => dismissOne(alertKey.dead(p.id))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 2) تحليل الأداء */}
          <SectionCard
            tone="success"
            title="تحليل الأداء"
            icon={<TrendingUp className="h-5 w-5 text-success" />}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                  <TrendingUp className="h-4 w-4 text-success" />
                  الأكثر نمواً هذا الأسبوع
                </h3>
                {data.performance.topGrowth.length === 0 ? (
                  <p className="text-sm text-muted">لا توجد بيانات كافية.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.performance.topGrowth.map((g) => (
                      <div
                        key={g.productId}
                        className="flex items-center justify-between rounded-lg border p-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-text">
                          {g.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-bold nums",
                            g.growthPct >= 0 ? "text-success" : "text-danger"
                          )}
                        >
                          {g.growthPct >= 0 ? "▲" : "▼"} {formatNumber(Math.abs(g.growthPct))}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                    <Trophy className="h-4 w-4 text-success" />
                    أفضل فرع
                  </h3>
                  {data.performance.bestBranch ? (
                    <div className="rounded-lg border p-3 text-sm">
                      <BranchBadge branch={data.performance.bestBranch.branch} />
                      <p className="mt-2 text-muted">
                        يستحوذ على{" "}
                        <span className="font-bold text-text nums">
                          {formatNumber(data.performance.bestBranch.share)}%
                        </span>{" "}
                        من مبيعات الأسبوع (
                        {formatCurrency(data.performance.bestBranch.total)}).
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">لا توجد مبيعات هذا الأسبوع.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-4">
                  <div>
                    <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text">
                      <Calendar className="h-4 w-4 text-accent" />
                      أعلى الأيام
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {data.performance.peakDays.slice(0, 3).map((d) => (
                        <span
                          key={d.day}
                          className="badge bg-accent-soft text-accent"
                        >
                          {d.label}
                        </span>
                      ))}
                      {data.performance.peakDays.length === 0 && (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text">
                      <Clock className="h-4 w-4 text-accent" />
                      ساعات الذروة
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {data.performance.peakHours.map((h) => (
                        <span
                          key={h.hour}
                          className="badge bg-accent-soft text-accent nums"
                        >
                          {HOUR(h.hour)}
                        </span>
                      ))}
                      {data.performance.peakHours.length === 0 && (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* 3) نصائح الذكاء الاصطناعي */}
          <SectionCard
            tone="accent"
            title="نصائح الذكاء الاصطناعي"
            icon={<Sparkles className="h-5 w-5 text-accent" />}
          >
            <div className="mb-3">
              <span
                className={cn(
                  "badge",
                  data.aiSource === "ai"
                    ? "bg-accent-soft text-accent"
                    : "bg-[var(--surface-2)] text-muted"
                )}
              >
                {data.aiSource === "ai" ? "✦ تحليل Gemini" : "تحليل تلقائي"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* عروض مقترحة */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                  <Tag className="h-4 w-4 text-accent" />
                  منتجات تحتاج عروضاً الآن
                </h3>
                <div className="space-y-2">
                  {data.ai.promotions.map((p, i) => (
                    <div key={i} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text">{p.product}</span>
                        <QuickAction
                          href="/inventory"
                          icon={<Pencil className="h-4 w-4" />}
                          label="إدارة"
                        />
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        {p.reason}
                      </p>
                    </div>
                  ))}
                  {data.ai.promotions.length === 0 && (
                    <p className="text-sm text-muted">—</p>
                  )}
                </div>
              </div>

              {/* اقتراحات تسعير */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                  <Percent className="h-4 w-4 text-warning" />
                  تسعير المنتجات الراكدة
                </h3>
                <div className="space-y-2">
                  {data.ai.pricing.map((p, i) => (
                    <div key={i} className="rounded-lg border p-3 text-sm">
                      <span className="font-medium text-text">{p.product}</span>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        {p.suggestion}
                      </p>
                    </div>
                  ))}
                  {data.ai.pricing.length === 0 && (
                    <p className="text-sm text-muted">—</p>
                  )}
                </div>
              </div>

              {/* أفكار إعلانية */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                  <Megaphone className="h-4 w-4 text-accent" />
                  أفكار إعلانية
                </h3>
                <ul className="space-y-2">
                  {data.ai.adIdeas.map((idea, i) => (
                    <li
                      key={i}
                      className="rounded-lg border p-3 text-sm leading-relaxed text-text"
                    >
                      {idea}
                    </li>
                  ))}
                  {data.ai.adIdeas.length === 0 && (
                    <p className="text-sm text-muted">—</p>
                  )}
                </ul>
              </div>

              {/* فرصة موسمية */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                  <Lightbulb className="h-4 w-4 text-warning" />
                  فرصة موسمية
                </h3>
                <div className="rounded-lg border border-warning/30 bg-[rgba(201,133,26,0.06)] p-3 text-sm leading-relaxed text-text">
                  {data.ai.seasonal || "—"}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
