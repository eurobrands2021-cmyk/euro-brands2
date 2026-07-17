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
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { RowsSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput, TextOnlyInput } from "@/components/ui/inputs";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  BRANCH_LABELS,
  DEFECT_REASONS,
  DEFECT_REASON_LABELS,
  DEFECT_CONDITIONS,
  DEFECT_CONDITION_LABELS,
  DEFECT_CONDITION_HINTS,
  type DefectReasonValue,
  type DefectConditionValue,
} from "@/lib/constants";
import type {
  DefectReportPage,
  ProductDTO,
  SupplierDTO,
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
        description="سجّل التلف واختر الحالة: تالف بالكامل (خسارة) · يُباع بخصم (يبقى بالمخزون) · يُرجع للمورد"
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

  // الحالة (التصرّف) وحقولها المرتبطة
  const [condition, setCondition] = useState<DefectConditionValue>("TOTAL_LOSS");
  const [discountPrice, setDiscountPrice] = useState("");
  const [supplierId, setSupplierId] = useState("");

  // الموردون (لحالة «يُرجع للمورد») + إضافة مورد جديد مباشرةً
  const { data: suppliersData, refetch: refetchSuppliers } =
    useFetch<{ suppliers: SupplierDTO[] }>("/api/suppliers");
  const suppliers = suppliersData?.suppliers ?? [];
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);

  function onSupplierSelect(value: string) {
    if (value === "__add_supplier__") {
      setAddingSupplier(true);
      setSupplierId("");
    } else {
      setSupplierId(value);
    }
  }

  async function saveNewSupplier() {
    const trimmed = newSupplier.trim();
    if (!trimmed) return toast.error("اسم المورد مطلوب");
    setSavingSupplier(true);
    try {
      const created = await apiPost<SupplierDTO>("/api/suppliers", {
        name: trimmed,
      });
      await refetchSuppliers();
      setSupplierId(created.id);
      setAddingSupplier(false);
      setNewSupplier("");
      toast.success("تمت إضافة المورد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إضافة المورد");
    } finally {
      setSavingSupplier(false);
    }
  }

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
    setCondition("TOTAL_LOSS");
    setDiscountPrice("");
    setSupplierId("");
    setAddingSupplier(false);
    setNewSupplier("");
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

    // تحقّق حقول الحالة
    let discountNum: number | null = null;
    if (condition === "SELL_AT_DISCOUNT") {
      discountNum = Number(discountPrice);
      if (!Number.isFinite(discountNum) || discountNum <= 0) {
        toast.error("أدخل سعر البيع بخصم");
        return;
      }
      if (variant && discountNum >= variant.price) {
        toast.error("سعر الخصم يجب أن يكون أقل من سعر الصنف الأصلي");
        return;
      }
    }
    if (condition === "RETURN_TO_SUPPLIER" && !supplierId) {
      toast.error("اختر المورد المُرجَع إليه");
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
        condition,
        discountPrice: condition === "SELL_AT_DISCOUNT" ? discountNum : null,
        supplierId: condition === "RETURN_TO_SUPPLIER" ? supplierId : null,
        createdBy: getSession()?.name ?? null,
      });
      void logActivity(
        "تسجيل تلف (ديفو)",
        `${product?.name} — كمية ${qty} — ${DEFECT_CONDITION_LABELS[condition]}`
      );
      toast.success(
        condition === "SELL_AT_DISCOUNT"
          ? "تم التسجيل — الصنف يبقى في المخزون بسعر مخفّض"
          : condition === "RETURN_TO_SUPPLIER"
            ? "تم تسجيل المرتجع للمورد وخصمه من المخزون"
            : "تم تسجيل التلف وخصمه من المخزون"
      );
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
                <RowsSkeleton rows={3} className="p-2" />
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

          {/* الحالة (التصرّف) — تحدّد أثر التسجيل على المخزون */}
          <div>
            <label className="label">الحالة (التصرّف)</label>
            <select
              className="input"
              value={condition}
              onChange={(e) =>
                setCondition(e.target.value as DefectConditionValue)
              }
            >
              {DEFECT_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {DEFECT_CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              {DEFECT_CONDITION_HINTS[condition]}
            </p>
          </div>

          {/* سعر البيع بخصم (عند «يُباع بخصم») */}
          {condition === "SELL_AT_DISCOUNT" && (
            <div>
              <label className="label">
                سعر البيع بخصم <span className="text-danger">*</span>
              </label>
              <NumberInput
                decimal
                className="input nums"
                value={discountPrice}
                onChange={setDiscountPrice}
                placeholder={variant ? `أقل من ${variant.price}` : "السعر المخفّض"}
              />
              {variant && (
                <p className="mt-1 text-xs text-muted nums">
                  السعر الأصلي: {formatCurrency(variant.price)} — يظهر الصنف في
                  نقطة البيع بشارة «تالف/خصم».
                </p>
              )}
            </div>
          )}

          {/* المورد (عند «يُرجع للمورد») */}
          {condition === "RETURN_TO_SUPPLIER" && (
            <div>
              <label className="label">
                المورد <span className="text-danger">*</span>
              </label>
              <select
                className="input"
                value={addingSupplier ? "__add_supplier__" : supplierId}
                onChange={(e) => onSupplierSelect(e.target.value)}
              >
                <option value="">اختر المورد</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="__add_supplier__">+ إضافة مورد جديد</option>
              </select>
              {addingSupplier && (
                <div className="mt-2 flex gap-2">
                  <TextOnlyInput
                    autoFocus
                    className="input"
                    value={newSupplier}
                    onChange={setNewSupplier}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveNewSupplier();
                      }
                    }}
                    placeholder="اسم المورد الجديد"
                  />
                  <button
                    type="button"
                    className="btn btn-primary flex-shrink-0"
                    onClick={saveNewSupplier}
                    disabled={savingSupplier}
                  >
                    {savingSupplier && <Spinner className="h-4 w-4" />}
                    حفظ
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary flex-shrink-0"
                    onClick={() => {
                      setAddingSupplier(false);
                      setNewSupplier("");
                    }}
                    disabled={savingSupplier}
                  >
                    إلغاء
                  </button>
                </div>
              )}
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

          {/* ملخّص القيمة المتوقعة حسب الحالة */}
          {variant && Number(quantity) > 0 && (
            <div
              className={cn(
                "rounded-lg p-3 text-sm",
                condition === "SELL_AT_DISCOUNT"
                  ? "bg-[rgba(59,154,110,0.1)]"
                  : "bg-[rgba(217,83,79,0.1)]"
              )}
            >
              {condition === "SELL_AT_DISCOUNT" ? (
                <>
                  <span className="text-muted">قيمة البيع بخصم المتوقّعة: </span>
                  <span className="font-bold text-success nums">
                    {formatCurrency(
                      (Number(discountPrice) || 0) * Number(quantity)
                    )}
                  </span>
                  <span className="mr-1 text-xs text-muted">
                    (لا يُخصَم من المخزون)
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted">
                    {condition === "RETURN_TO_SUPPLIER"
                      ? "قيمة المرتجع للمورد: "
                      : "الخسارة المتوقعة: "}
                  </span>
                  <span className="font-bold text-danger nums">
                    {formatCurrency(
                      (cost.trim() === "" ? variant.price : Number(cost) || 0) *
                        Number(quantity)
                    )}
                  </span>
                  {condition === "RETURN_TO_SUPPLIER" && (
                    <span className="mr-1 text-xs text-muted">
                      (لا يُحتسَب خسارة)
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className={cn(
              "btn w-full",
              condition === "SELL_AT_DISCOUNT" ? "btn-primary" : "btn-danger"
            )}
          >
            <Trash2 className="h-4 w-4" />
            {saving
              ? "جارٍ التسجيل…"
              : condition === "SELL_AT_DISCOUNT"
                ? "تسجيل — يبقى بسعر مخفّض"
                : condition === "RETURN_TO_SUPPLIER"
                  ? "تسجيل مرتجع للمورد وخصم المخزون"
                  : "تسجيل التلف وخصم المخزون"}
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

  // عدّاد كل حالة (للعرض في بطاقة التفصيل)
  const condStat = (c: DefectConditionValue) =>
    report.conditionBreakdown.find((x) => x.condition === c) ?? {
      condition: c,
      count: 0,
      quantity: 0,
      value: 0,
    };
  const totalLossStat = condStat("TOTAL_LOSS");
  const discountStat = condStat("SELL_AT_DISCOUNT");
  const supplierStat = condStat("RETURN_TO_SUPPLIER");

  return (
    <div className="space-y-6">
      {/* ملخّص — القيم مفصولة حسب الحالة */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="الخسارة الحقيقية"
          value={formatCurrency(report.trueLoss)}
          subtitle={`تالف بالكامل · ${formatNumber(totalLossStat.quantity)} قطعة`}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          title="قيمة البيع بخصم"
          value={formatCurrency(report.recoveredValue)}
          subtitle={`${formatNumber(discountStat.quantity)} قطعة تُباع بخصم`}
          icon={<PackageX className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          title="مرتجع للمورد"
          value={formatCurrency(report.supplierReturnValue)}
          subtitle={`${formatNumber(supplierStat.quantity)} قطعة مرتجعة`}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="accent"
        />
      </div>

      {/* توزيع حسب الحالة (التصرّف) */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-text">
          توزيع حسب الحالة (التصرّف)
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DEFECT_CONDITIONS.map((c) => {
            const s = condStat(c);
            const valueLabel =
              c === "TOTAL_LOSS"
                ? "خسارة"
                : c === "SELL_AT_DISCOUNT"
                  ? "قيمة البيع"
                  : "قيمة المرتجع";
            return (
              <div
                key={c}
                className="rounded-lg border bg-[var(--surface-2)]/40 p-3"
              >
                <p className="text-xs font-bold text-text">
                  {DEFECT_CONDITION_LABELS[c]}
                </p>
                <p className="mt-1 text-lg font-bold text-text nums">
                  {formatNumber(s.count)}{" "}
                  <span className="text-xs font-normal text-muted">سجل</span>
                </p>
                <p className="text-xs text-muted nums">
                  {formatNumber(s.quantity)} قطعة · {valueLabel}{" "}
                  {formatCurrency(s.value)}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          السبب الأكثر تكراراً: <span className="font-medium text-text">{topLabel}</span>{" "}
          ({formatNumber(report.topReasonCount)}) · إجمالي السجلات{" "}
          {formatNumber(report.total)}
        </p>
      </Card>

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
                {it.condition === "RETURN_TO_SUPPLIER" && it.supplierName && (
                  <p className="mt-0.5 text-xs text-muted">
                    المورد: {it.supplierName}
                  </p>
                )}
                {it.detail && (
                  <p className="mt-0.5 text-xs text-muted">{it.detail}</p>
                )}
              </div>
              <div className="shrink-0 space-y-1 text-left">
                <div className="flex flex-wrap justify-end gap-1">
                  <span
                    className={cn(
                      "badge",
                      it.condition === "SELL_AT_DISCOUNT"
                        ? "bg-[rgba(59,154,110,0.14)] text-success"
                        : it.condition === "RETURN_TO_SUPPLIER"
                          ? "bg-accent-soft text-accent"
                          : "bg-[rgba(217,83,79,0.12)] text-danger"
                    )}
                  >
                    {DEFECT_CONDITION_LABELS[it.condition]}
                  </span>
                  <span className="badge bg-[var(--surface-2)] text-muted">
                    {DEFECT_REASON_LABELS[it.reasonCode]}
                  </span>
                </div>
                {it.condition === "SELL_AT_DISCOUNT" ? (
                  <>
                    <p className="text-xs text-muted nums">
                      {formatNumber(it.quantity)} × {formatCurrency(it.discountPrice ?? 0)}
                    </p>
                    <p className="text-xs font-bold text-success nums">
                      = {formatCurrency((it.discountPrice ?? 0) * it.quantity)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted nums">
                      {formatNumber(it.quantity)} × {formatCurrency(it.unitCost)}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-bold nums",
                        it.condition === "RETURN_TO_SUPPLIER"
                          ? "text-accent"
                          : "text-danger"
                      )}
                    >
                      = {formatCurrency(it.loss)}
                    </p>
                  </>
                )}
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
