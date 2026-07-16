"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Trash2, Search, Save, Truck } from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiGet, apiPut } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { normalizeArabic } from "@/lib/normalize";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ProductFilterBar } from "@/components/product-filter-bar";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { calcDiscount, calcItemNet, round2 } from "@/lib/sale-utils";
import {
  BRANCHES,
  BRANCH_LABELS,
  DISCOUNT_TYPES,
  DISCOUNT_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHODS,
  TRANSFER_METHOD_LABELS,
  DELIVERY_METHODS,
  DELIVERY_METHOD_LABELS,
  ORDER_SOURCES,
  ORDER_SOURCE_LABELS,
  type BranchValue,
  type CategoryValue,
  type DiscountTypeValue,
  type PaymentMethodValue,
  type TransferMethodValue,
  type DeliveryMethodValue,
  type OrderSourceValue,
} from "@/lib/constants";
import { formatCurrency, formatSaleNumber } from "@/lib/format";
import { useSettings } from "@/components/settings-provider";
import { isInvoiceLocked } from "@/lib/invoice-lock";
import type { ProductDTO, SaleDTO } from "@/lib/types";

interface EditItem {
  productId: string;
  variantId: string;
  productName: string;
  brand: string;
  size: string;
  color: string | null;
  unitPrice: number;
  quantity: number;
  // ملاحظة/خصم الصنف — يُحفظان كما هما عبر التعديل (لا يُمسحان)
  note: string | null;
  itemDiscount: number;
  itemDiscountType: DiscountTypeValue;
}

export default function EditSalePage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useFetch<SaleDTO>(`/api/sales/${params.id}`);
  const { settings } = useSettings();

  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <Card className="p-6 text-center text-danger">
        {error || "الفاتورة غير موجودة"}
      </Card>
    );
  if (data.status === "CANCELLED")
    return (
      <Card className="p-6 text-center text-danger">
        لا يمكن تعديل فاتورة ملغية.
      </Card>
    );
  // فاتورة مقفلة (أقدم من مدة القفل ولم تُفتح يدوياً) — تُوجَّه لصفحة العرض لفتح القفل
  if (isInvoiceLocked(data.createdAt, settings.lockDays, data.unlockedAt))
    return (
      <Card className="p-6 text-center">
        <p className="text-warning">
          هذه الفاتورة مقفلة (أقدم من {settings.lockDays} يوم) وغير قابلة للتعديل.
        </p>
        <Link
          href={`/sales/${data.id}`}
          className="btn btn-secondary mt-4 inline-flex"
        >
          الرجوع لعرض الفاتورة وفتح القفل
        </Link>
      </Card>
    );

  return <SaleEditor sale={data} />;
}

