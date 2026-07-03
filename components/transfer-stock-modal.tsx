"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { NumberInput } from "@/components/ui/inputs";
import { apiPost } from "@/lib/client";
import { BRANCHES, BRANCH_LABELS, type BranchValue } from "@/lib/constants";
import type { ProductDTO, VariantDTO } from "@/lib/types";

function variantLabel(v: VariantDTO): string {
  const color = v.color ? ` / ${v.color}` : "";
  return `${v.size}${color} — ${BRANCH_LABELS[v.branch]} — متاح: ${v.quantity}`;
}

// نافذة تحويل مخزون بين الفرعين — تخصم من فرع المصدر وتضيف لفرع الوجهة
export function TransferStockModal({
  open,
  onClose,
  products,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductDTO[];
  onDone: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [toBranch, setToBranch] = useState<BranchValue | "">("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );
  const variant = useMemo(
    () => product?.variants.find((v) => v.id === variantId) ?? null,
    [product, variantId]
  );

  // الفروع الممكنة كوجهة = كل الفروع عدا فرع المصدر
  const destBranches = useMemo(
    () => (variant ? BRANCHES.filter((b) => b !== variant.branch) : []),
    [variant]
  );

  function reset() {
    setProductId("");
    setVariantId("");
    setToBranch("");
    setQuantity("1");
    setNotes("");
  }

  async function submit() {
    if (!productId) return toast.error("اختر المنتج");
    if (!variantId) return toast.error("اختر الصنف (المصدر)");
    if (!toBranch) return toast.error("اختر فرع الوجهة");
    const qty = Math.floor(Number(quantity) || 0);
    if (qty <= 0) return toast.error("الكمية يجب أن تكون أكبر من صفر");
    if (variant && qty > variant.quantity)
      return toast.error(`الكمية المتاحة في المصدر ${variant.quantity} فقط`);
    setSaving(true);
    try {
      await apiPost("/api/transfers", {
        productId,
        variantId,
        toBranch,
        quantity: qty,
        notes: notes.trim() || null,
      });
      toast.success("تم تحويل المخزون بين الفرعين");
      reset();
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحويل المخزون");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="تحويل مخزون بين الفرعين"
      footer={
        <>
          <button
            className="btn btn-primary w-full sm:w-auto"
            onClick={submit}
            disabled={saving}
          >
            {saving && <Spinner className="h-4 w-4" />}
            تحويل
          </button>
          <button
            className="btn btn-secondary w-full sm:w-auto"
            onClick={onClose}
            disabled={saving}
          >
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">المنتج</label>
          <select
            className="input"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setVariantId("");
              setToBranch("");
            }}
          >
            <option value="">اختر المنتج...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.brand}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">الصنف المصدر (المقاس / الفرع)</label>
          <select
            className="input"
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setToBranch("");
            }}
            disabled={!product}
          >
            <option value="">اختر الصنف...</option>
            {product?.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {variantLabel(v)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">إلى فرع</label>
          <select
            className="input"
            value={toBranch}
            onChange={(e) => setToBranch(e.target.value as BranchValue)}
            disabled={!variant}
          >
            <option value="">اختر فرع الوجهة...</option>
            {destBranches.map((b) => (
              <option key={b} value={b}>
                {BRANCH_LABELS[b]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">الكمية المحوّلة</label>
          <NumberInput
            className="input nums"
            value={quantity}
            onChange={setQuantity}
          />
          {variant && (
            <p className="mt-1 text-xs text-muted">
              المتاح في فرع المصدر: {variant.quantity}
            </p>
          )}
        </div>

        <div>
          <label className="label">ملاحظات (اختياري)</label>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="سبب التحويل / رقم إذن..."
          />
        </div>
      </div>
    </Modal>
  );
}
