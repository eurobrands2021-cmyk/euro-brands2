"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  Download,
  Upload,
  Archive,
  Trash2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  ShieldAlert,
  Eye,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { apiGet, apiPost } from "@/lib/client";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { buildExcelFile, buildPdfFile } from "@/lib/data-export-file";
import {
  DATA_TYPE_KEYS,
  DATA_TYPE_LABELS,
  ARCHIVE_RETENTION_HOURS,
  isArchivable,
  type DataTypeKey,
  type RangePreset,
  type ExportSheet,
  type ArchivedGroup,
  type ImportTypeResult,
} from "@/lib/data-management-types";

type ExportFormat = "excel" | "pdf";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "1m", label: "آخر شهر" },
  { value: "3m", label: "3 شهور" },
  { value: "6m", label: "6 شهور" },
  { value: "custom", label: "مخصص" },
];

// يبني جسم المدى الزمني للطلب (custom يضبط نهاية اليوم لتاريخ «إلى»)
function rangeBody(preset: RangePreset, from: string, to: string) {
  if (preset !== "custom") return { preset };
  let toIso: string | undefined;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    toIso = end.toISOString();
  }
  return {
    preset,
    from: from ? new Date(from).toISOString() : undefined,
    to: toIso,
  };
}

export function DataManagementCard() {
  const [tab, setTab] = useState<"export" | "import">("export");

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text">
        <Database className="h-5 w-5 text-accent" />
        إدارة البيانات
      </h2>
      <p className="mb-4 text-sm text-muted">
        تصدير البيانات، أرشفتها أو حذفها بعد التصدير، وإعادة استيراد ملف مؤرشف.
        متاح للمدير فقط.
      </p>

      {/* التبويبات الداخلية */}
      <div className="mb-5 flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
        <button
          onClick={() => setTab("export")}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            tab === "export"
              ? "bg-surface text-text shadow-sm"
              : "text-muted hover:text-text"
          )}
        >
          تصدير وأرشفة
        </button>
        <button
          onClick={() => setTab("import")}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            tab === "import"
              ? "bg-surface text-text shadow-sm"
              : "text-muted hover:text-text"
          )}
        >
          استيراد
        </button>
      </div>

      {tab === "export" ? <ExportPanel /> : <ImportPanel />}
    </Card>
  );
}

