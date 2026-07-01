import {
  BRANCHES,
  CATEGORIES,
  DELIVERY_METHODS,
  DELIVERY_STATUSES,
  DISCOUNT_TYPES,
  ORDER_SOURCES,
  PAYMENT_METHODS,
  STOCK_TRANSFER_STATUSES,
  TRANSFER_METHODS,
  type BranchValue,
  type CategoryValue,
  type DeliveryMethodValue,
  type DeliveryStatusValue,
  type OrderSourceValue,
  type PaymentMethodValue,
  type StockTransferStatusValue,
  type TransferMethodValue,
} from "./constants";
import { isCompleteEgyPhone, digitsOnly } from "./input-validators";
import type {
  ActivityLogInput,
  BrandInput,
  CustomerInput,
  CustomerUpdateInput,
  DeliveryInput,
  ImportRow,
  ProductInput,
  ProductTypeInput,
  SaleInput,
  StockTransferInput,
  VariantInput,
} from "./types";

export class ValidationError extends Error {}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// التحقق من مدخلات المنتج
export function parseProductInput(body: any): ProductInput {
  const name = asString(body?.name);
  const brand = asString(body?.brand);
  const category = asString(body?.category);

  if (!name) throw new ValidationError("اسم المنتج مطلوب");
  if (!brand) throw new ValidationError("البراند مطلوب");
  if (!CATEGORIES.includes(category as CategoryValue))
    throw new ValidationError("الفئة غير صحيحة");

  const images: string[] = Array.isArray(body?.images)
    ? body.images.filter((x: unknown) => typeof x === "string").slice(0, 3)
    : [];

  const productTypeId = asString(body?.productTypeId) || null;

  const rawVariants = Array.isArray(body?.variants) ? body.variants : [];
  if (rawVariants.length === 0)
    throw new ValidationError("يجب إضافة صف واحد على الأقل للمقاسات والكميات");

  const seen = new Set<string>();
  const variants: VariantInput[] = rawVariants.map((v: any, i: number) => {
    const size = asString(v?.size);
    const color = asString(v?.color) || null;
    const branch = asString(v?.branch);
    const quantity = Number(v?.quantity);
    const price = Number(v?.price);
    const minRaw = Number(v?.minQuantity);
    const minQuantity =
      Number.isFinite(minRaw) && minRaw >= 0 ? Math.floor(minRaw) : 5;

    if (!size) throw new ValidationError(`المقاس مطلوب في الصف ${i + 1}`);
    if (!BRANCHES.includes(branch as BranchValue))
      throw new ValidationError(`الفرع غير صحيح في الصف ${i + 1}`);
    if (!Number.isFinite(quantity) || quantity < 0)
      throw new ValidationError(`الكمية غير صحيحة في الصف ${i + 1}`);
    if (!Number.isFinite(price) || price < 0)
      throw new ValidationError(`السعر غير صحيح في الصف ${i + 1}`);

    const key = `${size}__${branch}__${color ?? ""}`;
    if (seen.has(key))
      throw new ValidationError(
        `لا يمكن تكرار نفس المقاس واللون في نفس الفرع (${size}${color ? ` / ${color}` : ""})`
      );
    seen.add(key);

    const id = asString(v?.id) || undefined;
    const sku = asString(v?.sku) || null;
    const skuManual = sku ? Boolean(v?.skuManual) : false;

    return {
      id,
      size,
      color,
      branch: branch as BranchValue,
      quantity: Math.floor(quantity),
      minQuantity,
      price,
      sku,
      skuManual,
    };
  });

  return {
    name,
    brand,
    category: category as CategoryValue,
    description: asString(body?.description) || null,
    barcode: asString(body?.barcode) || null,
    images,
    productTypeId,
    variants,
  };
}

