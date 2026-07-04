// إدارة البيانات (تصدير / أرشفة / حذف / إعادة استيراد) — منطق الخادم.
// كل العمليات المؤثِّرة (أرشفة/حذف/استيراد) تتطلّب كلمة مرور المدير ويُتحقَّق منها هنا
// في الخادم — فلا تُنفَّذ من كاشير حتى لو استُدعيت الـ API مباشرةً.
import { prisma } from "./prisma";
import { ADMIN_PASSWORD } from "./auth";
import {
  BRANCH_LABELS,
  PAYMENT_METHOD_LABELS,
  TRANSFER_METHOD_LABELS,
  SALE_STATUS_LABELS,
  CATEGORY_LABELS,
  DEFECT_REASON_LABELS,
  type BranchValue,
  type CategoryValue,
  type PaymentMethodValue,
  type TransferMethodValue,
  type SaleStatusValue,
  type DefectReasonValue,
} from "./constants";
import {
  ARCHIVE_RETENTION_MS,
  DATA_TYPE_KEYS,
  DATA_TYPE_LABELS,
  isArchivable,
  type ArchivedGroup,
  type DataTypeKey,
  type ExportSheet,
} from "./data-management-types";

// إعادة تصدير الأنواع/الثوابت المشتركة لتبقى نقاط الاستيراد القائمة تعمل
export {
  ARCHIVE_RETENTION_HOURS,
  ARCHIVE_RETENTION_MS,
  DATA_TYPE_KEYS,
  DATA_TYPE_LABELS,
  ARCHIVABLE_TYPES,
  isDataType,
  isArchivable,
} from "./data-management-types";
export type {
  DataTypeKey,
  RangePreset,
  ExportSheet,
  ArchivedGroup,
} from "./data-management-types";

// التحقّق من كلمة مرور المدير (نفس مستوى الحماية القائم في التطبيق).
export function verifyAdmin(password: unknown): boolean {
  return typeof password === "string" && password === ADMIN_PASSWORD;
}

// ----------------------------------------------------
//  المدى الزمني
// ----------------------------------------------------
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

// حساب المدى الزمني من الإعداد المختار. الأشهر تُحسب من الآن رجوعاً للخلف.
export function resolveRange(
  preset: string | null | undefined,
  fromStr?: string | null,
  toStr?: string | null
): DateRange {
  const now = new Date();
  const monthsAgo = (m: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - m);
    return d;
  };
  switch (preset) {
    case "1m":
      return { from: monthsAgo(1), to: now };
    case "3m":
      return { from: monthsAgo(3), to: now };
    case "6m":
      return { from: monthsAgo(6), to: now };
    case "custom": {
      const from = fromStr ? new Date(fromStr) : null;
      let to: Date | null = toStr ? new Date(toStr) : null;
      if (to) to = new Date(to.getTime()); // نُبقيها كما جاءت (الواجهة تضبط نهاية اليوم)
      return {
        from: from && !isNaN(from.getTime()) ? from : null,
        to: to && !isNaN(to.getTime()) ? to : null,
      };
    }
    default:
      return { from: null, to: null };
  }
}

// شرط prisma على عمود createdAt ضمن المدى
function createdWhere(range: DateRange): { gte?: Date; lte?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  const w: { gte?: Date; lte?: Date } = {};
  if (range.from) w.gte = range.from;
  if (range.to) w.lte = range.to;
  return w;
}

// ----------------------------------------------------
//  عدّ السجلات (لعرض التقدير قبل التصدير)
// ----------------------------------------------------
export async function countByType(
  types: DataTypeKey[],
  range: DateRange
): Promise<Record<DataTypeKey, number>> {
  const created = createdWhere(range);
  const where = created ? { createdAt: created } : {};
  const result = {} as Record<DataTypeKey, number>;
  const wanted = new Set(types);

  await Promise.all(
    DATA_TYPE_KEYS.map(async (k) => {
      if (!wanted.has(k)) {
        result[k] = 0;
        return;
      }
      switch (k) {
        case "sales":
          result[k] = await prisma.sale.count({ where });
          break;
        case "products":
          result[k] = await prisma.product.count({ where });
          break;
        case "customers":
          result[k] = await prisma.customer.count({ where });
          break;
        case "defects":
          result[k] = await prisma.damagedItem.count({ where });
          break;
        case "activity":
          result[k] = await prisma.activityLog.count({ where });
          break;
        case "transfers":
          result[k] = await prisma.stockTransfer.count({ where });
          break;
      }
    })
  );
  return result;
}

