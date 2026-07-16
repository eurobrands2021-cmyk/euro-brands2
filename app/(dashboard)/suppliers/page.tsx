"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Search,
  PackagePlus,
  History,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, StatCard } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { RowsSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput } from "@/components/ui/inputs";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import {
  BRANCHES,
  BRANCH_LABELS,
  type BranchValue,
} from "@/lib/constants";
import type {
  SupplierDTO,
  ProductDTO,
  VariantDTO,
  StockReceiptDTO,
  StockReceiptsListResponse,
} from "@/lib/types";

type Tab = "receive" | "suppliers" | "history";

export default function SuppliersPage() {
  const [tab, setTab] = useState<Tab>("receive");
  const {
    data: suppliersData,
    loading: suppliersLoading,
    refetch: refetchSuppliers,
  } = useFetch<{ suppliers: SupplierDTO[]; total: number }>("/api/suppliers");
  const suppliers = suppliersData?.suppliers ?? [];

  const tabs: { key: Tab; label: string; icon: typeof Truck }[] = [
    { key: "receive", label: "استلام بضاعة", icon: PackagePlus },
    { key: "suppliers", label: "الموردون", icon: Truck },
    { key: "history", label: "سجل الاستلام", icon: History },
  ];

  return (
    <div>
      <PageHeader
        title="الموردون واستلام البضاعة"
        description="إدارة الموردين، استلام البضاعة وتحديث المخزون والتكلفة (متوسط مرجّح)"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "btn " + (tab === t.key ? "btn-primary" : "btn-secondary")
            }
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "receive" && (
        <ReceiveTab
          suppliers={suppliers}
          suppliersLoading={suppliersLoading}
        />
      )}
      {tab === "suppliers" && (
        <SuppliersTab
          suppliers={suppliers}
          loading={suppliersLoading}
          onChanged={refetchSuppliers}
        />
      )}
      {tab === "history" && <HistoryTab suppliers={suppliers} />}
    </div>
  );
}

// ====================================================
//  استلام بضاعة
// ====================================================
interface DraftItem {
  variantId: string;
  productName: string;
  label: string; // مقاس/لون
  quantity: string;
  unitCost: string;
}

