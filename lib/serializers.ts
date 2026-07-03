import type {
  AccessRequest,
  ActivityLog,
  Brand,
  Customer,
  Product,
  ProductType,
  ProductVariant,
  Sale,
  SaleItem,
} from "@prisma/client";
import type { BranchValue, CategoryValue } from "./constants";
import type {
  AccessRequestDTO,
  AccessRequestStatus,
  ActivityLogDTO,
  BrandDTO,
  CustomerDTO,
  ProductDTO,
  ProductTypeDTO,
  SaleDTO,
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
    branch: v.branch as BranchValue,
    price: v.price,
    cost: v.cost,
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
    items: s.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      variantId: it.variantId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      subtotal: it.subtotal,
      productName: it.product.name,
      brand: it.product.brand,
      size: it.variant.size,
      color: it.variant.color ?? null,
      sku: it.variant.sku ?? null,
    })),
    itemsCount: s.items.reduce((sum, it) => sum + it.quantity, 0),
  };
}
