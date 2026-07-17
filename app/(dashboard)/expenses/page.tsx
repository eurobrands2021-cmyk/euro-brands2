"use client";

import { useMemo, useState } from "react";
import { Wallet, Plus, Trash2, Filter, X } from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPost, apiDelete } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, StatCard } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput } from "@/components/ui/inputs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import {
  BRANCHES,
  BRANCH_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type BranchValue,
  type ExpenseCategoryValue,
} from "@/lib/constants";
import type { ExpenseDTO, ExpensesListResponse } from "@/lib/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [branch, setBranch] = useState<BranchValue | "">("");
  const [category, setCategory] = useState<ExpenseCategoryValue | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (branch) p.set("branch", branch);
    if (category) p.set("category", category);
    if (from) p.set("from", new Date(from).toISOString());
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      p.set("to", d.toISOString());
    }
    return p.toString();
  }, [branch, category, from, to]);

  const { data, loading, refetch } = useFetch<ExpensesListResponse>(
    `/api/expenses?${query}`
  );
  const hasFilter = !!(branch || category || from || to);

  return (
    <div>
      <PageHeader
        title="المصروفات"
        description="تسجيل ومتابعة مصروفات الفرعين (إيجار/مرافق/رواتب/أخرى) — تدخل في حساب صافي الربح"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <AddExpenseCard onAdded={refetch} />
        </div>

        <div className="lg:col-span-3">
          {/* الملخّص */}
          {data && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                title="إجمالي المصروفات"
                value={formatCurrency(data.summary.totalAmount)}
                tone="warning"
              />
              <StatCard
                title="عدد العمليات"
                value={formatNumber(data.summary.count)}
                tone="accent"
              />
              {data.summary.byBranch.map((b) => (
                <StatCard
                  key={b.branch}
                  title={BRANCH_LABELS[b.branch]}
                  value={formatCurrency(b.total)}
                  tone="none"
                />
              ))}
            </div>
          )}

          {/* الفلاتر */}
          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[140px]">
                <label className="label">
                  <Filter className="ml-1 inline h-3.5 w-3.5" /> الفرع
                </label>
                <select
                  className="input"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value as BranchValue | "")}
                >
                  <option value="">كل الفروع</option>
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {BRANCH_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px]">
                <label className="label">الفئة</label>
                <select
                  className="input"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as ExpenseCategoryValue | "")
                  }
                >
                  <option value="">كل الفئات</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[130px]">
                <label className="label">من تاريخ</label>
                <input
                  type="date"
                  className="input nums"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="من تاريخ"
                />
              </div>
              <div className="min-w-[130px]">
                <label className="label">إلى تاريخ</label>
                <input
                  type="date"
                  className="input nums"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="إلى تاريخ"
                />
              </div>
              {hasFilter && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setBranch("");
                    setCategory("");
                    setFrom("");
                    setTo("");
                  }}
                >
                  <X className="h-4 w-4" /> مسح
                </button>
              )}
            </div>
          </Card>

          {loading ? (
            <PageLoader />
          ) : !data || data.expenses.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-8 w-8" />}
              title="لا توجد مصروفات"
              description="ابدأ بتسجيل أول مصروف من النموذج المجاور"
            />
          ) : (
            <ExpensesTable expenses={data.expenses} onDeleted={refetch} />
          )}
        </div>
      </div>
    </div>
  );
}

function AddExpenseCard({ onAdded }: { onAdded: () => void }) {
  const [branch, setBranch] = useState<BranchValue>("HADAYEK");
  const [category, setCategory] = useState<ExpenseCategoryValue>("rent");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("أدخل قيمة مصروف صحيحة");
      return;
    }
    setSaving(true);
    try {
      await apiPost<ExpenseDTO>("/api/expenses", {
        branch,
        category,
        amount,
        description: description.trim() || null,
        date: date ? new Date(date).toISOString() : null,
        createdBy: getSession()?.name ?? null,
      });
      toast.success("تم تسجيل المصروف");
      setAmount("");
      setDescription("");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التسجيل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone="accent" className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-text">
        <Plus className="h-5 w-5 text-accent" /> إضافة مصروف
      </h2>
      <div className="space-y-3">
        <div>
          <label className="label">الفرع</label>
          <select
            className="input"
            value={branch}
            onChange={(e) => setBranch(e.target.value as BranchValue)}
          >
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {BRANCH_LABELS[b]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">الفئة</label>
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategoryValue)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">القيمة (ج.م)</label>
          <NumberInput
            decimal
            className="input"
            value={amount}
            onChange={setAmount}
            placeholder="0"
          />
        </div>
        <div>
          <label className="label">التاريخ</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">الوصف (اختياري)</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="تفاصيل المصروف"
          />
        </div>
        <button
          className="btn btn-primary w-full"
          onClick={submit}
          disabled={saving}
        >
          {saving ? "جارٍ الحفظ…" : "تسجيل المصروف"}
        </button>
      </div>
    </Card>
  );
}

function ExpensesTable({
  expenses,
  onDeleted,
}: {
  expenses: ExpenseDTO[];
  onDeleted: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<ExpenseDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/expenses/${pendingDelete.id}`);
      toast.success("تم حذف المصروف");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--surface-2)] text-right text-xs text-muted">
              <th className="px-4 py-3 font-medium">التاريخ</th>
              <th className="px-4 py-3 font-medium">الفرع</th>
              <th className="px-4 py-3 font-medium">الفئة</th>
              <th className="px-4 py-3 font-medium">الوصف</th>
              <th className="px-4 py-3 font-medium">القيمة</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted nums">
                  {formatDate(e.date)}
                </td>
                <td className="px-4 py-3">{BRANCH_LABELS[e.branch]}</td>
                <td className="px-4 py-3">
                  <span className="badge bg-accent-soft text-accent">
                    {EXPENSE_CATEGORY_LABELS[e.category]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{e.description ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-text nums">
                  {formatCurrency(e.amount)}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="btn btn-ghost h-9 w-9 !px-0 text-danger"
                    onClick={() => setPendingDelete(e)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف المصروف"
        message={`هل تريد حذف مصروف ${
          pendingDelete ? formatCurrency(pendingDelete.amount) : ""
        }؟`}
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}
