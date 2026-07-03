"use client";

import { useState } from "react";
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  Calculator,
  Trophy,
  CalendarDays,
  Wallet,
  Package,
  Award,
  UserPlus,
  Truck,
  Store,
  RotateCcw,
  FileDown,
  FileSpreadsheet,
  Users,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { useFetch } from "@/lib/use-fetch";
import { DateRangePicker, type DateRange } from "@/components/date-range-picker";
import { StatCard, Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchBarChart } from "@/components/charts/branch-bar-chart";
import { WeekComparisonChart } from "@/components/charts/week-comparison-chart";
import { PaymentPieChart } from "@/components/charts/payment-pie-chart";
import type { DashboardStats } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";

// أقسام التقارير القابلة للإظهار/الإخفاء عبر لوحة الخيارات
const REPORT_SECTIONS = [
  { key: "quickStats", label: "البطاقات السريعة" },
  { key: "charts", label: "الرسوم البيانية" },
  { key: "payment", label: "توزيع طرق الدفع" },
  { key: "tables", label: "المنتجات والعملاء" },
  { key: "delivery", label: "إحصائيات التوصيل" },
  { key: "cashiers", label: "أداء الكاشيرين" },
] as const;

type SectionKey = (typeof REPORT_SECTIONS)[number]["key"];

type SectionVisibility = Record<SectionKey, boolean>;