// التحقق من مدخلات نوع المنتج
export function parseProductTypeInput(body: any): ProductTypeInput {
  const name = asString(body?.name);
  const code = asString(body?.code);
  const category = asString(body?.category);
  if (!name) throw new ValidationError("اسم النوع مطلوب");
  if (!code) throw new ValidationError("كود النوع (البادئة) مطلوب");
  if (!/^[A-Za-z0-9]+$/.test(code))
    throw new ValidationError("كود النوع لازم يكون حروف لاتينية وأرقام فقط");
  if (code.length > 6)
    throw new ValidationError("كود النوع لازم يكون 6 حروف كحد أقصى");
  if (!CATEGORIES.includes(category as CategoryValue))
    throw new ValidationError("الفئة غير صحيحة");
  return {
    name,
    code: code.toUpperCase(),
    category: category as CategoryValue,
  };
}

// التحقق من صفوف استيراد الجرد
export function parseImportRows(body: any): ImportRow[] {
  const raw = Array.isArray(body?.rows) ? body.rows : [];
  if (raw.length === 0)
    throw new ValidationError("لا توجد صفوف صالحة للاستيراد");

  return raw.map((r: any, i: number) => {
    const name = asString(r?.name);
    const brand = asString(r?.brand);
    const category = asString(r?.category);
    const branch = asString(r?.branch);
    const size = asString(r?.size);
    const color = asString(r?.color) || null;
    const sku = asString(r?.sku) || null;
    const productType = asString(r?.productType) || null;
    const quantity = Number(r?.quantity);
    const price = Number(r?.price);
    const at = `الصف ${i + 1}`;

    if (!name) throw new ValidationError(`اسم المنتج مطلوب (${at})`);
    if (!brand) throw new ValidationError(`البراند مطلوب (${at})`);
    if (!CATEGORIES.includes(category as CategoryValue))
      throw new ValidationError(`الفئة غير صحيحة (${at})`);
    if (!BRANCHES.includes(branch as BranchValue))
      throw new ValidationError(`الفرع غير صحيح (${at})`);
    if (!size) throw new ValidationError(`المقاس مطلوب (${at})`);
    if (!Number.isFinite(quantity) || quantity < 0)
      throw new ValidationError(`الكمية غير صحيحة (${at})`);
    if (!Number.isFinite(price) || price < 0)
      throw new ValidationError(`السعر غير صحيح (${at})`);

    return {
      name,
      brand,
      category: category as CategoryValue,
      branch: branch as BranchValue,
      size,
      color,
      quantity: Math.floor(quantity),
      price,
      sku,
      productType,
    };
  });
}

// التحقق من مدخلات البراند
export function parseBrandInput(body: any): BrandInput {
  const name = asString(body?.name);
  const category = asString(body?.category);
  if (!name) throw new ValidationError("اسم البراند مطلوب");
  if (!CATEGORIES.includes(category as CategoryValue))
    throw new ValidationError("الفئة غير صحيحة");
  return { name, category: category as CategoryValue };
}

