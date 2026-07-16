"use client";

import { useMemo, useState } from "react";
import {
  Lock,
  Unlock,
  Printer,
  Play,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  Eye,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPost, apiGet } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, StatCard } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput } from "@/components/ui/inputs";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { printShiftReport } from "@/lib/shift-print";
import {
  BRANCHES,
  BRANCH_LABELS,
  type BranchValue,
} from "@/lib/constants";
import type {
  ShiftCloseDTO,
  ShiftDetailResponse,
  ShiftListResponse,
} from "@/lib/types";

export default function ShiftsPage() {
  const session = getSession();
  const isAdmin = session?.role === "ADMIN";
  const [branch, setBranch] = useState<BranchValue>("HADAYEK");
  const [viewAll, setViewAll] = useState(false); // للمدير: عرض كل الفروع

  const listUrl = viewAll
    ? "/api/shifts"
    : `/api/shifts?branch=${branch}`;
  const { data, loading, refetch } = useFetch<ShiftListResponse>(listUrl);

  return (
    <div>
      <PageHeader
        title="إقفال الصندوق"
        description="بدء الشيفت بعهدة أول اليوم، وإقفاله بمطابقة النقد المعدود مع المتوقع"
      />

      {/* اختيار الفرع + عرض الكل */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-[var(--radius-md)] border p-1">
            {BRANCHES.map((b) => (
              <button
                key={b}
                onClick={() => {
                  setBranch(b);
                  setViewAll(false);
                }}
                className={
                  "rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-medium transition-colors " +
                  (!viewAll && branch === b
                    ? "bg-accent text-white"
                    : "text-muted hover:text-text")
                }
              >
                {BRANCH_LABELS[b]}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button
              onClick={() => setViewAll((v) => !v)}
              className={
                "btn " + (viewAll ? "btn-primary" : "btn-secondary")
              }
            >
              كل الفروع
            </button>
          )}
        </div>
      </Card>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          {!viewAll && (
            <div className="mb-6">
              {data?.openShift ? (
                <OpenShiftCard shift={data.openShift} onClosed={refetch} />
              ) : (
                <StartShiftCard branch={branch} onStarted={refetch} />
              )}
            </div>
          )}

          {/* ملخّص الفروقات */}
          {data && data.summary.count > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                title="عدد الإقفالات"
                value={formatNumber(data.summary.count)}
                tone="accent"
              />
              <StatCard
                title="صافي الفروقات"
                value={formatCurrency(data.summary.totalDifference)}
                tone={data.summary.totalDifference < 0 ? "warning" : "success"}
              />
              <StatCard
                title="شيفتات بزيادة"
                value={formatNumber(data.summary.overCount)}
                tone="success"
              />
              <StatCard
                title="شيفتات بعجز"
                value={formatNumber(data.summary.shortCount)}
                tone="warning"
              />
            </div>
          )}

          <ClosedShiftsTable
            shifts={(data?.shifts ?? []).filter((s) => s.closedAt)}
            showBranch={viewAll}
          />
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------
//  بدء الشيفت
// ----------------------------------------------------
function StartShiftCard({
  branch,
  onStarted,
}: {
  branch: BranchValue;
  onStarted: () => void;
}) {
  const [opening, setOpening] = useState("");
  const [saving, setSaving] = useState(false);

  async function start() {
    setSaving(true);
    try {
      await apiPost<ShiftCloseDTO>("/api/shifts", {
        branch,
        cashierName: getSession()?.name ?? null,
        openingCash: opening || "0",
      });
      toast.success("تم بدء الشيفت");
      setOpening("");
      onStarted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر بدء الشيفت");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone="accent" className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-text">
        <Play className="h-5 w-5 text-accent" /> بدء الشيفت — {BRANCH_LABELS[branch]}
      </h2>
      <p className="mb-4 text-sm text-muted">
        أدخل عهدة بداية اليوم (النقد الموجود في الدرج قبل أول عملية)
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="label">عهدة البداية (ج.م)</label>
          <NumberInput
            decimal
            className="input"
            value={opening}
            onChange={setOpening}
            placeholder="0"
          />
        </div>
        <button className="btn btn-primary" onClick={start} disabled={saving}>
          {saving ? "جارٍ البدء…" : "بدء الشيفت"}
        </button>
      </div>
    </Card>
  );
}

// ----------------------------------------------------
//  الشيفت المفتوح — عرض حي + إقفال
// ----------------------------------------------------
function OpenShiftCard({
  shift,
  onClosed,
}: {
  shift: ShiftCloseDTO;
  onClosed: () => void;
}) {
  const { data, loading, refetch } = useFetch<ShiftDetailResponse>(
    `/api/shifts/${shift.id}`
  );
  const [showClose, setShowClose] = useState(false);

  return (
    <Card tone="warning" className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text">
          <Unlock className="h-5 w-5 text-warning" /> شيفت مفتوح —{" "}
          {BRANCH_LABELS[shift.branch]}
        </h2>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={refetch}>
            تحديث
          </button>
          <button className="btn btn-primary" onClick={() => setShowClose(true)}>
            <Lock className="h-4 w-4" /> إقفال الشيفت
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span>الكاشير: {shift.cashierName ?? "—"}</span>
        <span>بدأ: {formatDateTime(shift.openedAt)}</span>
      </div>

      {loading || !data ? (
        <PageLoader />
      ) : (
        <ShiftReportGrid report={data.report} />
      )}

      {showClose && data && (
        <CloseShiftModal
          shift={shift}
          expected={data.report.expectedCash}
          onClose={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false);
            onClosed();
          }}
        />
      )}
    </Card>
  );
}

function ShiftReportGrid({
  report,
}: {
  report: ShiftDetailResponse["report"];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <MiniStat label="عهدة البداية" value={formatCurrency(report.openingCash)} />
      <MiniStat label="عدد الفواتير" value={formatNumber(report.invoicesCount)} />
      <MiniStat label="إجمالي المبيعات" value={formatCurrency(report.totalSales)} />
      <MiniStat label="كاش" value={formatCurrency(report.cashSales)} />
      <MiniStat label="فيزا" value={formatCurrency(report.cardSales)} />
      <MiniStat label="تحويل" value={formatCurrency(report.transferSales)} />
      <MiniStat label="مرتجعات نقدية" value={formatCurrency(report.cashRefunds)} />
      <MiniStat
        label="النقد المتوقع"
        value={formatCurrency(report.expectedCash)}
        strong
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          "mt-1 nums " +
          (strong ? "text-lg font-extrabold text-accent" : "font-bold text-text")
        }
      >
        {value}
      </p>
    </div>
  );
}

// ----------------------------------------------------
//  نافذة الإقفال
// ----------------------------------------------------
function CloseShiftModal({
  shift,
  expected,
  onClose,
  onClosed,
}: {
  shift: ShiftCloseDTO;
  expected: number;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const countedNum = Number(counted || "0");
  const difference = countedNum - expected;

  async function close() {
    setSaving(true);
    try {
      const res = await apiPost<ShiftDetailResponse>(
        `/api/shifts/${shift.id}/close`,
        { countedCash: counted || "0", notes: notes.trim() || null }
      );
      toast.success("تم إقفال الشيفت");
      // اطبع الملخّص مباشرة
      printShiftReport(res.shift, res.report);
      onClosed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإقفال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="إقفال الشيفت" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-[var(--radius-md)] bg-accent-soft p-4 text-center">
          <p className="text-sm text-muted">النقد المتوقع في الدرج</p>
          <p className="mt-1 text-2xl font-extrabold text-accent nums">
            {formatCurrency(expected)}
          </p>
        </div>

        <div>
          <label className="label">النقد المعدود فعلياً (ج.م)</label>
          <NumberInput
            decimal
            className="input"
            value={counted}
            onChange={setCounted}
            placeholder="0"
            autoFocus
          />
        </div>

        {counted !== "" && (
          <div
            className={
              "flex items-center justify-between rounded-[var(--radius-md)] border p-3 " +
              (Math.abs(difference) < 0.01
                ? "border-success text-success"
                : difference > 0
                  ? "border-success text-success"
                  : "border-danger text-danger")
            }
          >
            <span className="flex items-center gap-2 font-medium">
              {Math.abs(difference) < 0.01 ? (
                <>
                  <CheckCircle2 className="h-5 w-5" /> مطابق
                </>
              ) : difference > 0 ? (
                <>
                  <ArrowUpCircle className="h-5 w-5" /> زيادة
                </>
              ) : (
                <>
                  <ArrowDownCircle className="h-5 w-5" /> عجز
                </>
              )}
            </span>
            <span className="text-lg font-extrabold nums">
              {formatCurrency(Math.abs(difference))}
            </span>
          </div>
        )}

        <div>
          <label className="label">ملاحظات (اختياري)</label>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="سبب الفرق إن وُجد"
          />
        </div>

        <div className="flex gap-2">
          <button
            className="btn btn-primary flex-1"
            onClick={close}
            disabled={saving || counted === ""}
          >
            {saving ? "جارٍ الإقفال…" : "تأكيد الإقفال والطباعة"}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------
//  جدول الإقفالات السابقة
// ----------------------------------------------------
function ClosedShiftsTable({
  shifts,
  showBranch,
}: {
  shifts: ShiftCloseDTO[];
  showBranch: boolean;
}) {
  const [viewing, setViewing] = useState<ShiftDetailResponse | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function openDetail(id: string) {
    setLoadingId(id);
    try {
      const res = await apiGet<ShiftDetailResponse>(`/api/shifts/${id}`);
      setViewing(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر عرض الشيفت");
    } finally {
      setLoadingId(null);
    }
  }

  if (shifts.length === 0)
    return (
      <EmptyState
        icon={<Wallet className="h-8 w-8" />}
        title="لا توجد إقفالات بعد"
        description="ستظهر إقفالات الصندوق هنا بعد إقفال أول شيفت"
      />
    );

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--surface-2)] text-right text-xs text-muted">
              <th className="px-4 py-3 font-medium">الإقفال</th>
              {showBranch && <th className="px-4 py-3 font-medium">الفرع</th>}
              <th className="px-4 py-3 font-medium">الكاشير</th>
              <th className="px-4 py-3 font-medium">المتوقع</th>
              <th className="px-4 py-3 font-medium">المعدود</th>
              <th className="px-4 py-3 font-medium">الفرق</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted nums">
                  {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                </td>
                {showBranch && (
                  <td className="px-4 py-3">{BRANCH_LABELS[s.branch]}</td>
                )}
                <td className="px-4 py-3">{s.cashierName ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 nums">
                  {formatCurrency(s.expectedCash)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 nums">
                  {formatCurrency(s.countedCash ?? 0)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <DiffBadge value={s.difference} />
                </td>
                <td className="px-4 py-3">
                  <button
                    className="btn btn-ghost h-9 px-2"
                    onClick={() => openDetail(s.id)}
                    disabled={loadingId === s.id}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal
          open
          title={`ملخّص الشيفت — ${BRANCH_LABELS[viewing.shift.branch]}`}
          onClose={() => setViewing(null)}
        >
          <div className="space-y-4">
            <ShiftReportGrid report={viewing.report} />
            <div className="grid grid-cols-3 gap-3">
              <MiniStat
                label="المعدود"
                value={formatCurrency(viewing.shift.countedCash ?? 0)}
              />
              <div className="rounded-[var(--radius-md)] border bg-surface p-3">
                <p className="text-xs text-muted">الفرق</p>
                <p className="mt-1">
                  <DiffBadge value={viewing.shift.difference} />
                </p>
              </div>
              <MiniStat
                label="النقد المتوقع"
                value={formatCurrency(viewing.report.expectedCash)}
              />
            </div>
            {viewing.shift.notes && (
              <p className="text-sm text-muted">
                ملاحظات: {viewing.shift.notes}
              </p>
            )}
            <button
              className="btn btn-primary w-full"
              onClick={() => printShiftReport(viewing.shift, viewing.report)}
            >
              <Printer className="h-4 w-4" /> طباعة الملخّص
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function DiffBadge({ value }: { value: number }) {
  if (Math.abs(value) < 0.01)
    return <span className="badge bg-[rgba(59,154,110,0.12)] text-success">مطابق</span>;
  if (value > 0)
    return (
      <span className="badge bg-[rgba(59,154,110,0.12)] text-success nums">
        +{formatNumber(value)} زيادة
      </span>
    );
  return (
    <span className="badge bg-[rgba(220,53,69,0.12)] text-danger nums">
      {formatNumber(value)} عجز
    </span>
  );
}
