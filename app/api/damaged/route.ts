import { Prisma, type Branch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { parseDamagedInput, ValidationError } from "@/lib/validate";
import { round2 } from "@/lib/sale-utils";
import { buildDefectReport } from "@/lib/defect-report";
import {
  MOCK_MODE,
  mockCreateDamaged,
  mockDefectReport,
} from "@/lib/mock-store";
import type {
  DamagedItemDTO,
  DefectReport,
} from "@/lib/types";
import {
  DEFECT_REASONS,
  DEFECT_CONDITIONS,
  DEFECT_CONDITION_LABELS,
  type BranchValue,
  type DefectReasonValue,
  type DefectConditionValue,
} from "@/lib/constants";

// عمود reason في قاعدة البيانات يحمل كود السبب؛ نتحقق أنه ضمن القائمة
// (الصفوف القديمة قد تحمل نصاً حراً — نعيدها كـ OTHER ونعرض النص في detail).
function toReasonCode(dbReason: string | null): DefectReasonValue {
  return dbReason && DEFECT_REASONS.includes(dbReason as DefectReasonValue)
    ? (dbReason as DefectReasonValue)
    : "OTHER";
}

// حالة التصرّف — السجلات القديمة بلا عمود condition تُعتبر «تالف بالكامل».
function toCondition(dbValue: string | null | undefined): DefectConditionValue {
  return dbValue && DEFECT_CONDITIONS.includes(dbValue as DefectConditionValue)
    ? (dbValue as DefectConditionValue)
    : "TOTAL_LOSS";
}

export const dynamic = "force-dynamic";

// GET /api/damaged — تقرير الديفو (القائمة + الملخّص)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockDefectReport(searchParams));

    const branch = searchParams.get("branch");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.DamagedItemWhereInput = {};
    if (branch) where.branch = branch as Branch;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const rows = await prisma.damagedItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    // إثراء ببيانات المنتج/الصنف (لا توجد علاقات إلزامية على DamagedItem)
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const variantIds = [
      ...new Set(rows.map((r) => r.variantId).filter((v): v is string => !!v)),
    ];
    const supplierIds = [
      ...new Set(
        rows.map((r) => r.supplierId).filter((s): s is string => !!s)
      ),
    ];
    const [products, variants, suppliers] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, brand: true },
      }),
      prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, size: true, color: true },
      }),
      supplierIds.length
        ? prisma.supplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const pmap = new Map(products.map((p) => [p.id, p]));
    const vmap = new Map(variants.map((v) => [v.id, v]));
    const smap = new Map(suppliers.map((s) => [s.id, s.name]));

    const items: DamagedItemDTO[] = rows.map((r) => {
      const p = pmap.get(r.productId);
      const v = r.variantId ? vmap.get(r.variantId) : null;
      const reasonCode = toReasonCode(r.reason);
      return {
        id: r.id,
        productId: r.productId,
        variantId: r.variantId,
        productName: p?.name ?? "—",
        brand: p?.brand ?? "",
        size: v?.size ?? null,
        color: v?.color ?? null,
        branch: r.branch as BranchValue,
        quantity: r.quantity,
        reasonCode,
        // نص حر: عمود detail، ومع الصفوف القديمة نعرض النص المخزَّن في reason
        detail: r.detail ?? (reasonCode === "OTHER" ? r.reason : null),
        unitCost: r.unitCost,
        loss: round2(r.unitCost * r.quantity),
        photoUrl: r.photoUrl,
        condition: toCondition(r.condition),
        discountPrice: r.discountPrice ?? null,
        discountRemaining:
          r.condition === "SELL_AT_DISCOUNT"
            ? r.discountRemaining ?? r.quantity
            : null,
        supplierId: r.supplierId ?? null,
        supplierName: r.supplierId ? smap.get(r.supplierId) ?? null : null,
        createdAt: r.createdAt.toISOString(),
      };
    });

    // الملخّص (الخسارة/السبب الأكثر تكراراً) يُحسب دائماً فوق كامل النطاق المفلتر.
    const report: DefectReport = buildDefectReport(items);

    // ترقيم اختياري (skip/take على العناصر): يُفعَّل بوجود page ويعيد صفحة واحدة
    // من العناصر + الإجمالي، مع الإبقاء على الملخّص فوق كامل النطاق. غيابه يُبقي
    // السلوك القديم (التقرير الكامل).
    const pageRaw = Number(searchParams.get("page"));
    const perPageRaw = Number(searchParams.get("perPage"));
    if (Number.isInteger(pageRaw) && pageRaw >= 1) {
      const perPage = Math.min(
        Number.isInteger(perPageRaw) && perPageRaw > 0 ? perPageRaw : 20,
        200
      );
      const total = report.items.length;
      const pageItems = report.items.slice(
        (pageRaw - 1) * perPage,
        (pageRaw - 1) * perPage + perPage
      );
      return ok(
        { ...report, items: pageItems, total, page: pageRaw, perPage },
        200,
        CACHE_NONE
      );
    }

    return ok(report, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/damaged — تسجيل تلف: يخصم الكمية من المخزون داخل معاملة + سجل نشاط
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseDamagedInput(body);

    if (MOCK_MODE) return ok(mockCreateDamaged(input), 201);

    // الحالات التي تُخصَم من المخزون: تالف بالكامل + يُرجع للمورد.
    // «يُباع بخصم» يبقى في المخزون (يُعلَّم فقط بسعر مخفّض).
    const deductsStock = input.condition !== "SELL_AT_DISCOUNT";

    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: input.variantId },
        include: { product: { select: { name: true, brand: true } } },
      });
      if (!variant)
        throw new ValidationError("الصنف غير موجود في المخزون");
      // في كل الحالات لا يجوز تسجيل كمية تفوق المتاح.
      if (variant.quantity < input.quantity)
        throw new ValidationError(
          `الكمية غير كافية من "${variant.product.name}" مقاس ${variant.size} (المتاح: ${variant.quantity})`
        );

      // عند «يُرجع للمورد» نتحقق من وجود المورد
      let supplierName: string | null = null;
      if (input.condition === "RETURN_TO_SUPPLIER") {
        const supplier = input.supplierId
          ? await tx.supplier.findUnique({
              where: { id: input.supplierId },
              select: { name: true },
            })
          : null;
        if (!supplier) throw new ValidationError("المورد المختار غير موجود");
        supplierName = supplier.name;
      }

      // تكلفة الوحدة: القيمة المُدخلة أو سعر الصنف كقيمة افتراضية (لحساب الخسارة)
      const unitCost =
        input.unitCost != null && input.unitCost >= 0
          ? input.unitCost
          : variant.price;

      // 1) خصم الكمية من مخزون الفرع (فقط للحالات التي تُخصَم) — تحديث شرطي
      // ذري يمنع الرصيد السالب عند التسجيل المتزامن.
      if (deductsStock) {
        const dec = await tx.productVariant.updateMany({
          where: { id: variant.id, quantity: { gte: input.quantity } },
          data: { quantity: { decrement: input.quantity } },
        });
        if (dec.count === 0)
          throw new ValidationError(
            `الكمية غير كافية من "${variant.product.name}" مقاس ${variant.size} (المتاح: ${variant.quantity})`
          );
      }

      // 2) تسجيل التلف — كود السبب في عمود reason، والنص الحر في detail
      const damaged = await tx.damagedItem.create({
        data: {
          productId: variant.productId,
          variantId: variant.id,
          branch: variant.branch,
          quantity: input.quantity,
          reason: input.reasonCode,
          detail: input.detail,
          unitCost,
          photoUrl: input.photoUrl,
          condition: input.condition,
          discountPrice:
            input.condition === "SELL_AT_DISCOUNT"
              ? input.discountPrice ?? null
              : null,
          // دفتر الاستهلاك: كل الوحدات متاحة للبيع بخصم عند التسجيل
          discountRemaining:
            input.condition === "SELL_AT_DISCOUNT" ? input.quantity : null,
          supplierId:
            input.condition === "RETURN_TO_SUPPLIER"
              ? input.supplierId ?? null
              : null,
        },
      });

      // 3) قيد في سجل النشاط (سجل تدقيق) — صياغة حسب الحالة
      const condLabel = DEFECT_CONDITION_LABELS[input.condition];
      let effect: string;
      if (input.condition === "SELL_AT_DISCOUNT") {
        effect = `يُباع بخصم بسعر ${input.discountPrice} ج.م (بقي في المخزون)`;
      } else if (input.condition === "RETURN_TO_SUPPLIER") {
        effect = `مرتجع للمورد ${supplierName} — خُصم من المخزون`;
      } else {
        effect = `خسارة ${round2(unitCost * input.quantity)} ج.م`;
      }
      await tx.activityLog.create({
        data: {
          userName: input.createdBy || "النظام",
          userRole: "ADMIN",
          action: "تسجيل تلف (ديفو)",
          details: `${variant.product.name} مقاس ${variant.size} — كمية ${input.quantity} — ${condLabel} — ${effect}`,
        },
      });

      return { damaged, variant, supplierName };
    });

    const { damaged, variant, supplierName } = result;
    const dto: DamagedItemDTO = {
      id: damaged.id,
      productId: damaged.productId,
      variantId: damaged.variantId,
      productName: variant.product.name,
      brand: variant.product.brand,
      size: variant.size,
      color: variant.color,
      branch: damaged.branch as BranchValue,
      quantity: damaged.quantity,
      reasonCode: toReasonCode(damaged.reason),
      detail: damaged.detail,
      unitCost: damaged.unitCost,
      loss: round2(damaged.unitCost * damaged.quantity),
      photoUrl: damaged.photoUrl,
      condition: toCondition(damaged.condition),
      discountPrice: damaged.discountPrice ?? null,
      discountRemaining:
        damaged.condition === "SELL_AT_DISCOUNT"
          ? damaged.discountRemaining ?? damaged.quantity
          : null,
      supplierId: damaged.supplierId ?? null,
      supplierName,
      createdAt: damaged.createdAt.toISOString(),
    };
    return ok(dto, 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