// التحقق من مدخلات الفاتورة
export function parseSaleInput(body: any): SaleInput {
  const branch = asString(body?.branch);
  if (!BRANCHES.includes(branch as BranchValue))
    throw new ValidationError("يجب اختيار الفرع");

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0)
    throw new ValidationError("الفاتورة فارغة — أضف منتجات أولاً");

  const items = rawItems.map((it: any, i: number) => {
    const variantId = asString(it?.variantId);
    const quantity = Number(it?.quantity);
    if (!variantId)
      throw new ValidationError(`عنصر غير صحيح في الفاتورة (الصف ${i + 1})`);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new ValidationError(`الكمية غير صحيحة (الصف ${i + 1})`);
    return { variantId, quantity: Math.floor(quantity) };
  });

  let discountType = body?.discountType ?? null;
  if (discountType !== null && !DISCOUNT_TYPES.includes(discountType))
    throw new ValidationError("نوع الخصم غير صحيح");

  const discountValue = Number(body?.discountValue) || 0;
  if (discountValue < 0) throw new ValidationError("قيمة الخصم غير صحيحة");
  if (discountValue === 0) discountType = null;

  // طريقة الدفع (مطلوبة)
  const paymentMethod = asString(body?.paymentMethod);
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethodValue))
    throw new ValidationError("يجب اختيار طريقة الدفع");

  // طريقة التحويل (مطلوبة عند اختيار «تحويل»)
  let transferMethod: TransferMethodValue | null = null;
  if (paymentMethod === "TRANSFER") {
    const tm = asString(body?.transferMethod);
    if (!TRANSFER_METHODS.includes(tm as TransferMethodValue))
      throw new ValidationError("يجب اختيار طريقة التحويل");
    transferMethod = tm as TransferMethodValue;
  }

  // المبلغ المدفوع (للدفع الجزئي) — اختياري؛ يُحسب المتبقي في الخادم
  let paidAmount: number | null = null;
  if (body?.paidAmount != null && body?.paidAmount !== "") {
    const pa = Number(body.paidAmount);
    if (!Number.isFinite(pa) || pa < 0)
      throw new ValidationError("المبلغ المدفوع غير صحيح");
    paidAmount = pa;
  }

  // التوصيل (اختياري)
  let delivery: DeliveryInput | null = null;
  if (body?.delivery && typeof body.delivery === "object") {
    delivery = parseDeliveryInput(body.delivery);
  }

  const customerName = asString(body?.customerName) || null;
  const customerPhone = asString(body?.customerPhone) || null;
  const saveAsNewCustomer = !!body?.saveAsNewCustomer;
  if (saveAsNewCustomer) {
    if (!customerPhone)
      throw new ValidationError("رقم هاتف العميل مطلوب لحفظه كعميل جديد");
    if (!customerName)
      throw new ValidationError("اسم العميل مطلوب لحفظه كعميل جديد");
  }

  return {
    branch: branch as BranchValue,
    items,
    discountType,
    discountValue,
    customerName,
    customerPhone,
    customerNotes: asString(body?.customerNotes) || null,
    paymentMethod: paymentMethod as PaymentMethodValue,
    transferMethod,
    invoiceNotes: asString(body?.invoiceNotes) || null,
    paidAmount,
    cashierName: asString(body?.cashierName) || null,
    delivery,
    saveAsNewCustomer,
  };
}

// التحقق من مدخلات العميل (إنشاء)
export function parseCustomerInput(body: any): CustomerInput {
  const name = asString(body?.name);
  const phone = digitsOnly(asString(body?.phone));
  if (!name) throw new ValidationError("اسم العميل مطلوب");
  if (!isCompleteEgyPhone(phone))
    throw new ValidationError("رقم الهاتف غير صحيح — يجب أن يكون 11 رقماً");

  const branch = asString(body?.branch) || null;
  if (branch && !BRANCHES.includes(branch as BranchValue))
    throw new ValidationError("الفرع غير صحيح");

  return {
    name,
    phone,
    branch: (branch as BranchValue | null) ?? null,
    notes: asString(body?.notes) || null,
  };
}

// التحقق من مدخلات تعديل العميل (اسم/ملاحظات/فرع فقط)
export function parseCustomerUpdateInput(body: any): CustomerUpdateInput {
  const out: CustomerUpdateInput = {};

  if (body?.name !== undefined) {
    const name = asString(body.name);
    if (!name) throw new ValidationError("اسم العميل مطلوب");
    out.name = name;
  }
  if (body?.notes !== undefined) out.notes = asString(body.notes) || null;
  if (body?.branch !== undefined) {
    const branch = asString(body.branch) || null;
    if (branch && !BRANCHES.includes(branch as BranchValue))
      throw new ValidationError("الفرع غير صحيح");
    out.branch = (branch as BranchValue | null) ?? null;
  }

  return out;
}

