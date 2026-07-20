import {
  BRANCHES,
  CATEGORIES,
  DEFECT_REASONS,
  DEFECT_CONDITIONS,
  DELIVERY_METHODS,
  DELIVERY_STATUSES,
  DISCOUNT_TYPES,
  ORDER_SOURCES,
  PAYMENT_METHODS,
  TRANSFER_METHODS,
  RETURN_TYPES,
  REFUND_METHODS,
  EXPENSE_CATEGORIES,
  type ReturnTypeValue,
  type RefundMethodValue,
  type ExpenseCategoryValue,
  type BranchValue,
  type CategoryValue,
  type DefectReasonValue,
  type DefectConditionValue,
  type DeliveryMethodValue,
  type DeliveryStatusValue,
  type DiscountTypeValue,
  type OrderSourceValue,
  type PaymentMethodValue,
  type TransferMethodValue,
} from "./constants";
import { isCompleteEgyPhone, digitsOnly, sanitizeNumber } from "./input-validators";
import { round2 } from "./sale-utils";
import type {
  ActivityLogInput,
  BrandInput,
  CustomerInput,
  CustomerUpdateInput,
  DamagedInput,
  DeliveryInput,
  ImportRow,
  ProductInput,
  ProductTypeInput,
  ReturnInput,
  ReturnItemInput,
  SaleInput,
  VariantInput,
  SupplierInput,
  StockReceiptInput,
  StockReceiptItemInput,
  ExpenseInput,
  ShiftCloseInput,
  ShiftFinalizeInput,
} from "./types";

export class ValidationError extends Error {}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// تحويل قيمة كمية إلى عدد صحيح مهما كان نوعها (رقم/نص/أرقام عربية).
// يعيد NaN عند التعذّر ليرفضها المتحقق. يضمن عدم تسرّب "0" أو NaN للتخزين.
function parseQuantity(v: unknown): number {
  if (typeof v === "number") return Math.floor(v);
  const digits = digitsOnly(String(v ?? "")); // "٤" → "4"، "" عند الفراغ
  if (!digits) return NaN;
  return parseInt(digits, 10);
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
      alertOnLowStock: v?.alertOnLowStock === true,
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
    isDraft: body?.isDraft === true,
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
    const rawAction = asString(r?.action);
    const action: ImportRow["action"] =
      rawAction === "merge" || rawAction === "skip" || rawAction === "replace"
        ? rawAction
        : "replace";
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
      action,
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

    // ملاحظة الصنف (اختيارية)
    const note = asString(it?.note) || null;

    // خصم الصنف (اختياري) — قيمة موجبة ونوع نسبة/مبلغ ثابت
    let itemDiscount = Number(it?.itemDiscount) || 0;
    if (itemDiscount < 0)
      throw new ValidationError(`قيمة خصم الصنف غير صحيحة (الصف ${i + 1})`);
    let itemDiscountType: DiscountTypeValue = "FIXED";
    if (it?.itemDiscountType && DISCOUNT_TYPES.includes(it.itemDiscountType))
      itemDiscountType = it.itemDiscountType;
    if (itemDiscountType === "PERCENTAGE" && itemDiscount > 100)
      throw new ValidationError(`نسبة خصم الصنف تتجاوز 100% (الصف ${i + 1})`);
    if (itemDiscount === 0) itemDiscountType = "FIXED";

    return {
      variantId,
      quantity: Math.floor(quantity),
      note,
      itemDiscount,
      itemDiscountType,
    };
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

  // الباقي النقدي للعميل (حاسبة الباقي في POS) — اختياري
  let changeAmount: number | null = null;
  if (body?.changeAmount != null && body?.changeAmount !== "") {
    const ca = Number(body.changeAmount);
    if (!Number.isFinite(ca) || ca < 0)
      throw new ValidationError("قيمة الباقي غير صحيحة");
    changeAmount = ca;
  }

  // التوصيل (اختياري)
  let delivery: DeliveryInput | null = null;
  if (body?.delivery && typeof body.delivery === "object") {
    delivery = parseDeliveryInput(body.delivery);
  }

  // مفتاح التفرّد (idempotency) من العميل — نصّ قصير اختياري
  const clientRefRaw = asString(body?.clientRef);
  const clientRef = clientRefRaw ? clientRefRaw.slice(0, 80) : null;

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
    changeAmount,
    cashierName: asString(body?.cashierName) || null,
    delivery,
    saveAsNewCustomer,
    clientRef,
  };
}

