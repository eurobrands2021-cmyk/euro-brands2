"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Ban, CheckCircle2, FileText, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPut } from "@/lib/client";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { Card } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { BranchBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import {
  BRANCH_LABELS,
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

export default function TransferDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error, refetch, setData } = useFetch<StockTransferDTO>(
    `/api/transfers/${params.id}`
  );
  const [action, setAction] = useState<"COMPLETED" | "CANCELLED" | null>(null);
  const [acting, setActing] = useState(false);

  async function confirmAction() {
    if (!action || !data) return;
    setActing(true);
    try {
      const updated = await apiPut<StockTransferDTO>(`/api/transfers/${data.id}`, {
        status: action,
      });
      void logActivity(
        action === "COMPLETED"
          ? ACTIVITY_ACTIONS.COMPLETE_TRANSFER
          : ACTIVITY_ACTIONS.CANCEL_TRANSFER,
        `تحويل ${transferLabel(data.id)} — ${BRANCH_LABELS[data.fromBranch]} ← ${
          BRANCH_LABELS[data.toBranch]
        }`
      );
      toast.success(
        action === "COMPLETED" ? "تم إتمام التحويل وتحديث المخزون" : "تم إلغاء التحويل"
      );
      setData(updated);
      setAction(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تنفيذ العملية");
      refetch();
    } finally {
      setActing(false);
    }
  }

  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <Card className="p-6 text-center text-danger">
        {error || "التحويل غير موجود"}
      </Card>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/transfers"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع إلى التحويلات
        </Link>
        <div className="flex items-center gap-2">
          {data.status === "PENDING" && (
            <>
              <button
                onClick={() => setAction("COMPLETED")}
                className="btn btn-secondary h-9 text-sm text-success"
              >
                <CheckCircle2 className="h-4 w-4" />
                إتمام
              </button>
              <button
                onClick={() => setAction("CANCELLED")}
                className="btn btn-secondary h-9 text-sm text-danger"
              >
                <Ban className="h-4 w-4" />
                إلغاء
              </button>
            </>
          )}
          <button onClick={() => window.print()} className="btn btn-secondary h-9 text-sm">
            <Printer className="h-4 w-4" />
            طباعة
          </button>
        </div>
      </div>

      <Card className="p-6" tone="accent">
        {/* الترويسة */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-extrabold text-white">
                EB
              </span>
              <span className="text-lg font-extrabold text-text">Euro Brands</span>
            </div>
            <p className="mt-2 text-sm text-muted nums">{formatDateTime(data.createdAt)}</p>
            {data.completedAt && (
              <p className="mt-0.5 text-xs text-muted nums">
                تم الإتمام: {formatDateTime(data.completedAt)}
              </p>
            )}
          </div>
          <div className="text-left">
            <p className="text-2xl font-extrabold text-accent nums">
              {transferLabel(data.id)}
            </p>
            <div className="mt-1">
              <span className={cn("badge", STATUS_STYLE[data.status])}>
                {STOCK_TRANSFER_STATUS_LABELS[data.status]}
              </span>
            </div>
          </div>
        </div>

        {/* الفروع */}
        <div className="flex flex-wrap items-center gap-3 border-b py-4 text-sm">
          <div>
            <p className="mb-1 text-xs text-muted">من فرع</p>
            <BranchBadge branch={data.fromBranch} />
          </div>
          <ArrowRight className="h-4 w-4 text-muted" />
          <div>
            <p className="mb-1 text-xs text-muted">إلى فرع</p>
            <BranchBadge branch={data.toBranch} />
          </div>
          {data.createdBy && (
            <div className="mr-auto">
              <p className="mb-1 text-xs text-muted">بواسطة</p>
              <p className="text-text">{data.createdBy}</p>
            </div>
          )}
        </div>

        {data.notes && (
          <div className="flex items-start gap-1.5 border-b py-4 text-sm text-text">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            {data.notes}
          </div>
        )}

        {/* الأصناف — جدول لسطح المكتب */}
        <div className="hidden overflow-x-auto py-4 sm:block">
          <table className="w-full min-w-[480px] text-right text-sm">
            <thead>
              <tr className="border-b text-muted">
                <th className="px-2 py-2 font-medium">المنتج</th>
                <th className="px-2 py-2 font-medium">المقاس</th>
                <th className="px-2 py-2 font-medium">الكود</th>
                <th className="px-2 py-2 font-medium">الكمية</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]">
                  <td className="px-2 py-3">
                    <p className="font-medium text-text">{item.productName}</p>
                    <p className="text-xs text-muted">{item.brand}</p>
                  </td>
                  <td className="px-2 py-3 text-text">
                    <span className="nums">{item.size}</span>
                    {item.color && <span className="text-muted"> / {item.color}</span>}
                  </td>
                  <td className="px-2 py-3 text-muted nums">{item.sku || "—"}</td>
                  <td className="px-2 py-3 font-bold text-text nums">
                    {formatNumber(item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* الأصناف — بطاقات للموبايل */}
        <div className="space-y-2 py-4 sm:hidden">
          {data.items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-text">{item.productName}</p>
                  <p className="text-xs text-muted">
                    {item.brand} · مقاس <span className="nums">{item.size}</span>
                    {item.color && ` · ${item.color}`}
                  </p>
                </div>
                <p className="font-bold text-text nums">{formatNumber(item.quantity)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between border-t pt-4 text-base font-extrabold text-text">
          <span>إجمالي القطع المحوّلة</span>
          <span className="nums">{formatNumber(data.itemsCount)}</span>
        </div>
      </Card>

      <ConfirmDialog
        open={!!action}
        title={action === "COMPLETED" ? "إتمام التحويل" : "إلغاء التحويل"}
        message={
          action === "COMPLETED"
            ? "سيتم خصم الكميات من فرع المصدر وإضافتها لفرع الوجهة فوراً. لا يمكن التراجع."
            : "سيتم إلغاء التحويل دون أي تأثير على المخزون. لا يمكن التراجع."
        }
        confirmLabel={action === "COMPLETED" ? "تأكيد الإتمام" : "تأكيد الإلغاء"}
        loading={acting}
        onConfirm={confirmAction}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}