// ----------------------------------------------------
//  تجميع بيانات التصدير (صفوف جاهزة للجدول لكل نوع)
// ----------------------------------------------------
const fmtDate = (d: Date | null | undefined): string => {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

export async function collectExport(
  types: DataTypeKey[],
  range: DateRange
): Promise<ExportSheet[]> {
  const created = createdWhere(range);
  const where = created ? { createdAt: created } : {};
  const wanted = new Set(types);
  const sheets: ExportSheet[] = [];

  if (wanted.has("sales")) {
    const sales = await prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: { select: { name: true, brand: true } },
            variant: { select: { size: true, color: true, sku: true } },
          },
        },
      },
    });
    sheets.push({
      type: "sales",
      label: DATA_TYPE_LABELS.sales,
      columns: [
        "رقم الفاتورة",
        "التاريخ",
        "الفرع",
        "العميل",
        "الهاتف",
        "طريقة الدفع",
        "الحالة",
        "الإجمالي",
        "الخصم",
        "الصافي",
        "المدفوع",
        "المتبقي",
        "عدد الأصناف",
        "الكاشير",
      ],
      rows: sales.map((s) => [
        s.saleNumber,
        fmtDate(s.createdAt),
        BRANCH_LABELS[s.branch as BranchValue],
        s.customerName ?? "",
        s.customerPhone ?? "",
        s.paymentMethod === "TRANSFER" && s.transferMethod
          ? `${PAYMENT_METHOD_LABELS[s.paymentMethod as PaymentMethodValue]} - ${
              TRANSFER_METHOD_LABELS[s.transferMethod as TransferMethodValue] ??
              s.transferMethod
            }`
          : PAYMENT_METHOD_LABELS[s.paymentMethod as PaymentMethodValue],
        SALE_STATUS_LABELS[s.status as SaleStatusValue],
        s.totalAmount,
        s.totalAmount - s.finalAmount,
        s.finalAmount,
        s.paidAmount,
        s.remainingAmount,
        s.items.reduce((sum, it) => sum + it.quantity, 0),
        s.cashierName ?? "",
      ]),
    });
  }

  if (wanted.has("products")) {
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { variants: true, productType: { select: { name: true } } },
    });
    const rows: (string | number)[][] = [];
    for (const p of products) {
      if (p.variants.length === 0) {
        rows.push([
          p.name,
          p.brand,
          CATEGORY_LABELS[p.category as CategoryValue],
          p.productType?.name ?? "",
          "",
          "",
          "",
          0,
          0,
          "",
          fmtDate(p.createdAt),
        ]);
        continue;
      }
      for (const v of p.variants) {
        rows.push([
          p.name,
          p.brand,
          CATEGORY_LABELS[p.category as CategoryValue],
          p.productType?.name ?? "",
          v.color ?? "",
          v.size,
          BRANCH_LABELS[v.branch as BranchValue],
          v.quantity,
          v.price,
          v.sku ?? "",
          fmtDate(p.createdAt),
        ]);
      }
    }
    sheets.push({
      type: "products",
      label: DATA_TYPE_LABELS.products,
      columns: [
        "اسم المنتج",
        "البراند",
        "الفئة",
        "النوع",
        "اللون",
        "المقاس",
        "الفرع",
        "الكمية",
        "السعر",
        "الكود (SKU)",
        "تاريخ الإضافة",
      ],
      rows,
    });
  }

  if (wanted.has("customers")) {
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    sheets.push({
      type: "customers",
      label: DATA_TYPE_LABELS.customers,
      columns: [
        "الاسم",
        "الهاتف",
        "إجمالي الإنفاق",
        "عدد الزيارات",
        "آخر زيارة",
        "الفرع",
        "ملاحظات",
        "تاريخ الإضافة",
      ],
      rows: customers.map((c) => [
        c.name,
        c.phone,
        c.totalSpent,
        c.visitCount,
        fmtDate(c.lastVisitAt),
        c.branch ? BRANCH_LABELS[c.branch as BranchValue] : "",
        c.notes ?? "",
        fmtDate(c.createdAt),
      ]),
    });
  }

  if (wanted.has("defects")) {
    const items = await prisma.damagedItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    // إثراء بأسماء المنتجات
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, brand: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));
    const variantIds = Array.from(
      new Set(items.map((i) => i.variantId).filter((v): v is string => !!v))
    );
    const variants = variantIds.length
      ? await prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, size: true, color: true },
        })
      : [];
    const vMap = new Map(variants.map((v) => [v.id, v]));
    sheets.push({
      type: "defects",
      label: DATA_TYPE_LABELS.defects,
      columns: [
        "المنتج",
        "البراند",
        "المقاس",
        "اللون",
        "الفرع",
        "الكمية",
        "السبب",
        "تفاصيل",
        "تكلفة الوحدة",
        "الخسارة",
        "التاريخ",
      ],
      rows: items.map((i) => {
        const p = pMap.get(i.productId);
        const v = i.variantId ? vMap.get(i.variantId) : null;
        return [
          p?.name ?? i.productId,
          p?.brand ?? "",
          v?.size ?? "",
          v?.color ?? "",
          BRANCH_LABELS[i.branch as BranchValue],
          i.quantity,
          i.reason
            ? DEFECT_REASON_LABELS[i.reason as DefectReasonValue] ?? i.reason
            : "",
          i.detail ?? "",
          i.unitCost,
          i.quantity * i.unitCost,
          fmtDate(i.createdAt),
        ];
      }),
    });
  }

  if (wanted.has("activity")) {
    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    sheets.push({
      type: "activity",
      label: DATA_TYPE_LABELS.activity,
      columns: ["التاريخ", "المستخدم", "الدور", "الإجراء", "التفاصيل"],
      rows: logs.map((a) => [
        fmtDate(a.createdAt),
        a.userName,
        a.userRole === "ADMIN" ? "مدير" : "كاشير",
        a.action,
        a.details ?? "",
      ]),
    });
  }

  if (wanted.has("transfers")) {
    const transfers = await prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    const statusLabel = (s: string) =>
      s === "COMPLETED" ? "مكتمل" : s === "CANCELLED" ? "ملغي" : "قيد الانتظار";
    sheets.push({
      type: "transfers",
      label: DATA_TYPE_LABELS.transfers,
      columns: [
        "من فرع",
        "إلى فرع",
        "الحالة",
        "عدد الأصناف",
        "إجمالي الكمية",
        "المنشئ",
        "ملاحظات",
        "تاريخ الإنشاء",
        "تاريخ الاكتمال",
      ],
      rows: transfers.map((t) => [
        BRANCH_LABELS[t.fromBranch as BranchValue],
        BRANCH_LABELS[t.toBranch as BranchValue],
        statusLabel(t.status),
        t.items.length,
        t.items.reduce((sum, it) => sum + it.quantity, 0),
        t.createdBy ?? "",
        t.notes ?? "",
        fmtDate(t.createdAt),
        fmtDate(t.completedAt),
      ]),
    });
  }

  return sheets;
}

