"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  ChevronDown,
  Store,
  CheckCircle2,
  Package,
  RefreshCcw,
  ScanLine,
  Save,
  Clock,
  Truck,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiGet, apiPost } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ReceiptModal } from "@/components/receipt-modal";
import { QuickAddProductModal } from "@/components/quick-add-product-modal";
import { Modal } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { Spinner, PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  NumberInput,
  PhoneInput,
  TextOnlyInput,
} from "@/components/ui/inputs";
import { isCompleteEgyPhone, digitsOnly } from "@/lib/input-validators";
import { extractSkuFromScan } from "@/lib/public-url";
import { normalizeArabic } from "@/lib/normalize";
import { addPendingSale } from "@/lib/offline-db";
import {
  OFFLINE_QUEUE_CHANGED_EVENT,
  OFFLINE_SYNCED_EVENT,
} from "@/components/offline-provider";
import { cn } from "@/lib/cn";
import { calcDiscount, round2 } from "@/lib/sale-utils";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSaleNumber,
} from "@/lib/format";
import {
  BRANCHES,
  BRANCH_LABELS,
  DELIVERY_METHODS,
  DELIVERY_METHOD_LABELS,
  ORDER_SOURCES,
  ORDER_SOURCE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHODS,
  TRANSFER_METHOD_LABELS,
  type BranchValue,
  type DeliveryMethodValue,
  type DiscountTypeValue,
  type OrderSourceValue,
  type PaymentMethodValue,
  type TransferMethodValue,
} from "@/lib/constants";
import type {
  CustomerDTO,
  CustomerListResponse,
  ProductDTO,
  SaleDTO,
  VariantDTO,
} from "@/lib/types";

interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  brand: string;
  size: string;
  color: string | null;
  sku: string | null;
  unitPrice: number;
  available: number;
  quantity: number;
}

interface HeldInvoice {
  id: string;
  savedAt: string;
  itemsCount: number;
  total: number;
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  customerNotes: string;
  invoiceNotes: string;
  discountType: DiscountTypeValue | "NONE";
  discountValue: string;
  paymentMethod: PaymentMethodValue;
  transferMethod: TransferMethodValue | "";
  partialOn: boolean;
  paidInput: string;
  cashReceived?: string;
  deliveryOn?: boolean;
  orderSource?: OrderSourceValue | "";
  deliveryMethod?: DeliveryMethodValue | "";
  deliveryAddress?: string;
  addressNotes?: string;
  trackingNumber?: string;
}

const BRANCH_KEY = "eb-pos-branch";
// تخبئة «الأكثر مبيعاً» لمدة ساعة لتفادي الجلب عند كل تركيز على حقل البحث
const BESTSELLERS_KEY = "pos_bestsellers";
const BESTSELLERS_TTL_MS = 60 * 60 * 1000; // ساعة واحدة

interface BestsellersCache {
  branch: string;
  ts: number;
  items: ProductDTO[];
}

export default function PosPage() {
  const [branch, setBranch] = useState<BranchValue | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(BRANCH_KEY) as BranchValue | null;
    if (stored && BRANCHES.includes(stored)) setBranch(stored);
    setReady(true);
  }, []);

  function chooseBranch(b: BranchValue) {
    setBranch(b);
    localStorage.setItem(BRANCH_KEY, b);
  }

  if (!ready) return <PageLoader />;
  if (!branch) return <BranchPicker onPick={chooseBranch} />;
  // مفتاح لإعادة تهيئة الحالة عند تغيير الفرع
  return (
    <PosRegister
      key={branch}
      branch={branch}
      onChangeBranch={() => setBranch(null)}
    />
  );
}

