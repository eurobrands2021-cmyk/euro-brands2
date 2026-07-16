"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Banknote,
  TrendingUp,
  Calculator,
  Trophy,
  Wallet,
  Package,
  Truck,
  Store,
  RotateCcw,
  FileDown,
  FileSpreadsheet,
  Users,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Receipt,
  Percent,
  Tag,
  Boxes,
  PackageX,
  AlertTriangle,
  ArrowLeftRight,
  Ruler,
  Sparkles,
  Building2,
  CreditCard,
  Coins,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { useFetch } from "@/lib/use-fetch";
import { DateRangePicker, type DateRange } from "@/components/date-range-picker";
import { StatCard, Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { ChartSkeleton } from "@/components/ui/skeleton";
import type { DashboardStats } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  BRANCH_LABELS,
  CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/constants";
import {
  SALES_SECTIONS,
  INVENTORY_SECTIONS,
  SALES_KEYS,
  INVENTORY_KEYS,
  type ReportTab,
} from "@/lib/report-sections";
import dynamic from "next/dynamic";

// تحميل كسول للرسوم البيانية (recharts ثقيلة) — تُنقل خارج الحزمة الأولية
// وتُعرض عند الحاجة فقط، مع هيكل تحميل بدل الدوّارة.
const chartLoading = () => <ChartSkeleton />;
const BranchBarChart = dynamic(
  () => import("@/components/charts/branch-bar-chart").then((m) => m.BranchBarChart),
  { ssr: false, loading: chartLoading }
);
const PaymentPieChart = dynamic(
  () => import("@/components/charts/payment-pie-chart").then((m) => m.PaymentPieChart),
  { ssr: false, loading: chartLoading }
);
const CategoryPieChart = dynamic(
  () => import("@/components/charts/category-pie-chart").then((m) => m.CategoryPieChart),
  { ssr: false, loading: chartLoading }
);
const SalesLineChart = dynamic(
  () => import("@/components/charts/sales-line-chart").then((m) => m.SalesLineChart),
  { ssr: false, loading: chartLoading }
);

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange | null>(null);
  const url = range
    ? `/api/dashboard?from=${encodeURIComponent(
        range.from
      )}&to=${encodeURIComponent(range.to)}`
    : null;
  const { data, loading, error } = useFetch<DashboardStats>(url);

  const [tab, setTab] = useState<ReportTab>("sales");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedSales, setSelectedSales] = useState<Set<string>>(
    () => new Set(SALES_KEYS)
  );
  const [selectedInv, setSelectedInv] = useState<Set<string>>(
    () => new Set(INVENTORY_KEYS)
  );
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const sections = tab === "sales" ? SALES_SECTIONS : INVENTORY_SECTIONS;
  const selected = tab === "sales" ? selectedSales : selectedInv;
  const setSelected = tab === "sales" ? setSelectedSales : setSelectedInv;

  // ترتيب المفاتيح المحددة حسب ترتيب أقسام التبويب النشط
  const orderedSelected = useMemo(
    () => sections.map((s) => s.key).filter((k) => selected.has(k)),
    [sections, selected]
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(sections.map((s) => s.key)));
  }
  function deselectAll() {
    setSelected(new Set());
  }

  async function exportPdf() {
    if (!data || !range) return;
    if (orderedSelected.length === 0) {
      toast.error("اختر قسماً واحداً على الأقل للتصدير");
      return;
    }
    setExporting("pdf");
    try {
      const { generateReportPdf } = await import("@/lib/pdf/report-pdf");
      await generateReportPdf(data, range, { tab, selected: orderedSelected });
    } catch {
      toast.error("تعذّر إنشاء ملف PDF");
    } finally {
      setExporting(null);
    }
  }

  async function exportExcel() {
    if (!data || !range) return;
    if (orderedSelected.length === 0) {
      toast.error("اختر قسماً واحداً على الأقل للتصدير");
      return;
    }
    setExporting("excel");
    try {
      const { generateReportExcel } = await import("@/lib/excel-report");
      await generateReportExcel(data, range, { tab, selected: orderedSelected });
    } catch {
      toast.error("تعذّر إنشاء ملف Excel");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="التقارير"
        description="تقارير المبيعات والمنتجات والجرد — اختر الأقسام التي تريد عرضها وتصديرها"
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

      {/* التبويبات */}
      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton
          active={tab === "sales"}
          onClick={() => setTab("sales")}
          icon={<TrendingUp className="h-4 w-4" />}
          label="تقارير المبيعات"
        />
        <TabButton
          active={tab === "inventory"}
          onClick={() => setTab("inventory")}
          icon={<Boxes className="h-4 w-4" />}
          label="تقارير المنتجات والجرد"
        />
      </div>

      {loading && <PageLoader />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل البيانات: {error}
        </Card>
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* لوحة الخيارات القابلة للطي */}
          <FilterPanel
            open={filtersOpen}
            onToggle={() => setFiltersOpen((o) => !o)}
            sections={sections}
            selected={selected}
            onToggleKey={toggle}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            selectedCount={orderedSelected.length}
          />

          {/* الأقسام المحددة */}
          {orderedSelected.length === 0 ? (
            <EmptyState
              title="لا توجد أقسام محددة"
              description="فعّل قسماً واحداً على الأقل من لوحة الخيارات بالأعلى لعرض بياناته."
            />
          ) : (
            <div className="space-y-6">
              {orderedSelected.map((key) => (
                <div key={key}>{renderSection(key, data)}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition-colors",
        active
          ? "border-accent bg-accent text-white"
          : "bg-surface text-muted hover:bg-[var(--surface-2)] hover:text-text"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterPanel({
  open,
  onToggle,
  sections,
  selected,
  onToggleKey,
  onSelectAll,
  onDeselectAll,
  selectedCount,
}: {
  open: boolean;
  onToggle: () => void;
  sections: { key: string; label: string }[];
  selected: Set<string>;
  onToggleKey: (key: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  selectedCount: number;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <SlidersHorizontal className="h-5 w-5 text-accent" />
          خيارات العرض
          <span className="text-xs font-normal text-muted nums">
            ({selectedCount}/{sections.length})
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="btn btn-secondary h-9 px-3 text-xs"
          >
            تحديد الكل
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="btn btn-secondary h-9 px-3 text-xs"
          >
            إلغاء التحديد
          </button>
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
      </div>

      {/* منطقة قابلة للطي بسلاسة */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-4 grid grid-cols-1 gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => {
              const on = selected.has(s.key);
              return (
                <label
                  key={s.key}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors",
                    on
                      ? "border-accent/40 bg-accent-soft text-text"
                      : "text-muted hover:bg-[var(--surface-2)]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggleKey(s.key)}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 flex-1">{s.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---- عرض كل قسم كبطاقة بيانات ----
function renderSection(key: string, data: DashboardStats): React.ReactNode {
  switch (key) {
    // ==== تقارير المبيعات ====
    case "totalSales":
      return (
        <StatCard
          tone="accent"
          title="إجمالي المبيعات في الفترة (الصافي)"
          value={formatCurrency(data.rangeSales)}
          subtitle={`قبل الخصم: ${formatCurrency(data.grossSales)}`}
          icon={<Banknote className="h-5 w-5" />}
        />
      );
    case "invoicesCount":
      return (
        <StatCard
          tone="accent"
          title="عدد الفواتير"
          value={formatNumber(data.rangeSalesCount)}
          subtitle={`${formatNumber(data.itemsSold)} قطعة مباعة`}
          icon={<Receipt className="h-5 w-5" />}
        />
      );
    case "avgInvoice":
      return (
        <StatCard
          tone="accent"
          title="متوسط قيمة الفاتورة"
          value={formatCurrency(data.avgInvoice)}
          icon={<Calculator className="h-5 w-5" />}
        />
      );
    case "maxInvoice":
      return (
        <StatCard
          tone="success"
          title="أعلى فاتورة في الفترة"
          value={formatCurrency(data.maxInvoice)}
          icon={<Trophy className="h-5 w-5" />}
        />
      );
    case "byBranch":
      return (
        <SectionCard title="المبيعات حسب الفرع" icon={<Building2 />}>
          {data.branchComparison.some((b) => b.total > 0) ? (
            <>
              <BranchBarChart data={data.branchComparison} />
              <SimpleTable
                headers={[
                  "الفرع",
                  "عدد الفواتير",
                  "الإجمالي",
                  "المرتجعات",
                  "الصافي",
                ]}
                rows={data.branchComparison.map((b) => [
                  BRANCH_LABELS[b.branch],
                  formatNumber(b.count),
                  formatCurrency(b.total),
                  b.refunds > 0 ? `− ${formatCurrency(b.refunds)}` : "—",
                  formatCurrency(b.netCash),
                ])}
              />
            </>
          ) : (
            <EmptyBlock />
          )}
        </SectionCard>
      );
    case "byCategory":
      return (
        <SectionCard title="المبيعات حسب الفئة" icon={<Tag />}>
          {data.byCategory.some((c) => c.total > 0) ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CategoryPieChart data={data.byCategory} />
              <SimpleTable
                headers={["الفئة", "الكمية", "الإيراد"]}
                rows={data.byCategory.map((c) => [
                  CATEGORY_LABELS[c.category],
                  formatNumber(c.qty),
                  formatCurrency(c.total),
                ])}
              />
            </div>
          ) : (
            <EmptyBlock />
          )}
        </SectionCard>
      );
    case "byBrand":
      return (
        <SectionCard title="المبيعات حسب البراند (Top 10)" icon={<Sparkles />}>
          <SimpleTable
            headers={["البراند", "الكمية المباعة", "الإيراد"]}
            rows={data.topBrands.map((b) => [
              b.brand,
              formatNumber(b.qty),
              formatCurrency(b.revenue),
            ])}
          />
        </SectionCard>
      );
    case "topProducts":
      return (
        <SectionCard title="أكثر المنتجات مبيعاً (Top 10)" icon={<Trophy />}>
          {data.topProducts.length === 0 ? (
            <EmptyBlock />
          ) : (
            <div className="space-y-2">
              {data.topProducts.map((p, i) => (
                <div
                  key={`${p.name}-${i}`}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-sm font-bold text-accent nums">
                    {i + 1}
                  </div>
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]">
                    {p.image ? (
                      <Image
                        src={p.image}
                        alt=""
                        fill
                        sizes="48px"
                        loading="lazy"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">{p.name}</p>
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
        </SectionCard>
      );
    case "cashiers":
      return (
        <SectionCard title="أداء الكاشيرين" icon={<Users />}>
          {data.cashierStats.length === 0 ? (
            <EmptyBlock text="لا توجد فواتير مسجّلة باسم كاشير في هذه الفترة" />
          ) : (
            <SimpleTable
              headers={[
                "الكاشير",
                "عدد الفواتير",
                "الإجمالي",
                "المتوسط",
                "أعلى فاتورة",
              ]}
              rows={data.cashierStats.map((c) => [
                c.name,
                formatNumber(c.count),
                formatCurrency(c.total),
                formatCurrency(c.avgInvoice),
                formatCurrency(c.maxInvoice),
              ])}
            />
          )}
        </SectionCard>
      );
    case "byPayment":
      return (
        <SectionCard title="المبيعات حسب طريقة الدفع" icon={<CreditCard />}>
          {data.paymentBreakdown.some((p) => p.total > 0) ? (
            <PaymentPieChart data={data.paymentBreakdown} />
          ) : (
            <EmptyBlock />
          )}
        </SectionCard>
      );
    case "discounts":
      return (
        <SectionCard title="الخصومات الممنوحة" icon={<Percent />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniStat
              label="إجمالي الخصومات"
              value={formatCurrency(data.discountTotal)}
            />
            <MiniStat
              label="فواتير عليها خصم"
              value={formatNumber(data.discountedCount)}
            />
            <MiniStat
              label="نسبة الخصم من المبيعات"
              value={`${formatNumber(
                data.grossSales
                  ? Math.round((data.discountTotal / data.grossSales) * 1000) /
                      10
                  : 0
              )}%`}
            />
          </div>
        </SectionCard>
      );
    case "deliveryVsPickup":
      return (
        <SectionCard title="مبيعات التوصيل مقابل الاستلام" icon={<Truck />}>
          <DeliveryStats stats={data.deliveryStats} />
        </SectionCard>
      );
    case "dailyTrend":
      return (
        <SectionCard title="تريند المبيعات اليومي" icon={<TrendingUp />}>
          {data.dailySales.some((d) => d.total > 0) ? (
            <SalesLineChart
              data={data.dailySales}
              avg={
                data.dailySales.length
                  ? data.dailySales.reduce((s, d) => s + d.total, 0) /
                    data.dailySales.length
                  : 0
              }
            />
          ) : (
            <EmptyBlock />
          )}
        </SectionCard>
      );

    case "returnsToday":
      return (
        <StatCard
          tone="warning"
          title="المرتجعات اليوم"
          value={formatNumber(data.returnsToday.count)}
          subtitle={`القيمة المُستردة: ${formatCurrency(data.returnsToday.value)}`}
          icon={<RotateCcw className="h-5 w-5" />}
        />
      );
    case "returnsSummary": {
      const rs = data.returnsSummary;
      const hasReturns = rs.returnCount + rs.exchangeCount > 0;
      return (
        <SectionCard
          title="المرتجعات والاستبدال (ملخّص الفترة)"
          icon={<RotateCcw />}
        >
          {hasReturns ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "عمليات إرجاع", value: formatNumber(rs.returnCount) },
                  {
                    label: "عمليات استبدال",
                    value: formatNumber(rs.exchangeCount),
                  },
                  {
                    label: "صافي المُسترَد",
                    value: formatCurrency(rs.netRefunded),
                  },
                  {
                    label: "فروق استبدال محصّلة",
                    value: formatCurrency(rs.exchangeUpcharge),
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3 text-center"
                  >
                    <p className="text-xs text-muted">{s.label}</p>
                    <p className="mt-1 text-lg font-extrabold text-text nums">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
              {rs.topReturnedProducts.length > 0 ? (
                <SimpleTable
                  headers={[
                    "المنتج",
                    "البراند",
                    "الكمية المُرتجعة",
                    "قيمة الإرجاع",
                  ]}
                  rows={rs.topReturnedProducts.map((p) => [
                    p.name,
                    p.brand,
                    formatNumber(p.qty),
                    formatCurrency(p.refund),
                  ])}
                />
              ) : null}
            </>
          ) : (
            <EmptyBlock />
          )}
        </SectionCard>
      );
    }

    // ==== تقارير المنتجات والجرد ====
    case "inventoryValue":
      return (
        <StatCard
          tone="success"
          title="إجمالي قيمة المخزون الحالي"
          value={formatCurrency(data.inventoryValue)}
          subtitle="بسعر البيع لكل صنف"
          icon={<Wallet className="h-5 w-5" />}
        />
      );
    case "productsCount":
      return (
        <StatCard
          tone="accent"
          title="عدد المنتجات الكلي"
          value={formatNumber(data.productsCount)}
          subtitle={`${formatNumber(data.variantsCount)} صنف (SKU)`}
          icon={<Boxes className="h-5 w-5" />}
        />
      );
    case "lowStock":
      return (
        <SectionCard
          title="المنتجات منخفضة المخزون"
          icon={<AlertTriangle />}
          tone="warning"
        >
          {data.lowStock.length === 0 ? (
            <EmptyBlock text="لا توجد أصناف منخفضة الكمية" />
          ) : (
            <SimpleTable
              headers={["المنتج", "البراند", "الفرع", "المقاس", "الكمية"]}
              rows={data.lowStock
                .slice(0, 50)
                .map((v) => [
                  v.productName,
                  v.brand,
                  BRANCH_LABELS[v.branch],
                  v.size,
                  formatNumber(v.quantity),
                ])}
            />
          )}
        </SectionCard>
      );
    case "outOfStock":
      return (
        <SectionCard
          title="المنتجات التي نفد مخزونها"
          icon={<PackageX />}
          tone="warning"
        >
          {data.outOfStock.length === 0 ? (
            <EmptyBlock text="لا توجد منتجات نفد مخزونها بالكامل" />
          ) : (
            <SimpleTable
              headers={["المنتج", "البراند", "الفئة"]}
              rows={data.outOfStock.map((p) => [
                p.name,
                p.brand,
                CATEGORY_LABELS[p.category],
              ])}
            />
          )}
        </SectionCard>
      );
    case "stockByBranch":
      return (
        <SectionCard title="مقارنة مخزون الفرعين" icon={<Building2 />}>
          <SimpleTable
            headers={["الفرع", "الكمية", "القيمة"]}
            rows={data.stockByBranch.map((s) => [
              BRANCH_LABELS[s.branch],
              formatNumber(s.quantity),
              formatCurrency(s.value),
            ])}
          />
        </SectionCard>
      );
    case "stockByCategory":
      return (
        <SectionCard title="المخزون حسب الفئة" icon={<Tag />}>
          <SimpleTable
            headers={["الفئة", "الكمية", "القيمة"]}
            rows={data.stockByCategory.map((s) => [
              CATEGORY_LABELS[s.category],
              formatNumber(s.quantity),
              formatCurrency(s.value),
            ])}
          />
        </SectionCard>
      );
    case "stockByBrand":
      return (
        <SectionCard title="المخزون حسب البراند" icon={<Sparkles />}>
          <SimpleTable
            headers={["البراند", "الكمية", "القيمة"]}
            rows={data.stockByBrand.map((s) => [
              s.brand,
              formatNumber(s.quantity),
              formatCurrency(s.value),
            ])}
          />
        </SectionCard>
      );
    case "slowMoving":
      return (
        <SectionCard title="المنتجات الأبطأ حركة" icon={<RotateCcw />}>
          {data.slowMoving.length === 0 ? (
            <EmptyBlock text="لا توجد منتجات راكدة في الفترة" />
          ) : (
            <SimpleTable
              headers={["المنتج", "البراند", "المخزون"]}
              rows={data.slowMoving.map((p) => [
                p.name,
                p.brand,
                formatNumber(p.quantity),
              ])}
            />
          )}
        </SectionCard>
      );
    case "topProfit":
      return (
        <SectionCard
          title="المنتجات الأكثر ربحية"
          icon={<TrendingUp />}
          tone="success"
        >
          <p className="mb-3 text-xs text-muted">
            الربح الحقيقي = الإيراد − تكلفة البضاعة المباعة (حسب تكلفة الصنف)
          </p>
          {data.topProfit.length === 0 ? (
            <EmptyBlock />
          ) : (
            <SimpleTable
              headers={[
                "المنتج",
                "البراند",
                "الكمية",
                "الإيراد",
                "التكلفة",
                "مجمل الربح",
              ]}
              rows={data.topProfit.map((p) => [
                p.name,
                p.brand,
                formatNumber(p.qty),
                formatCurrency(p.revenue),
                formatCurrency(p.cost),
                formatCurrency(p.profit),
              ])}
            />
          )}
        </SectionCard>
      );
    case "netProfit":
      return (
        <SectionCard title="صافي الربح" icon={<Coins />} tone="success">
          <p className="mb-3 text-xs text-muted">
            صافي الربح = مجمل الربح (الإيراد − تكلفة البضاعة) − المصروفات
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ProfitTile label="إيراد الفترة" value={data.rangeSales} />
            <ProfitTile label="تكلفة البضاعة المباعة" value={data.cogs} negative />
            <ProfitTile
              label="مجمل الربح"
              value={data.grossProfit}
              strong
            />
            <ProfitTile label="المصروفات" value={data.expensesTotal} negative />
            <ProfitTile
              label="صافي الربح"
              value={data.netProfit}
              strong
              highlight
            />
          </div>
          {data.expensesByCategory.some((c) => c.total > 0) && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted">
                تفصيل المصروفات:
              </p>
              <SimpleTable
                headers={["الفئة", "القيمة"]}
                rows={data.expensesByCategory
                  .filter((c) => c.total > 0)
                  .map((c) => [
                    EXPENSE_CATEGORY_LABELS[c.category],
                    formatCurrency(c.total),
                  ])}
              />
            </div>
          )}
        </SectionCard>
      );
    case "damaged":
      return (
        <SectionCard
          title="تقرير الديفو (التالف/المعيب)"
          icon={<PackageX />}
          tone="warning"
        >
          {data.damagedItems.length === 0 ? (
            <EmptyBlock text="لا توجد أصناف تالفة مسجّلة في هذه الفترة" />
          ) : (
            <SimpleTable
              headers={["المنتج", "البراند", "الفرع", "الكمية", "السبب", "التاريخ"]}
              rows={data.damagedItems.map((d) => [
                d.productName,
                d.brand,
                d.branch ? BRANCH_LABELS[d.branch] : "—",
                formatNumber(d.quantity),
                d.reason ?? "—",
                format(new Date(d.createdAt), "yyyy/MM/dd"),
              ])}
            />
          )}
        </SectionCard>
      );
    case "transfers":
      return (
        <SectionCard
          title="تحويلات المخزون بين الفرعين"
          icon={<ArrowLeftRight />}
        >
          {data.stockTransfers.length === 0 ? (
            <EmptyBlock text="لا توجد تحويلات مخزون في هذه الفترة" />
          ) : (
            <SimpleTable
              headers={[
                "من",
                "إلى",
                "الحالة",
                "عدد الأصناف",
                "الكمية",
                "التاريخ",
              ]}
              rows={data.stockTransfers.map((t) => [
                BRANCH_LABELS[t.fromBranch],
                BRANCH_LABELS[t.toBranch],
                t.status,
                formatNumber(t.itemsCount),
                formatNumber(t.quantity),
                format(new Date(t.createdAt), "yyyy/MM/dd"),
              ])}
            />
          )}
        </SectionCard>
      );
    case "newProducts":
      return (
        <SectionCard title="المنتجات الجديدة في الفترة" icon={<Sparkles />}>
          {data.newProducts.length === 0 ? (
            <EmptyBlock text="لم تُضَف منتجات جديدة في هذه الفترة" />
          ) : (
            <SimpleTable
              headers={["المنتج", "البراند", "الفئة", "تاريخ الإضافة"]}
              rows={data.newProducts.map((p) => [
                p.name,
                p.brand,
                CATEGORY_LABELS[p.category],
                format(new Date(p.createdAt), "yyyy/MM/dd"),
              ])}
            />
          )}
        </SectionCard>
      );
    case "sizeReport":
      return (
        <SectionCard title="تقرير المقاسات (أكثر مقاس مبيع)" icon={<Ruler />}>
          {data.bySize.length === 0 ? (
            <EmptyBlock />
          ) : (
            <SimpleTable
              headers={["المقاس", "الكمية المباعة", "الإيراد"]}
              rows={data.bySize.map((s) => [
                s.size,
                formatNumber(s.qty),
                formatCurrency(s.revenue),
              ])}
            />
          )}
        </SectionCard>
      );
    default:
      return null;
  }
}

// ---- عناصر مساعدة للعرض ----
function SectionCard({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "accent" | "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5" tone={tone}>
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
        {icon && <span className="text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
        {title}
      </h2>
      {children}
    </Card>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  if (rows.length === 0) return <EmptyBlock />;
  return (
    <TableScroll>
      <table className="w-full min-w-[420px] text-right text-sm">
        <thead>
          <tr className="border-b text-muted">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--border)]">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-3 py-2 nums",
                    j === 0 ? "font-medium text-text" : "text-muted"
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-text nums">{value}</p>
    </div>
  );
}

function EmptyBlock({ text = "لا توجد بيانات في هذه الفترة" }: { text?: string }) {
  return <p className="py-4 text-center text-sm text-muted">{text}</p>;
}

// بطاقة رقم في قسم صافي الربح (Part D)
function ProfitTile({
  label,
  value,
  negative,
  strong,
  highlight,
}: {
  label: string;
  value: number;
  negative?: boolean;
  strong?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border p-3",
        highlight && "border-accent bg-accent-soft"
      )}
    >
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 nums",
          strong ? "text-lg font-extrabold" : "font-bold",
          highlight ? "text-accent" : negative ? "text-danger" : "text-text"
        )}
      >
        {negative && value > 0 ? "− " : ""}
        {formatCurrency(value)}
      </p>
    </div>
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
          {formatNumber(stats.returnedCount)} من{" "}
          {formatNumber(stats.deliveryCount)} طلب توصيل
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
