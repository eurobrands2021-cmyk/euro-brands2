import type {
  AccessRequest,
  ActivityLog,
  Brand,
  Customer,
  Expense,
  Product,
  ProductType,
  ProductVariant,
  Return,
  ReturnItem,
  Sale,
  SaleItem,
  ShiftClose,
  StockReceipt,
  StockReceiptItem,
  Supplier,
} from "@prisma/client";
import type {
  BranchValue,
  CategoryValue,
  DiscountTypeValue,
  ExpenseCategoryValue,
  RefundMethodValue,
  ReturnTypeValue,
} from "./constants";
import { EXPENSE_CATEGORIES } from "./constants";
import { round2 } from "./sale-utils";
import type {
  AccessRequestDTO,
  AccessRequestStatus,
  ActivityLogDTO,
  BrandDTO,
  CustomerDTO,
  ExpenseDTO,
  ProductDTO,
  ProductTypeDTO,
  ReturnDTO,
  SaleDTO,
  ShiftCloseDTO,
  StockReceiptDTO,
  SupplierDTO,
  VariantDTO,
} from "./types";

export function toAccessRequestDTO(a: AccessRequest): AccessRequestDTO {
  return {
    id: a.id,
    name: a.name,
    status: a.status as AccessRequestStatus,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
  };
}

export function toBrandDTO(b: Brand): BrandDTO {
  return { id: b.id, name: b.name, category: b.category as CategoryValue };
}

export function toCustomerDTO(c: Customer): CustomerDTO {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    totalSpent: c.totalSpent,
    visitCount: c.visitCount,
    lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
    branch: (c.branch as BranchValue | null) ?? null,
    notes: c.notes ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toActivityDTO(a: ActivityLog): ActivityLogDTO {
  return {
    id: a.id,
    userName: a.userName,
    userRole: a.userRole,
    action: a.action,
    details: a.details ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toProductTypeDTO(t: ProductType): ProductTypeDTO {
  return {
    id: t.id,
    name: t.name,
    code: t.code,
    category: t.category as CategoryValue,
  };
}

export function toVariantDTO(v: ProductVariant): VariantDTO {
  return {
    id: v.id,
    productId: v.productId,
    size: v.size,
    color: v.color ?? null,
    quantity: v.quantity,
    minQuantity: v.minQuantity,
    alertOnLowStock: v.alertOnLowStock ?? false,
    branch: v.branch as BranchValue,
    price: v.price,
    cost: v.cost ?? 0,
    sku: v.sku ?? null,
    skuManual: v.skuManual,
  };
}

type ProductWithVariants = Product & {
  variants: ProductVariant[];
  productType?: ProductType | null;
};

export function toProductDTO(
  p: ProductWithVariants,
  soldCount?: number
): ProductDTO {
  const variants = p.variants.map(toVariantDTO);
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category as CategoryValue,
    description: p.description,
    sku: p.sku,
    barcode: p.barcode,
    images: p.images,
    productTypeId: p.productTypeId ?? null,
    productType: p.productType ? toProductTypeDTO(p.productType) : null,
    variants,
    totalQuantity: variants.reduce((sum, v) => sum + v.quantity, 0),
    isDraft: p.isDraft ?? false,
    ...(soldCount !== undefined ? { soldCount } : {}),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

type SaleItemWithRefs = SaleItem & {
  product: { name: string; brand: string };
  variant: { size: string; color: string | null; sku: string | null };
};
type SaleWithItems = Sale & { items: SaleItemWithRefs[] };

export function toSaleDTO(s: SaleWithItems): SaleDTO {
  return {
    id: s.id,
    saleNumber: s.saleNumber,
    branch: s.branch as BranchValue,
    totalAmount: s.totalAmount,
    discountType: s.discountType,
    discountValue: s.discountValue,
    finalAmount: s.finalAmount,
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    customerNotes: s.customerNotes,
    paymentMethod: s.paymentMethod as SaleDTO["paymentMethod"],
    transferMethod: (s.transferMethod as SaleDTO["transferMethod"]) ?? null,
    invoiceNotes: s.invoiceNotes,
    paidAmount: s.paidAmount,
    remainingAmount: s.remainingAmount,
    changeAmount: s.changeAmount ?? null,
    cashierName: s.cashierName ?? null,
    status: s.status as SaleDTO["status"],
    cancellationReason: s.cancellationReason,
    isDelivery: s.isDelivery,
    orderSource: s.orderSource,
    deliveryMethod: (s.deliveryMethod as SaleDTO["deliveryMethod"]) ?? null,
    deliveryAddress: s.deliveryAddress,
    addressNotes: s.addressNotes,
    trackingNumber: s.trackingNumber,
    deliveryStatus: (s.deliveryStatus as SaleDTO["deliveryStatus"]) ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    unlockedAt: s.unlockedAt ? s.unlockedAt.toISOString() : null,
    unlockReason: s.unlockReason ?? null,
    items: s.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      variantId: it.variantId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      subtotal: it.subtotal,
      note: it.note ?? null,
      itemDiscount: it.itemDiscount ?? 0,
      itemDiscountType: (it.itemDiscountType as DiscountTypeValue) ?? "FIXED",
      productName: it.product.name,
      brand: it.product.brand,
      size: it.variant.size,
      color: it.variant.color ?? null,
      sku: it.variant.sku ?? null,
    })),
    itemsCount: s.items.reduce((sum, it) => sum + it.quantity, 0),
  };
}

type ReturnItemWithRefs = ReturnItem & {
  variant: ProductVariant & { product: { name: string; brand: string } };
  exchangeVariant: { size: string; color: string | null; price: number } | null;
};
type ReturnWithRefs = Return & {
  sale: { saleNumber: number };
  items: ReturnItemWithRefs[];
};

export function toReturnDTO(r: ReturnWithRefs): ReturnDTO {
  return {
    id: r.id,
    saleId: r.saleId,
    saleNumber: r.sale.saleNumber,
    branch: r.branch as BranchValue,
    type: r.type as ReturnTypeValue,
    reason: r.reason ?? null,
    refundMethod: (r.refundMethod as RefundMethodValue | null) ?? null,
    refundTotal: r.refundTotal,
    exchangeDifference: r.exchangeDifference,
    createdBy: r.createdBy ?? null,
    createdAt: r.createdAt.toISOString(),
    items: r.items.map((it) => ({
      id: it.id,
      saleItemId: it.saleItemId,
      variantId: it.variantId,
      productName: it.variant.product.name,
      brand: it.variant.product.brand,
      size: it.variant.size,
      color: it.variant.color ?? null,
      quantity: it.quantity,
      refundAmount: it.refundAmount,
      exchangeVariantId: it.exchangeVariantId ?? null,
      exchangeSize: it.exchangeVariant?.size ?? null,
      exchangeColor: it.exchangeVariant?.color ?? null,
      exchangeUnitPrice: it.exchangeVariant?.price ?? null,
    })),
  };
}

// ---- Part A: إقفال الصندوق ----
export function toShiftCloseDTO(s: ShiftClose): ShiftCloseDTO {
  return {
    id: s.id,
    branch: s.branch as BranchValue,
    cashierName: s.cashierName ?? null,
    openingCash: s.openingCash,
    expectedCash: s.expectedCash,
    countedCash: s.countedCash ?? null,
    difference: s.difference,
    notes: s.notes ?? null,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt ? s.closedAt.toISOString() : null,
  };
}

// ---- Part B: الموردون ----
export function toSupplierDTO(
  s: Supplier & { _count?: { receipts: number } }
): SupplierDTO {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone ?? null,
    notes: s.notes ?? null,
    createdAt: s.createdAt.toISOString(),
    ...(s._count ? { receiptsCount: s._count.receipts } : {}),
  };
}