// ----------------------------------------------------
//  الأرشفة (حذف مؤجّل) — ضبط archivedAt
// ----------------------------------------------------
export async function archiveTypes(
  types: DataTypeKey[],
  range: DateRange
): Promise<Record<string, number>> {
  const created = createdWhere(range);
  const where = created ? { createdAt: created, archivedAt: null } : { archivedAt: null };
  const now = new Date();
  const counts: Record<string, number> = {};
  for (const k of types) {
    if (!isArchivable(k)) continue;
    switch (k) {
      case "sales":
        counts.sales = (
          await prisma.sale.updateMany({ where, data: { archivedAt: now } })
        ).count;
        break;
      case "products":
        counts.products = (
          await prisma.product.updateMany({ where, data: { archivedAt: now } })
        ).count;
        break;
      case "customers":
        counts.customers = (
          await prisma.customer.updateMany({ where, data: { archivedAt: now } })
        ).count;
        break;
      case "activity":
        counts.activity = (
          await prisma.activityLog.updateMany({ where, data: { archivedAt: now } })
        ).count;
        break;
    }
  }
  return counts;
}

// ----------------------------------------------------
//  الحذف الفوري (نهائي)
// ----------------------------------------------------
// حذف المنتجات دون كسر قيود المفاتيح: المنتجات المرتبطة ببنود فواتير (تاريخ بيع)
// لا يمكن حذفها (RESTRICT)، فنتخطّاها ونُبلّغ بعددها.
async function deleteProductsSafe(where: {
  createdAt?: { gte?: Date; lte?: Date };
}): Promise<{ deleted: number; skipped: number }> {
  const products = await prisma.product.findMany({
    where,
    select: { id: true, _count: { select: { saleItems: true } } },
  });
  const deletableIds = products
    .filter((p) => p._count.saleItems === 0)
    .map((p) => p.id);
  const skipped = products.length - deletableIds.length;
  if (deletableIds.length === 0) return { deleted: 0, skipped };
  const res = await prisma.product.deleteMany({
    where: { id: { in: deletableIds } },
  });
  return { deleted: res.count, skipped };
}

