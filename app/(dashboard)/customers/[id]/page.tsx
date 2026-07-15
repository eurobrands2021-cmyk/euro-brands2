"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  Phone,
  Repeat,
  Wallet,
  Clock,
  Pencil,
  Save,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPut } from "@/lib/client";
import { useHistoryPagination } from "@/lib/use-history-pagination";
import {
  HistoryDateFilter,
  HistoryPager,
} from "@/components/ui/history-toolbar";
import { Card, StatCard } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchBadge } from "@/components/ui/badge";
import { SalesTable } from "@/components/sales-table";
import { TextOnlyInput } from "@/components/ui/inputs";
import {
  BRANCHES,
  BRANCH_LABELS,
  type BranchValue,
} from "@/lib/constants";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import type { CustomerDetailDTO } from "@/lib/types";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { from, to, setFrom, setTo, page, setPage, pageSize, params: pageParams, hasDateFilter, clearDates } =
    useHistoryPagination();
  const { data, loading, error, setData } = useFetch<CustomerDetailDTO>(
    `/api/customers/${params.id}?${pageParams.toString()}`
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [branch, setBranch] = useState<BranchValue | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setNotes(data.notes ?? "");
      setBranch(data.branch ?? "");
    }
  }, [data]);

  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <Card className="p-6 text-center text-danger">
        {error || "العميل غير موجود"}
      </Card>
    );

  async function saveEdits() {
    if (!name.trim()) return toast.error("اسم العميل مطلوب");
    setSaving(true);
    try {
      const updated = await apiPut<CustomerDetailDTO>(
        `/api/customers/${params.id}`,
        {
          name: name.trim(),
          notes: notes.trim() || null,
          branch: branch || null,
        }
      );
      setData((prev) => (prev ? { ...prev, ...updated } : prev));
      toast.success("تم حفظ التعديلات");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع إلى العملاء
        </Link>
      </div>

      <Card className="mb-6 p-5" tone="accent">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editing ? (
              <TextOnlyInput
                className="input text-lg font-bold"
                value={name}
                onChange={setName}
                placeholder="اسم العميل"
              />
            ) : (
              <h1 className="text-xl font-extrabold text-text">{data.name}</h1>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted nums">
              <Phone className="h-4 w-4" />
              {data.phone || "بدون رقم"}
            </p>
          </div>

          {editing ? (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={saveEdits}
                disabled={saving}
                className="btn btn-primary h-9 text-xs"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                حفظ
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setName(data.name);
                  setNotes(data.notes ?? "");
                  setBranch(data.branch ?? "");
                }}
                className="btn btn-secondary h-9 text-xs"
              >
                <X className="h-4 w-4" />
                إلغاء
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="btn btn-secondary h-9 shrink-0 text-xs"
            >
              <Pencil className="h-4 w-4" />
              تعديل
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">الفرع المعتاد</label>
              <select
                className="input"
                value={branch}
                onChange={(e) => setBranch(e.target.value as BranchValue | "")}
              >
                <option value="">— غير محدد —</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {BRANCH_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">ملاحظات</label>
              <textarea
                className="input min-h-[70px] resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات عن العميل..."
              />
            </div>
          </div>
        ) : (
          <>
            {data.branch && (
              <div className="mt-3">
                <BranchBadge branch={data.branch} />
              </div>
            )}
            {data.notes && (
              <p className="mt-3 rounded-lg border bg-bg p-3 text-sm text-text">
                {data.notes}
              </p>
            )}
          </>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="عدد الزيارات"
          value={formatNumber(data.visitCount)}
          icon={<Repeat className="h-5 w-5" />}
        />
        <StatCard
          title="إجمالي الإنفاق"
          value={formatCurrency(data.totalSpent)}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          title="آخر زيارة"
          value={data.lastVisitAt ? formatDateTime(data.lastVisitAt) : "—"}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-bold text-text">تاريخ المشتريات</h2>
        <HistoryDateFilter
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          onClear={clearDates}
          hasDateFilter={hasDateFilter}
        />
      </div>
      {data.sales.length === 0 ? (
        <EmptyState
          title={
            hasDateFilter
              ? "لا توجد فواتير ضمن النطاق المحدد"
              : "لا توجد فواتير لهذا العميل بعد"
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <SalesTable sales={data.sales} />
          <div className="px-4 pb-3">
            <HistoryPager
              page={page}
              perPage={pageSize}
              total={data.salesTotal}
              onPage={setPage}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
