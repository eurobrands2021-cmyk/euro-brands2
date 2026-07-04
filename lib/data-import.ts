// إعادة استيراد ملف مؤرشف — منطق الـ upsert لكل نوع بيانات (دون تكرار).
// تُستدعى من /api/data-management/import بعد أن يفكّ العميل ملف Excel ويختار
// الأنواع/الصفوف. استيراد الفواتير لا يعدّل المخزون الحالي.
import { prisma } from "./prisma";
import { buildVariantSku, uniquifySku } from "./sku";
import {
  BRANCHES,
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SALE_STATUSES,
  SALE_STATUS_LABELS,
  DEFECT_REASONS,
  DEFECT_REASON_LABELS,
  type BranchValue,
  type CategoryValue,
  type PaymentMethodValue,
  type SaleStatusValue,
  type DefectReasonValue,
} from "./constants";
import { type Branch, type Category, type PaymentMethod, type SaleStatus } from "@prisma/client";
import type { DataTypeKey } from "./data-management";

type Cell = string | number | null | undefined;
type Row = Record<string, Cell>;

export interface ImportTypeResult {
  type: DataTypeKey;
  created: number;
  updated: number;
  skipped: number;
}

// قراءة خلية حسب اسم العمود (يتجاهل الفراغات في الرأس)
function cell(row: Row, header: string): string {
  if (header in row) return norm(row[header]);
  const key = Object.keys(row).find((k) => k.trim() === header);
  return key ? norm(row[key]) : "";
}
function norm(v: Cell): string {
  return v == null ? "" : String(v).trim();
}
function numVal(v: string): number {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
// تحويل "yyyy/MM/dd HH:mm" أو ISO إلى Date (أو null)
function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v.replace(/\//g, "-"));
  return isNaN(d.getTime()) ? null : d;
}

// خرائط عكسية من التسمية العربية إلى القيمة
const byLabel = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>
): Record<string, T> =>
  Object.fromEntries(values.map((v) => [labels[v], v])) as Record<string, T>;

const BRANCH_BY_LABEL = byLabel(BRANCHES, BRANCH_LABELS);
const CATEGORY_BY_LABEL = byLabel(CATEGORIES, CATEGORY_LABELS);
const PAYMENT_BY_LABEL = byLabel(PAYMENT_METHODS, PAYMENT_METHOD_LABELS);
const SALE_STATUS_BY_LABEL = byLabel(SALE_STATUSES, SALE_STATUS_LABELS);
const DEFECT_BY_LABEL = byLabel(DEFECT_REASONS, DEFECT_REASON_LABELS);

function toBranch(label: string): BranchValue | null {
  return BRANCH_BY_LABEL[label] ?? (BRANCHES.includes(label as BranchValue) ? (label as BranchValue) : null);
}

// ----------------------------------------------------
//  العملاء — upsert بالهاتف
// ----------------------------------------------------
async function importCustomers(rows: Row[]): Promise<ImportTypeResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  for (const r of rows) {
    const phone = cell(r, "الهاتف");
    const name = cell(r, "الاسم");
    if (!phone || !name) {
      skipped++;
      continue;
    }
    const branchLabel = cell(r, "الفرع");
    const branch = branchLabel ? toBranch(branchLabel) : null;
    const data = {
      name,
      totalSpent: numVal(cell(r, "إجمالي الإنفاق")),
      visitCount: Math.floor(numVal(cell(r, "عدد الزيارات"))),
      lastVisitAt: parseDate(cell(r, "آخر زيارة")),
      branch: (branch as Branch | null) ?? undefined,
      notes: cell(r, "ملاحظات") || null,
    };
    const existing = await prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      await prisma.customer.update({ where: { phone }, data });
      updated++;
    } else {
      await prisma.customer.create({ data: { phone, ...data } });
      created++;
    }
  }
  return { type: "customers", created, updated, skipped };
}

