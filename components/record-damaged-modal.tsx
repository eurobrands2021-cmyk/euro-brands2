"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { NumberInput } from "@/components/ui/inputs";
import { apiPost } from "@/lib/client";
import { BRANCH_LABELS } from "@/lib/constants";
import type { ProductDTO, VariantDTO } from "@/lib/types";

function variantLabel(v: VariantDTO): string {
  const color = v.color ? ` / ${v.color}` : "";
  return `${v.size}${color} — ${BRANCH_LABELS[v.branch]} — متاح: ${v.quantity}`;
}

// نافذة تسجيل ديفو (تالف/معيب) — تخصم الكمية من مخزون الصنف
export function RecordDamagedModal({
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
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );
  const variant = useMemo(
    () => product?.variants.find((v) => v.id === variantId) ?? null,
    [product, variantId]
  );

  function reset() {
    setProductId("");
    setVariantId("");
    setQuantity("1");
    setReason("");
  }

  async function submit() {
    if (!productId) return toast.error("اختر المنتج");
    if (!variantId) return toast.error("اختر الصنف (المقاس)");
    const qty = Math.floor(Number(quantity) || 0);
    if (qty <= 0) return toast.error("الكمية يجب أن تكون أكبر من صفر");
    if (variant && qty > variant.quantity)
      return toast.error(`الكمية المتاحة ${variant.quantity} فقط`);
    setSaving(true);
    try {
      await apiPost("/api/damaged", {
        productId,
        variantId,
        quantity: qty,
        reason: reason.trim() || null,
      });
      toast.success("تم تسجيل الديفو وخصمه من المخزون");
      reset();
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تسجيل الديفو");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="تسجيل ديفو (تالف/معيب)"
      footer={
        <>
          <button
            className="btn btn-primary w-full sm:w-auto"
            onClick={submit}
            disabled={saving}
          >
            {saving && <Spinner className="h-4 w-4" />}
            تسجيل وخصم
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
          <label className="label">الصنف (المقاس / الفرع)</label>
          <select
            className="input"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
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
          <label className="label">الكمية التالفة</label>
          <NumberInput
            className="input nums"
            value={quantity}
            onChange={setQuantity}
          />
          {variant && (
            <p className="mt-1 text-xs text-muted">
              المتاح في المخزون: {variant.quantity}
            </p>
          )}
        </div>

        <div>
          <label className="label">السبب (اختياري)</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="كسر / عيب تصنيع / تلف أثناء العرض..."
          />
        </div>
      </div>
    </Modal>
  );
}
