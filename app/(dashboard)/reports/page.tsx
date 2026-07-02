"use client";

import { useMemo, useState } from "react";
import {
  FileDown,
  FileSpreadsheet,
  ChevronDown,
  CheckSquare,
  Square,
  ListFilter,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { DateRangePicker, type DateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { ReportsData } from "@/lib/types";
import {
  ALL_SECTIONS,
  sectionsForTab,
  type SectionId,
  type ReportTab,
} from "@/lib/reports/sections";
import {
  buildSectionContent,
  displayCell,
  type SectionContent,
} from "@/lib/reports/export-data";

const TABS: { key: ReportTab; label: string }[] = [
  { key: "sales", label: "تقارير المبيعات" },
  { key: "inventory", label: "تقارير المنتجات والجرد" },
];

// اختيار افتراضي مفيد عند فتح الصفحة
const DEFAULT_SELECTED: SectionId[] = [
  "totalSales",
  "invoicesCount",
  "avgInvoice",
  "byBranch",
  "byCategory",
  "inventoryValue",
  "productsCount",
  "lowStock",
];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("sales");
  const [range, setRange] = useState<DateRange | null>(null);
  const [selected, setSelected] = useState<Set<SectionId>>(
    () => new Set(DEFAULT_SELECTED)
  );
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => new Set());
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const url = range
    ? `/api/reports?from=${encodeURIComponent(
        range.from
      )}&to=${encodeURIComponent(range.to)}`
    : null;
  const { data, loading, error } = useFetch<ReportsData>(url);

  // معرّفات مختارة بالترتيب الأساسي (المبيعات ثم الجرد) — للتصدير
  const selectedOrdered = useMemo(
    () => ALL_SECTIONS.filter((s) => selected.has(s.id)).map((s) => s.id),
    [selected]
  );

  const tabSections = sectionsForTab(tab);
  const tabSelected = tabSections.filter((s) => selected.has(s.id));
  const allTabSelected =
    tabSections.length > 0 && tabSelected.length === tabSections.length;

  function toggle(id: SectionId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllInTab() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allTabSelected) {
        for (const s of tabSections) next.delete(s.id);
      } else {
        for (const s of tabSections) next.add(s.id);
      }
      return next;
    });
  }

  function toggleCollapse(id: SectionId) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportPdf() {
    if (!data || !range) return;
    if (!selectedOrdered.length) {
      toast.error("اختر قسماً واحداً على الأقل للتصدير");
      return;
    }
    setExporting("pdf");
    try {
      const { generateReportsPdf } = await import("@/lib/reports/export-pdf");
      await generateReportsPdf(data, range, selectedOrdered);
    } catch {
      toast.error("تعذّر إنشاء ملف PDF");
    } finally {
      setExporting(null);
    }
  }

  async function exportExcel() {
    if (!data || !range) return;
    if (!selectedOrdered.length) {
      toast.error("اختر قسماً واحداً على الأقل للتصدير");
      return;
    }
    setExporting("excel");
    try {
      const { generateReportsExcel } = await import(
        "@/lib/reports/export-excel"
      );
      await generateReportsExcel(data, range, selectedOrdered);
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
        description="مُنشئ تقارير معياري — اختر الأقسام التي تريدها ثم صدّرها"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker onChange={setRange} />
            <button
              onClick={exportExcel}
              disabled={!data || exporting !== null || !selectedOrdered.length}
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
              disabled={!data || exporting !== null || !selectedOrdered.length}
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

      {/* تبويبات */}
      <div className="mb-5 inline-flex rounded-lg border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-accent text-white"
                : "text-muted hover:text-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* لوحة اختيار الأقسام */}
      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-text">
            <ListFilter className="h-4 w-4 text-accent" />
            اختر أقسام التقرير
            <span className="text-xs font-normal text-muted">
              ({tabSelected.length} من {tabSections.length} محدّد)
            </span>
          </div>
          <button
            onClick={toggleAllInTab}
            className="btn btn-secondary text-sm"
          >
            {allTabSelected ? (
              <Square className="h-4 w-4" />
            ) : (
              <CheckSquare className="h-4 w-4" />
            )}
            {allTabSelected ? "إلغاء التحديد" : "تحديد الكل"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tabSections.map((s) => {
            const isOn = selected.has(s.id);
            return (
              <label
                key={s.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors",
                  isOn
                    ? "border-accent bg-accent-soft"
                    : "hover:border-accent"
                )}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 shrink-0 accent-accent"
                />
                <span className="text-text">{s.label}</span>
              </label>
            );
          })}
        </div>
      </Card>

      {/* الحالة */}
      {loading && <PageLoader />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل البيانات: {error}
        </Card>
      )}

      {/* الأقسام المختارة (للتبويب الحالي) */}
      {data && !loading && (
        <div className="space-y-4">
          {tabSelected.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm text-muted">
                لم تختر أي قسم في هذا التبويب. فعّل الأقسام من الأعلى لعرضها هنا.
              </p>
            </Card>
          ) : (
            tabSelected.map((s) => (
              <CollapsibleSection
                key={s.id}
                content={buildSectionContent(data, s.id)}
                open={!collapsed.has(s.id)}
                onToggle={() => toggleCollapse(s.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  content,
  open,
  onToggle,
}: {
  content: SectionContent;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-right transition-colors hover:bg-[var(--surface-2)]"
      >
        <span className="text-base font-bold text-text">{content.title}</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </button>
      {open && (
        <div className="border-t px-5 py-4">
          <SectionBody content={content} />
        </div>
      )}
    </Card>
  );
}

function SectionBody({ content }: { content: SectionContent }) {
  const hasTable = !!content.table && content.table.rows.length > 0;
  return (
    <div className="space-y-4">
      {content.metrics?.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {content.metrics.map((m) => (
            <div key={m.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted">{m.label}</p>
              <p className="mt-1 text-lg font-extrabold text-text nums">
                {m.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {content.note && <p className="text-sm text-muted">{content.note}</p>}

      {hasTable && (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b text-muted">
                {content.table!.columns.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-3 py-2 font-medium"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.table!.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-[var(--border)]">
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className="whitespace-nowrap px-3 py-2 text-text nums"
                    >
                      {displayCell(cell, content.table!.columns[ci])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
