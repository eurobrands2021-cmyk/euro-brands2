"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { NumberInput, TextOnlyInput } from "@/components/ui/inputs";
import { useFetch } from "@/lib/use-fetch";
import { apiPost } from "@/lib/client";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import {
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  COMMON_COLORS,
  sizesForCategory,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";
import type {
  BrandDTO,
  ProductDTO,
  ProductInput,
  ProductTypeDTO,
  VariantDTO,
} from "@/lib/types";

// نافذة «إضافة سريعة من POS»: تنشئ منتجاً كمسودة وتضيفه للسلة فوراً.
// المستخدم يُكمل باقي البيانات لاحقاً من صفحة المخزون.
export function QuickAddProductModal({
  open,
  branch,
  onClose,
  onAdded,
}: {
  open: boolean;
  branch: BranchValue;
  onClose: () => void;
  onAdded: (product: ProductDTO, variant: VariantDTO) => void;
}) {
  const [name, setName] = useState("");
  // هل عدّل المستخدم الاسم يدوياً؟ لو نعم نتوقّف عن التوليد التلقائي.
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState<CategoryValue>("CLOTHES");
  const [productTypeId, setProductTypeId] = useState("");
  const [size, setSize] = useState("");
  // وضع «مقاس مخصص» (أخرى) — يكشف حقل إدخال حر عندما لا تكفي القائمة القياسية
  const [customSizeMode, setCustomSizeMode] = useState(false);
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);

  const { data: brandsData, refetch: refetchBrands } = useFetch<BrandDTO[]>(
    `/api/brands?category=${category}`
  );
  const brandOptions = (brandsData ?? []).map((b) => b.name);

  // إضافة براند جديد مباشرةً من القائمة
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);

  const { data: typesData, loading: typesLoading } =
    useFetch<ProductTypeDTO[]>("/api/product-types");
  const typeOptions = (typesData ?? []).filter((t) => t.category === category);
  const selectedType = typeOptions.find((t) => t.id === productTypeId);

  // اسم مقترح يُبنى من «{نوع المنتج} {البراند}» مثل «بولو أميركن إيجل».
  const suggestedName = useMemo(
    () => [selectedType?.name, brand].filter(Boolean).join(" ").trim(),
    [selectedType?.name, brand]
  );

  // توليد الاسم تلقائياً عند تغيير النوع أو البراند، ما لم يُعدّله المستخدم يدوياً.
  useEffect(() => {
    if (nameManuallyEdited) return;
    setName(suggestedName);
  }, [nameManuallyEdited, suggestedName]);

  // تغيير الاسم يدوياً يوقف التوليد؛ ومسحه بالكامل يستأنفه من جديد.
  function handleNameChange(v: string) {
    setName(v);
    setNameManuallyEdited(v.trim().length > 0);
  }

  // إعادة ضبط الحقول عند فتح النافذة
  useEffect(() => {
    if (open) {
      setName("");
      setNameManuallyEdited(false);
      setBrand("");
      setCategory("CLOTHES");
      setProductTypeId("");
      setSize("");
      setCustomSizeMode(false);
      setColor("");
      setPrice("");
      setQuantity("1");
      setAddingBrand(false);
      setNewBrand("");
    }
  }, [open]);

  // عند تغيير الفئة: صفّر البراند والنوع والمقاس (لأنها مرتبطة بالفئة)
  function changeCategory(c: CategoryValue) {
    setCategory(c);
    setBrand("");
    setProductTypeId("");
    setSize("");
    setCustomSizeMode(false);
    setAddingBrand(false);
    setNewBrand("");
  }

  // اختيار خيار «إضافة براند جديد» من القائمة
  function onBrandSelect(value: string) {
    if (value === "__add_brand__") {
      setAddingBrand(true);
      setBrand("");
    } else {
      setBrand(value);
    }
  }

  async function saveNewBrand() {
    const trimmed = newBrand.trim();
    if (!trimmed) return toast.error("اسم البراند مطلوب");
    setSavingBrand(true);
    try {
      const created = await apiPost<BrandDTO>("/api/brands", {
        name: trimmed,
        category,
      });
      await refetchBrands();
      setBrand(created.name);
      setAddingBrand(false);
      setNewBrand("");
      toast.success("تمت إضافة البراند");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إضافة البراند");
    } finally {
      setSavingBrand(false);
    }
  }

  async function submit() {
    if (!name.trim()) return toast.error("اسم المنتج مطلوب");
    if (!brand.trim()) return toast.error("يجب اختيار البراند");
    if (!size.trim()) return toast.error("المقاس مطلوب");
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      return toast.error("أدخل سعراً صحيحاً");
    const qtyNum = Math.max(1, Math.floor(Number(quantity) || 1));

    const payload: ProductInput = {
      name: name.trim(),
      brand: brand.trim(),
      category,
      description: null,
      barcode: null,
      images: [],
      productTypeId: productTypeId || null,
      isDraft: true,
      variants: [
        {
          branch,
          size: size.trim(),
          color: color.trim() || null,
          quantity: qtyNum,
          minQuantity: 5,
          price: priceNum,
          sku: null,
        },
      ],
    };

    setSaving(true);
    try {
      const created = await apiPost<ProductDTO>("/api/products", payload);
      const variant = created.variants[0];
      if (!variant) throw new Error("تعذّر إنشاء الصنف");
      void logActivity(
        ACTIVITY_ACTIONS.CREATE_PRODUCT,
        `${created.name} (مسودة سريعة)`
      );
      onAdded(created, variant);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إضافة المنتج");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="إضافة سريعة من POS"
      footer={
        <>
          <button
            className="btn btn-primary w-full sm:w-auto"
            onClick={submit}
            disabled={saving}
          >
            {saving && <Spinner className="h-4 w-4" />}
            إضافة للسلة
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">اسم المنتج *</label>
          <TextOnlyInput
            autoFocus
            className="input"
            value={name}
            onChange={handleNameChange}
            placeholder="سيتم توليده تلقائياً"
          />
        </div>

        <div>
          <label className="label">الفئة *</label>
          <select
            className="input"
            value={category}
            onChange={(e) => changeCategory(e.target.value as CategoryValue)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">البراند *</label>
          <select
            className="input"
            value={addingBrand ? "__add_brand__" : brand}
            onChange={(e) => onBrandSelect(e.target.value)}
          >
            <option value="">اختر البراند</option>
            {brandOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            <option value="__add_brand__">+ إضافة براند جديد</option>
          </select>
          {addingBrand && (
            <div className="mt-2 flex gap-2">
              <TextOnlyInput
                autoFocus
                className="input"
                value={newBrand}
                onChange={setNewBrand}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveNewBrand();
                  }
                }}
                placeholder="اسم البراند الجديد"
              />
              <button
                type="button"
                className="btn btn-primary flex-shrink-0"
                onClick={saveNewBrand}
                disabled={savingBrand}
              >
                {savingBrand && <Spinner className="h-4 w-4" />}
                حفظ
              </button>
              <button
                type="button"
                className="btn btn-secondary flex-shrink-0"
                onClick={() => {
                  setAddingBrand(false);
                  setNewBrand("");
                }}
                disabled={savingBrand}
              >
                إلغاء
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="label">النوع</label>
          <select
            className="input"
            value={productTypeId}
            onChange={(e) => setProductTypeId(e.target.value)}
            disabled={typesLoading}
          >
            <option value="">
              {typesLoading
                ? "جاري التحميل…"
                : typeOptions.length === 0
                  ? "لا توجد أنواع لهذه الفئة"
                  : "— بدون نوع —"}
            </option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">المقاس *</label>
          <select
            className="input"
            value={customSizeMode ? "__other__" : size}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__other__") {
                setCustomSizeMode(true);
                setSize("");
              } else {
                setCustomSizeMode(false);
                setSize(v);
              }
            }}
          >
            <option value="">اختر المقاس</option>
            {sizesForCategory(category).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {/* مقاس محفوظ خارج القائمة القياسية يبقى ظاهراً */}
            {size && !customSizeMode && !sizesForCategory(category).includes(size) && (
              <option value={size}>{size}</option>
            )}
            <option value="__other__">أخرى…</option>
          </select>
          {customSizeMode && (
            <input
              className="input mt-2"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="اكتب مقاساً مخصصاً (مثال: 3XL أو 46)"
              autoFocus
            />
          )}
        </div>

        <div>
          <label className="label">اللون</label>
          <select
            className="input"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          >
            <option value="">— بدون لون —</option>
            {COMMON_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">السعر (ج.م) *</label>
          <NumberInput
            decimal
            className="input nums"
            value={price}
            onChange={setPrice}
            placeholder="0"
          />
        </div>

        <div>
          <label className="label">الكمية</label>
          <NumberInput
            className="input nums"
            value={quantity}
            onChange={setQuantity}
            placeholder="1"
          />
        </div>

        <div>
          <label className="label">الفرع</label>
          <input
            className="input bg-[var(--surface-2)]"
            value={BRANCH_LABELS[branch]}
            readOnly
          />
        </div>
      </div>

      <p className="mt-3 rounded-lg border border-warning/40 bg-[rgba(201,133,26,0.08)] p-2.5 text-xs text-warning">
        سيُضاف المنتج كمسودة ويُدرَج في السلة فوراً — أكمل باقي بياناته لاحقاً من
        المخزون.
      </p>
    </Modal>
  );
}