// ----------------------------------------------------
//  المنتجات — find-or-create منتج + upsert صنف (دون تكرار)
// ----------------------------------------------------
async function importProducts(rows: Row[]): Promise<ImportTypeResult> {
  let created = 0,
    updated = 0,
    skipped = 0;

  const allSkus = await prisma.productVariant.findMany({
    where: { sku: { not: null } },
    select: { sku: true },
  });
  const takenSku = new Set(allSkus.map((s) => s.sku!).filter(Boolean));

  for (const r of rows) {
    const name = cell(r, "اسم المنتج");
    const brand = cell(r, "البراند");
    const categoryLabel = cell(r, "الفئة");
    const category =
      CATEGORY_BY_LABEL[categoryLabel] ??
      (CATEGORIES.includes(categoryLabel as CategoryValue)
        ? (categoryLabel as CategoryValue)
        : null);
    const branchLabel = cell(r, "الفرع");
    const branch = toBranch(branchLabel);
    const size = cell(r, "المقاس");
    const color = cell(r, "اللون") || null;
    if (!name || !brand || !category || !branch || !size) {
      skipped++;
      continue;
    }
    const quantity = Math.floor(numVal(cell(r, "الكمية")));
    const price = numVal(cell(r, "السعر"));
    const rawSku = cell(r, "الكود (SKU)") || null;

    // المنتج: بحث بالاسم+البراند (غير حسّاس لحالة الأحرف)، وإلا إنشاء
    let product = await prisma.product.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        brand: { equals: brand, mode: "insensitive" },
      },
      select: { id: true, productType: { select: { code: true } } },
    });
    if (!product) {
      const c = await prisma.product.create({
        data: { name, brand, category: category as Category, images: [] },
        select: { id: true, productType: { select: { code: true } } },
      });
      product = c;
    }

    // الصنف: بحث بنفس (المقاس/الفرع/اللون)
    const existing = await prisma.productVariant.findFirst({
      where: { productId: product.id, size, branch: branch as Branch, color },
      select: { id: true, sku: true },
    });
    if (existing) {
      await prisma.productVariant.update({
        where: { id: existing.id },
        data: { quantity, price },
      });
      updated++;
    } else {
      const sku = rawSku
        ? uniquifySku(rawSku, takenSku)
        : uniquifySku(
            buildVariantSku({
              productId: product.id,
              typeCode: product.productType?.code,
              size,
              branch: branch,
              color,
            }),
            takenSku
          );
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          size,
          color,
          branch: branch as Branch,
          quantity,
          price,
          sku,
          skuManual: !!rawSku,
        },
      });
      created++;
    }
  }
  return { type: "products", created, updated, skipped };
}

// ----------------------------------------------------
//  الفواتير — upsert برقم الفاتورة (لا يعدّل المخزون)
// ----------------------------------------------------
async function importSales(rows: Row[]): Promise<ImportTypeResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  for (const r of rows) {
    const saleNumber = Math.floor(numVal(cell(r, "رقم الفاتورة")));
    const branch = toBranch(cell(r, "الفرع"));
    if (!saleNumber || !branch) {
      skipped++;
      continue;
    }
    const total = numVal(cell(r, "الإجمالي"));
    const discount = numVal(cell(r, "الخصم"));
    const finalAmount = numVal(cell(r, "الصافي")) || total - discount;
    const paymentLabelRaw = cell(r, "طريقة الدفع").split(" - ")[0];
    const payment =
      PAYMENT_BY_LABEL[paymentLabelRaw] ??
      (PAYMENT_METHODS.includes(paymentLabelRaw as PaymentMethodValue)
        ? (paymentLabelRaw as PaymentMethodValue)
        : "CASH");
    const statusLabel = cell(r, "الحالة");
    const status =
      SALE_STATUS_BY_LABEL[statusLabel] ??
      (SALE_STATUSES.includes(statusLabel as SaleStatusValue)
        ? (statusLabel as SaleStatusValue)
        : "COMPLETED");
    const data = {
      branch: branch as Branch,
      totalAmount: total,
      finalAmount,
      customerName: cell(r, "العميل") || null,
      customerPhone: cell(r, "الهاتف") || null,
      paymentMethod: payment as PaymentMethod,
      status: status as SaleStatus,
      paidAmount: numVal(cell(r, "المدفوع")),
      remainingAmount: numVal(cell(r, "المتبقي")),
      cashierName: cell(r, "الكاشير") || null,
      createdAt: parseDate(cell(r, "التاريخ")) ?? undefined,
    };
    const existing = await prisma.sale.findUnique({ where: { saleNumber } });
    if (existing) {
      // لا نلمس بنود الفاتورة أو المخزون — تحديث ترويسة فقط
      const { createdAt, ...rest } = data;
      void createdAt;
      await prisma.sale.update({ where: { saleNumber }, data: rest });
      updated++;
    } else {
      await prisma.sale.create({ data: { saleNumber, ...data } });
      created++;
    }
  }
  return { type: "sales", created, updated, skipped };
}

// ----------------------------------------------------
//  سجل النشاط — إنشاء دون تكرار (المستخدم+الإجراء+التاريخ)
// ----------------------------------------------------
async function importActivity(rows: Row[]): Promise<ImportTypeResult> {
  let created = 0,
    skipped = 0;
  for (const r of rows) {
    const userName = cell(r, "المستخدم");
    const action = cell(r, "الإجراء");
    const createdAt = parseDate(cell(r, "التاريخ"));
    if (!userName || !action) {
      skipped++;
      continue;
    }
    const roleLabel = cell(r, "الدور");
    const userRole = roleLabel === "مدير" ? "ADMIN" : "CASHIER";
    const details = cell(r, "التفاصيل") || null;
    // منع التكرار: نفس المستخدم والإجراء ونفس اللحظة (± دقيقة)
    if (createdAt) {
      const dup = await prisma.activityLog.findFirst({
        where: {
          userName,
          action,
          createdAt: {
            gte: new Date(createdAt.getTime() - 60000),
            lte: new Date(createdAt.getTime() + 60000),
          },
        },
        select: { id: true },
      });
      if (dup) {
        skipped++;
        continue;
      }
    }
    await prisma.activityLog.create({
      data: { userName, userRole, action, details, createdAt: createdAt ?? undefined },
    });
    created++;
  }
  return { type: "activity", created, updated: 0, skipped };
}

