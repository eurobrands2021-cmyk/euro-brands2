"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Search,
  Camera,
  X,
  TrendingDown,
  PackageX,
  ClipboardList,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPost, uploadImage } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { useHistoryPagination } from "@/lib/use-history-pagination";
import {
  HistoryDateFilter,
  HistoryPager,
} from "@/components/ui/history-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Card, StatCard } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput } from "@/components/ui/inputs";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import {
  BRANCH_LABELS,
  DEFECT_REASONS,
  DEFECT_REASON_LABELS,
  type DefectReasonValue,
} from "@/lib/constants";
import type {
  DefectReportPage,
  ProductDTO,
  VariantDTO,
} from "@/lib/types";

export default function DefectsPage() {
  const { from, to, setFrom, setTo, page, setPage, pageSize, params, hasDateFilter, clearDates } =
    useHistoryPagination();
  const {
    data: report,
    loading: reportLoading,
    refetch: refetchReport,
  } = useFetch<DefectReportPage>(`/api/damaged?${params.toString()}`);

  return (
    <div>
      <PageHeader
        title="الديفو — المنتجات التالفة"
        description="تسجيل التلف يخصم الكمية من المخزون تلقائياً ويُدوَّن في سجل التدقيق"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* نموذج تسجيل التلف */}
        <div className="lg:col-span-2">
          <RecordDefectCard onRecorded={refetchReport} />
        </div>

        {/* التقرير */}
        <div className="lg:col-span-3">
          <div className="mb-4">
            <HistoryDateFilter
              from={from}
              to={to}
              onFrom={setFrom}
              onTo={setTo}
              onClear={clearDates}
              hasDateFilter={hasDateFilter}
            />
          </div>
          {reportLoading ? (
            <PageLoader />
          ) : (
            <DefectReportView
              report={report}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
//  نموذج تسجيل التلف
// ----------------------------------------------------
function RecordDefectCard({ onRecorded }: { onRecorded: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reasonCode, setReasonCode] = useState<DefectReasonValue>("MANUFACTURING");
  const [reason, setReason] = useState("");
  const [cost, setCost] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // بحث عند الطلب (بوابة حرفين + limit) بدل تحميل الكتالوج كاملاً — نفس نمط
  // بحث نقطة البيع. لا نجلب إلا عند الكتابة.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searchUrl =
    debounced.length >= 2
      ? `/api/products?search=${encodeURIComponent(debounced)}&limit=8`
      : null;
  const { data: searchData, loading } = useFetch<ProductDTO[]>(searchUrl);
  const results = searchData ?? [];

  const variant: VariantDTO | null = useMemo(
    () => product?.variants.find((v) => v.id === variantId) ?? null,
    [product, variantId]
  );

  function pickProduct(p: ProductDTO) {
    setProduct(p);
    setQuery("");
    // اختر أول صنف متاح تلقائياً
    const firstAvail = p.variants.find((v) => v.quantity > 0) ?? p.variants[0];
    setVariantId(firstAvail?.id ?? "");
    setCost("");
  }

  function reset() {
    setProduct(null);
    setVariantId("");
    setQuantity("1");
    setReasonCode("MANUFACTURING");
    setReason("");
    setCost("");
    setPhoto(null);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // اسمح بإعادة اختيار نفس الملف
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      setPhoto(url);
      toast.success("تم رفع الصورة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!variant) {
      toast.error("اختر المنتج والصنف أولاً");
      return;
    }
    // عدد صحيح موجب صريح (لا نرسل نصاً أو قيمة كسرية أبداً)
    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("الكمية غير صحيحة");
      return;
    }
    if (qty > variant.quantity) {
      toast.error(`المتاح من هذا الصنف ${variant.quantity} فقط`);
      return;
    }
    if (reasonCode === "OTHER" && !reason.trim()) {
      toast.error("اكتب سبب التلف عند اختيار «أخرى»");
      return;
    }

    setSaving(true);
    try {
      await apiPost("/api/damaged", {
        variantId: variant.id,
        quantity: qty,
        reasonCode,
        detail: reason.trim() || null,
        unitCost: cost.trim() === "" ? null : Number(cost),
        photoUrl: photo,
        createdBy: getSession()?.name ?? null,
      });
      void logActivity(
        "تسجيل تلف (ديفو)",
        `${product?.name} — كمية ${qty}`
      );
      toast.success("تم تسجيل التلف وخصمه من المخزون");
      reset();
      onRecorded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تسجيل التلف");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone="warning" className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
        <AlertTriangle className="h-5 w-5 text-warning" />
        تسجيل تلف
      </h2>

      {/* اختيار المنتج */}
      {!product ? (
        <div>
          <label className="label">المنتج</label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pr-9"
              placeholder="ابحث بالاسم أو البراند (عربي/إنجليزي)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim().length >= 2 && (
            <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
              {loading ? (
                <p className="p-3 text-center text-sm text-muted">
                  جارٍ البحث…
                </p>
              ) : results.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted">
                  لا توجد نتائج
                </p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pickProduct(p)}
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-right last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text">
                        {p.name}
                      </span>
                      <span className="block text-xs text-muted">{p.brand}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted nums">
                      متاح: {formatNumber(p.totalQuantity)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border bg-[var(--surface-2)] p-3">
          <div className="min-w-0">
            <p className="truncate font-bold text-text">{product.name}</p>
            <p className="text-xs text-muted">{product.brand}</p>
          </div>
          <button
            onClick={reset}
            className="btn btn-ghost h-8 w-8 !px-0"
            aria-label="تغيير المنتج"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {product && (
        <div className="space-y-4">
          {/* الصنف */}
          <div>
            <label className="label">الصنف (الفرع / المقاس)</label>
            <select
              className="input"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
            >
              {product.variants.map((v) => (
                <option key={v.id} value={v.id} disabled={v.quantity <= 0}>
                  {BRANCH_LABELS[v.branch]} · {v.size}
                  {v.color ? ` / ${v.color}` : ""} — متاح {v.quantity} —{" "}
                  {formatCurrency(v.price)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* الكمية */}
            <div>
              <label className="label">الكمية التالفة</label>
              <NumberInput
                className="input nums"
                value={quantity}
                onChange={setQuantity}
                max={variant?.quantity}
              />
              {variant && (
                <p className="mt-1 text-xs text-muted nums">
                  المتاح: {formatNumber(variant.quantity)}
                </p>
              )}
            </div>
            {/* التكلفة (اختياري) */}
            <div>
              <label className="label">تكلفة الوحدة (اختياري)</label>
              <NumberInput
                className="input nums"
                decimal
                value={cost}
                onChange={setCost}
                placeholder={
                  variant ? String(variant.price) : "سعر الصنف"
                }
              />
              <p className="mt-1 text-xs text-muted">
                تُستخدم لحساب الخسارة (افتراضياً سعر الصنف)
              </p>
            </div>
          </div>

          {/* سبب التلف */}
          <div>
            <label className="label">سبب التلف</label>
            <select
              className="input"
              value={reasonCode}
              onChange={(e) =>
                setReasonCode(e.target.value as DefectReasonValue)
              }
            >
              {DEFECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {DEFECT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {/* تفاصيل السبب (مطلوبة عند أخرى) */}
          {(reasonCode === "OTHER" || reason) && (
            <div>
              <label className="label">
                تفاصيل السبب
                {reasonCode === "OTHER" && (
                  <span className="text-danger"> *</span>
                )}
              </label>
              <input
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="وصف مختصر للعيب…"
              />
            </div>
          )}

          {/* صورة اختيارية */}
          <div>
            <label className="label">صورة العيب (اختياري)</label>
            {photo ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt="صورة العيب"
                  className="h-24 w-24 rounded-lg border object-cover"
                />
                <button
                  onClick={() => setPhoto(null)}
                  className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
                  aria-label="حذف الصورة"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="btn btn-secondary cursor-pointer">
                <Camera className="h-4 w-4" />
                {uploading ? "جارٍ الرفع…" : "إضافة صورة"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={handlePhoto}
                />
              </label>
            )}
          </div>

          {/* ملخّص الخسارة المتوقعة */}
          {variant && Number(quantity) > 0 && (
            <div className="rounded-lg bg-[rgba(217,83,79,0.1)] p-3 text-sm">
              <span className="text-muted">الخسارة المتوقعة: </span>
              <span className="font-bold text-danger nums">
                {formatCurrency(
                  (cost.trim() === "" ? variant.price : Number(cost) || 0) *
                    Number(quantity)
                )}
              </span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className="btn btn-danger w-full"
          >
            <Trash2 className="h-4 w-4" />
            {saving ? "جارٍ التسجيل…" : "تسجيل التلف وخصم المخزون"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------
//  عرض التقرير
// ----------------------------------------------------
function DefectReportView({
  report,
  page,
  pageSize,
  onPage,
}: {
  report: DefectReportPage | null;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (!report || report.total === 0) {
    return (
      <EmptyState
        icon={<PackageX className="h-7 w-7" />}
        title="لا توجد سجلات تلف"
        description="سجّل أول تلف من النموذج المجاور — سيُخصم من المخزون ويظهر هنا."
      />
    );
  }

  const topLabel = report.topReason
    ? DEFECT_REASON_LABELS[report.topReason]
    : "—";

  return (
    <div className="space-y-6">
      {/* ملخّص */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="إجمالي الخسارة"
          value={formatCurrency(report.totalLoss)}
          subtitle={`${formatNumber(report.totalQuantity)} قطعة تالفة`}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          title="السبب الأكثر تكراراً"
          value={<span className="text-lg">{topLabel}</span>}
          subtitle={`${formatNumber(report.topReasonCount)} سجل`}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          title="عدد السجلات"
          value={formatNumber(report.total)}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="none"
        />
      </div>

      {/* توزيع الأسباب */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-text">توزيع أسباب التلف</h3>
        <div className="space-y-2">
          {report.reasonBreakdown.map((r) => {
            const pct = report.total
              ? Math.round((r.count / report.total) * 100)
              : 0;
            return (
              <div key={r.reason}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-text">
                    {DEFECT_REASON_LABELS[r.reason]}
                  </span>
                  <span className="text-muted nums">
                    {formatNumber(r.count)} · {formatCurrency(r.loss)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* السجل */}
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h3 className="text-sm font-bold text-text">سجل التلف</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {report.items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 p-3">
              {it.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.photoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-muted">
                  <PackageX className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text">
                  {it.productName}
                  {it.size ? ` · ${it.size}` : ""}
                  {it.color ? ` / ${it.color}` : ""}
                </p>
                <p className="text-xs text-muted">
                  {it.brand} · {BRANCH_LABELS[it.branch]} ·{" "}
                  {formatDateTime(it.createdAt)}
                </p>
                {it.detail && (
                  <p className="mt-0.5 text-xs text-muted">{it.detail}</p>
                )}
              </div>
              <div className="shrink-0 text-left">
                <span className="badge bg-accent-soft text-accent">
                  {DEFECT_REASON_LABELS[it.reasonCode]}
                </span>
                <p className="mt-1 text-xs text-danger nums">
                  {formatNumber(it.quantity)} × {formatCurrency(it.unitCost)}
                </p>
                <p className="text-xs font-bold text-danger nums">
                  = {formatCurrency(it.loss)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 pb-3">
          <HistoryPager
            page={page}
            perPage={pageSize}
            total={report.total}
            onPage={onPage}
          />
        </div>
      </Card>
    </div>
  );
}
