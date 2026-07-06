"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  X,
  Plus,
  Trash2,
  Save,
  Link2,
  Copy,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Check,
  Printer,
  Tag,
  Bell,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { NumberInput, TextOnlyInput } from "@/components/ui/inputs";
import { AddBrandModal } from "@/components/add-brand-modal";
import { AddProductTypeModal } from "@/components/add-product-type-modal";
import { QrCode as QrCanvas, Barcode128 } from "@/components/code-visuals";
import {
  TicketPrintModal,
  type TicketItem,
} from "@/components/ticket-print-modal";
import { apiPost, apiPut, uploadImage } from "@/lib/client";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { useFetch } from "@/lib/use-fetch";
import { buildVariantSku } from "@/lib/sku";
import { publicProductUrl } from "@/lib/public-url";
import { cn } from "@/lib/cn";
import type {
  BrandDTO,
  ProductDTO,
  ProductInput,
  ProductTypeDTO,
} from "@/lib/types";
import {
  BRANCHES,
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  sizesForCategory,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";

interface VariantRow {
  clientId: string;
  id?: string;
  branch: BranchValue;
  size: string;
  color: string;
  quantity: string;
  minQuantity: string;
  alertOnLowStock: boolean;
  price: string;
  sku: string;
  skuManual: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const DRAFT_KEY = "eb-product-draft";

const STEPS = [
  { n: 1, label: "المعلومات الأساسية" },
  { n: 2, label: "المقاسات والأسعار" },
  { n: 3, label: "الصور والباركود" },
] as const;

function emptyRow(branch: BranchValue = "HADAYEK"): VariantRow {
  return {
    clientId: uid(),
    branch,
    size: "",
    color: "",
    quantity: "0",
    minQuantity: "5",
    alertOnLowStock: false,
    price: "0",
    sku: "",
    skuManual: false,
  };
}

function VariantField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted sm:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}

export function ProductForm({ initial }: { initial?: ProductDTO }) {
  const router = useRouter();
  const isEdit = !!initial;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [category, setCategory] = useState<CategoryValue>(
    initial?.category ?? "CLOTHES"
  );
  const [productTypeId, setProductTypeId] = useState<string>(
    initial?.productTypeId ?? ""
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [urlInput, setUrlInput] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>(
    initial?.variants.length
      ? initial.variants.map((v) => ({
          clientId: uid(),
          id: v.id,
          branch: v.branch,
          size: v.size,
          color: v.color ?? "",
          quantity: String(v.quantity),
          minQuantity: String(v.minQuantity ?? 5),
          alertOnLowStock: v.alertOnLowStock ?? false,
          price: String(v.price),
          sku: v.sku ?? "",
          skuManual: v.skuManual,
        }))
      : [emptyRow()]
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [ticketItems, setTicketItems] = useState<TicketItem[] | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // مسودة محلية للمنتجات الجديدة فقط: تُستعاد لو غادر المستخدم في المنتصف.
  const draftRestored = useRef(false);
  const [draftLoaded, setDraftLoaded] = useState(isEdit); // في وضع التعديل لا مسودة

  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === "object") {
          if (typeof d.name === "string") setName(d.name);
          if (typeof d.brand === "string") setBrand(d.brand);
          if (typeof d.category === "string") setCategory(d.category);
          if (typeof d.productTypeId === "string")
            setProductTypeId(d.productTypeId);
          if (typeof d.description === "string") setDescription(d.description);
          if (typeof d.barcode === "string") setBarcode(d.barcode);
          if (Array.isArray(d.images)) setImages(d.images);
          if (Array.isArray(d.variants) && d.variants.length)
            setVariants(d.variants);
          if (typeof d.step === "number") setStep(d.step);
          draftRestored.current = true;
        }
      }
    } catch {
      /* تجاهل مسودة تالفة */
    }
    setDraftLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (draftRestored.current) {
      toast("تم استعادة مسودة غير محفوظة");
      draftRestored.current = false;
    }
  }, [draftLoaded]);

  // حفظ المسودة عند كل تغيير (للمنتجات الجديدة فقط، بعد أول تحميل)
  useEffect(() => {
    if (isEdit || !draftLoaded) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          name,
          brand,
          category,
          productTypeId,
          description,
          barcode,
          images,
          variants,
          step,
        })
      );
    } catch {
      /* تجاهل */
    }
  }, [
    isEdit,
    draftLoaded,
    name,
    brand,
    category,
    productTypeId,
    description,
    barcode,
    images,
    variants,
    step,
  ]);

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* تجاهل */
    }
  }

  const sizeOptions = sizesForCategory(category);

  // البراندات حسب الفئة المحددة
  const { data: brandsData, refetch: refetchBrands } = useFetch<BrandDTO[]>(
    `/api/brands?category=${category}`
  );
  const brandOptions = (brandsData ?? []).map((b) => b.name);

  // أنواع المنتجات: تُجلَب مرة واحدة فقط
  const {
    data: typesData,
    loading: typesLoading,
    error: typesError,
    refetch: refetchTypes,
  } = useFetch<ProductTypeDTO[]>("/api/product-types");
  const typeOptions = (typesData ?? []).filter((t) => t.category === category);

  useEffect(() => {
    if (
      productTypeId &&
      typesData &&
      !typesData.some((t) => t.id === productTypeId && t.category === category)
    ) {
      setProductTypeId("");
    }
  }, [category, typesData, productTypeId]);

  const typePlaceholder = typesLoading
    ? "جاري التحميل…"
    : typesError
      ? "تعذّر التحميل"
      : typeOptions.length === 0
        ? "لا توجد أنواع لهذه الفئة"
        : "— بدون نوع —";

  const selectedType = typeOptions.find((t) => t.id === productTypeId);

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      if (images.length >= 3) {
        toast.error("الحد الأقصى 3 صور للمنتج");
        break;
      }
      setUploading(true);
      try {
        const { url } = await uploadImage(file);
        setImages((prev) => (prev.length < 3 ? [...prev, url] : prev));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "تعذّر رفع الصورة");
      } finally {
        setUploading(false);
      }
    }
  }

  function addUrl() {
    const url = urlInput.trim();
    if (!url) return;
    if (images.length >= 3) return toast.error("الحد الأقصى 3 صور للمنتج");
    setImages((prev) => [...prev, url]);
    setUrlInput("");
  }

  function updateRow(clientId: string, patch: Partial<VariantRow>) {
    setVariants((rows) =>
      rows.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r))
    );
  }

  // كود SKU المعروض/المُولَّد لصف معيّن. يُرجع null لو لا يمكن معرفته بعد
  // (منتج جديد لم يُحفَظ وبلا كود يدوي).
  function rowSku(row: VariantRow): string | null {
    if (row.sku.trim()) return row.sku.trim();
    if (isEdit && initial) {
      return buildVariantSku({
        productId: initial.id,
        typeCode: selectedType?.code ?? null,
        size: row.size || "?",
        branch: row.branch,
        color: row.color || null,
      });
    }
    return null;
  }

  function previewSku(row: VariantRow): string {
    return rowSku(row) ?? "—";
  }

  function copyToOtherBranch() {
    setVariants((rows) => {
      const additions: VariantRow[] = [];
      for (const r of rows) {
        const other: BranchValue =
          r.branch === "HADAYEK" ? "ZAHRAA" : "HADAYEK";
        const exists = rows.some(
          (x) => x.size === r.size && x.branch === other && x.color === r.color
        );
        const willAdd = additions.some(
          (x) => x.size === r.size && x.branch === other && x.color === r.color
        );
        if (r.size && !exists && !willAdd) {
          additions.push({
            ...r,
            clientId: uid(),
            id: undefined,
            branch: other,
            sku: "",
            skuManual: false,
          });
        }
      }
      if (additions.length === 0) {
        toast("لا توجد صفوف لنسخها للفرع الآخر");
        return rows;
      }
      toast.success(`تم نسخ ${additions.length} صف للفرع الآخر`);
      return [...rows, ...additions];
    });
  }

  function regenerateAutoSkus() {
    setVariants((rows) =>
      rows.map((r) => (r.skuManual ? r : { ...r, sku: "" }))
    );
    toast("سيُعاد توليد كل الأكواد التلقائية عند الحفظ");
  }

  // ------ التحقق لكل خطوة ------
  function validateStep1(): boolean {
    if (!name.trim()) {
      toast.error("اسم المنتج مطلوب");
      return false;
    }
    if (!brand.trim()) {
      toast.error("يجب اختيار البراند");
      return false;
    }
    return true;
  }

  function validateStep2(): boolean {
    if (variants.length === 0) {
      toast.error("أضف صفاً واحداً على الأقل");
      return false;
    }
    const seen = new Set<string>();
    for (const r of variants) {
      if (!r.size) {
        toast.error("يجب اختيار المقاس في كل الصفوف");
        return false;
      }
      const key = `${r.size}__${r.branch}__${r.color.trim()}`;
      if (seen.has(key)) {
        toast.error(
          `تكرار للمقاس ${r.size}${r.color ? ` / ${r.color}` : ""} في نفس الفرع`
        );
        return false;
      }
      seen.add(key);
    }
    return true;
  }

  function goNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(3, s + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function goPrev() {
    setStep((s) => Math.max(1, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      return;
    }

    const payload: ProductInput = {
      name: name.trim(),
      brand: brand.trim(),
      category,
      description: description.trim() || null,
      barcode: barcode.trim() || null,
      images,
      productTypeId: productTypeId || null,
      variants: variants.map((r) => ({
        id: r.id,
        branch: r.branch,
        size: r.size,
        color: r.color.trim() || null,
        quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
        minQuantity: Math.max(0, Math.floor(Number(r.minQuantity) || 0)),
        alertOnLowStock: r.alertOnLowStock,
        price: Math.max(0, Number(r.price) || 0),
        sku: r.sku.trim() || null,
        skuManual: r.skuManual,
      })),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await apiPut(`/api/products/${initial!.id}`, payload);
        void logActivity(ACTIVITY_ACTIONS.UPDATE_PRODUCT, payload.name);
        toast.success("تم حفظ التعديلات");
      } else {
        await apiPost("/api/products", payload);
        void logActivity(ACTIVITY_ACTIONS.CREATE_PRODUCT, payload.name);
        clearDraft();
        toast.success("تمت إضافة المنتج");
      }
      router.push("/inventory");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  // ------ تجميع عناصر التيكيت للطباعة ------
  function ticketItemFor(row: VariantRow): TicketItem | null {
    const sku = rowSku(row);
    if (!sku) return null;
    return {
      sku,
      productName: name.trim() || "—",
      brand: brand.trim(),
      size: row.size,
      color: row.color.trim() || null,
      price: Math.max(0, Number(row.price) || 0),
    };
  }

  function printRow(row: VariantRow) {
    const item = ticketItemFor(row);
    if (!item) {
      toast.error("احفظ المنتج أولاً لتوليد كود هذا الصنف");
      return;
    }
    setTicketItems([item]);
  }

  function printSelected() {
    const rows =
      selectedRows.size > 0
        ? variants.filter((r) => selectedRows.has(r.clientId))
        : variants;
    const items = rows
      .map(ticketItemFor)
      .filter((x): x is TicketItem => x !== null);
    if (items.length === 0) {
      toast.error("لا توجد أصناف لها كود SKU. احفظ المنتج أولاً.");
      return;
    }
    setTicketItems(items);
  }

  function toggleSelect(clientId: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* مؤشر الخطوات */}
      <Stepper current={step} onStep={setStep} />

      {/* الخطوة 1: المعلومات الأساسية */}
      {step === 1 && (
        <Card className="p-4">
          <h2 className="mb-3 text-base font-bold text-text">
            المعلومات الأساسية
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">اسم المنتج *</label>
              <TextOnlyInput
                className="input"
                value={name}
                onChange={setName}
                placeholder="مثال: تيشيرت قطن كلاسيك"
              />
            </div>

            <div>
              <label className="label">البراند *</label>
              <div className="flex gap-2">
                <select
                  className="input"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                >
                  <option value="">اختر البراند</option>
                  {brandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  {brand && !brandOptions.includes(brand) && (
                    <option value={brand}>{brand}</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setBrandModalOpen(true)}
                  className="btn btn-secondary flex-shrink-0"
                  title="إضافة براند جديد"
                >
                  <Plus className="h-4 w-4" />
                  جديد
                </button>
              </div>
              {brandOptions.length === 0 && (
                <p className="mt-1 text-xs text-muted">
                  لا توجد براندات لهذه الفئة — أضف واحداً عبر زر «جديد».
                </p>
              )}
            </div>

            <div>
              <label className="label">الفئة *</label>
              <select
                className="input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as CategoryValue);
                  setBrand("");
                  setVariants((rows) =>
                    rows.map((r) => (r.skuManual ? r : { ...r, sku: "" }))
                  );
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">نوع المنتج</label>
              <div className="flex gap-2">
                <select
                  className="input"
                  value={productTypeId}
                  onChange={(e) => setProductTypeId(e.target.value)}
                  disabled={typesLoading || !!typesError}
                >
                  <option value="">{typePlaceholder}</option>
                  {typeOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setTypeModalOpen(true)}
                  className="btn btn-secondary flex-shrink-0"
                  title="إضافة نوع جديد"
                >
                  <Plus className="h-4 w-4" />
                  جديد
                </button>
              </div>
              {typesError ? (
                <p className="mt-1 text-xs text-danger">
                  تعذّر تحميل أنواع المنتجات.{" "}
                  <button
                    type="button"
                    onClick={() => refetchTypes()}
                    className="font-medium underline"
                  >
                    إعادة المحاولة
                  </button>
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  كود النوع يُستخدم بادئةً لتوليد SKU التلقائي لكل صنف.
                </p>
              )}
            </div>

            <div>
              <label className="label">الباركود</label>
              <input
                className="input nums"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="امسح أو أدخل الباركود"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label">الوصف</label>
              <textarea
                className="input min-h-[80px] resize-y"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف اختياري للمنتج..."
              />
            </div>
          </div>
        </Card>
      )}

      {/* الخطوة 2: المقاسات والكميات والأسعار */}
      {step === 2 && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-text">
              المقاسات والكميات والأسعار
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary h-9 text-xs"
                onClick={regenerateAutoSkus}
                title="إعادة توليد كل أكواد SKU التلقائية عند الحفظ"
              >
                <RefreshCw className="h-4 w-4" />
                توليد SKUs
              </button>
              <button
                type="button"
                className="btn btn-secondary h-9 text-xs"
                onClick={copyToOtherBranch}
                title="نسخ كل الصفوف إلى الفرع الآخر"
              >
                <Copy className="h-4 w-4" />
                نسخ للفرع الآخر
              </button>
              <button
                type="button"
                className="btn btn-secondary h-9 text-xs"
                onClick={() =>
                  setVariants((rows) => [
                    ...rows,
                    emptyRow(rows[rows.length - 1]?.branch ?? "HADAYEK"),
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                إضافة صف
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="hidden gap-2 px-1 text-xs font-medium text-muted sm:grid sm:grid-cols-[1.1fr_0.8fr_0.9fr_0.7fr_0.8fr_0.9fr_1.3fr_auto]">
              <span>الفرع</span>
              <span>المقاس</span>
              <span>اللون</span>
              <span>الكمية</span>
              <span>الحد الأدنى</span>
              <span>السعر</span>
              <span>كود SKU</span>
              <span></span>
            </div>

            {variants.map((row) => (
              <div
                key={row.clientId}
                className="rounded-lg border p-3 sm:p-2.5"
              >
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-[1.1fr_0.8fr_0.9fr_0.7fr_0.8fr_0.9fr_1.3fr_auto] sm:h-9 sm:items-center sm:gap-2"
              >
                <VariantField label="الفرع">
                  <select
                    className="input sm:h-9 sm:py-1"
                    value={row.branch}
                    onChange={(e) =>
                      updateRow(row.clientId, {
                        branch: e.target.value as BranchValue,
                        ...(row.skuManual ? {} : { sku: "" }),
                      })
                    }
                  >
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {BRANCH_LABELS[b]}
                      </option>
                    ))}
                  </select>
                </VariantField>

                <VariantField label="المقاس">
                  <select
                    className="input sm:h-9 sm:py-1"
                    value={row.size}
                    onChange={(e) =>
                      updateRow(row.clientId, {
                        size: e.target.value,
                        ...(row.skuManual ? {} : { sku: "" }),
                      })
                    }
                  >
                    <option value="">المقاس</option>
                    {sizeOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {row.size && !sizeOptions.includes(row.size) && (
                      <option value={row.size}>{row.size}</option>
                    )}
                  </select>
                </VariantField>

                <VariantField label="اللون">
                  <input
                    className="input sm:h-9 sm:py-1"
                    value={row.color}
                    onChange={(e) =>
                      updateRow(row.clientId, {
                        color: e.target.value,
                        ...(row.skuManual ? {} : { sku: "" }),
                      })
                    }
                    placeholder="أحمر / أسود..."
                  />
                </VariantField>

                <VariantField label="الكمية">
                  <NumberInput
                    className="input nums sm:h-9 sm:py-1"
                    value={row.quantity}
                    onChange={(v) => updateRow(row.clientId, { quantity: v })}
                  />
                </VariantField>

                <VariantField label="الحد الأدنى">
                  <NumberInput
                    className="input nums sm:h-9 sm:py-1"
                    value={row.minQuantity}
                    onChange={(v) => updateRow(row.clientId, { minQuantity: v })}
                  />
                </VariantField>

                <VariantField label="السعر (ج.م)">
                  <NumberInput
                    decimal
                    className="input nums sm:h-9 sm:py-1"
                    value={row.price}
                    onChange={(v) => updateRow(row.clientId, { price: v })}
                  />
                </VariantField>

                <VariantField label="كود الصنف (SKU)">
                  <div className="flex gap-1">
                    <input
                      className={`input nums sm:h-9 sm:py-1 ${row.skuManual ? "" : "text-muted"}`}
                      value={row.sku}
                      placeholder={
                        row.skuManual ? "" : previewSku(row) || "تلقائي عند الحفظ"
                      }
                      onChange={(e) =>
                        updateRow(row.clientId, {
                          sku: e.target.value,
                          skuManual: e.target.value.trim().length > 0,
                        })
                      }
                    />
                    {row.skuManual && (
                      <button
                        type="button"
                        className="btn btn-ghost h-[38px] flex-shrink-0 !px-2 text-muted sm:h-9"
                        onClick={() =>
                          updateRow(row.clientId, { sku: "", skuManual: false })
                        }
                        title="إعادة للتوليد التلقائي"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </VariantField>

                <button
                  type="button"
                  onClick={() =>
                    setVariants((rows) =>
                      rows.length === 1
                        ? rows
                        : rows.filter((r) => r.clientId !== row.clientId)
                    )
                  }
                  disabled={variants.length === 1}
                  className="btn btn-ghost col-span-2 h-11 w-full gap-2 text-danger hover:bg-[rgba(217,83,79,0.12)] disabled:opacity-30 sm:col-span-1 sm:h-9 sm:w-9 sm:!px-0"
                  aria-label="حذف الصف"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sm:hidden">حذف الصف</span>
                </button>
              </div>

              {/* تفعيل تنبيه الجرس عند بلوغ الحد الأدنى لهذا الصنف */}
              <label
                className={cn(
                  "mt-2.5 flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:mt-2",
                  row.alertOnLowStock
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-[var(--border)] text-muted hover:text-text"
                )}
              >
                <input
                  type="checkbox"
                  checked={row.alertOnLowStock}
                  onChange={(e) =>
                    updateRow(row.clientId, { alertOnLowStock: e.target.checked })
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <Bell className="h-3.5 w-3.5 shrink-0" />
                تنبيهني عند الحد الأدنى
              </label>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* الخطوة 3: الصور والباركود */}
      {step === 3 && (
        <>
          <Card className="p-4">
            <h2 className="mb-1 text-base font-bold text-text">صور المنتج</h2>
            <p className="mb-3 text-xs text-muted">
              حتى 3 صور — اسحب وأفلت أو اختر ملفاً
            </p>

            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div
                  key={img + i}
                  className="relative h-24 w-24 overflow-hidden rounded-lg border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setImages((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                    aria-label="حذف الصورة"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {images.length < 3 && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    uploadFiles(Array.from(e.dataTransfer.files));
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex h-24 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-muted transition-colors hover:border-accent hover:text-accent ${
                    dragging ? "border-accent bg-accent-soft text-accent" : ""
                  }`}
                >
                  {uploading ? (
                    <Spinner className="h-5 w-5" />
                  ) : (
                    <Upload className="h-5 w-5" />
                  )}
                  <span className="text-xs">اسحب الصورة هنا أو اضغط</span>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />

            {images.length < 3 && (
              <div className="mt-3 max-w-md">
                <label className="label">رابط صورة</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      className="input pr-9"
                      placeholder="أو ألصق رابط صورة..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addUrl();
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary h-[42px]"
                    onClick={addUrl}
                  >
                    إضافة
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* أكواد QR / Barcode + طباعة تيكيت لكل صنف */}
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-text">
                  الأكواد وطباعة التيكيت
                </h2>
                <p className="text-xs text-muted">
                  QR يفتح صفحة المنتج العامة، والباركود يشفّر كود الصنف للكاشير.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary h-9 text-xs"
                onClick={printSelected}
              >
                <Printer className="h-4 w-4" />
                طباعة{" "}
                {selectedRows.size > 0
                  ? `المحدد (${selectedRows.size})`
                  : "الكل"}
              </button>
            </div>

            {!isEdit && (
              <div className="mb-3 rounded-lg border border-dashed p-3 text-xs text-muted">
                تُولَّد أكواد SKU النهائية بعد حفظ المنتج. الأكواد الظاهرة هنا
                معاينة تقريبية — احفظ المنتج ثم عد للطباعة النهائية.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {variants.map((row) => {
                const sku = rowSku(row);
                const selected = selectedRows.has(row.clientId);
                return (
                  <div
                    key={row.clientId}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      selected && "border-accent bg-accent-soft"
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-text">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(row.clientId)}
                          className="h-4 w-4 accent-[#6c63ff]"
                        />
                        {BRANCH_LABELS[row.branch]} · {row.size || "—"}
                        {row.color ? ` · ${row.color}` : ""}
                      </label>
                      <button
                        type="button"
                        onClick={() => printRow(row)}
                        className="btn btn-ghost h-8 !px-2 text-xs text-accent"
                        title="طباعة تيكيت هذا الصنف"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        تيكيت
                      </button>
                    </div>

                    {sku ? (
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-md bg-white p-1.5">
                          <QrCanvas value={publicProductUrl(sku)} size={64} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-1 text-[11px] text-muted">
                            <Tag className="h-3 w-3" />
                            <span className="truncate nums">{sku}</span>
                          </div>
                          <div className="rounded-md bg-white p-1.5">
                            <Barcode128
                              value={sku}
                              height={34}
                              width={1.2}
                              fontSize={10}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        سيظهر الكود بعد حفظ المنتج.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* التنقّل بين الخطوات — مثبّت أسفل الشاشة على الموبايل ليبقى في المتناول */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-[var(--bg)] py-3 sm:static sm:border-0 sm:bg-transparent sm:py-0">
        <div>
          {step > 1 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={goPrev}
              disabled={saving}
            >
              <ChevronRight className="h-4 w-4" />
              السابق
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/inventory")}
            disabled={saving}
          >
            إلغاء
          </button>

          {step < 3 ? (
            <button
              key="wizard-next"
              type="button"
              className="btn btn-primary"
              onClick={goNext}
            >
              التالي
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <button
              key="wizard-submit"
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isEdit ? "حفظ التعديلات" : "إضافة المنتج"}
            </button>
          )}
        </div>
      </div>

      <AddBrandModal
        open={brandModalOpen}
        category={category}
        onClose={() => setBrandModalOpen(false)}
        onAdded={(b) => {
          setBrand(b.name);
          refetchBrands();
        }}
      />

      <AddProductTypeModal
        open={typeModalOpen}
        category={category}
        onClose={() => setTypeModalOpen(false)}
        onAdded={(t) => {
          setProductTypeId(t.id);
          refetchTypes();
        }}
      />

      <TicketPrintModal
        open={ticketItems !== null}
        items={ticketItems ?? []}
        onClose={() => setTicketItems(null)}
      />
    </form>
  );
}

// مؤشر تقدّم من 3 خطوات — قابل للنقر للرجوع لخطوة سابقة
function Stepper({
  current,
  onStep,
}: {
  current: number;
  onStep: (n: number) => void;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const done = current > s.n;
          const active = current === s.n;
          return (
            <div key={s.n} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => {
                  // يُسمح بالرجوع للخطوات السابقة فقط
                  if (s.n < current) onStep(s.n);
                }}
                className={cn(
                  "flex items-center gap-2",
                  s.n < current ? "cursor-pointer" : "cursor-default"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                    active && "bg-accent text-white",
                    done && "bg-accent/20 text-accent",
                    !active && !done && "bg-[var(--surface-2)] text-muted"
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : s.n}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium sm:inline",
                    active ? "text-text" : "text-muted"
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1 rounded",
                    current > s.n ? "bg-accent" : "bg-[var(--border)]"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