function ReceiveTab({
  suppliers,
  suppliersLoading,
}: {
  suppliers: SupplierDTO[];
  suppliersLoading: boolean;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [branch, setBranch] = useState<BranchValue>("HADAYEK");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () =>
      items.reduce(
        (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0),
        0
      ),
    [items]
  );

  function addItem(variant: VariantDTO, productName: string) {
    if (items.some((it) => it.variantId === variant.id)) {
      toast.error("هذا الصنف مضاف بالفعل");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        variantId: variant.id,
        productName,
        label: `${variant.size}${variant.color ? " / " + variant.color : ""} — ${BRANCH_LABELS[variant.branch]}`,
        quantity: "1",
        unitCost: variant.cost ? String(variant.cost) : "",
      },
    ]);
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it) => (it.variantId === id ? { ...it, ...patch } : it))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.variantId !== id));
  }

  async function submit() {
    if (!supplierId) {
      toast.error("اختر المورد");
      return;
    }
    if (items.length === 0) {
      toast.error("أضف صنفاً واحداً على الأقل");
      return;
    }
    for (const it of items) {
      if (!Number(it.quantity) || Number(it.quantity) <= 0) {
        toast.error(`كمية غير صحيحة لصنف ${it.productName}`);
        return;
      }
    }
    setSaving(true);
    try {
      await apiPost<StockReceiptDTO>("/api/stock-receipts", {
        supplierId,
        branch,
        invoiceNumber: invoiceNumber.trim() || null,
        notes: notes.trim() || null,
        createdBy: getSession()?.name ?? null,
        items: items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          unitCost: it.unitCost || "0",
        })),
      });
      toast.success("تم استلام البضاعة وتحديث المخزون");
      setItems([]);
      setInvoiceNumber("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الاستلام");
    } finally {
      setSaving(false);
    }
  }

  if (suppliersLoading) return <PageLoader />;

  if (suppliers.length === 0)
    return (
      <EmptyState
        icon={<Truck className="h-8 w-8" />}
        title="لا يوجد موردون"
        description="أضف مورداً أولاً من تبويب «الموردون» ثم ابدأ الاستلام"
      />
    );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-5">
          <h3 className="mb-3 font-bold text-text">بيانات الاستلام</h3>
          <div className="space-y-3">
            <div>
              <label className="label">المورد</label>
              <select
                className="input"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">— اختر المورد —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الفرع المستلِم</label>
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
              <label className="label">رقم فاتورة المورد (اختياري)</label>
              <input
                className="input"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="label">ملاحظات (اختياري)</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </Card>

        <ProductPicker branch={branch} onPick={addItem} />
      </div>

      <div className="lg:col-span-3">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-text">
              الأصناف المستلَمة ({formatNumber(items.length)})
            </h3>
            <span className="text-lg font-extrabold text-accent nums">
              {formatCurrency(total)}
            </span>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<PackagePlus className="h-8 w-8" />}
              title="لم تُضف أصناف بعد"
              description="ابحث عن منتج واختر الصنف لإضافته للاستلام"
            />
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div
                  key={it.variantId}
                  className="rounded-[var(--radius-md)] border p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">
                        {it.productName}
                      </p>
                      <p className="text-xs text-muted">{it.label}</p>
                    </div>
                    <button
                      className="btn btn-ghost h-8 w-8 !px-0 text-danger"
                      onClick={() => removeItem(it.variantId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="w-24">
                      <label className="label text-xs">الكمية</label>
                      <NumberInput
                        className="input"
                        value={it.quantity}
                        onChange={(v) => updateItem(it.variantId, { quantity: v })}
                      />
                    </div>
                    <div className="w-28">
                      <label className="label text-xs">تكلفة الوحدة</label>
                      <NumberInput
                        decimal
                        className="input"
                        value={it.unitCost}
                        onChange={(v) => updateItem(it.variantId, { unitCost: v })}
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-xs text-muted">الإجمالي</p>
                      <p className="font-bold text-text nums">
                        {formatCurrency(
                          (Number(it.quantity) || 0) *
                            (Number(it.unitCost) || 0)
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn-primary mt-4 w-full"
            onClick={submit}
            disabled={saving || items.length === 0}
          >
            {saving ? "جارٍ الاستلام…" : "تأكيد الاستلام وتحديث المخزون"}
          </button>
        </Card>
      </div>
    </div>
  );
}

// بحث منتج → اختيار صنف بفرع الاستلام
function ProductPicker({
  branch,
  onPick,
}: {
  branch: BranchValue;
  onPick: (v: VariantDTO, productName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [product, setProduct] = useState<ProductDTO | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searchUrl =
    debounced.length >= 2
      ? `/api/products?search=${encodeURIComponent(debounced)}&limit=8`
      : null;
  const { data, loading } = useFetch<ProductDTO[]>(searchUrl);
  const results = data ?? [];

  const branchVariants = product?.variants.filter((v) => v.branch === branch) ?? [];

  return (
    <Card className="p-5">
      <h3 className="mb-3 font-bold text-text">إضافة صنف</h3>
      {!product ? (
        <div>
          <label className="label">ابحث عن المنتج</label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pr-9"
              placeholder="الاسم أو البراند…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {debounced.length >= 2 && (
            <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
              {loading ? (
                <RowsSkeleton rows={3} className="p-2" />
              ) : results.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted">لا توجد نتائج</p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-right last:border-0 hover:bg-[var(--surface-2)]"
                    onClick={() => {
                      setProduct(p);
                      setQuery("");
                    }}
                  >
                    <span className="font-medium text-text">{p.name}</span>
                    <span className="text-xs text-muted">{p.brand}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-text">{product.name}</p>
              <p className="text-xs text-muted">{product.brand}</p>
            </div>
            <button
              className="btn btn-ghost h-8 w-8 !px-0"
              onClick={() => setProduct(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-2 text-xs text-muted">
            أصناف فرع {BRANCH_LABELS[branch]}:
          </p>
          {branchVariants.length === 0 ? (
            <p className="rounded-lg border p-3 text-center text-sm text-muted">
              لا توجد أصناف لهذا المنتج في فرع {BRANCH_LABELS[branch]}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {branchVariants.map((v) => (
                <button
                  key={v.id}
                  className="btn btn-secondary"
                  onClick={() => onPick(v, product.name)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {v.size}
                  {v.color ? ` / ${v.color}` : ""}
                  <span className="text-xs text-muted">({v.quantity})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ====================================================
//  إدارة الموردين
// ====================================================
function SuppliersTab({
  suppliers,
  loading,
  onChanged,
}: {
  suppliers: SupplierDTO[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<SupplierDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SupplierDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/suppliers/${pendingDelete.id}`);
      toast.success("تم حذف المورد");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> مورد جديد
        </button>
      </div>

      {loading ? (
        <PageLoader />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-8 w-8" />}
          title="لا يوجد موردون"
          description="أضف أول مورد للبدء"
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[var(--surface-2)] text-right text-xs text-muted">
                  <th className="px-4 py-3 font-medium">الاسم</th>
                  <th className="px-4 py-3 font-medium">الهاتف</th>
                  <th className="px-4 py-3 font-medium">عدد الاستلامات</th>
                  <th className="px-4 py-3 font-medium">ملاحظات</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium text-text">{s.name}</td>
                    <td className="px-4 py-3 text-muted nums">
                      {s.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted nums">
                      {formatNumber(s.receiptsCount ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-muted">{s.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost h-9 w-9 !px-0"
                          onClick={() => setEditing(s)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="btn btn-ghost h-9 w-9 !px-0 text-danger"
                          onClick={() => setPendingDelete(s)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(creating || editing) && (
        <SupplierModal
          supplier={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف المورد"
        message={`هل تريد حذف المورد «${pendingDelete?.name ?? ""}»؟`}
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: SupplierDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("اسم المورد مطلوب");
      return;
    }
    setSaving(true);
    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (supplier) await apiPut(`/api/suppliers/${supplier.id}`, body);
      else await apiPost("/api/suppliers", body);
      toast.success(supplier ? "تم تعديل المورد" : "تمت إضافة المورد");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={supplier ? "تعديل مورد" : "مورد جديد"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">الاسم</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">الهاتف (اختياري)</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="label">ملاحظات (اختياري)</label>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-primary flex-1"
            onClick={save}
            disabled={saving}
          >
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ====================================================
//  سجل الاستلام
// ====================================================
function HistoryTab({ suppliers }: { suppliers: SupplierDTO[] }) {
  const [supplierId, setSupplierId] = useState("");
  const [branch, setBranch] = useState<BranchValue | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (supplierId) p.set("supplierId", supplierId);
    if (branch) p.set("branch", branch);
    if (from) p.set("from", new Date(from).toISOString());
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      p.set("to", d.toISOString());
    }
    return p.toString();
  }, [supplierId, branch, from, to]);

  const { data, loading } = useFetch<StockReceiptsListResponse>(
    `/api/stock-receipts?${query}`
  );

  return (
    <div>
      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            title="عدد عمليات الاستلام"
            value={formatNumber(data.summary.count)}
            tone="accent"
          />
          <StatCard
            title="إجمالي التكلفة"
            value={formatCurrency(data.summary.totalCost)}
            tone="warning"
          />
          <StatCard
            title="إجمالي الكميات"
            value={formatNumber(data.summary.totalQuantity)}
            tone="success"
          />
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <label className="label">المورد</label>
            <select
              className="input"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">كل الموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="label">الفرع</label>
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
          <div className="min-w-[130px]">
            <label className="label">من</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="min-w-[130px]">
            <label className="label">إلى</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <PageLoader />
      ) : !data || data.receipts.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="لا توجد عمليات استلام"
          description="ستظهر هنا عمليات استلام البضاعة"
        />
      ) : (
        <div className="space-y-3">
          {data.receipts.map((r) => (
            <ReceiptRow key={r.id} receipt={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReceiptRow({ receipt }: { receipt: StockReceiptDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0">
      <button
        className="flex w-full items-center justify-between gap-3 p-4 text-right"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <p className="font-bold text-text">{receipt.supplierName}</p>
          <p className="text-xs text-muted">
            {formatDateTime(receipt.createdAt)} — {BRANCH_LABELS[receipt.branch]}
            {receipt.invoiceNumber ? ` — فاتورة ${receipt.invoiceNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <p className="font-extrabold text-accent nums">
              {formatCurrency(receipt.totalCost)}
            </p>
            <p className="text-xs text-muted nums">
              {formatNumber(receipt.quantity)} قطعة
            </p>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </div>
      </button>
      {open && (
        <div className="border-t px-4 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-muted">
                <th className="py-1 font-medium">المنتج</th>
                <th className="py-1 font-medium">الصنف</th>
                <th className="py-1 font-medium">الكمية</th>
                <th className="py-1 font-medium">تكلفة الوحدة</th>
                <th className="py-1 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="py-2">{it.productName}</td>
                  <td className="py-2 text-muted">
                    {it.size}
                    {it.color ? ` / ${it.color}` : ""}
                  </td>
                  <td className="py-2 nums">{formatNumber(it.quantity)}</td>
                  <td className="py-2 nums">{formatCurrency(it.unitCost)}</td>
                  <td className="py-2 font-medium nums">
                    {formatCurrency(it.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {receipt.notes && (
            <p className="mt-2 text-xs text-muted">ملاحظات: {receipt.notes}</p>
          )}
        </div>
      )}
    </Card>
  );
}