type StockReceiptItemWithRefs = StockReceiptItem & {
  variant: ProductVariant & { product: { name: string; brand: string } };
};
type StockReceiptWithRefs = StockReceipt & {
  supplier: { name: string };
  items: StockReceiptItemWithRefs[];
};

export function toStockReceiptDTO(r: StockReceiptWithRefs): StockReceiptDTO {
  const items = r.items.map((it) => ({
    id: it.id,
    variantId: it.variantId,
    productName: it.variant.product.name,
    brand: it.variant.product.brand,
    size: it.variant.size,
    color: it.variant.color ?? null,
    quantity: it.quantity,
    unitCost: it.unitCost,
    lineTotal: round2(it.unitCost * it.quantity),
  }));
  return {
    id: r.id,
    supplierId: r.supplierId,
    supplierName: r.supplier.name,
    branch: r.branch as BranchValue,
    invoiceNumber: r.invoiceNumber ?? null,
    totalCost: r.totalCost,
    notes: r.notes ?? null,
    createdBy: r.createdBy ?? null,
    createdAt: r.createdAt.toISOString(),
    itemsCount: items.length,
    quantity: items.reduce((s, it) => s + it.quantity, 0),
    items,
  };
}

// ---- Part C: المصروفات ----
export function toExpenseDTO(e: Expense): ExpenseDTO {
  const category = EXPENSE_CATEGORIES.includes(
    e.category as ExpenseCategoryValue
  )
    ? (e.category as ExpenseCategoryValue)
    : "other";
  return {
    id: e.id,
    branch: e.branch as BranchValue,
    category,
    amount: e.amount,
    description: e.description ?? null,
    date: e.date.toISOString(),
    createdBy: e.createdBy ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}