// التحقق من مدخلات سجل النشاط
export function parseActivityInput(body: any): ActivityLogInput {
  const userName = asString(body?.userName);
  const userRole = asString(body?.userRole);
  const action = asString(body?.action);
  if (!userName) throw new ValidationError("اسم المستخدم مطلوب");
  if (userRole !== "ADMIN" && userRole !== "CASHIER")
    throw new ValidationError("الدور غير صحيح");
  if (!action) throw new ValidationError("الإجراء مطلوب");
  return {
    userName,
    userRole,
    action,
    details: asString(body?.details) || null,
  };
}

// التحقق من بيانات التوصيل
export function parseDeliveryInput(body: any): DeliveryInput {
  const orderSource = asString(body?.orderSource);
  const deliveryMethod = asString(body?.deliveryMethod);
  const deliveryAddress = asString(body?.deliveryAddress);
  if (!ORDER_SOURCES.includes(orderSource as OrderSourceValue))
    throw new ValidationError("مصدر الطلب غير صحيح");
  if (!DELIVERY_METHODS.includes(deliveryMethod as DeliveryMethodValue))
    throw new ValidationError("طريقة التوصيل غير صحيحة");
  if (!deliveryAddress) throw new ValidationError("عنوان التوصيل مطلوب");

  return {
    orderSource: orderSource as OrderSourceValue,
    deliveryMethod: deliveryMethod as DeliveryMethodValue,
    deliveryAddress,
    addressNotes: asString(body?.addressNotes) || null,
    trackingNumber: asString(body?.trackingNumber) || null,
  };
}

// التحقق من حالة التوصيل
export function parseDeliveryStatus(body: any): DeliveryStatusValue {
  const status = asString(body?.status);
  if (!DELIVERY_STATUSES.includes(status as DeliveryStatusValue))
    throw new ValidationError("الحالة غير صحيحة");
  return status as DeliveryStatusValue;
}

// التحقق من مدخلات تحويل المخزون بين الفروع
export function parseStockTransferInput(body: any): StockTransferInput {
  const fromBranch = asString(body?.fromBranch);
  const toBranch = asString(body?.toBranch);
  if (!BRANCHES.includes(fromBranch as BranchValue))
    throw new ValidationError("يجب اختيار فرع المصدر");
  if (!BRANCHES.includes(toBranch as BranchValue))
    throw new ValidationError("يجب اختيار فرع الوجهة");
  if (fromBranch === toBranch)
    throw new ValidationError("فرع المصدر والوجهة يجب أن يكونا مختلفين");

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0)
    throw new ValidationError("أضف صنفاً واحداً على الأقل للتحويل");

  const merged = new Map<string, number>();
  for (const it of rawItems) {
    const variantId = asString(it?.variantId);
    const quantity = Number(it?.quantity);
    if (!variantId) throw new ValidationError("عنصر غير صحيح في التحويل");
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new ValidationError("الكمية غير صحيحة في أحد الأصناف");
    merged.set(variantId, (merged.get(variantId) ?? 0) + Math.floor(quantity));
  }

  return {
    fromBranch: fromBranch as BranchValue,
    toBranch: toBranch as BranchValue,
    notes: asString(body?.notes) || null,
    createdBy: asString(body?.createdBy) || null,
    items: [...merged.entries()].map(([variantId, quantity]) => ({
      variantId,
      quantity,
    })),
  };
}

// التحقق من تحديث حالة التحويل (إتمام أو إلغاء فقط)
export function parseStockTransferStatusInput(
  body: any
): "COMPLETED" | "CANCELLED" {
  const status = asString(body?.status);
  if (!STOCK_TRANSFER_STATUSES.includes(status as StockTransferStatusValue))
    throw new ValidationError("الحالة غير صحيحة");
  if (status !== "COMPLETED" && status !== "CANCELLED")
    throw new ValidationError("لا يمكن تعيين هذه الحالة مباشرةً");
  return status;
}