function BranchPicker({ onPick }: { onPick: (b: BranchValue) => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md p-8 text-center" tone="accent">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Store className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-extrabold text-text">اختر الفرع</h1>
        <p className="mt-1 text-sm text-muted">
          حدد الفرع الذي تعمل عليه لبدء جلسة البيع
        </p>
        <div className="mt-6 grid gap-3">
          {BRANCHES.map((b) => (
            <button
              key={b}
              onClick={() => onPick(b)}
              className="btn btn-secondary h-12 text-base hover:border-accent hover:text-accent"
            >
              {BRANCH_LABELS[b]}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PosRegister({
  branch,
  onChangeBranch,
}: {
  branch: BranchValue;
  onChangeBranch: () => void;
}) {
  const heldKey = `eb-held-${branch}`;

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  // على الموبايل: الفاتورة تُطوى كـ«درج» يُفتح عند الحاجة (سطح المكتب دائماً مفتوح)
  const [cartOpen, setCartOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountTypeValue | "NONE">(
    "NONE"
  );
  const [discountValue, setDiscountValue] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerLookup, setCustomerLookup] = useState<CustomerDTO | null>(null);
  const [customerNotFound, setCustomerNotFound] = useState(false);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [saveAsNewCustomer, setSaveAsNewCustomer] = useState(false);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>("CASH");
  const [transferMethod, setTransferMethod] = useState<TransferMethodValue | "">(
    ""
  );
  const [partialOn, setPartialOn] = useState(false);
  const [paidInput, setPaidInput] = useState("");
  const [cashReceived, setCashReceived] = useState(""); // دفع العميل — حاسبة الباقي
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [orderSource, setOrderSource] = useState<OrderSourceValue | "">("");
  const [deliveryMethod, setDeliveryMethod] = useState<
    DeliveryMethodValue | ""
  >("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receipt, setReceipt] = useState<SaleDTO | null>(null);
  const [held, setHeld] = useState<HeldInvoice[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [bestsellers, setBestsellers] = useState<ProductDTO[]>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => setHighlight(0), [debounced]);

  // بعد مزامنة الطابور (عودة الاتصال) أعِد جلب المنتجات لتحديث الكميات
  useEffect(() => {
    const onSynced = () => refetch();
    window.addEventListener(OFFLINE_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(OFFLINE_SYNCED_EVENT, onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحميل/حفظ الفواتير المعلّقة في localStorage (لكل فرع)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(heldKey);
      setHeld(raw ? JSON.parse(raw) : []);
    } catch {
      setHeld([]);
    }
  }, [heldKey]);
  useEffect(() => {
    localStorage.setItem(heldKey, JSON.stringify(held));
  }, [held, heldKey]);

  // «الأكثر مبيعاً» — تُعرَض عند تركيز حقل البحث وهو فارغ. تُخبَّأ محلياً لمدة
  // ساعة لكل فرع لتفادي الجلب عند كل تركيز.
  useEffect(() => {
    // 1) من التخبئة إن كانت طازجة ولنفس الفرع
    try {
      const raw = localStorage.getItem(BESTSELLERS_KEY);
      if (raw) {
        const cache = JSON.parse(raw) as BestsellersCache;
        if (
          cache &&
          cache.branch === branch &&
          Array.isArray(cache.items) &&
          Date.now() - cache.ts < BESTSELLERS_TTL_MS
        ) {
          setBestsellers(cache.items);
          return;
        }
      }
    } catch {
      /* تجاهل تخبئة تالفة */
    }

    // 2) جلب من الخادم ثم تخبئة النتيجة
    let cancelled = false;
    apiGet<ProductDTO[]>(
      `/api/products?sort=bestselling&limit=5&branch=${branch}`
    )
      .then((items) => {
        if (cancelled) return;
        setBestsellers(items);
        try {
          const cache: BestsellersCache = { branch, ts: Date.now(), items };
          localStorage.setItem(BESTSELLERS_KEY, JSON.stringify(cache));
        } catch {
          /* تجاهل امتلاء التخزين */
        }
      })
      .catch(() => {
        /* تجاهل فشل الجلب — تبقى القائمة فارغة */
      });
    return () => {
      cancelled = true;
    };
  }, [branch]);

  const normalizedSearch = normalizeArabic(debounced);
  const url = `/api/products?branch=${branch}${
    debounced ? `&search=${encodeURIComponent(normalizedSearch)}` : ""
  }`;
  const { data, loading, error, refetch } = useFetch<ProductDTO[]>(url);
  const results = data ?? [];
  const dropdownItems = results.slice(0, 8);
  const dropdownOpen =
    searchFocused && debounced.length >= 2 && dropdownItems.length > 0 && !loading;

  // قائمة «الأكثر مبيعاً» تظهر عند تركيز حقل البحث وهو فارغ ووجود منتجات
  const bestsellersOpen =
    searchFocused && term.trim() === "" && bestsellers.length > 0;

  // ---- عمليات السلة ----
  function addVariant(product: ProductDTO, variant: ProductDTO["variants"][0]) {
    if (variant.quantity <= 0) return;
    const existingQty =
      cart.find((i) => i.variantId === variant.id)?.quantity ?? 0;
    if (existingQty >= variant.quantity) {
      toast.error("لا توجد كمية إضافية متاحة");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === variant.id);
      if (existing) {
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
          sku: variant.sku ?? null,
          unitPrice: variant.price,
          available: variant.quantity,
          quantity: 1,
        },
      ];
    });
    setCartOpen(true); // افتح درج الفاتورة على الموبايل عند أول إضافة
  }

  // إضافة منتج مسودة أُنشئ للتو من نافذة الإضافة السريعة
  function handleQuickAdded(product: ProductDTO, variant: VariantDTO) {
    addVariant(product, variant);
    toast.success("تم إضافة المنتج كمسودة — أكمل بياناته من المخزون");
    refetch();
  }

  // يضيف أول مقاس متاح للمنتج (لاختصار لوحة المفاتيح)
  function addFirstAvailable(product: ProductDTO) {
    const v = product.variants.find((x) => {
      const inCart = cart.find((c) => c.variantId === x.id)?.quantity ?? 0;
      return x.quantity > 0 && inCart < x.quantity;
    });
    if (v) addVariant(product, v);
    else toast.error("لا توجد كمية متاحة لهذا المنتج");
  }

  function setQty(variantId: string, qty: number) {
    setCart((prev) =>
      prev.map((i) =>
        i.variantId === variantId
          ? { ...i, quantity: Math.min(Math.max(1, qty), i.available) }
          : i
      )
    );
  }
  function removeItem(variantId: string) {
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  // تغيير رقم الهاتف يُلغي نتيجة أي بحث سابق عن عميل
  function handlePhoneChange(value: string) {
    setCustomerPhone(value);
    if (customerLookup || customerNotFound) {
      setCustomerLookup(null);
      setCustomerNotFound(false);
      setSaveAsNewCustomer(false);
    }
  }

  // ملء اسم العميل تلقائياً عند اكتمال رقم الهاتف (11 رقماً) — دون نقر إضافي
  useEffect(() => {
    // نطبّع الرقم لأرقام فقط (11 رقماً = بادئة + 8) قبل البحث والمطابقة
    const digits = digitsOnly(customerPhone);
    if (!isCompleteEgyPhone(digits)) return;
    let cancelled = false;
    setCustomerLookupLoading(true);
    apiGet<CustomerListResponse>(
      `/api/customers?phone=${encodeURIComponent(digits)}`
    )
      .then((res) => {
        if (cancelled) return;
        const exact =
          res.customers.find((c) => c.phone === digits) ??
          res.customers[0] ??
          null;
        if (exact) {
          setCustomerLookup(exact);
          setCustomerName(exact.name);
          setCustomerNotFound(false);
          setSaveAsNewCustomer(false);
        } else {
          setCustomerLookup(null);
          setCustomerNotFound(true);
        }
      })
      .catch(() => {
        /* تجاهل فشل الجلب المؤقّت */
      })
      .finally(() => {
        if (!cancelled) setCustomerLookupLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPhone]);

  // مسح الباركود: بحث فوري بنفس رقم الباركود، وإضافة تلقائية للسلة إن كان
  // هناك صنف مطابق واحد فقط في هذا الفرع، وإلا تُعرض النتائج للاختيار.
  async function handleBarcodeScan(rawCode: string) {
    // يدعم مسح QR الذي يشفّر رابط /p/[sku] كما يدعم باركود الـ SKU المباشر:
    // نستخرج الـ SKU من الرابط إن وُجد، وإلا نستخدم القيمة كما هي.
    const code = extractSkuFromScan(rawCode);
    try {
      const results = await apiGet<ProductDTO[]>(
        `/api/products?branch=${branch}&search=${encodeURIComponent(code)}`
      );
      const matches = results.flatMap((p) =>
        p.variants.map((v) => ({ product: p, variant: v }))
      );
      if (matches.length === 1) {
        addVariant(matches[0].product, matches[0].variant);
        toast.success(
          `تمت إضافة ${matches[0].product.name} (${matches[0].variant.size}) للفاتورة`
        );
        setTerm("");
      } else if (matches.length === 0) {
        toast.error("لم يتم العثور على منتج بهذا الباركود");
        setTerm(code);
      } else {
        setTerm(code);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر البحث عن الباركود");
    }
  }

  function resetSale() {
    setCart([]);
    setDiscountType("NONE");
    setDiscountValue("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    setCustomerLookup(null);
    setCustomerNotFound(false);
    setSaveAsNewCustomer(false);
    setInvoiceNotes("");
    setPaymentMethod("CASH");
    setTransferMethod("");
    setPartialOn(false);
    setPaidInput("");
    setCashReceived("");
    setDeliveryOn(false);
    setOrderSource("");
    setDeliveryMethod("");
    setDeliveryAddress("");
    setAddressNotes("");
    setTrackingNumber("");
  }

  // ---- الإجماليات ----
  const totalAmount = useMemo(
    () => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    [cart]
  );
  const { discountAmount, finalAmount } = useMemo(
    () =>
      calcDiscount(
        totalAmount,
        discountType === "NONE" ? null : discountType,
        Number(discountValue) || 0
      ),
    [totalAmount, discountType, discountValue]
  );
  const itemsCount = cart.reduce((s, i) => s + i.quantity, 0);
  const paidAmount = partialOn
    ? Math.min(Math.max(Number(paidInput) || 0, 0), finalAmount)
    : finalAmount;
  const remainingAmount = round2(finalAmount - paidAmount);

  // حاسبة الباقي النقدي (مستقلة عن الدفع الجزئي)
  const cashReceivedNum = Number(cashReceived) || 0;
  const changeDue = round2(cashReceivedNum - finalAmount);
  const cashCalcActive = !partialOn && cashReceived.trim() !== "";

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Escape يُخفي القائمة المنسدلة (النتائج أو سجل آخر المنتجات)
    if (e.key === "Escape") {
      setSearchFocused(false);
      return;
    }
    if (!dropdownOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, dropdownItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = dropdownItems[highlight];
      if (p) addFirstAvailable(p);
    } else if (e.key === "Escape") {
      setSearchFocused(false);
    }
  }

  // ---- الفواتير المعلّقة ----
  function saveHeld() {
    if (cart.length === 0) return toast.error("لا توجد فاتورة لحفظها");
    const inv: HeldInvoice = {
      id: Math.random().toString(36).slice(2),
      savedAt: new Date().toISOString(),
      itemsCount,
      total: round2(finalAmount),
      cart,
      customerName,
      customerPhone,
      customerNotes,
      invoiceNotes,
      discountType,
      discountValue,
      paymentMethod,
      transferMethod,
      partialOn,
      paidInput,
      cashReceived,
      deliveryOn,
      orderSource,
      deliveryMethod,
      deliveryAddress,
      addressNotes,
      trackingNumber,
    };
    setHeld((prev) => [inv, ...prev]);
    resetSale();
    toast.success("تم حفظ الفاتورة مؤقتاً");
  }

  function restoreHeld(h: HeldInvoice) {
    setCart(h.cart);
    setCartOpen(true);
    setCustomerName(h.customerName);
    setCustomerPhone(h.customerPhone);
    setCustomerNotes(h.customerNotes);
    setInvoiceNotes(h.invoiceNotes);
    setDiscountType(h.discountType);
    setDiscountValue(h.discountValue);
    setPaymentMethod(h.paymentMethod);
    setTransferMethod(h.transferMethod);
    setPartialOn(h.partialOn);
    setPaidInput(h.paidInput);
    setCashReceived(h.cashReceived ?? "");
    setDeliveryOn(!!h.deliveryOn);
    setOrderSource((h.orderSource as OrderSourceValue | "") ?? "");
    setDeliveryMethod(h.deliveryMethod ?? "");
    setDeliveryAddress(h.deliveryAddress ?? "");
    setAddressNotes(h.addressNotes ?? "");
    setTrackingNumber(h.trackingNumber ?? "");
    setHeld((prev) => prev.filter((x) => x.id !== h.id));
    setHeldOpen(false);
    toast.success("تم استرجاع الفاتورة");
  }

  function deleteHeld(id: string) {
    setHeld((prev) => prev.filter((x) => x.id !== id));
  }

  async function confirmSale() {
    if (cart.length === 0) return toast.error("الفاتورة فارغة");
    if (customerPhone && !isCompleteEgyPhone(customerPhone))
      return toast.error("رقم الهاتف غير مكتمل — يجب أن يكون 11 رقماً");
    if (paymentMethod === "TRANSFER" && !transferMethod)
      return toast.error("اختر طريقة التحويل");
    if (deliveryOn) {
      if (!orderSource) return toast.error("اختر مصدر الطلب");
      if (!deliveryMethod) return toast.error("اختر طريقة التوصيل");
      if (!deliveryAddress.trim()) return toast.error("أدخل عنوان التوصيل");
    }

    const payload = {
      branch,
      items: cart.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      discountType: discountType === "NONE" ? null : discountType,
      discountValue: Number(discountValue) || 0,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerNotes: customerNotes || null,
      invoiceNotes: invoiceNotes || null,
      paymentMethod,
      transferMethod: paymentMethod === "TRANSFER" ? transferMethod : null,
      paidAmount: partialOn
        ? paidAmount
        : cashCalcActive
          ? cashReceivedNum
          : null,
      changeAmount: cashCalcActive && changeDue > 0 ? changeDue : null,
      cashierName: getSession()?.name ?? null,
      saveAsNewCustomer: !customerLookup && customerNotFound && saveAsNewCustomer,
      delivery:
        deliveryOn && orderSource && deliveryMethod
          ? {
              orderSource, // قيمة enum (PHONE/FACEBOOK/...)
              deliveryMethod,
              deliveryAddress: deliveryAddress.trim(),
              addressNotes: addressNotes.trim() || null,
              trackingNumber:
                deliveryMethod === "BOSTA"
                  ? trackingNumber.trim() || null
                  : null,
            }
          : null,
    };

    // وضع عدم الاتصال: تحقّق من المخزون المخبّأ ثم أضف الفاتورة لطابور المزامنة
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const blocked = cart.find(
        (i) => i.available <= 0 || i.quantity > i.available
      );
      if (blocked) return toast.error("المنتج غير متوفر في المخزون");
      setSubmitting(true);
      try {
        await addPendingSale({
          id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          payload,
          branch,
          itemsCount,
          total: round2(finalAmount),
          createdAt: new Date().toISOString(),
        });
        window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
        toast.success(
          "تم حفظ الفاتورة محلياً — ستتم مزامنتها عند عودة الاتصال"
        );
        resetSale();
      } catch (e) {
        toast.error("تعذّر حفظ الفاتورة محلياً");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const sale = await apiPost<SaleDTO>("/api/sales", payload);
      setReceipt(sale);
      void logActivity(
        ACTIVITY_ACTIONS.CREATE_SALE,
        `فاتورة ${formatSaleNumber(sale.saleNumber)} — ${formatCurrency(
          sale.finalAmount
        )}`
      );
      resetSale();
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تأكيد البيعة");
      refetch();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-24 md:pb-0">
      {/* رأس الصفحة */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text">نقطة البيع</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Store className="h-4 w-4" />
            الفرع الحالي:{" "}
            <span className="font-bold text-accent">{BRANCH_LABELS[branch]}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setHeldOpen(true)}
            className="btn btn-secondary h-9 text-xs"
          >
            <Clock className="h-4 w-4" />
            معلّقة
            {held.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white nums">
                {held.length}
              </span>
            )}
          </button>
          <button onClick={onChangeBranch} className="btn btn-secondary h-9 text-xs">
            <RefreshCcw className="h-4 w-4" />
            تغيير الفرع
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* البحث والنتائج */}
        <div className="order-1 flex-1 md:order-2">
          <Card className="p-4">
            <div className="mb-4 flex flex-wrap gap-2">
              <div className="relative w-full sm:w-auto sm:flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  className="input pr-9"
                  placeholder="ابحث بالاسم أو البراند أو الكود/الباركود..."
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onFocus={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    setSearchFocused(true);
                  }}
                  onBlur={() => {
                    blurTimer.current = setTimeout(
                      () => setSearchFocused(false),
                      150
                    );
                  }}
                  onKeyDown={onSearchKey}
                />

                {/* قائمة منسدلة سريعة (بعد حرفين) مع تنقّل بالأسهم */}
                {dropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-[60vh] w-full overflow-y-auto rounded-lg border bg-surface shadow-card">
                    {dropdownItems.map((p, idx) => (
                      <div
                        key={p.id}
                        onMouseEnter={() => setHighlight(idx)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 border-b border-[var(--border)] p-2 last:border-0",
                          idx === highlight && "bg-accent-soft"
                        )}
                        onClick={() => addFirstAvailable(p)}
                      >
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-[var(--surface-2)]">
                          {p.images[0] ? (
                            <Image
                              src={p.images[0]}
                              alt=""
                              fill
                              sizes="36px"
                              loading="lazy"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted">
                              <Package className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">
                            {p.name}
                          </p>
                          <p className="text-xs text-muted">{p.brand}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {p.variants.slice(0, 4).map((v) => (
                            <button
                              key={v.id}
                              disabled={v.quantity <= 0}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addVariant(p, v);
                              }}
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[11px] nums",
                                v.quantity <= 0
                                  ? "text-muted line-through opacity-50"
                                  : "hover:border-accent hover:text-accent"
                              )}
                            >
                              {v.size}
                              {v.color ? `/${v.color}` : ""} ({v.quantity})
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* «الأكثر مبيعاً» — تظهر عند تركيز حقل البحث وهو فارغ */}
                {bestsellersOpen && (
                  <div className="absolute z-20 mt-1 max-h-[70vh] w-full overflow-y-auto rounded-lg border bg-surface shadow-card">
                    <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] font-bold text-muted">
                      الأكثر مبيعاً
                    </div>
                    <div className="space-y-2 p-2">
                      {bestsellers.map((p) => (
                        <SearchResult
                          key={`bs-${p.id}`}
                          product={p}
                          cart={cart}
                          onAdd={addVariant}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                className="btn btn-secondary flex-1 flex-shrink-0 sm:flex-none"
                title="إضافة منتج سريعة"
              >
                <Plus className="h-4 w-4" />
                إضافة
              </button>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="btn btn-secondary flex-1 flex-shrink-0 sm:flex-none"
                title="مسح الباركود بالكاميرا"
              >
                <ScanLine className="h-4 w-4" />
                مسح
              </button>
            </div>

            {loading ? (
              <PageLoader label="جاري البحث..." />
            ) : error ? (
              <div className="rounded-lg border border-danger/40 bg-[rgba(217,83,79,0.08)] p-4 text-sm text-danger">
                <p className="font-bold">تعذّر تحميل المنتجات</p>
                <p className="mt-1 break-words">{error}</p>
                <button
                  onClick={refetch}
                  className="btn btn-secondary mt-3 h-9 text-xs"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                icon={<Package className="h-7 w-7" />}
                title="لا توجد منتجات"
                description={
                  debounced
                    ? `لا توجد منتجات مطابقة لـ "${debounced}" في هذا الفرع.`
                    : "لا توجد منتجات في هذا الفرع بعد."
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.map((product) => (
                  <SearchResult
                    key={product.id}
                    product={product}
                    cart={cart}
                    onAdd={addVariant}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* الفاتورة الحالية */}
        <div className="order-2 w-full md:order-1 md:w-[400px] md:shrink-0">
          <Card className="p-4 md:sticky md:top-20" tone="accent">
            <button
              type="button"
              onClick={() => setCartOpen((o) => !o)}
              aria-expanded={cartOpen}
              className="mb-3 flex w-full items-center justify-between gap-2 text-right md:pointer-events-none"
            >
              <h2 className="flex items-center gap-2 text-base font-bold text-text">
                <ShoppingCart className="h-5 w-5 text-accent" />
                الفاتورة الحالية
              </h2>
              <span className="flex items-center gap-2">
                {cart.length > 0 && (
                  <span className="badge bg-accent-soft text-accent nums">
                    {formatNumber(itemsCount)} قطعة
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted transition-transform md:hidden",
                    cartOpen && "rotate-180"
                  )}
                />
              </span>
            </button>

            <div className={cn("md:block", cartOpen ? "block" : "hidden")}>
            {cart.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted">
                لم تتم إضافة منتجات بعد.
                <br />
                ابحث وأضف المنتجات من القائمة.
              </div>
            ) : (
              <div className="max-h-[36vh] space-y-2 overflow-y-auto pl-1">
                {cart.map((item) => (
                  <div key={item.variantId} className="rounded-lg border bg-bg p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">
                          {item.productName}
                        </p>
                        <p className="text-xs text-muted">
                          مقاس {item.size}
                          {item.color ? ` / ${item.color}` : ""} ·{" "}
                          {formatCurrency(item.unitPrice)}
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
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
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
                          onChange={(v) =>
                            setQty(item.variantId, Number(v) || 1)
                          }
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
                      <span className="text-sm font-bold text-text nums">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* بيانات العميل */}
            <details className="mt-4 rounded-lg border">
              <summary className="cursor-pointer px-3 py-3 text-base font-medium text-text">
                بيانات العميل (اختياري)
              </summary>
              <div className="space-y-2 border-t p-3">
                {/* الهاتف أولاً — يملأ الاسم تلقائياً عند اكتمال 11 رقماً */}
                <PhoneInput
                  value={customerPhone}
                  onChange={handlePhoneChange}
                />
                {customerLookupLoading && (
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Spinner className="h-3.5 w-3.5" />
                    جارٍ البحث عن العميل…
                  </p>
                )}
                <TextOnlyInput
                  className="input"
                  placeholder="اسم العميل"
                  value={customerName}
                  onChange={setCustomerName}
                />

                {customerLookup && (
                  <div className="rounded-lg border border-accent/30 bg-accent-soft p-3">
                    <p className="text-xs font-bold text-accent">عميل مسجّل</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-muted">عدد الزيارات</p>
                        <p className="mt-0.5 font-bold text-text nums">
                          {formatNumber(customerLookup.visitCount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted">إجمالي الإنفاق</p>
                        <p className="mt-0.5 font-bold text-text nums">
                          {formatCurrency(customerLookup.totalSpent)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted">آخر زيارة</p>
                        <p className="mt-0.5 text-text nums">
                          {customerLookup.lastVisitAt
                            ? formatDateTime(customerLookup.lastVisitAt)
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {customerNotFound && (
                  <div className="rounded-lg border border-warning/40 bg-[rgba(201,133,26,0.1)] p-3">
                    <p className="text-xs font-bold text-warning">عميل جديد</p>
                    <p className="mt-0.5 text-xs text-muted">
                      لا يوجد عميل مسجّل بهذا الرقم.
                    </p>
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-medium text-text">
                      <input
                        type="checkbox"
                        checked={saveAsNewCustomer}
                        onChange={(e) => setSaveAsNewCustomer(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      حفظ كعميل جديد
                    </label>
                  </div>
                )}

                <textarea
                  className="input min-h-[56px] resize-y"
                  placeholder="ملاحظات العميل"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                />
              </div>
            </details>

            {/* ملاحظات الفاتورة (مستقلة) */}
            <div className="mt-3">
              <label className="label">ملاحظات الفاتورة</label>
              <textarea
                className="input min-h-[52px] resize-y"
                placeholder="ملاحظة تُطبع على الفاتورة..."
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
              />
            </div>

            {/* طريقة الدفع */}
            <div className="mt-4">
              <label className="label">طريقة الدفع *</label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(m);
                      if (m !== "TRANSFER") setTransferMethod("");
                    }}
                    className={cn(
                      "rounded-lg border py-2 text-sm font-medium transition-colors",
                      paymentMethod === m
                        ? "border-accent bg-accent-soft text-accent"
                        : "text-muted hover:text-text"
                    )}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
              {paymentMethod === "TRANSFER" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {TRANSFER_METHODS.map((tm) => (
                    <button
                      key={tm}
                      type="button"
                      onClick={() => setTransferMethod(tm)}
                      className={cn(
                        "rounded-lg border py-2 text-sm font-medium transition-colors",
                        transferMethod === tm
                          ? "border-accent bg-accent-soft text-accent"
                          : "text-muted hover:text-text"
                      )}
                    >
                      {TRANSFER_METHOD_LABELS[tm]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* الخصم */}
            <div className="mt-4">
              <label className="label">الخصم</label>
              <div className="flex gap-2">
                <select
                  className="input w-auto flex-shrink-0"
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType(e.target.value as DiscountTypeValue | "NONE")
                  }
                >
                  <option value="NONE">بدون</option>
                  <option value="PERCENTAGE">نسبة %</option>
                  <option value="FIXED">مبلغ ثابت</option>
                </select>
                {discountType !== "NONE" && (
                  <NumberInput
                    decimal
                    max={discountType === "PERCENTAGE" ? 100 : undefined}
                    className="input nums"
                    placeholder={discountType === "PERCENTAGE" ? "% النسبة" : "المبلغ"}
                    value={discountValue}
                    onChange={setDiscountValue}
                  />
                )}
              </div>
            </div>

            {/* التوصيل */}
            <div className="mt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text">
                <input
                  type="checkbox"
                  checked={deliveryOn}
                  onChange={(e) => setDeliveryOn(e.target.checked)}
                  className="h-4 w-4 accent-[#6c63ff]"
                />
                <Truck className="h-4 w-4 text-accent" />
                توصيل
              </label>
              {deliveryOn && (
                <div className="mt-2 space-y-2 rounded-lg border bg-bg p-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      مصدر الطلب *
                    </label>
                    <select
                      className="input"
                      value={orderSource}
                      onChange={(e) =>
                        setOrderSource(e.target.value as OrderSourceValue | "")
                      }
                    >
                      <option value="">اختر المصدر</option>
                      {ORDER_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {ORDER_SOURCE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      طريقة التوصيل *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {DELIVERY_METHODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDeliveryMethod(m)}
                          className={cn(
                            "rounded-lg border py-2 text-sm font-medium transition-colors",
                            deliveryMethod === m
                              ? "border-accent bg-accent-soft text-accent"
                              : "text-muted hover:text-text"
                          )}
                        >
                          {DELIVERY_METHOD_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {deliveryMethod === "BOSTA" && (
                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        رقم التتبع (Bosta)
                      </label>
                      <NumberInput
                        className="input nums"
                        placeholder="مثال: 1234567"
                        value={trackingNumber}
                        onChange={setTrackingNumber}
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      عنوان التوصيل *
                    </label>
                    <textarea
                      className="input min-h-[60px] resize-y"
                      placeholder="الشارع، المنطقة، العلامات المميزة..."
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      ملاحظات العنوان
                    </label>
                    <textarea
                      className="input min-h-[48px] resize-y"
                      placeholder="رقم بديل، أوقات استلام مناسبة..."
                      value={addressNotes}
                      onChange={(e) => setAddressNotes(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* الدفع الجزئي */}
            <div className="mt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text">
                <input
                  type="checkbox"
                  checked={partialOn}
                  onChange={(e) => setPartialOn(e.target.checked)}
                  className="h-4 w-4 accent-[#6c63ff]"
                />
                دفع جزئي
              </label>
              {partialOn && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="mb-1 block text-xs text-muted">المبلغ المدفوع</span>
                    <NumberInput
                      decimal
                      max={finalAmount}
                      className="input nums"
                      value={paidInput}
                      onChange={setPaidInput}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-muted">المبلغ المتبقي</span>
                    <div className="input flex items-center bg-[var(--surface-2)] nums">
                      {formatCurrency(remainingAmount)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* حاسبة الباقي النقدي — كم دفع العميل وكم الباقي له */}
            {!partialOn && (
              <div className="mt-4">
                <label className="label">دفع العميل (حاسبة الباقي)</label>
                <NumberInput
                  decimal
                  className="input nums"
                  placeholder="المبلغ الذي دفعه العميل نقداً"
                  value={cashReceived}
                  onChange={setCashReceived}
                />
                {cashCalcActive && (
                  <div
                    className={cn(
                      "mt-2 flex items-center justify-between rounded-lg border px-3 py-2.5 text-base font-extrabold transition-colors",
                      changeDue >= 0
                        ? "border-success/40 bg-[rgba(59,154,110,0.1)] text-success"
                        : "border-danger/40 bg-[rgba(217,83,79,0.1)] text-danger"
                    )}
                  >
                    <span>{changeDue >= 0 ? "الباقي" : "ناقص"}</span>
                    <span className="nums">
                      {formatCurrency(Math.abs(changeDue))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* الإجماليات */}
            <div className="mt-4 space-y-1.5 border-t pt-4 text-sm">
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
              <div className="flex justify-between text-base font-extrabold text-text">
                <span>الصافي</span>
                <span className="nums">{formatCurrency(finalAmount)}</span>
              </div>
              {partialOn && remainingAmount > 0 && (
                <div className="flex justify-between font-bold text-warning">
                  <span>متبقٍ على العميل</span>
                  <span className="nums">{formatCurrency(remainingAmount)}</span>
                </div>
              )}
            </div>

            {/* أزرار (سطح المكتب) */}
            <div className="mt-4 hidden gap-2 md:flex">
              <button
                onClick={confirmSale}
                disabled={submitting || cart.length === 0}
                className="btn btn-primary h-11 flex-1 text-base"
              >
                {submitting ? (
                  <Spinner className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                تأكيد البيعة
              </button>
              <button
                onClick={saveHeld}
                disabled={cart.length === 0}
                className="btn btn-secondary h-11"
                title="حفظ الفاتورة مؤقتاً"
              >
                <Save className="h-4 w-4" />
                حفظ مؤقت
              </button>
            </div>
            </div>
          </Card>
        </div>
      </div>

      {/* شريط ثابت للموبايل */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-surface p-3 shadow-[0_-2px_12px_rgba(0,0,0,0.12)] md:hidden">
        <button
          onClick={saveHeld}
          disabled={cart.length === 0}
          className="btn btn-secondary h-14 px-3"
          aria-label="حفظ مؤقت"
        >
          <Save className="h-5 w-5" />
        </button>
        <button
          onClick={confirmSale}
          disabled={submitting || cart.length === 0}
          className="btn btn-primary h-14 flex-1 justify-between text-base"
        >
          <span className="flex items-center gap-2">
            {submitting ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            تأكيد البيعة
          </span>
          <span className="flex items-center gap-2 nums">
            {cart.length > 0 && (
              <span className="rounded-md bg-white/20 px-2 py-0.5 text-sm">
                {formatNumber(itemsCount)}
              </span>
            )}
            {formatCurrency(finalAmount)}
          </span>
        </button>
      </div>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => {
          void handleBarcodeScan(code);
        }}
      />

      <QuickAddProductModal
        open={quickAddOpen}
        branch={branch}
        onClose={() => setQuickAddOpen(false)}
        onAdded={handleQuickAdded}
      />

      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />

      {/* الفواتير المعلّقة */}
      <Modal
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        title={`الفواتير المعلّقة — ${BRANCH_LABELS[branch]}`}
      >
        {held.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            لا توجد فواتير معلّقة.
          </p>
        ) : (
          <div className="space-y-2">
            {held.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text nums">
                    {formatNumber(h.itemsCount)} قطعة · {formatCurrency(h.total)}
                  </p>
                  <p className="text-xs text-muted nums">
                    {formatDateTime(h.savedAt)}
                    {h.customerName ? ` · ${h.customerName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => restoreHeld(h)}
                    className="btn btn-primary h-9 text-xs"
                  >
                    استرجاع
                  </button>
                  <button
                    onClick={() => deleteHeld(h.id)}
                    className="btn btn-ghost h-9 w-9 !px-0 text-danger"
                    aria-label="حذف"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SearchResult({
  product,
  cart,
  onAdd,
}: {
  product: ProductDTO;
  cart: CartItem[];
  onAdd: (p: ProductDTO, v: ProductDTO["variants"][0]) => void;
}) {
  // نعرض المقاسات المتاحة فقط (كمية > 0) في منتقي الصنف
  const availableVariants = product.variants.filter((v) => v.quantity > 0);
  const priceSource = availableVariants.length
    ? availableVariants
    : product.variants;
  const prices = priceSource.map((v) => v.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const priceLabel =
    minPrice === maxPrice
      ? formatCurrency(minPrice)
      : `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}`;
  const allOut = availableVariants.length === 0;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]">
          {product.images[0] ? (
            <Image
              src={product.images[0]}
              alt=""
              fill
              sizes="48px"
              loading="lazy"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <Package className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text">{product.name}</p>
          <p className="truncate text-xs text-muted">
            {product.brand}
            {product.sku ? ` · ${product.sku}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold text-accent nums">
          {priceLabel}
        </span>
      </div>

      {allOut ? (
        <p className="mt-3 rounded-lg bg-[rgba(217,83,79,0.1)] px-3 py-2 text-center text-xs font-medium text-danger">
          نفذ المخزون
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {availableVariants.map((v) => {
            const inCart = cart.find((c) => c.variantId === v.id)?.quantity ?? 0;
            const maxed = inCart >= v.quantity;
            return (
              <button
                key={v.id}
                disabled={maxed}
                onClick={() => onAdd(product, v)}
                title={maxed ? "أضفت كل الكمية المتاحة" : `المتاح: ${v.quantity}`}
                className={cn(
                  "inline-flex min-h-[44px] min-w-[3.5rem] items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  maxed
                    ? "cursor-not-allowed text-muted opacity-50"
                    : "hover:border-accent hover:bg-accent-soft hover:text-accent active:bg-accent-soft",
                  inCart > 0 && "border-accent bg-accent-soft text-accent"
                )}
              >
                <span className="nums">
                  {v.size}
                  {v.color ? ` / ${v.color}` : ""}
                </span>
                <span className="mr-1 text-xs text-muted nums">
                  ({v.quantity})
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
