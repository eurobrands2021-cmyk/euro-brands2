"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  CheckCircle2,
  Eye,
  Plus,
  X,
} from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPut } from "@/lib/client";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import {
  BRANCHES,
  BRANCH_LABELS,
  STOCK_TRANSFER_STATUSES,
  STOCK_TRANSFER_STATUS_LABELS,
  type StockTransferStatusValue,
} from "@/lib/constants";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { StockTransferDTO } from "@/lib/types";

const STATUS_STYLE: Record<StockTransferStatusValue, string> = {
  PENDING: "bg-[rgba(201,133,26,0.14)] text-warning",
  COMPLETED: "bg-[rgba(59,154,110,0.14)] text-success",
  CANCELLED: "bg-[rgba(217,83,79,0.14)] text-danger",
};

function transferLabel(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

export default function TransfersPage() {
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionTarget, setActionTarget] = useState<{
    transfer: StockTransferDTO;
    action: "COMPLETED" | "CANCELLED";
  } | null>(null);
  const [acting, setActing] = useState(false);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    if (status) params.set("status", status);
    if (from) params.set("from", startOfDay(new Date(from)).toISOString());
    if (to) params.set("to", endOfDay(new Date(to)).toISOString());
    const qs = params.toString();
    return `/api/transfers${qs ? `?${qs}` : ""}`;
  }, [branch, status, from, to]);

  const { data, loading, error, refetch } = useFetch<StockTransferDTO[]>(url);
  const transfers = data ?? [];
  const hasFilters = !!(branch || status || from || to);

  function clearFilters() {
    setBranch("");
    setStatus("");
    setFrom("");
    setTo("");
  }

  async function confirmAction() {
    if (!actionTarget) return;
    setActing(true);
    try {
      await apiPut(`/api/transfers/${actionTarget.transfer.id}`, {
        status: actionTarget.action,
      });
      void logActivity(
        actionTarget.action === "COMPLETED"
          ? ACTIVITY_ACTIONS.COMPLETE_TRANSFER
          : ACTIVITY_ACTIONS.CANCEL_TRANSFER,
        `تحويل ${transferLabel(actionTarget.transfer.id)} — ${
          BRANCH_LABELS[actionTarget.transfer.fromBranch]
        } ← ${BRANCH_LABELS[actionTarget.transfer.toBranch]}`
      );
      toast.success(
        actionTarget.action === "COMPLETED"
          ? "تم إتمام التحويل وتحديث المخزون"
          : "تم إلغاء التحويل"
      );
      setActionTarget(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تنفيذ العملية");
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="تحويلات المخزون"
        description="تحويل الأصناف بين فرعي حدائق المعادي وزهراء المعادي"
        actions={
          <Link href="/transfers/new" className="btn btn-primary">
            <Plus className="h-4 w-4" />
            تحويل جديد
          </Link>
        }
      />

      {/* الفلاتر */}
      <Card className="mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="input"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="">كل الفروع</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {BRANCH_LABELS[b]}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">كل الحالات</option>
            {STOCK_TRANSFER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STOCK_TRANSFER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="من تاريخ"
          />
          <input
            type="date"
            className="input"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="إلى تاريخ"
          />
        </div>
        {hasFilters && (
          <button
            className="btn btn-ghost mt-3 h-8 px-2 text-xs"
            onClick={clearFilters}
          >
            <X className="h-4 w-4" />
            مسح الفلاتر
          </button>
        )}
      </Card>

      {loading && <PageLoader />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل التحويلات: {error}
        </Card>
      )}

      {!loading && !error && transfers.length === 0 && (
        <EmptyState
          icon={<ArrowLeftRight className="h-7 w-7" />}
          title="لا توجد تحويلات"
          description={
            hasFilters
              ? "لا توجد تحويلات مطابقة للفلاتر المحددة."
              : "ابدأ بإنشاء أول تحويل مخزون بين الفروع."
          }
        />
      )}

      {!loading && transfers.length > 0 && (
        <Card className="p-2 sm:p-4">
          {/* جدول لسطح المكتب */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[860px] text-right text-sm">
              <thead>
                <tr className="border-b text-muted">
                  <th className="px-3 py-3 font-medium">رقم التحويل</th>
                  <th className="px-3 py-3 font-medium">من فرع</th>
                  <th className="px-3 py-3 font-medium">إلى فرع</th>
                  <th className="px-3 py-3 font-medium">عدد الأصناف</th>
                  <th className="px-3 py-3 font-medium">الحالة</th>
                  <th className="px-3 py-3 font-medium">بواسطة</th>
                  <th className="px-3 py-3 font-medium">التاريخ</th>
                  <th className="px-3 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-3 font-bold text-accent nums">
                      {transferLabel(t.id)}
                    </td>
                    <td className="px-3 py-3">
                      <BranchBadge branch={t.fromBranch} />
                    </td>
                    <td className="px-3 py-3">
                      <BranchBadge branch={t.toBranch} />
                    </td>
                    <td className="px-3 py-3 text-text nums">
                      {formatNumber(t.itemsCount)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn("badge", STATUS_STYLE[t.status])}
                      >
                        {STOCK_TRANSFER_STATUS_LABELS[t.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {t.createdBy || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted nums">
                      {formatDateTime(t.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <Link
                          href={`/transfers/${t.id}`}
                          className="btn btn-ghost h-8 w-8 !px-0"
                          aria-label="عرض"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {t.status === "PENDING" && (
                          <>
                            <button
                              onClick={() =>
                                setActionTarget({ transfer: t, action: "COMPLETED" })
                              }
                              className="btn btn-ghost h-8 w-8 !px-0 text-success"
                              aria-label="إتمام"
                              title="إتمام التحويل"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() =>
                                setActionTarget({ transfer: t, action: "CANCELLED" })
                              }
                              className="btn btn-ghost h-8 w-8 !px-0 text-danger"
                              aria-label="إلغاء"
                              title="إلغاء التحويل"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* بطاقات للموبايل */}
          <div className="space-y-3 sm:hidden">
            {transfers.map((t) => (
              <div key={t.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-accent nums">{transferLabel(t.id)}</p>
                  <span className={cn("badge", STATUS_STYLE[t.status])}>
                    {STOCK_TRANSFER_STATUS_LABELS[t.status]}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <BranchBadge branch={t.fromBranch} />
                  <ArrowRight className="h-4 w-4 text-muted" />
                  <BranchBadge branch={t.toBranch} />
                </div>
                <p className="mt-2 text-xs text-muted nums">
                  {formatDateTime(t.createdAt)}
                  {t.createdBy ? ` · ${t.createdBy}` : ""} ·{" "}
                  {formatNumber(t.itemsCount)} صنف
                </p>
                <div className="mt-3 flex justify-end gap-2 border-t pt-3">
                  <Link href={`/transfers/${t.id}`} className="btn btn-secondary h-9 text-xs">
                    <Eye className="h-4 w-4" />
                    عرض
                  </Link>
                  {t.status === "PENDING" && (
                    <>
                      <button
                        onClick={() =>
                          setActionTarget({ transfer: t, action: "COMPLETED" })
                        }
                        className="btn btn-secondary h-9 text-xs text-success"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        إتمام
                      </button>
                      <button
                        onClick={() =>
                          setActionTarget({ transfer: t, action: "CANCELLED" })
                        }
                        className="btn btn-ghost h-9 text-xs text-danger"
                      >
                        <Ban className="h-4 w-4" />
                        إلغاء
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!actionTarget}
        title={
          actionTarget?.action === "COMPLETED" ? "إتمام التحويل" : "إلغاء التحويل"
        }
        message={
          actionTarget?.action === "COMPLETED"
            ? "سيتم خصم الكميات من فرع المصدر وإضافتها لفرع الوجهة فوراً. لا يمكن التراجع."
            : "سيتم إلغاء التحويل دون أي تأثير على المخزون. لا يمكن التراجع."
        }
        confirmLabel={actionTarget?.action === "COMPLETED" ? "تأكيد الإتمام" : "تأكيد الإلغاء"}
        loading={acting}
        onConfirm={confirmAction}
        onCancel={() => setActionTarget(null)}
      />
    </div>
  );
}
