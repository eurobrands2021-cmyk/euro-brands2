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
  type BranchValue,
  type DefectReasonValue,
} from "@/lib/constants";

// عمود reason في قاعدة البيانات يحمل كود السبب؛ نتحقق أنه ضمن القائمة
// (الصفوف القديمة قد تحمل نصاً حراً — نعيدها كـ OTHER ونعرض النص في detail).
function toReasonCode(dbReason: string | null): DefectReasonValue {
  return dbReason && DEFECT_REASONS.includes(dbReason as DefectReasonValue)
    ? (dbReason as DefectReasonValue)
    : "OTHER";
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
    const [products, variants] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, brand: true },
      }),
      prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, size: true, color: true },
      }),
    ]);
    const pmap = new Map(products.map((p) => [p.id, p]));
    const vmap = new Map(variants.map((v) => [v.id, v]));

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

    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: input.variantId },
        include: { product: { select: { name: true, brand: true } } },
      });
      if (!variant)
        throw new ValidationError("الصنف غير موجود في المخزون");
      if (variant.quantity < input.quantity)
        throw new ValidationError(
          `الكمية غير كافية من "${variant.product.name}" مقاس ${variant.size} (المتاح: ${variant.quantity})`
        );

      // تكلفة الوحدة: القيمة المُدخلة أو سعر الصنف كقيمة افتراضية (لحساب الخسارة)
      const unitCost =
        input.unitCost != null && input.unitCost >= 0
          ? input.unitCost
          : variant.price;

      // 1) خصم الكمية من مخزون الفرع — تحديث شرطي ذري يمنع الرصيد السالب
      // عند تسجيل تلف متزامن يتجاوز طلبان الفحص المبدئي معاً.
      const dec = await tx.productVariant.updateMany({
        where: { id: variant.id, quantity: { gte: input.quantity } },
        data: { quantity: { decrement: input.quantity } },
      });
      if (dec.count === 0)
        throw new ValidationError(
          `الكمية غير كافية من "${variant.product.name}" مقاس ${variant.size} (المتاح: ${variant.quantity})`
        );

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
        },
      });

      // 3) قيد في سجل النشاط (سجل تدقيق)
      const loss = round2(unitCost * input.quantity);
      await tx.activityLog.create({
        data: {
          userName: input.createdBy || "النظام",
          userRole: "ADMIN",
          action: "تسجيل تلف (ديفو)",
          details: `${variant.product.name} مقاس ${variant.size} — كمية ${input.quantity} — خسارة ${loss} ج.م`,
        },
      });

      return { damaged, variant };
    });

    const { damaged, variant } = result;
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
      createdAt: damaged.createdAt.toISOString(),
    };
    return ok(dto, 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