// ----------------------------------------------------
//  الديفو — إنشاء دون تكرار (يتطلّب مطابقة منتج بالاسم+البراند)
// ----------------------------------------------------
async function importDefects(rows: Row[]): Promise<ImportTypeResult> {
  let created = 0,
    skipped = 0;
  for (const r of rows) {
    const name = cell(r, "المنتج");
    const brand = cell(r, "البراند");
    const branch = toBranch(cell(r, "الفرع"));
    if (!name || !branch) {
      skipped++;
      continue;
    }
    const product = await prisma.product.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        brand: brand ? { equals: brand, mode: "insensitive" } : undefined,
      },
      select: { id: true },
    });
    if (!product) {
      skipped++;
      continue;
    }
    const quantity = Math.floor(numVal(cell(r, "الكمية"))) || 1;
    const unitCost = numVal(cell(r, "تكلفة الوحدة"));
    const reasonLabel = cell(r, "السبب");
    const reason =
      DEFECT_BY_LABEL[reasonLabel] ??
      (DEFECT_REASONS.includes(reasonLabel as DefectReasonValue)
        ? (reasonLabel as DefectReasonValue)
        : null);
    const createdAt = parseDate(cell(r, "التاريخ"));
    // منع التكرار
    if (createdAt) {
      const dup = await prisma.damagedItem.findFirst({
        where: {
          productId: product.id,
          branch: branch as Branch,
          quantity,
          createdAt: {
            gte: new Date(createdAt.getTime() - 60000),
            lte: new Date(createdAt.getTime() + 60000),
          },
        },
        select: { id: true },
      });
      if (dup) {
        skipped++;
        continue;
      }
    }
    await prisma.damagedItem.create({
      data: {
        productId: product.id,
        branch: branch as Branch,
        quantity,
        reason: reason ?? null,
        detail: cell(r, "تفاصيل") || null,
        unitCost,
        createdAt: createdAt ?? undefined,
      },
    });
    created++;
  }
  return { type: "defects", created, updated: 0, skipped };
}

// ----------------------------------------------------
//  التحويلات — إنشاء ترويسة دون تكرار (البنود غير قابلة للاستعادة من الملخّص)
// ----------------------------------------------------
async function importTransfers(rows: Row[]): Promise<ImportTypeResult> {
  let created = 0,
    skipped = 0;
  const statusFromLabel = (l: string) =>
    l === "مكتمل" ? "COMPLETED" : l === "ملغي" ? "CANCELLED" : "PENDING";
  for (const r of rows) {
    const from = toBranch(cell(r, "من فرع"));
    const to = toBranch(cell(r, "إلى فرع"));
    if (!from || !to) {
      skipped++;
      continue;
    }
    const createdAt = parseDate(cell(r, "تاريخ الإنشاء"));
    if (createdAt) {
      const dup = await prisma.stockTransfer.findFirst({
        where: {
          fromBranch: from as Branch,
          toBranch: to as Branch,
          createdAt: {
            gte: new Date(createdAt.getTime() - 60000),
            lte: new Date(createdAt.getTime() + 60000),
          },
        },
        select: { id: true },
      });
      if (dup) {
        skipped++;
        continue;
      }
    }
    await prisma.stockTransfer.create({
      data: {
        fromBranch: from as Branch,
        toBranch: to as Branch,
        status: statusFromLabel(cell(r, "الحالة")),
        createdBy: cell(r, "المنشئ") || null,
        notes: cell(r, "ملاحظات") || null,
        createdAt: createdAt ?? undefined,
        completedAt: parseDate(cell(r, "تاريخ الاكتمال")),
      },
    });
    created++;
  }
  return { type: "transfers", created, updated: 0, skipped };
}

export async function importByType(
  type: DataTypeKey,
  rows: Row[]
): Promise<ImportTypeResult> {
  switch (type) {
    case "customers":
      return importCustomers(rows);
    case "products":
      return importProducts(rows);
    case "sales":
      return importSales(rows);
    case "activity":
      return importActivity(rows);
    case "defects":
      return importDefects(rows);
    case "transfers":
      return importTransfers(rows);
  }
}