// ====================================================
//  لوحة التصدير + الأرشفة/الحذف
// ====================================================
function ExportPanel() {
  const [selected, setSelected] = useState<Set<DataTypeKey>>(
    new Set(DATA_TYPE_KEYS)
  );
  const [preset, setPreset] = useState<RangePreset>("1m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<ExportFormat>("excel");

  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deletePwd, setDeletePwd] = useState("");
  const [deleting, setDeleting] = useState(false);

  // تأكيد الأرشفة بكلمة مرور المدير (يتحقّق منها الخادم) بدل إرسال ثابت من العميل
  const [showArchivePwd, setShowArchivePwd] = useState(false);

  const [archived, setArchived] = useState<ArchivedGroup[]>([]);

  const userName = getSession()?.name ?? "المدير";

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiGet<{ archived: ArchivedGroup[] }>(
        "/api/data-management/status"
      );
      setArchived(res.archived ?? []);
    } catch {
      /* تجاهل */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // تقدير الأعداد لكل الأنواع كلّما تغيّر المدى (مع debounce بسيط)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setEstimating(true);
      try {
        const res = await apiPost<{ counts: Record<string, number> }>(
          "/api/data-management/estimate",
          { types: DATA_TYPE_KEYS, ...rangeBody(preset, from, to) }
        );
        if (!cancelled) setCounts(res.counts);
      } catch {
        if (!cancelled) setCounts(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [preset, from, to]);

  function toggle(k: DataTypeKey) {
    setExported(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const selectedList = useMemo(
    () => DATA_TYPE_KEYS.filter((k) => selected.has(k)),
    [selected]
  );
  const archivableSelected = selectedList.filter(isArchivable);

  async function handleExport() {
    if (selectedList.length === 0) {
      toast.error("اختر نوعاً واحداً على الأقل");
      return;
    }
    setExporting(true);
    try {
      const res = await apiPost<{ sheets: ExportSheet[] }>(
        "/api/data-management/export",
        { types: selectedList, ...rangeBody(preset, from, to) }
      );
      if (format === "excel") await buildExcelFile(res.sheets);
      else await buildPdfFile(res.sheets);
      setExported(true);
      toast.success("تم التصدير بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر التصدير");
    } finally {
      setExporting(false);
    }
  }

  function requestArchive() {
    if (archivableSelected.length === 0) {
      toast.error("الأنواع المختارة غير قابلة للأرشفة (الديفو والتحويلات تُحذف مباشرةً فقط)");
      return;
    }
    setShowArchivePwd(true);
  }

  async function handleArchive(password: string) {
    setArchiving(true);
    try {
      const res = await apiPost<{ total: number }>(
        "/api/data-management/archive",
        {
          types: archivableSelected,
          ...rangeBody(preset, from, to),
          password,
          user: userName,
        }
      );
      toast.success(
        `تمت أرشفة ${formatNumber(res.total)} سجلاً — سيُحذف تلقائياً بعد ${ARCHIVE_RETENTION_HOURS} ساعة`
      );
      setShowArchivePwd(false);
      setExported(false);
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّرت الأرشفة");
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await apiPost<{ total: number; skippedProducts: number }>(
        "/api/data-management/delete",
        {
          types: selectedList,
          ...rangeBody(preset, from, to),
          password: deletePwd,
          user: userName,
        }
      );
      toast.success(
        `تم حذف ${formatNumber(res.total)} سجلاً نهائياً${
          res.skippedProducts
            ? ` (تُخطّي ${formatNumber(res.skippedProducts)} منتجاً مرتبطاً بفواتير)`
            : ""
        }`
      );
      setShowDelete(false);
      setDeletePwd("");
      setExported(false);
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحذف");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* عدّاد المؤرشفات المنتظرة للحذف */}
      {archived.length > 0 && <ArchivedCountdown groups={archived} />}

      {/* 1) اختيار الأنواع مع الأعداد */}
      <div>
        <label className="label mb-2 block">أنواع البيانات للتصدير</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DATA_TYPE_KEYS.map((k) => {
            const count = counts?.[k];
            return (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm transition-colors",
                  selected.has(k)
                    ? "border-accent bg-accent-soft"
                    : "border-[var(--border)] hover:border-accent/50"
                )}
              >
                <span className="flex items-center gap-2 font-medium text-text">
                  <input
                    type="checkbox"
                    checked={selected.has(k)}
                    onChange={() => toggle(k)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {DATA_TYPE_LABELS[k]}
                </span>
                <span className="nums text-xs text-muted">
                  {estimating || count == null ? "…" : formatNumber(count)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 2) المدى الزمني */}
      <div>
        <label className="label mb-2 block">المدى الزمني</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setPreset(p.value);
                setExported(false);
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                preset === p.value
                  ? "border-accent bg-accent text-white"
                  : "border-[var(--border)] text-muted hover:text-text"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">من تاريخ</label>
              <input
                type="date"
                className="input nums"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setExported(false);
                }}
              />
            </div>
            <div>
              <label className="label">إلى تاريخ</label>
              <input
                type="date"
                className="input nums"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setExported(false);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3) الصيغة */}
      <div>
        <label className="label mb-2 block">الصيغة</label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFormat("excel")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              format === "excel"
                ? "border-accent bg-accent text-white"
                : "border-[var(--border)] text-muted hover:text-text"
            )}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel (ورقة لكل نوع)
          </button>
          <button
            onClick={() => setFormat("pdf")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              format === "pdf"
                ? "border-accent bg-accent text-white"
                : "border-[var(--border)] text-muted hover:text-text"
            )}
          >
            <FileText className="h-4 w-4" />
            PDF (أقسام)
          </button>
        </div>
      </div>

      {/* زر التصدير */}
      <button
        onClick={handleExport}
        disabled={exporting || selectedList.length === 0}
        className="btn btn-primary h-11 w-full sm:w-auto"
      >
        {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        تصدير الآن ({formatNumber(selectedList.length)} أنواع)
      </button>

      {/* بعد التصدير: احتفظ / أرشفة / حذف */}
      {exported && (
        <div className="space-y-3 rounded-lg border border-accent/40 bg-accent-soft/40 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-text">
            <CheckCircle2 className="h-4 w-4 text-success" />
            تم التصدير — ماذا تريد أن تفعل بالبيانات المصدَّرة؟
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => {
                setExported(false);
                toast.success("تم الاحتفاظ بالبيانات");
              }}
              className="btn btn-secondary h-11 flex-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              احتفظ
            </button>
            <button
              onClick={requestArchive}
              disabled={archiving}
              className="btn btn-secondary h-11 flex-1"
            >
              {archiving ? <Spinner className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              أرشفة (احذف بعد 3 أيام)
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="btn btn-danger h-11 flex-1"
            >
              <Trash2 className="h-4 w-4" />
              احذف الآن
            </button>
          </div>
          <p className="text-xs text-muted">
            الأرشفة تضبط مؤقّتاً وتحذف تلقائياً بعد {ARCHIVE_RETENTION_HOURS} ساعة
            (الديفو والتحويلات غير قابلة للأرشفة). الحذف الفوري نهائي ويتطلّب كلمة
            المرور.
          </p>
        </div>
      )}

      {/* نافذة تأكيد الحذف النهائي */}
      <Modal
        open={showDelete}
        onClose={() => {
          if (!deleting) {
            setShowDelete(false);
            setDeletePwd("");
          }
        }}
        title="تأكيد الحذف النهائي"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-danger/40 bg-[rgba(217,83,79,0.08)] p-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="text-sm text-text">
              <p className="font-bold text-danger">تحذير: هذا الإجراء لا يمكن التراجع عنه.</p>
              <p className="mt-1 text-muted">
                سيتم حذف الأنواع التالية نهائياً ضمن المدى المحدد:
              </p>
              <p className="mt-1 font-medium">
                {selectedList.map((k) => DATA_TYPE_LABELS[k]).join(" · ")}
              </p>
              <p className="mt-2 text-xs text-muted">
                ملاحظة: حذف الفواتير لا يُعيد الكميات إلى المخزون. المنتجات
                المرتبطة بفواتير سابقة لن تُحذف.
              </p>
            </div>
          </div>
          <div>
            <label className="label">اكتب كلمة مرور المدير للتأكيد</label>
            <input
              type="password"
              className="input"
              value={deletePwd}
              onChange={(e) => setDeletePwd(e.target.value)}
              placeholder="كلمة المرور"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleDelete}
              disabled={deleting || !deletePwd}
              className="btn btn-danger h-11 flex-1"
            >
              {deleting ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              حذف نهائي
            </button>
            <button
              onClick={() => {
                setShowDelete(false);
                setDeletePwd("");
              }}
              disabled={deleting}
              className="btn btn-secondary h-11 flex-1"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>

      {/* تأكيد الأرشفة بكلمة مرور المدير (يتحقّق منها الخادم) */}
      <AdminPasswordModal
        open={showArchivePwd}
        title="تأكيد الأرشفة"
        busy={archiving}
        onConfirm={handleArchive}
        onClose={() => setShowArchivePwd(false)}
      />
    </div>
  );
}

