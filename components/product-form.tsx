"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
} from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { NumberInput, TextOnlyInput } from "@/components/ui/inputs";
import { AddBrandModal } from "@/components/add-brand-modal";
import { AddProductTypeModal } from "@/components/add-product-type-modal";
import { apiPost, apiPut, uploadImage } from "@/lib/client";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { useFetch } from "@/lib/use-fetch";
import { buildVariantSku } from "@/lib/sku";
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
  price: string;
  cost: string;
  sku: string;
  skuManual: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function emptyRow(branch: BranchValue = "HADAYEK"): VariantRow {
  return {
    clientId: uid(),
    branch,
    size: "",
    color: "",
    quantity: "0",
    minQuantity: "5",
    price: "0",
    cost: "0",
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
          price: String(v.price),
          cost: String(v.cost ?? 0),
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

  const sizeOptions = sizesForCategory(category);

  // البراندات حسب الفئة المحددة
  const { data: brandsData, refetch: refetchBrands } = useFetch<BrandDTO[]>(
    `/api/brands?category=${category}`
  );
  const brandOptions = (brandsData ?? []).map((b) => b.name);

  // أنواع المنتجات: تُجلَب مرة واحدة فقط (بدون ?category=) والقائمة صغيرة
  // (25 نوعاً)، فالتبديل بين الفئات فوري بفلترة على العميل دون أي إعادة جلب
  // ودون نافذة فراغ مؤقتة بين تغيير الفئة ووصول استجابة جديدة.
  const {
    data: typesData,
    loading: typesLoading,
    error: typesError,
    refetch: refetchTypes,
  } = useFetch<ProductTypeDTO[]>("/api/product-types");
  const typeOptions = (typesData ?? []).filter((t) => t.category === category);

  // عند تغيير الفئة: إن لم يعد النوع المختار ينتمي لها، نمسحه.
  useEffect(() => {
    if (
      productTypeId &&
      typesData &&
      !typesData.some((t) => t.id === productTypeId && t.category === category)
    ) {
      setProductTypeId("");
    }
  }, [category, typesData, productTypeId]);

  // نص العنصر الأول في قائمة الأنواع: يميّز التحميل/الخطأ/الفراغ الفعلي
  // حتى لا يظهر تحميل حقيقي أو فشل في الجلب وكأنه ببساطة "لا توجد أنواع".
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

  // SKU معاينة: ما سيُحفَظ تلقائياً لو لم يكتبه المستخدم يدوياً.
  // يحتاج معرف المنتج، فعند الإنشاء نُظهر "—" بدلاً من تخمين خاطئ.
  function previewSku(row: VariantRow): string {
    if (!isEdit || !initial) return "—";
    return buildVariantSku({
      productId: initial.id,
      typeCode: selectedType?.code ?? null,
      size: row.size || "?",
      branch: row.branch,
      color: row.color || null,
    });
  }

  // نسخ كل الصفوف إلى الفرع الآخر
  function copyToOtherBranch() {
    setVariants((rows) => {
      const additions: VariantRow[] = [];
      for (const r of rows) {
        const other: BranchValue =
          r.branch === "HADAYEK" ? "ZAHRAA" : "HADAYEK";
        const exists = rows.some(
          (x) =>
            x.size === r.size && x.branch === other && x.color === r.color
        );
        const willAdd = additions.some(
          (x) =>
            x.size === r.size && x.branch === other && x.color === r.color
        );
        if (r.size && !exists && !willAdd) {
          additions.push({
            ...r,
            clientId: uid(),
            id: undefined,
            branch: other,
            sku: "", // SKU جديد سيُولَّد على الخادم
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

  // إعادة توليد كل SKUs التلقائية (لا يمس الأكواد اليدوية)
  function regenerateAutoSkus() {
    setVariants((rows) =>
      rows.map((r) => (r.skuManual ? r : { ...r, sku: "" }))
    );
    toast("سيُعاد توليد كل الأكواد التلقائية عند الحفظ");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("اسم المنتج مطلوب");
    if (!brand.trim()) return toast.error("يجب اختيار البراند");
    if (variants.length === 0) return toast.error("أضف صفاً واحداً على الأقل");

    const seen = new Set<string>();
    for (const r of variants) {
      if (!r.size) return toast.error("يجب اختيار المقاس في كل الصفوف");
      const key = `${r.size}__${r.branch}__${r.color.trim()}`;
      if (seen.has(key))
        return toast.error(
          `تكرار للمقاس ${r.size}${r.color ? ` / ${r.color}` : ""} في نفس الفرع`
        );
      seen.add(key);
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
        price: Math.max(0, Number(r.price) || 0),
        cost: Math.max(0, Number(r.cost) || 0),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* البيانات الأساسية */}
      <Card className="p-4">
        <h2 className="mb-3 text-base font-bold text-text">بيانات المنتج</h2>
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

          {/* البراند */}
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

          {/* نوع المنتج */}
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

      {/* الصور */}
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

      {/* المقاسات والألوان والكميات */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-text">
            الأصناف — المقاسات والألوان والكميات
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
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted sm:grid sm:grid-cols-[1.1fr_0.8fr_0.9fr_0.7fr_0.8fr_0.9fr_0.9fr_1.3fr_auto]">
            <span>الفرع</span>
            <span>المقاس</span>
            <span>اللون</span>
            <span>الكمية</span>
            <span>الحد الأدنى</span>
            <span>السعر</span>
            <span>التكلفة</span>
            <span>كود SKU</span>
            <span></span>
          </div>

          {variants.map((row) => (
            <div
              key={row.clientId}
              className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-[1.1fr_0.8fr_0.9fr_0.7fr_0.8fr_0.9fr_0.9fr_1.3fr_auto] sm:h-9 sm:items-center sm:gap-2 sm:border-0 sm:p-0"
            >
              <VariantField label="الفرع">
                <select
                  className="input sm:h-9 sm:py-1"
                  value={row.branch}
                  onChange={(e) =>
                    updateRow(row.clientId, {
                      branch: e.target.value as BranchValue,
                      // إعادة توليد SKU عند تغيير ما يدخل فيه (إن لم يكن يدوياً)
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

              <VariantField label="التكلفة (ج.م)">
                <NumberInput
                  decimal
                  className="input nums sm:h-9 sm:py-1"
                  value={row.cost}
                  onChange={(v) => updateRow(row.clientId, { cost: v })}
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
          ))}
        </div>
      </Card>

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEdit ? "حفظ التعديلات" : "إضافة المنتج"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.push("/inventory")}
          disabled={saving}
        >
          إلغاء
        </button>
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
    </form>
  );
}