function SaleEditor({ sale }: { sale: SaleDTO }) {
  const router = useRouter();

  const [branch, setBranch] = useState<BranchValue>(sale.branch);
  const [items, setItems] = useState<EditItem[]>(
    sale.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      productName: it.productName,
      brand: it.brand,
      size: it.size,
      color: it.color,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      note: it.note,
      itemDiscount: it.itemDiscount,
      itemDiscountType: it.itemDiscountType,
    }))
  );

  const [customerName, setCustomerName] = useState(sale.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(sale.customerPhone ?? "");
  const [customerNotes, setCustomerNotes] = useState(sale.customerNotes ?? "");
  const [invoiceNotes, setInvoiceNotes] = useState(sale.invoiceNotes ?? "");
  const [discountType, setDiscountType] = useState<DiscountTypeValue | "">(
    sale.discountType ?? ""
  );
  const [discountValue, setDiscountValue] = useState(
    sale.discountValue ? String(sale.discountValue) : ""
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>(
    sale.paymentMethod
  );
  const [transferMethod, setTransferMethod] = useState<TransferMethodValue | "">(
    sale.transferMethod ?? ""
  );
  const [paidAmount, setPaidAmount] = useState(
    sale.remainingAmount > 0 ? String(sale.paidAmount) : ""
  );

  // التوصيل
  const [isDelivery, setIsDelivery] = useState(sale.isDelivery);
  const [orderSource, setOrderSource] = useState<OrderSourceValue | "">(
    sale.orderSource ?? ""
  );
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethodValue | "">(
    sale.deliveryMethod ?? ""
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    sale.deliveryAddress ?? ""
  );
  const [addressNotes, setAddressNotes] = useState(sale.addressNotes ?? "");
  const [trackingNumber, setTrackingNumber] = useState(sale.trackingNumber ?? "");

  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  // فلتر «تصفّح بالبراند أولاً» (نفس نمط نقطة البيع)
  const [filterCategory, setFilterCategory] = useState<CategoryValue | "ALL">(
    "ALL"
  );
  const [filterBrand, setFilterBrand] = useState<string | null>(null);
  // المنتجات المُضافة من البحث (تُراكَم حتى تبقى أصنافها متاحة للتبديل والتحقق)
  const [picked, setPicked] = useState<ProductDTO[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // أصناف الفاتورة الحالية تُجلب بمعرّفات منتجاتها فقط (بحث موجّه) بدل كتالوج
  // الفرع كاملاً — فقط للفرع الأصلي (تغيير الفرع يمسح العناصر).
  const initialIds = useMemo(
    () => [...new Set(sale.items.map((it) => it.productId))],
    [sale.items]
  );
  const lookupUrl =
    branch === sale.branch && initialIds.length
      ? `/api/products?branch=${branch}&ids=${initialIds.join(",")}`
      : null;
  const { data: lookupProducts } = useFetch<ProductDTO[]>(lookupUrl);

  // بحث عند الطلب لإضافة المنتجات (بوابة حرفين + limit) بدل كتالوج الفرع كاملاً
  const searchUrl =
    debounced.length >= 2
      ? `/api/products?branch=${branch}&search=${encodeURIComponent(
          debounced
        )}&limit=8`
      : null;
  const { data: searchData, loading: searchLoading } =
    useFetch<ProductDTO[]>(searchUrl);
  const searchResults = searchData ?? [];

  // «تصفّح بالبراند أولاً»: اختيار براند يجلب كل منتجاته للفرع فوراً؛ الكتابة
  // تُضيّق داخلها. المسار البديل (البحث بالاسم أعلاه) يبقى كما هو.
  const browseByBrand = filterBrand !== null;
  const browseUrl = browseByBrand
    ? `/api/products?branch=${branch}&brand=${encodeURIComponent(filterBrand)}${
        filterCategory !== "ALL" ? `&category=${filterCategory}` : ""
      }&limit=100`
    : null;
  const { data: browseData, loading: browseLoading } =
    useFetch<ProductDTO[]>(browseUrl);
  const brandResults = useMemo(() => {
    let list = browseData ?? [];
    if (debounced) {
      const nq = normalizeArabic(debounced);
      list = list.filter((p) =>
        normalizeArabic(`${p.name} ${p.brand}`).includes(nq)
      );
    }
    return list;
  }, [browseData, debounced]);

  // خريطة الأصناف المعروفة: أصناف الفاتورة (بمعرّفاتها) + ما أُضيف من البحث.
  const resolved = useMemo(() => {
    const m = new Map<string, ProductDTO>();
    for (const p of lookupProducts ?? []) m.set(p.id, p);
    for (const p of picked) m.set(p.id, p);
    return m;
  }, [lookupProducts, picked]);

  const variantMap = useMemo(() => {
    const m = new Map<string, { product: ProductDTO; variant: ProductDTO["variants"][number] }>();
    for (const p of resolved.values())
      for (const v of p.variants) m.set(v.id, { product: p, variant: v });
    return m;
  }, [resolved]);

  // كميات العناصر الأصلية (تُعاد للمخزون عند الحفظ، فتزيد المتاح لنفس الصنف)
  const originalQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of sale.items)
      m.set(it.variantId, (m.get(it.variantId) ?? 0) + it.quantity);
    return m;
  }, [sale.items]);

  function availableFor(variantId: string): number {
    const ref = variantMap.get(variantId);
    const stock = ref ? ref.variant.quantity : 0;
    return stock + (originalQty.get(variantId) ?? 0);
  }

  // تغيير الفرع يُفرِّغ العناصر لأن الأصناف تختلف بين الفرعين
  function changeBranch(b: BranchValue) {
    if (b === branch) return;
    if (
      items.length > 0 &&
      !window.confirm("تغيير الفرع سيمسح عناصر الفاتورة الحالية. متابعة؟")
    )
      return;
    setBranch(b);
    setItems([]);
    setFilterCategory("ALL");
    setFilterBrand(null);
  }

  function setQty(index: number, qty: number) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? { ...it, quantity: Math.max(1, Math.floor(qty) || 1) }
          : it
      )
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // تغيير الصنف (المقاس/اللون) ضمن نفس المنتج
  function changeVariant(index: number, variantId: string) {
    const ref = variantMap.get(variantId);
    if (!ref) return;
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              variantId,
              size: ref.variant.size,
              color: ref.variant.color,
              unitPrice: ref.variant.price,
              quantity: Math.min(
                it.quantity,
                Math.max(1, availableFor(variantId))
              ),
            }
          : it
      )
    );
  }

  function addProduct(p: ProductDTO) {
    // سجّل المنتج ليبقى متاحاً للتبديل/التحقق لاحقاً
    setPicked((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    // نحسب المتاح من أصناف المنتج المُمرَّر مباشرةً (قد لا يكون في الخريطة بعد)
    const availOf = (v: ProductDTO["variants"][number]) =>
      v.quantity + (originalQty.get(v.id) ?? 0);
    const v = p.variants.find((x) => availOf(x) > 0) ?? p.variants[0];
    if (!v) return;
    setItems((prev) => {
      const existing = prev.findIndex((it) => it.variantId === v.id);
      if (existing >= 0) {
        return prev.map((it, i) =>
          i === existing
            ? {
                ...it,
                quantity: Math.min(it.quantity + 1, Math.max(1, availOf(v))),
              }
            : it
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          brand: p.brand,
          size: v.size,
          color: v.color,
          unitPrice: v.price,
          quantity: 1,
          note: null,
          itemDiscount: 0,
          itemDiscountType: "FIXED",
        },
      ];
    });
    setSearch("");
    setDebounced(""); // أغلق قائمة البحث فوراً
  }

  // الإجماليات
  const totalAmount = useMemo(
    () =>
      round2(
        items.reduce(
          (s, it) =>
            s +
            calcItemNet(
              it.unitPrice,
              it.quantity,
              it.itemDiscount,
              it.itemDiscountType
            ).net,
          0
        )
      ),
    [items]
  );
  const dValue = Number(discountValue) || 0;
  const { discountAmount, finalAmount } = calcDiscount(
    totalAmount,
    discountType || null,
    dValue
  );

  async function save() {
    if (items.length === 0) return toast.error("الفاتورة فارغة — أضف منتجات");
    // تحقق من الكميات مقابل المتاح
    for (const it of items) {
      const avail = availableFor(it.variantId);
      if (it.quantity > avail)
        return toast.error(
          `الكمية غير كافية من "${it.productName}" مقاس ${it.size} (المتاح: ${avail})`
        );
    }
    if (paymentMethod === "TRANSFER" && !transferMethod)
      return toast.error("اختر طريقة التحويل");
    if (isDelivery && (!orderSource || !deliveryMethod || !deliveryAddress.trim()))
      return toast.error("أكمل بيانات التوصيل (المصدر والطريقة والعنوان)");

    const session = getSession();
    setSaving(true);
    try {
      const body = {
        branch,
        items: items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          note: it.note,
          itemDiscount: it.itemDiscount,
          itemDiscountType: it.itemDiscountType,
        })),
        discountType: discountType || null,
        discountValue: dValue,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        customerNotes: customerNotes.trim() || null,
        paymentMethod,
        transferMethod:
          paymentMethod === "TRANSFER" ? transferMethod || null : null,
        invoiceNotes: invoiceNotes.trim() || null,
        paidAmount: paidAmount === "" ? null : Number(paidAmount),
        delivery: isDelivery
          ? {
              orderSource,
              deliveryMethod,
              deliveryAddress: deliveryAddress.trim(),
              addressNotes: addressNotes.trim() || null,
              trackingNumber: trackingNumber.trim() || null,
            }
          : null,
        editorName: session?.name ?? null,
        editorRole: session?.role ?? null,
      };
      await apiPut<SaleDTO>(`/api/sales/${sale.id}`, body);
      toast.success("تم حفظ تعديلات الفاتورة وتصحيح المخزون");
      router.push(`/sales/${sale.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  }

  const paidNum = paidAmount === "" ? finalAmount : Number(paidAmount) || 0;
  const remaining = round2(Math.max(finalAmount - paidNum, 0));

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <div className="mb-4">
        <Link
          href={`/sales/${sale.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للفاتورة
        </Link>
      </div>
      <PageHeader
        title={`تعديل الفاتورة ${formatSaleNumber(sale.saleNumber)}`}
        description="عدّل البيانات والمنتجات — سيُصحَّح المخزون تلقائياً عند الحفظ"
      />

      {/* الفرع */}
      <Card className="mb-4 p-4">
        <label className="label">الفرع</label>
        <div className="flex flex-wrap gap-2">
          {BRANCHES.map((b) => (
            <button
              key={b}
              onClick={() => changeBranch(b)}
              className={
                branch === b
                  ? "btn btn-primary h-10"
                  : "btn btn-secondary h-10"
              }
            >
              {BRANCH_LABELS[b]}
            </button>
          ))}
        </div>
      </Card>

      {/* المنتجات */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-text">المنتجات</h2>
          <span className="text-sm text-muted nums">
            {items.length} صنف
          </span>
        </div>

        {/* شريط الفلترة الموحّد — تصفّح بالبراند أولاً */}
        <ProductFilterBar
          category={filterCategory}
          brand={filterBrand}
          onCategory={(c) => {
            setFilterCategory(c);
            setFilterBrand(null);
          }}
          onBrand={setFilterBrand}
          className="mb-3"
        />

        {/* إضافة منتج بالبحث بالاسم */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="input pr-9"
            placeholder={
              browseByBrand
                ? "ضيّق داخل منتجات البراند (اختياري)"
                : "ابحث لإضافة منتج (الاسم أو البراند)"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {!browseByBrand &&
            debounced.length >= 2 &&
            (searchLoading || searchResults.length > 0) && (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-surface shadow-card">
              {searchLoading && (
                <p className="px-3 py-2 text-center text-sm text-muted">
                  جارٍ البحث…
                </p>
              )}
              {searchResults.map((p) => {
                // المتاح يُحسب من أصناف نتيجة البحث نفسها (مسحوبة لهذا الفرع)
                const avail = p.variants.reduce(
                  (s, v) => s + v.quantity + (originalQty.get(v.id) ?? 0),
                  0
                );
                return (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-right text-sm last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-text">
                        {p.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {p.brand}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted nums">
                      متاح: {avail}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* وضع البراند: قائمة كل منتجات البراند المختار (مع تضييق بالكتابة) */}
        {browseByBrand && (
          <div className="mb-3 max-h-72 overflow-auto rounded-lg border">
            {browseLoading ? (
              <p className="px-3 py-4 text-center text-sm text-muted">
                جارٍ التحميل…
              </p>
            ) : brandResults.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">
                لا توجد منتجات مطابقة لهذا البراند في الفرع.
              </p>
            ) : (
              brandResults.map((p) => {
                const avail = p.variants.reduce(
                  (s, v) => s + v.quantity + (originalQty.get(v.id) ?? 0),
                  0
                );
                return (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-right text-sm last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-text">
                        {p.name}
                      </span>
                      <span className="block text-xs text-muted">{p.brand}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted nums">
                      متاح: {avail}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            لا توجد منتجات — أضف من البحث بالأعلى.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it, i) => {
              const ref = variantMap.get(it.variantId);
              const productVariants = ref?.product.variants ?? [];
              const avail = availableFor(it.variantId);
              return (
                <div
                  key={`${it.variantId}-${i}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">
                      {it.productName}
                    </p>
                    <p className="text-xs text-muted">{it.brand}</p>
                    {it.itemDiscount > 0 && (
                      <p className="text-xs text-warning">
                        خصم الصنف:{" "}
                        {it.itemDiscountType === "PERCENTAGE"
                          ? `${it.itemDiscount}%`
                          : formatCurrency(it.itemDiscount)}
                      </p>
                    )}
                    {it.note && (
                      <p className="truncate text-xs text-muted">
                        📝 {it.note}
                      </p>
                    )}
                  </div>

                  {/* اختيار الصنف (المقاس/اللون) */}
                  {productVariants.length > 0 ? (
                    <select
                      className="input h-9 w-auto min-w-[120px] text-xs"
                      value={it.variantId}
                      onChange={(e) => changeVariant(i, e.target.value)}
                    >
                      {productVariants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.size}
                          {v.color ? ` / ${v.color}` : ""} (متاح{" "}
                          {availableFor(v.id)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-muted nums">
                      {it.size}
                      {it.color ? ` / ${it.color}` : ""}
                    </span>
                  )}

                  <input
                    type="number"
                    min={1}
                    className="input h-9 w-20 text-center nums"
                    value={it.quantity}
                    onChange={(e) => setQty(i, Number(e.target.value))}
                  />
                  <span
                    className={
                      it.quantity > avail
                        ? "w-24 text-left text-xs font-bold text-danger nums"
                        : "w-24 text-left text-xs text-muted nums"
                    }
                  >
                    {formatCurrency(
                      calcItemNet(
                        it.unitPrice,
                        it.quantity,
                        it.itemDiscount,
                        it.itemDiscountType
                      ).net
                    )}
                  </span>
                  <button
                    onClick={() => removeItem(i)}
                    className="btn btn-ghost h-9 w-9 !px-0 text-danger"
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* بيانات العميل + الدفع */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-base font-bold text-text">بيانات العميل</h2>
          <label className="label">اسم العميل</label>
          <input
            className="input mb-3"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="عميل عابر"
          />
          <label className="label">رقم الهاتف</label>
          <input
            className="input mb-3 nums"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            inputMode="numeric"
          />
          <label className="label">ملاحظات العميل</label>
          <textarea
            className="input min-h-[60px] resize-y"
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
          />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-base font-bold text-text">الدفع والخصم</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">نوع الخصم</label>
              <select
                className="input"
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as DiscountTypeValue | "")
                }
              >
                <option value="">بدون</option>
                {DISCOUNT_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {DISCOUNT_TYPE_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">قيمة الخصم</label>
              <input
                type="number"
                className="input nums"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                disabled={!discountType}
                min={0}
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">طريقة الدفع</label>
              <select
                className="input"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as PaymentMethodValue)
                }
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_METHOD_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            {paymentMethod === "TRANSFER" && (
              <div>
                <label className="label">طريقة التحويل</label>
                <select
                  className="input"
                  value={transferMethod}
                  onChange={(e) =>
                    setTransferMethod(e.target.value as TransferMethodValue | "")
                  }
                >
                  <option value="">اختر</option>
                  {TRANSFER_METHODS.map((t) => (
                    <option key={t} value={t}>
                      {TRANSFER_METHOD_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <label className="label mt-3">المبلغ المدفوع (اتركه فارغاً = مدفوع بالكامل)</label>
          <input
            type="number"
            className="input nums"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            min={0}
            placeholder={String(finalAmount)}
          />
          <label className="label mt-3">ملاحظات الفاتورة</label>
          <textarea
            className="input min-h-[60px] resize-y"
            value={invoiceNotes}
            onChange={(e) => setInvoiceNotes(e.target.value)}
          />
        </Card>
      </div>

      {/* التوصيل */}
      <Card className="mb-4 p-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isDelivery}
            onChange={(e) => setIsDelivery(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="flex items-center gap-1.5 text-base font-bold text-text">
            <Truck className="h-4 w-4" />
            طلب توصيل
          </span>
        </label>
        {isDelivery && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">مصدر الطلب</label>
              <select
                className="input"
                value={orderSource}
                onChange={(e) =>
                  setOrderSource(e.target.value as OrderSourceValue | "")
                }
              >
                <option value="">اختر</option>
                {ORDER_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {ORDER_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">طريقة التوصيل</label>
              <select
                className="input"
                value={deliveryMethod}
                onChange={(e) =>
                  setDeliveryMethod(e.target.value as DeliveryMethodValue | "")
                }
              >
                <option value="">اختر</option>
                {DELIVERY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {DELIVERY_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">العنوان</label>
              <input
                className="input"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="label">ملاحظات العنوان</label>
              <input
                className="input"
                value={addressNotes}
                onChange={(e) => setAddressNotes(e.target.value)}
              />
            </div>
            <div>
              <label className="label">رقم التتبع (Bosta)</label>
              <input
                className="input nums"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
          </div>
        )}
      </Card>

      {/* الإجماليات + الحفظ */}
      <Card className="p-4">
        <div className="mr-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-muted">
            <span>الإجمالي</span>
            <span className="nums">{formatCurrency(totalAmount)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-warning">
              <span>الخصم</span>
              <span className="nums">- {formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 text-lg font-extrabold text-text">
            <span>الصافي</span>
            <span className="nums">{formatCurrency(finalAmount)}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between font-medium text-warning">
              <span>المتبقي</span>
              <span className="nums">{formatCurrency(remaining)}</span>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={save}
            disabled={saving || items.length === 0}
            className="btn btn-primary h-11 sm:w-auto"
          >
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            حفظ التعديلات
          </button>
          <Link
            href={`/sales/${sale.id}`}
            className="btn btn-secondary h-11 sm:w-auto"
          >
            إلغاء
          </Link>
        </div>
      </Card>
    </div>
  );
}