// نافذة تأكيد بكلمة مرور المدير — تُرسَل للخادم للتحقّق منها (لا تُخزَّن في العميل)
function AdminPasswordModal({
  open,
  title,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  onConfirm: (password: string) => void;
  onClose: () => void;
}) {
  const [pwd, setPwd] = useState("");
  useEffect(() => {
    if (!open) setPwd("");
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          اكتب كلمة مرور المدير للتأكيد. هذه العملية للمدير فقط.
        </p>
        <input
          type="password"
          className="input"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="كلمة المرور"
          autoFocus
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => onConfirm(pwd)}
            disabled={busy || !pwd}
            className="btn btn-primary h-11 flex-1"
          >
            {busy && <Spinner className="h-4 w-4" />}
            تأكيد
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="btn btn-secondary h-11 flex-1"
          >
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

// عدّاد تنازلي للبيانات المؤرشفة المنتظرة للحذف التلقائي
function ArchivedCountdown({ groups }: { groups: ArchivedGroup[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function remaining(deleteAt: string): string {
    const ms = new Date(deleteAt).getTime() - now;
    if (ms <= 0) return "يُحذف قريباً…";
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    const parts: string[] = [];
    if (d) parts.push(`${d} يوم`);
    if (h) parts.push(`${h} س`);
    parts.push(`${m} د`);
    return `يُحذف خلال ${parts.join(" ")}`;
  }

  return (
    <div className="rounded-lg border border-warning/40 bg-[rgba(201,133,26,0.08)] p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-text">
        <Clock className="h-4 w-4 text-warning" />
        بيانات مؤرشفة بانتظار الحذف التلقائي
      </p>
      <div className="space-y-1.5">
        {groups.map((g) => (
          <div
            key={g.type}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="font-medium text-text">
              {g.label}{" "}
              <span className="nums text-xs text-muted">
                ({formatNumber(g.count)})
              </span>
            </span>
            <span className="nums text-xs text-warning">
              {remaining(g.deleteAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ====================================================
//  لوحة الاستيراد
// ====================================================
type ImportMode = "review" | "full" | "partial";
type RawRow = Record<string, string | number | null>;

interface ParsedGroup {
  type: DataTypeKey;
  label: string;
  headers: string[];
  rows: RawRow[];
  include: boolean;
  mode: ImportMode;
  selectedRows: boolean[];
}

const LABEL_TO_TYPE: Record<string, DataTypeKey> = Object.fromEntries(
  DATA_TYPE_KEYS.map((k) => [DATA_TYPE_LABELS[k], k])
) as Record<string, DataTypeKey>;

function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [groups, setGroups] = useState<ParsedGroup[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportTypeResult[] | null>(null);
  const [showImportPwd, setShowImportPwd] = useState(false);

  const userName = getSession()?.name ?? "المدير";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    setResults(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const parsed: ParsedGroup[] = [];
      for (const sheetName of wb.SheetNames) {
        const type = LABEL_TO_TYPE[sheetName.trim()];
        if (!type) continue; // ورقة غير معروفة — نتجاهلها
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "" });
        if (rows.length === 0) continue;
        const headers = Object.keys(rows[0]);
        parsed.push({
          type,
          label: DATA_TYPE_LABELS[type],
          headers,
          rows,
          include: true,
          mode: "full",
          selectedRows: rows.map(() => true),
        });
      }
      if (parsed.length === 0) {
        toast.error("لم يُعثر على أوراق بيانات معروفة في الملف");
        return;
      }
      setGroups(parsed);
    } catch {
      toast.error("تعذّر قراءة ملف Excel");
    } finally {
      setParsing(false);
    }
  }

  function updateGroup(type: DataTypeKey, patch: Partial<ParsedGroup>) {
    setGroups((prev) =>
      prev
        ? prev.map((g) => (g.type === type ? { ...g, ...patch } : g))
        : prev
    );
  }

  function toggleRow(type: DataTypeKey, idx: number) {
    setGroups((prev) =>
      prev
        ? prev.map((g) => {
            if (g.type !== type) return g;
            const selectedRows = [...g.selectedRows];
            selectedRows[idx] = !selectedRows[idx];
            return { ...g, selectedRows };
          })
        : prev
    );
  }

  const toImport = useMemo(
    () =>
      (groups ?? []).filter((g) => g.include && g.mode !== "review"),
    [groups]
  );

  const totalRowsToImport = useMemo(
    () =>
      toImport.reduce(
        (sum, g) =>
          sum +
          (g.mode === "partial"
            ? g.selectedRows.filter(Boolean).length
            : g.rows.length),
        0
      ),
    [toImport]
  );

  function requestImport() {
    if (toImport.length === 0) {
      toast.error("اختر نوعاً واحداً على الأقل للاستيراد (غير وضع المراجعة)");
      return;
    }
    setShowImportPwd(true);
  }

  async function handleImport(password: string) {
    setImporting(true);
    try {
      const payloadGroups = toImport.map((g) => ({
        type: g.type,
        rows:
          g.mode === "partial"
            ? g.rows.filter((_, i) => g.selectedRows[i])
            : g.rows,
      }));
      const res = await apiPost<{ results: ImportTypeResult[] }>(
        "/api/data-management/import",
        { groups: payloadGroups, password, user: userName }
      );
      setResults(res.results);
      setShowImportPwd(false);
      const created = res.results.reduce((a, r) => a + r.created, 0);
      const updated = res.results.reduce((a, r) => a + r.updated, 0);
      toast.success(
        `تم الاستيراد: ${formatNumber(created)} جديد · ${formatNumber(updated)} تحديث`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الاستيراد");
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setGroups(null);
    setResults(null);
  }

  if (!groups) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          ارفع ملف Excel مؤرشفاً (نفس صيغة التصدير) لمعاينة محتوياته واستيرادها
          دون تكرار. لكل نوع تختار: عرض ومراجعة فقط، استيراد كامل، أو استيراد
          جزئي بتحديد صفوف.
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="btn btn-primary h-11 w-full sm:w-auto"
        >
          {parsing ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          رفع ملف Excel
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFile}
        />
        <p className="flex items-center gap-2 text-xs text-muted">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          استيراد الفواتير لا يعدّل المخزون الحالي.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* نتائج الاستيراد */}
      {results && (
        <div className="space-y-2 rounded-lg border border-success/40 bg-[rgba(59,154,110,0.08)] p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-text">
            <CheckCircle2 className="h-4 w-4 text-success" />
            اكتمل الاستيراد
          </p>
          {results.map((r) => (
            <p key={r.type} className="nums text-xs text-muted">
              {DATA_TYPE_LABELS[r.type]}: {formatNumber(r.created)} جديد ·{" "}
              {formatNumber(r.updated)} تحديث · {formatNumber(r.skipped)} متخطّى
            </p>
          ))}
        </div>
      )}

      {/* قائمة الأنواع الموجودة في الملف */}
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.type} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-text">
                <input
                  type="checkbox"
                  checked={g.include}
                  onChange={() => updateGroup(g.type, { include: !g.include })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {g.label}{" "}
                <span className="nums text-xs text-muted">
                  ({formatNumber(g.rows.length)})
                </span>
              </label>
              {g.include && (
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["review", "عرض ومراجعة فقط", Eye],
                      ["full", "استيراد كامل", Download],
                      ["partial", "استيراد جزئي", CheckCircle2],
                    ] as [ImportMode, string, typeof Eye][]
                  ).map(([mode, label, Icon]) => (
                    <button
                      key={mode}
                      onClick={() => updateGroup(g.type, { mode })}
                      className={cn(
                        "flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                        g.mode === mode
                          ? "border-accent bg-accent text-white"
                          : "border-[var(--border)] text-muted hover:text-text"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* معاينة الصفوف */}
            {g.include && (
              <div className="mt-3 max-h-64 overflow-auto rounded border">
                <table className="w-full min-w-[600px] text-right text-[11px]">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b text-muted">
                      {g.mode === "partial" && (
                        <th className="px-2 py-1.5 font-medium">تحديد</th>
                      )}
                      {g.headers.map((h) => (
                        <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "border-b border-[var(--border)]",
                          g.mode === "partial" && !g.selectedRows[i] && "opacity-40"
                        )}
                      >
                        {g.mode === "partial" && (
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={g.selectedRows[i]}
                              onChange={() => toggleRow(g.type, i)}
                              className="h-3.5 w-3.5 accent-[var(--accent)]"
                            />
                          </td>
                        )}
                        {g.headers.map((h) => (
                          <td key={h} className="px-2 py-1 text-text whitespace-nowrap">
                            {String(row[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.rows.length > 100 && (
                  <p className="p-2 text-[11px] text-muted">
                    تُعرض أول 100 صف فقط في المعاينة، وسيُستورد الكل حسب الوضع.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={requestImport}
          disabled={importing || totalRowsToImport === 0}
          className="btn btn-primary h-11 sm:w-auto"
        >
          {importing ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          تأكيد الاستيراد ({formatNumber(totalRowsToImport)} صف)
        </button>
        <button
          onClick={reset}
          disabled={importing}
          className="btn btn-secondary h-11 sm:w-auto"
        >
          رفع ملف آخر
        </button>
      </div>

      {/* تأكيد الاستيراد بكلمة مرور المدير (يتحقّق منها الخادم) */}
      <AdminPasswordModal
        open={showImportPwd}
        title="تأكيد الاستيراد"
        busy={importing}
        onConfirm={handleImport}
        onClose={() => setShowImportPwd(false)}
      />
    </div>
  );
}