// التحقق من مدخلات العميل (إنشاء)
export function parseCustomerInput(body: any): CustomerInput {
  const name = asString(body?.name);
  const rawPhone = digitsOnly(asString(body?.phone));

  // يكفي إدخال أحدهما: الاسم أو الهاتف
  if (!name && !rawPhone)
    throw new ValidationError("أدخل اسم العميل أو رقم هاتفه على الأقل");

  // لو أُدخل هاتف فيجب أن يكون كاملاً وصحيحاً (11 رقماً ببادئة مصرية)
  if (rawPhone && !isCompleteEgyPhone(rawPhone))
    throw new ValidationError("رقم الهاتف غير صحيح — يجب أن يكون 11 رقماً");

  const branch = asString(body?.branch) || null;
  if (branch && !BRANCHES.includes(branch as BranchValue))
    throw new ValidationError("الفرع غير صحيح");

  return {
    // هاتف فقط دون اسم → اسم افتراضي «عميل»
    name: name || "عميل",
    // اسم فقط دون هاتف → الهاتف null
    phone: rawPhone || null,
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

// ----------------------------------------------------
//  استرجاع كلمة المرور
// ----------------------------------------------------

// التحقق من مدخلات طلب دخول الكاشير
export function parseAccessRequestInput(body: any): { name: string } {
  const name = asString(body?.name);
  if (!name) throw new ValidationError("الاسم مطلوب");
  if (name.length > 60) throw new ValidationError("الاسم طويل جداً");
  return { name };
}

// التحقق من قرار المدير على طلب الدخول
export function parseAccessRequestStatus(
  body: any
): "APPROVED" | "REJECTED" {
  const status = asString(body?.status).toUpperCase();
  if (status !== "APPROVED" && status !== "REJECTED")
    throw new ValidationError("القرار غير صحيح");
  return status;
}

export type AdminRecoveryBody =
  | { action: "setup"; question: string; answer: string }
  | { action: "verify"; answer: string };

// التحقق من مدخلات استرجاع حساب المدير (إعداد أو تحقق)
export function parseAdminRecoveryBody(body: any): AdminRecoveryBody {
  const action = asString(body?.action);
  if (action === "setup") {
    const question = asString(body?.question);
    const answer = asString(body?.answer);
    if (!question) throw new ValidationError("سؤال الأمان مطلوب");
    if (question.length > 200)
      throw new ValidationError("سؤال الأمان طويل جداً");
    if (!answer) throw new ValidationError("إجابة سؤال الأمان مطلوبة");
    return { action: "setup", question, answer };
  }
  if (action === "verify") {
    const answer = asString(body?.answer);
    if (!answer) throw new ValidationError("الإجابة مطلوبة");
    return { action: "verify", answer };
  }
  throw new ValidationError("طلب غير صحيح");
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

// التحقق من مدخلات تسجيل التلف (الديفو)
export function parseDamagedInput(body: any): DamagedInput {
  const variantId = asString(body?.variantId);
  if (!variantId) throw new ValidationError("يجب اختيار الصنف التالف");

  // كمية صحيحة موجبة — تتحمّل الأرقام كنص أو أرقاماً عربية (٤ → 4)
  const quantity = parseQuantity(body?.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new ValidationError("الكمية غير صحيحة");

  const reasonCode = asString(body?.reasonCode);
  if (!DEFECT_REASONS.includes(reasonCode as DefectReasonValue))
    throw new ValidationError("سبب التلف غير صحيح");

  const detail = asString(body?.detail) || null;
  if (reasonCode === "OTHER" && !detail)
    throw new ValidationError("يرجى كتابة سبب التلف عند اختيار «أخرى»");

  let unitCost: number | null = null;
  if (body?.unitCost != null && body?.unitCost !== "") {
    const c = Number(body.unitCost);
    if (!Number.isFinite(c) || c < 0)
      throw new ValidationError("التكلفة غير صحيحة");
    unitCost = c;
  }

  const photoUrl = asString(body?.photoUrl) || null;

  // الحالة (التصرّف) — افتراضياً «تالف بالكامل» للتوافق مع السجلات/الطلبات القديمة
  const conditionRaw = asString(body?.condition) || "TOTAL_LOSS";
  if (!DEFECT_CONDITIONS.includes(conditionRaw as DefectConditionValue))
    throw new ValidationError("حالة التصرّف غير صحيحة");
  const condition = conditionRaw as DefectConditionValue;

  // حقول مرتبطة بالحالة: سعر الخصم (يُباع بخصم) / المورد (يُرجع للمورد)
  let discountPrice: number | null = null;
  let supplierId: string | null = null;

  if (condition === "SELL_AT_DISCOUNT") {
    if (body?.discountPrice == null || body?.discountPrice === "")
      throw new ValidationError("أدخل سعر البيع بخصم");
    const dp = Number(body.discountPrice);
    if (!Number.isFinite(dp) || dp <= 0)
      throw new ValidationError("سعر البيع بخصم غير صحيح");
    discountPrice = round2(dp);
  } else if (condition === "RETURN_TO_SUPPLIER") {
    supplierId = asString(body?.supplierId) || null;
    if (!supplierId) throw new ValidationError("اختر المورد المُرجَع إليه");
  }

  return {
    variantId,
    quantity, // عدد صحيح موجب مضمون
    reasonCode: reasonCode as DefectReasonValue,
    detail,
    unitCost,
    photoUrl,
    condition,
    discountPrice,
    supplierId,
    createdBy: asString(body?.createdBy) || null,
  };
}

// التحقّق من مُدخلات المرتجع/الاستبدال قبل تنفيذها في معاملة قاعدة البيانات
export function parseReturnInput(body: any): ReturnInput {
  const saleId = asString(body?.saleId);
  if (!saleId) throw new ValidationError("الفاتورة غير محددة");

  const type = asString(body?.type);
  if (!RETURN_TYPES.includes(type as ReturnTypeValue))
    throw new ValidationError("نوع العملية غير صحيح");

  const refundMethodRaw = asString(body?.refundMethod);
  const refundMethod =
    refundMethodRaw &&
    REFUND_METHODS.includes(refundMethodRaw as RefundMethodValue)
      ? (refundMethodRaw as RefundMethodValue)
      : null;

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0)
    throw new ValidationError("اختر صنفاً واحداً على الأقل للإرجاع");

  const items: ReturnItemInput[] = rawItems.map((it: any) => {
    const saleItemId = asString(it?.saleItemId);
    if (!saleItemId) throw new ValidationError("بند غير صالح في الطلب");

    const quantity = parseQuantity(it?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0)
      throw new ValidationError("كمية الإرجاع غير صحيحة");

    const exchangeVariantId = asString(it?.exchangeVariantId) || null;
    if (type === "EXCHANGE" && !exchangeVariantId)
      throw new ValidationError("اختر الصنف البديل لكل بند في الاستبدال");

    return { saleItemId, quantity, exchangeVariantId };
  });

  return {
    saleId,
    type: type as ReturnTypeValue,
    reason: asString(body?.reason) || null,
    refundMethod,
    createdBy: asString(body?.createdBy) || null,
    items,
  };
}

// التحقق من حالة التوصيل
export function parseDeliveryStatus(body: any): DeliveryStatusValue {
  const status = asString(body?.status);
  if (!DELIVERY_STATUSES.includes(status as DeliveryStatusValue))
    throw new ValidationError("الحالة غير صحيحة");
  return status as DeliveryStatusValue;
}

// ----------------------------------------------------
//  العمليات اليومية (Parts A–C)
// ----------------------------------------------------

// قيمة نقدية غير سالبة (تتحمّل الأرقام العربية والفواصل)
function parseMoney(v: unknown, field = "القيمة"): number {
  const cleaned = sanitizeNumber(String(v ?? ""), { decimal: true });
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0)
    throw new ValidationError(`${field} غير صحيحة`);
  return round2(n);
}

// Part A: بدء الشيفت
export function parseShiftCloseInput(body: any): ShiftCloseInput {
  const branch = asString(body?.branch);
  if (!BRANCHES.includes(branch as BranchValue))
    throw new ValidationError("الفرع غير صحيح");
  return {
    branch: branch as BranchValue,
    cashierName: asString(body?.cashierName) || null,
    openingCash: parseMoney(body?.openingCash, "عهدة البداية"),
  };
}

// Part A: إقفال الشيفت (إدخال المعدود)
export function parseShiftFinalizeInput(body: any): ShiftFinalizeInput {
  return {
    countedCash: parseMoney(body?.countedCash, "النقد المعدود"),
    notes: asString(body?.notes) || null,
  };
}

// Part B: المورد
export function parseSupplierInput(body: any): SupplierInput {
  const name = asString(body?.name);
  if (!name) throw new ValidationError("اسم المورد مطلوب");
  return {
    name,
    phone: asString(body?.phone) || null,
    notes: asString(body?.notes) || null,
  };
}

// Part B: استلام بضاعة
export function parseStockReceiptInput(body: any): StockReceiptInput {
  const supplierId = asString(body?.supplierId);
  if (!supplierId) throw new ValidationError("يجب اختيار المورد");

  const branch = asString(body?.branch);
  if (!BRANCHES.includes(branch as BranchValue))
    throw new ValidationError("الفرع غير صحيح");

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0)
    throw new ValidationError("أضف صنفاً واحداً على الأقل للاستلام");

  const items: StockReceiptItemInput[] = rawItems.map((it: any) => {
    const variantId = asString(it?.variantId);
    if (!variantId) throw new ValidationError("صنف غير صالح في الاستلام");
    const quantity = parseQuantity(it?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0)
      throw new ValidationError("كمية الاستلام غير صحيحة");
    const unitCost = parseMoney(it?.unitCost, "تكلفة الوحدة");
    return { variantId, quantity, unitCost };
  });

  return {
    supplierId,
    branch: branch as BranchValue,
    invoiceNumber: asString(body?.invoiceNumber) || null,
    notes: asString(body?.notes) || null,
    createdBy: asString(body?.createdBy) || null,
    items,
  };
}

// Part C: مصروف
export function parseExpenseInput(body: any): ExpenseInput {
  const branch = asString(body?.branch);
  if (!BRANCHES.includes(branch as BranchValue))
    throw new ValidationError("الفرع غير صحيح");

  const category = asString(body?.category);
  if (!EXPENSE_CATEGORIES.includes(category as ExpenseCategoryValue))
    throw new ValidationError("فئة المصروف غير صحيحة");

  const amount = parseMoney(body?.amount, "قيمة المصروف");
  if (amount <= 0) throw new ValidationError("قيمة المصروف يجب أن تكون أكبر من صفر");

  // تاريخ اختياري — نتحقّق أنه صالح إن وُجد
  let date: string | null = null;
  const rawDate = asString(body?.date);
  if (rawDate) {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime()))
      throw new ValidationError("تاريخ المصروف غير صحيح");
    date = d.toISOString();
  }

  return {
    branch: branch as BranchValue,
    category: category as ExpenseCategoryValue,
    amount,
    description: asString(body?.description) || null,
    date,
    createdBy: asString(body?.createdBy) || null,
  };
}