export async function deleteTypes(
  types: DataTypeKey[],
  range: DateRange
): Promise<{ counts: Record<string, number>; skippedProducts: number }> {
  const created = createdWhere(range);
  const where = created ? { createdAt: created } : {};
  const counts: Record<string, number> = {};
  let skippedProducts = 0;

  for (const k of types) {
    switch (k) {
      case "sales":
        // حذف الفواتير لا يُعيد المخزون (SaleItem يُحذف تلقائياً بالـ Cascade فقط).
        counts.sales = (await prisma.sale.deleteMany({ where })).count;
        break;
      case "products": {
        const r = await deleteProductsSafe(where);
        counts.products = r.deleted;
        skippedProducts = r.skipped;
        break;
      }
      case "customers":
        counts.customers = (await prisma.customer.deleteMany({ where })).count;
        break;
      case "defects":
        counts.defects = (await prisma.damagedItem.deleteMany({ where })).count;
        break;
      case "activity":
        counts.activity = (await prisma.activityLog.deleteMany({ where })).count;
        break;
      case "transfers":
        counts.transfers = (
          await prisma.stockTransfer.deleteMany({ where })
        ).count;
        break;
    }
  }
  return { counts, skippedProducts };
}

// ----------------------------------------------------
//  الحالة + الكنس التلقائي للمؤرشفات المنتهية (> 72 ساعة)
// ----------------------------------------------------
// يحذف كل ما مضى على أرشفته أكثر من 72 ساعة، ثم يُعيد ملخّص ما تبقّى مؤرشفاً.
export async function sweepAndListArchived(): Promise<ArchivedGroup[]> {
  const cutoff = new Date(Date.now() - ARCHIVE_RETENTION_MS);

  // كنس المنتهية
  await prisma.sale.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  await prisma.customer.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  await prisma.activityLog.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  // المنتجات: احذف فقط غير المرتبطة ببنود فواتير (تفادي RESTRICT)
  const expiredProducts = await prisma.product.findMany({
    where: { archivedAt: { lt: cutoff } },
    select: { id: true, _count: { select: { saleItems: true } } },
  });
  const delIds = expiredProducts
    .filter((p) => p._count.saleItems === 0)
    .map((p) => p.id);
  if (delIds.length)
    await prisma.product.deleteMany({ where: { id: { in: delIds } } });

  // ملخّص المتبقّي مؤرشفاً
  const groups: ArchivedGroup[] = [];
  const push = (
    type: DataTypeKey,
    count: number,
    earliest: Date | null | undefined
  ) => {
    if (count === 0 || !earliest) return;
    groups.push({
      type,
      label: DATA_TYPE_LABELS[type],
      count,
      earliestArchivedAt: earliest.toISOString(),
      deleteAt: new Date(earliest.getTime() + ARCHIVE_RETENTION_MS).toISOString(),
    });
  };

  const [saleAgg, custAgg, actAgg, prodAgg] = await Promise.all([
    prisma.sale.aggregate({
      where: { archivedAt: { not: null } },
      _count: true,
      _min: { archivedAt: true },
    }),
    prisma.customer.aggregate({
      where: { archivedAt: { not: null } },
      _count: true,
      _min: { archivedAt: true },
    }),
    prisma.activityLog.aggregate({
      where: { archivedAt: { not: null } },
      _count: true,
      _min: { archivedAt: true },
    }),
    prisma.product.aggregate({
      where: { archivedAt: { not: null } },
      _count: true,
      _min: { archivedAt: true },
    }),
  ]);
  push("sales", saleAgg._count, saleAgg._min.archivedAt);
  push("customers", custAgg._count, custAgg._min.archivedAt);
  push("activity", actAgg._count, actAgg._min.archivedAt);
  push("products", prodAgg._count, prodAgg._min.archivedAt);

  return groups;
}
