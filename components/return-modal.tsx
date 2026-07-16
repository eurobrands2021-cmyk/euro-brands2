"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Repeat } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { apiGet, apiPost } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  REFUND_METHODS,
  REFUND_METHOD_LABELS,
  type ReturnTypeValue,
  type RefundMethodValue,
} from "@/lib/constants";
import type {
  ProductDTO,
  ReturnDTO,
  ReturnItemInput,
  SaleDTO,
  VariantDTO,
} from "@/lib/types";

interface RowState {
  qty: number;
  exchangeVariantId: string;
}

// نافذة إرجاع/استبدال أصناف من فاتورة قائمة (جزئي — بند واحد أو أكثر).
export function ReturnModal({
  sale,
  returns,
  open,
  onClose,
  onDone,
}: {
  sale: SaleDTO;
  returns: ReturnDTO[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<ReturnTypeValue>("RETURN");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethodValue>("CASH");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [variantsByProduct, setVariantsByProduct] = useState<
    Record<string, VariantDTO[]>
  >({});
  const [busy, setBusy] = useState(false);

  // كمية مُرتجعة سابقاً لكل بند (من سجل المرتجعات) لتحديد المتبقي القابل للإرجاع
  const alreadyReturned = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of returns)
      for (const it of r.items)
        m.set(it.saleItemId, (m.get(it.saleItemId) ?? 0) + it.quantity);
    return m;
  }, [returns]);

  const remainingOf = (itemId: string, original: number) =>
    original - (alreadyReturned.get(itemId) ?? 0);

  // إعادة الضبط عند كل فتح
  useEffect(() => {
    if (open) {
      setType("RETURN");
      setReason("");
      setRefundMethod("CASH");
      setRows({});
    }
  }, [open]);

  // جلب أصناف المنتجات (للاستبدال) — البدائل هي أصناف نفس المنتج في نفس الفرع
  useEffect(() => {
    if (!open || type !== "EXCHANGE") return;
    const ids = [...new Set(sale.items.map((it) => it.productId))].filter(
      (id) => !variantsByProduct[id]
    );
    if (ids.length === 0) return;
    let alive = true;
    Promise.all(
      ids.map((id) =>
        apiGet<ProductDTO>(`/api/products/${id}`)
          .then((p) => [id, p.variants] as const)
          .catch(() => [id, [] as VariantDTO[]] as const)
      )
    ).then((pairs) => {
      if (!alive) return;
      setVariantsByProduct((prev) => {
        const next = { ...prev };
        for (const [id, vs] of pairs) next[id] = vs;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [open, type, sale.items, variantsByProduct]);

  const ratio = sale.totalAmount > 0 ? sale.finalAmount / sale.totalAmount : 1;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const setQty = (itemId: string, qty: number) =>
    setRows((prev) => ({
      ...prev,
      [itemId]: { qty, exchangeVariantId: prev[itemId]?.exchangeVariantId ?? "" },
    }));
  const setExchange = (itemId: string, vId: string) =>
    setRows((prev) => ({
      ...prev,
      [itemId]: { qty: prev[itemId]?.qty ?? 0, exchangeVariantId: vId },
    }));

  const selected = sale.items
    .map((it) => ({ it, row: rows[it.id] }))
    .filter((x) => x.row && x.row.qty > 0);

  // الحسابات الحيّة: قيمة المُرتجَع، قيمة البديل، والاسترداد/فرق السعر
  const { refundValue, replacementValue } = useMemo(() => {
    let refund = 0;
    let replacement = 0;
    for (const { it, row } of selected) {
      const unitNet = (it.subtotal / it.quantity) * ratio;
      refund = round2(refund + unitNet * row.qty);
      if (type === "EXCHANGE" && row.exchangeVariantId) {
        const v = variantsByProduct[it.productId]?.find(
          (x) => x.id === row.exchangeVariantId
        );
        if (v) replacement = round2(replacement + v.price * row.qty);
      }
    }
    return { refundValue: refund, replacementValue: replacement };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, type, variantsByProduct]);

  const exchangeDiff = round2(replacementValue - refundValue);

  async function submit() {
    if (selected.length === 0) {
      toast.error("اختر صنفاً واحداً على الأقل");
      return;
    }
    if (type === "EXCHANGE" && selected.some((x) => !x.row.exchangeVariantId)) {
      toast.error("اختر الصنف البديل لكل بند");
      return;
    }
    const items: ReturnItemInput[] = selected.map((x) => ({
      saleItemId: x.it.id,
      quantity: x.row.qty,
      exchangeVariantId:
        type === "EXCHANGE" ? x.row.exchangeVariantId : undefined,
    }));
    setBusy(true);
    try {
      await apiPost<ReturnDTO>("/api/returns", {
        saleId: sale.id,
        type,
        reason: reason.trim() || null,
        refundMethod,
        createdBy: getSession()?.name ?? null,
        items,
      });
      toast.success(type === "RETURN" ? "تم تسجيل الإرجاع" : "تم تسجيل الاستبدال");
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`إرجاع / استبدال — فاتورة #${formatNumber(sale.saleNumber)}`}
      size="lg"
      footer={
        <>
          <button
            onClick={submit}
            disabled={busy || selected.length === 0}
            className="btn btn-primary w-full sm:w-auto"
          >
            {busy ? "جارٍ…" : type === "RETURN" ? "تأكيد الإرجاع" : "تأكيد الاستبدال"}
          </button>
          <button onClick={onClose} className="btn btn-ghost w-full sm:w-auto">
            إلغاء
          </button>
        </>
      }
    >
      {/* نوع العملية */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            { v: "RETURN", label: "إرجاع", icon: RotateCcw },
            { v: "EXCHANGE", label: "استبدال", icon: Repeat },
          ] as const
        ).map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => setType(v)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-[var(--radius-md)] border py-2.5 text-sm font-medium transition-colors",
              type === v
                ? "border-accent bg-accent-soft text-accent"
                : "text-muted hover:bg-[var(--surface-2)]"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* الأصناف */}
      <div className="space-y-2">
        {sale.items.map((it) => {
          const remaining = remainingOf(it.id, it.quantity);
          const row = rows[it.id];
          const qty = row?.qty ?? 0;
          const disabled = remaining <= 0;
          const options = (variantsByProduct[it.productId] ?? []).filter(
            (v) => v.branch === sale.branch && v.quantity > 0
          );
          return (
            <div
              key={it.id}
              className={cn(
                "rounded-[var(--radius-md)] border p-3",
                disabled && "opacity-50"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {it.productName}
                  </p>
                  <p className="text-xs text-muted nums">
                    {it.brand ? `${it.brand} · ` : ""}مقاس {it.size}
                    {it.color ? ` / ${it.color}` : ""} ·{" "}
                    {formatCurrency(it.unitPrice)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted nums">
                    المتاح للإرجاع: {formatNumber(remaining)} من{" "}
                    {formatNumber(it.quantity)}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={remaining}
                  inputMode="numeric"
                  disabled={disabled}
                  value={qty || ""}
                  onChange={(e) => {
                    const n = Math.max(
                      0,
                      Math.min(remaining, Math.floor(Number(e.target.value) || 0))
                    );
                    setQty(it.id, n);
                  }}
                  placeholder="0"
                  className="input nums h-10 w-20 shrink-0 text-center"
                />
              </div>

              {/* اختيار الصنف البديل (استبدال فقط، عند تحديد كمية) */}
              {type === "EXCHANGE" && qty > 0 && (
                <div className="mt-3 border-t pt-3">
                  <label className="mb-1 block text-xs font-medium text-muted">
                    الصنف البديل
                  </label>
                  <select
                    value={row?.exchangeVariantId ?? ""}
                    onChange={(e) => setExchange(it.id, e.target.value)}
                    className="input h-10"
                  >
                    <option value="">— اختر البديل —</option>
                    {options.map((v) => (
                      <option key={v.id} value={v.id}>
                        مقاس {v.size}
                        {v.color ? ` / ${v.color}` : ""} — {formatCurrency(v.price)}{" "}
                        (متاح {v.quantity})
                      </option>
                    ))}
                  </select>
                  {options.length === 0 && (
                    <p className="mt-1 text-xs text-warning">
                      لا توجد أصناف بديلة متاحة في هذا الفرع.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* سبب + طريقة الاسترداد */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">السبب (اختياري)</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: مقاس غير مناسب"
          />
        </div>
        <div>
          <label className="label">طريقة الاسترداد</label>
          <select
            className="input"
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value as RefundMethodValue)}
          >
            {REFUND_METHODS.map((m) => (
              <option key={m} value={m}>
                {REFUND_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* الملخّص الحيّ */}
      <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">قيمة الأصناف المُرتجعة</span>
          <span className="font-bold text-text nums">
            {formatCurrency(refundValue)}
          </span>
        </div>
        {type === "EXCHANGE" && (
          <>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-muted">قيمة الأصناف البديلة</span>
              <span className="font-bold text-text nums">
                {formatCurrency(replacementValue)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="font-medium text-text">
                {exchangeDiff > 0
                  ? "يدفع العميل"
                  : exchangeDiff < 0
                    ? "يُرد للعميل"
                    : "لا فرق"}
              </span>
              <span
                className={cn(
                  "text-base font-extrabold nums",
                  exchangeDiff > 0
                    ? "text-warning"
                    : exchangeDiff < 0
                      ? "text-success"
                      : "text-text"
                )}
              >
                {formatCurrency(Math.abs(exchangeDiff))}
              </span>
            </div>
          </>
        )}
        {type === "RETURN" && (
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <span className="font-medium text-text">إجمالي الاسترداد</span>
            <span className="text-base font-extrabold text-success nums">
              {formatCurrency(refundValue)}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
