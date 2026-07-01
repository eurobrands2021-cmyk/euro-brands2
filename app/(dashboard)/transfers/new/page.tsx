"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPost } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { Card } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput } from "@/components/ui/inputs";
import { cn } from "@/lib/cn";
import { BRANCHES, BRANCH_LABELS, type BranchValue } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type { ProductDTO, StockTransferDTO } from "@/lib/types";

interface TransferItemRow {
  variantId: string;
  productId: string;
  productName: string;
  brand: string;
  size: string;
  color: string | null;
  available: number;
  quantity: number;
}

export default function NewTransferPage() {
  const router = useRouter();
  const [fromBranch, setFromBranch] = useState<BranchValue | "">("");
  const [toBranch, setToBranch] = useState<BranchValue | "">("");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<TransferItemRow[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const url =
    fromBranch && debounced.length >= 1
      ? `/api/products?branch=${fromBranch}&search=${encodeURIComponent(debounced)}`
      : null;
  const { data, loading } = useFetch<ProductDTO[]>(url);
  const results = data ?? [];

  function addVariant(product: ProductDTO, variant: ProductDTO["variants"][0]) {
    if (variant.quantity <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === variant.id);
      if (existing) {
        if (existing.quantity >= variant.quantity) {
          toast.error("لا توجد كمية إضافية متاحة");
          return prev;
        }
        return prev.map((i) =>
          i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          productId: product.id,
          productName: product.name,
          brand: product.brand,
          size: variant.size,
          color: variant.color ?? null,
          available: variant.quantity,
          quantity: 1,
        },
      ];
    });
  }

  function setQty(variantId: string, qty: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.variantId === variantId
          ? { ...i, quantity: Math.min(Math.max(1, qty), i.available) }
          : i
      )
    );
  }

  function removeItem(variantId: string) {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const toBranchOptions = BRANCHES.filter((b) => b !== fromBranch);

  async function submit() {
    if (!fromBranch) return toast.error("اختر فرع المصدر");
    if (!toBranch) return toast.error("اختر فرع الوجهة");
    if (fromBranch === toBranch)
      return toast.error("فرع المصدر والوجهة يجب أن يكونا مختلفين");
    if (items.length === 0) return toast.error("أضف صنفاً واحداً على الأقل");

    setSubmitting(true);
    try {
      const transfer = await apiPost<StockTransferDTO>("/api/transfers", {
        fromBranch,
        toBranch,
        notes: notes || null,
        createdBy: getSession()?.name ?? null,
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      });
      void logActivity(
        ACTIVITY_ACTIONS.CREATE_TRANSFER,
        `${BRANCH_LABELS[fromBranch]} ← ${BRANCH_LABELS[toBranch]} — ${formatNumber(
          totalQty
        )} قطعة`
      );
      toast.success("تم إنشاء التحويل (قيد الانتظار)");
      router.push(`/transfers/${transfer.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إنشاء التحويل");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/transfers"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع إلى التحويلات
        </Link>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* اختيار الفروع والبحث */}
        <div className="order-1 flex-1 md:order-2">
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">من فرع *</label>
                <select
                  className="input"
                  value={fromBranch}
                  onChange={(e) => {
                    const v = e.target.value as BranchValue | "";
                    setFromBranch(v);
                    if (v === toBranch) setToBranch("");
                    setItems([]);
                  }}
                >
                  <option value="">اختر الفرع</option>
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {BRANCH_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">إلى فرع *</label>
                <select
                  className="input"
                  value={toBranch}
                  disabled={!fromBranch}
                  onChange={(e) => setToBranch(e.target.value as BranchValue | "")}
                >
                  <option value="">اختر الفرع</option>
                  {toBranchOptions.map((b) => (
                    <option key={b} value={b}>
                      {BRANCH_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="label">ملاحظات</label>
              <textarea
                className="input min-h-[52px] resize-y"
                placeholder="ملاحظة اختيارية على التحويل..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="mt-4 border-t pt-4">
              <label className="label">بحث عن منتجات في فرع المصدر</label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  className="input pr-9"
                  placeholder={
                    fromBranch ? "ابحث بالاسم أو البراند أو الكود..." : "اختر فرع المصدر أولاً"
                  }
                  value={term}
                  disabled={!fromBranch}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </div>

              <div className="mt-3">
                {!fromBranch ? (
                  <p className="py-6 text-center text-sm text-muted">
                    اختر فرع المصدر لعرض المنتجات المتاحة فيه.
                  </p>
                ) : loading ? (
                  <PageLoader label="جاري البحث..." />
                ) : results.length === 0 ? (
                  <EmptyState
                    icon={<Package className="h-7 w-7" />}
                    title="لا توجد منتجات"
                    description={
                      debounced
                        ? `لا توجد منتجات مطابقة لـ "${debounced}" في هذا الفرع.`
                        : "ابدأ الكتابة للبحث عن منتجات في فرع المصدر."
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {results.map((product) => (
                      <SearchResult
                        key={product.id}
                        product={product}
                        items={items}
                        onAdd={addVariant}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* أصناف التحويل */}
        <div className="order-2 w-full md:order-1 md:w-[400px] md:shrink-0">
          <Card className="p-4 md:sticky md:top-20" tone="accent">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-text">أصناف التحويل</h2>
              {items.length > 0 && (
                <span className="badge bg-accent-soft text-accent nums">
                  {formatNumber(totalQty)} قطعة
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted">
                لم تتم إضافة أصناف بعد.
                <br />
                ابحث وأضف الأصناف من القائمة.
              </div>
            ) : (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pl-1">
                {items.map((item) => (
                  <div key={item.variantId} className="rounded-lg border bg-bg p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">
                          {item.productName}
                        </p>
                        <p className="text-xs text-muted nums">
                          مقاس {item.size}
                          {item.color ? ` / ${item.color}` : ""} · المتاح:{" "}
                          {formatNumber(item.available)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeItem(item.variantId)}
                        className="-mr-1 flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-2)] hover:text-danger"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        onClick={() => setQty(item.variantId, item.quantity - 1)}
                        className="flex h-10 w-10 items-center justify-center rounded-md border text-muted hover:text-text"
                        aria-label="إنقاص"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <NumberInput
                        value={String(item.quantity)}
                        max={item.available}
                        onChange={(v) => setQty(item.variantId, Number(v) || 1)}
                        className="input h-10 w-16 px-1 text-center nums"
                      />
                      <button
                        onClick={() => setQty(item.variantId, item.quantity + 1)}
                        disabled={item.quantity >= item.available}
                        className="flex h-10 w-10 items-center justify-center rounded-md border text-muted hover:text-text disabled:opacity-30"
                        aria-label="زيادة"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || items.length === 0}
              className="btn btn-primary mt-4 h-11 w-full text-base"
            >
              {submitting ? <Spinner className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              إنشاء التحويل
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SearchResult({
  product,
  items,
  onAdd,
}: {
  product: ProductDTO;
  items: TransferItemRow[];
  onAdd: (p: ProductDTO, v: ProductDTO["variants"][0]) => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]">
          {product.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <Package className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text">{product.name}</p>
          <p className="text-xs text-muted">{product.brand}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {product.variants.map((v) => {
          const inCart = items.find((i) => i.variantId === v.id)?.quantity ?? 0;
          const out = v.quantity <= 0;
          const maxed = inCart >= v.quantity;
          return (
            <button
              key={v.id}
              disabled={out || maxed}
              onClick={() => onAdd(product, v)}
              title={out ? "نفذت الكمية" : `المتاح: ${v.quantity}`}
              className={cn(
                "inline-flex min-h-[44px] min-w-[3.5rem] items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                out
                  ? "cursor-not-allowed text-muted line-through opacity-60"
                  : "hover:border-accent hover:bg-accent-soft hover:text-accent active:bg-accent-soft",
                inCart > 0 && !out && "border-accent bg-accent-soft text-accent"
              )}
            >
              <span className="nums">
                {v.size}
                {v.color ? ` / ${v.color}` : ""}
              </span>
              <span className="mr-1 text-xs text-muted nums">
                ({out ? "نفذ" : v.quantity})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