const ALL_VISIBLE: SectionVisibility = Object.fromEntries(
  REPORT_SECTIONS.map((s) => [s.key, true])
) as SectionVisibility;

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange | null>(null);
  // لوحة الخيارات: مفتوحة افتراضياً، مع تحكّم بإظهار كل قسم
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [visible, setVisible] = useState<SectionVisibility>(ALL_VISIBLE);
  const url = range
    ? `/api/dashboard?from=${encodeURIComponent(
        range.from
      )}&to=${encodeURIComponent(range.to)}`
    : null;
  const { data, loading, error } = useFetch<DashboardStats>(url);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  async function exportPdf() {
    if (!data || !range) return;
    setExporting("pdf");
    try {
      const { generateReportPdf } = await import("@/lib/pdf/report-pdf");
      await generateReportPdf(data, range);
    } catch {
      toast.error("تعذّر إنشاء ملف PDF");
    } finally {
      setExporting(null);
    }
  }

  async function exportExcel() {
    if (!data || !range) return;
    setExporting("excel");
    try {
      const { generateReportExcel } = await import("@/lib/excel-report");
      await generateReportExcel(data, range);
    } catch {
      toast.error("تعذّر إنشاء ملف Excel");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        description="نظرة عامة على الأداء والمبيعات والمخزون"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker onChange={setRange} />
            <button
              onClick={exportExcel}
              disabled={!data || exporting !== null}
              className="btn btn-secondary"
            >
              {exporting === "excel" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              تصدير Excel
            </button>
            <button
              onClick={exportPdf}
              disabled={!data || exporting !== null}
              className="btn btn-secondary"
            >
              {exporting === "pdf" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              تصدير PDF
            </button>
          </div>
        }
      />

      {loading && <PageLoader />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل البيانات: {error}
        </Card>
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* لوحة الخيارات القابلة للطي — تتحكّم بإظهار الأقسام */}
          <FilterPanel
            open={filtersOpen}
            onToggle={() => setFiltersOpen((o) => !o)}
            visible={visible}
            onChange={(key) =>
              setVisible((v) => ({ ...v, [key]: !v[key] }))
            }
          />

          {/* القسم 1 — بطاقات سريعة */}
          {visible.quickStats && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <TodayVsYesterdayCard data={data} />
              <StatCard
                tone="accent"
                title="مبيعات الفترة"
                value={formatCurrency(data.rangeSales)}
                subtitle={`${formatNumber(data.rangeSalesCount)} فاتورة`}
                icon={<Banknote className="h-5 w-5" />}
              />
              <StatCard
                tone="accent"
                title="متوسط قيمة الفاتورة"
                value={formatCurrency(data.avgInvoice)}
                subtitle={`${formatNumber(data.itemsSold)} قطعة مباعة`}
                icon={<Calculator className="h-5 w-5" />}
              />
              <StatCard
                tone="success"
                title="أعلى يوم مبيعات"
                value={
                  data.topDay ? (
                    <span className="text-lg">
                      {formatCurrency(data.topDay.total)}
                    </span>
                  ) : (
                    "—"
                  )
                }
                subtitle={
                  data.topDay
                    ? format(new Date(data.topDay.date), "yyyy/MM/dd")
                    : "لا توجد مبيعات في الفترة"
                }
                icon={<CalendarDays className="h-5 w-5" />}
              />
              <StatCard
                tone="warning"
                title="رصيد متبقي عند العملاء"
                value={formatCurrency(data.remainingTotal)}
                subtitle="إجمالي المتبقي (كل الوقت)"
                icon={<Wallet className="h-5 w-5" />}
              />
            </div>
          )}

          {/* القسم 2 — رسوم بيانية */}
          {visible.charts && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-base font-bold text-text">
                مقارنة مبيعات الفروع
              </h2>
              <BranchBarChart data={data.branchComparison} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-1 text-base font-bold text-text">
                الأسبوع الحالي مقارنة بالأسبوع السابق
              </h2>
              <p className="mb-3 text-xs text-muted">
                المبيعات اليومية لآخر 7 أيام مقابل الأسبوع الذي قبله
              </p>
              <WeekComparisonChart
                thisWeek={data.weekComparison.thisWeek}
                lastWeek={data.weekComparison.lastWeek}
              />
            </Card>
          </div>
          )}

          {visible.payment && (
          <Card className="p-5">
            <h2 className="mb-4 text-base font-bold text-text">
              توزيع طرق الدفع
            </h2>
            <PaymentPieChart data={data.paymentBreakdown} />
          </Card>
          )}

          {/* القسم 3 — جداول */}
          {visible.tables && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
                <Trophy className="h-5 w-5 text-success" />
                أكثر 5 منتجات مبيعاً
              </h2>
              {data.topProducts.length === 0 ? (
                <EmptyState
                  title="لا توجد مبيعات"
                  description="لم تُسجّل مبيعات في هذه الفترة."
                />
              ) : (
                <div className="space-y-2">
                  {data.topProducts.map((p, i) => (
                    <div
                      key={`${p.name}-${i}`}
                      className="flex items-center gap-3 rounded-lg border p-2.5"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted">
                            <Package className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted">{p.brand}</p>
                      </div>
                      <div className="shrink-0 text-left">
                        <p className="font-bold text-text nums">
                          {formatNumber(p.qty)} قطعة
                        </p>
                        <p className="text-xs text-muted nums">
                          {formatCurrency(p.revenue)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="space-y-6">
              <Card className="p-5" tone="success">
                <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
                  <Award className="h-5 w-5 text-success" />
                  أكثر براند مبيعاً
                </h2>
                {data.topBrand ? (
                  <div>
                    <p className="text-2xl font-extrabold text-text">
                      {data.topBrand.brand}
                    </p>
                    <p className="mt-2 text-sm text-muted nums">
                      {formatNumber(data.topBrand.qty)} قطعة مباعة
                    </p>
                    <p className="text-sm font-bold text-text nums">
                      {formatCurrency(data.topBrand.revenue)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    لا توجد مبيعات في هذه الفترة
                  </p>
                )}
              </Card>

              <Card className="p-5" tone="accent">
                <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
                  <UserPlus className="h-5 w-5 text-accent" />
                  عملاء جدد في الفترة
                </h2>
                <p className="text-3xl font-extrabold text-accent nums">
                  {formatNumber(data.newCustomersCount)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  عملاء لم يظهروا في فواتير سابقة قبل هذه الفترة
                </p>
              </Card>
            </div>
          </div>
          )}

          {/* القسم 4 — إحصائيات التوصيل */}
          {visible.delivery && (
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
              <Truck className="h-5 w-5 text-accent" />
              إحصائيات التوصيل
            </h2>
            <DeliveryStats stats={data.deliveryStats} />
          </Card>
          )}

          {/* القسم 5 — أداء الكاشيرين */}
          {visible.cashiers && (
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
              <Users className="h-5 w-5 text-accent" />
              أداء الكاشيرين
            </h2>
            <CashierStats stats={data.cashierStats} />
          </Card>
          )}
        </div>
      )}
    </div>
  );
}

// لوحة خيارات قابلة للطي — زر إخفاء/إظهار + مربّعات اختيار للأقسام
function FilterPanel({
  open,
  onToggle,
  visible,
  onChange,
}: {
  open: boolean;
  onToggle: () => void;
  visible: SectionVisibility;
  onChange: (key: SectionKey) => void;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <SlidersHorizontal className="h-5 w-5 text-accent" />
          خيارات العرض
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="btn btn-secondary h-9 gap-1.5 px-3 text-sm"
        >
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {open ? "إخفاء الخيارات" : "إظهار الخيارات"}
        </button>
      </div>

      {/* منطقة قابلة للطي بسلاسة عبر grid-rows */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-3">
            {REPORT_SECTIONS.map((s) => (
              <label
                key={s.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors",
                  visible[s.key]
                    ? "border-accent/40 bg-accent-soft text-text"
                    : "text-muted hover:bg-[var(--surface-2)]"
                )}
              >
                <input
                  type="checkbox"
                  checked={visible[s.key]}
                  onChange={() => onChange(s.key)}
                  className="h-4 w-4 shrink-0 accent-accent"
                />
                <span className="min-w-0 truncate">{s.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function CashierStats({ stats }: { stats: DashboardStats["cashierStats"] }) {
  if (stats.length === 0) {
    return (
      <p className="text-sm text-muted">
        لا توجد فواتير مسجّلة باسم كاشير في هذه الفترة
      </p>
    );
  }
  return (
    <>
      {/* جدول لسطح المكتب */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] text-right text-sm">
          <thead>
            <tr className="border-b text-muted">
              <th className="px-3 py-2 font-medium">الاسم</th>
              <th className="px-3 py-2 font-medium">عدد الفواتير</th>
              <th className="px-3 py-2 font-medium">إجمالي المبيعات</th>
              <th className="px-3 py-2 font-medium">متوسط الفاتورة</th>
              <th className="px-3 py-2 font-medium">أعلى فاتورة</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((c) => (
              <tr key={c.name} className="border-b border-[var(--border)]">
                <td className="px-3 py-2 font-medium text-text">{c.name}</td>
                <td className="px-3 py-2 text-text nums">
                  {formatNumber(c.count)}
                </td>
                <td className="px-3 py-2 font-bold text-text nums">
                  {formatCurrency(c.total)}
                </td>
                <td className="px-3 py-2 text-muted nums">
                  {formatCurrency(c.avgInvoice)}
                </td>
                <td className="px-3 py-2 text-muted nums">
                  {formatCurrency(c.maxInvoice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* بطاقات للموبايل */}
      <div className="space-y-3 sm:hidden">
        {stats.map((c) => (
          <div key={c.name} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-text">{c.name}</p>
              <p className="font-bold text-accent nums">
                {formatCurrency(c.total)}
              </p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-center text-xs">
              <div>
                <p className="text-muted">الفواتير</p>
                <p className="mt-0.5 text-text nums">{formatNumber(c.count)}</p>
              </div>
              <div>
                <p className="text-muted">المتوسط</p>
                <p className="mt-0.5 text-text nums">
                  {formatCurrency(c.avgInvoice)}
                </p>
              </div>
              <div>
                <p className="text-muted">الأعلى</p>
                <p className="mt-0.5 text-text nums">
                  {formatCurrency(c.maxInvoice)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TodayVsYesterdayCard({ data }: { data: DashboardStats }) {
  const up = data.todayChangePct >= 0;
  return (
    <Card className="p-5" tone="accent">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted">مبيعات اليوم</p>
          <p className="mt-1 text-2xl font-extrabold text-text nums">
            {formatCurrency(data.todaySales)}
          </p>
          <p className="mt-0.5 text-xs text-muted nums">
            {formatNumber(data.todaySalesCount)} فاتورة
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold nums",
            up
              ? "bg-[rgba(59,154,110,0.14)] text-success"
              : "bg-[rgba(217,83,79,0.14)] text-danger"
          )}
        >
          {up ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {formatNumber(Math.abs(Math.round(data.todayChangePct)))}%
        </div>
      </div>
      <div className="mt-3 border-t pt-2 text-xs text-muted nums">
        أمس: {formatCurrency(data.yesterdaySales)} ·{" "}
        {formatNumber(data.yesterdaySalesCount)} فاتورة
      </div>
    </Card>
  );
}

function DeliveryStats({
  stats,
}: {
  stats: DashboardStats["deliveryStats"];
}) {
  const total = stats.deliveryCount + stats.pickupCount;
  const deliveryPct =
    total > 0 ? Math.round((stats.deliveryCount / total) * 100) : 0;
  const pickupPct = total > 0 ? 100 - deliveryPct : 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted">
          <Truck className="h-4 w-4" />
          طلبات التوصيل
        </div>
        <p className="text-2xl font-extrabold text-text nums">
          {formatNumber(stats.deliveryCount)}
        </p>
        <p className="mt-1 text-xs text-muted nums">{deliveryPct}% من الطلبات</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${deliveryPct}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted">
          <Store className="h-4 w-4" />
          الاستلام من المحل
        </div>
        <p className="text-2xl font-extrabold text-text nums">
          {formatNumber(stats.pickupCount)}
        </p>
        <p className="mt-1 text-xs text-muted nums">{pickupPct}% من الطلبات</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${pickupPct}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted">
          <RotateCcw className="h-4 w-4" />
          نسبة المرتجعات
        </div>
        <p className="text-2xl font-extrabold text-text nums">
          {formatNumber(stats.returnedPct)}%
        </p>
        <p className="mt-1 text-xs text-muted nums">
          {formatNumber(stats.returnedCount)} من {formatNumber(stats.deliveryCount)} طلب توصيل
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full bg-warning"
            style={{ width: `${Math.min(stats.returnedPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
