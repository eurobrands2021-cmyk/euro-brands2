import { Prisma, type Branch, type Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { toProductDTO } from "@/lib/serializers";
import { parseProductInput, ValidationError } from "@/lib/validate";
import { MOCK_MODE, mockListProducts, mockCreateProduct } from "@/lib/mock-store";
import { buildVariantSku, uniquifySku } from "@/lib/sku";
import { normalizeArabic } from "@/lib/normalize";
import { expandBrandQuery } from "@/lib/brand-map";
import { cached } from "@/lib/cache";
import {
  selectStatusProductIds,
  type StatusQueryFilters,
} from "@/lib/product-status-query";
import { foldSql, likePattern } from "@/lib/sql-search";

// نافذة احتساب «الأكثر مبيعاً» — 90 يوماً متجدّدة (بدلاً من كامل التاريخ).
const BESTSELLER_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// حدّ أقصى افتراضي لحجم الصفحة عند تفعيل الترقيم (skip/take).
const MAX_PAGE_SIZE = 200;

// أدوات البحث النصي العربي على مستوى SQL مشتركة في lib/sql-search.

// يُرجع معرّفات المنتجات المطابقة لأي من عبارات البحث الموسّعة، بحثاً في
// الاسم/البراند/الكود/الباركود وأكواد الأصناف — كلّه داخل SQL بدل تحميل
// الجدول كاملاً وتصفيته في الذاكرة.
async function searchProductIds(terms: string[]): Promise<string[]> {
  if (terms.length === 0) return [];
  const patterns = terms.map(likePattern);
  // ملاحظة: p."sku" مهجور (لكل صنف SKU خاص) فلا نبحث فيه — نبحث في اسم/براند
  // المنتج والباركود وأكواد الأصناف فقط.
  const folded = foldSql(
    `(coalesce(p."name",'') || ' ' || coalesce(p."brand",'') || ' ' || coalesce(p."barcode",'') || ' ' || coalesce(v."sku",''))`
  );
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT p."id"
    FROM "Product" p
    LEFT JOIN "ProductVariant" v ON v."productId" = p."id"
    WHERE ${folded} ILIKE ANY(${patterns}::text[])
  `);
  return rows.map((r) => r.id);
}

export const dynamic = "force-dynamic";

// GET /api/products — قائمة المنتجات مع الفلاتر
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListProducts(searchParams));
    const search = searchParams.get("search")?.trim();
    const branch = searchParams.get("branch");
    const category = searchParams.get("category");
    const brand = searchParams.get("brand");
    const size = searchParams.get("size");
    // بحث مُوجَّه بمعرّفات محددة (لصفحة تعديل الفاتورة: تُجلب أصناف الفاتورة
    // فقط بدل كتالوج الفرع كاملاً). مصفوفة معرّفات مفصولة بفواصل.
    const idsParam = searchParams.get("ids");
    const ids = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    const withSales = searchParams.get("withSales") === "1";
    const sort = searchParams.get("sort");
    const bestselling = sort === "bestselling";
    const mostSold = sort === "mostSold";
    const lowestQty = sort === "lowestQty";
    // فلتر حالة المخزون (تبويبات صفحة المخزون) + فلتر المسودات
    const statusParam = searchParams.get("status");
    const status =
      statusParam === "low" || statusParam === "out" ? statusParam : null;
    const draftsOnly = searchParams.get("drafts") === "1";
    // إرفاق أعداد التبويبات (all/low/out) وإجمالي المسودات مع الاستجابة المرقّمة
    const withCounts = searchParams.get("withCounts") === "1";
    const limitRaw = Number(searchParams.get("limit"));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null;

    // ترقيم اختياري (skip/take): يُفعَّل بوجود page، ويغيّر شكل الاستجابة إلى
    // { items, total, page, perPage }. غيابه يُبقي السلوك القديم (مصفوفة).
    const pageRaw = Number(searchParams.get("page"));
    const perPageRaw = Number(searchParams.get("perPage"));
    const paginated = Number.isInteger(pageRaw) && pageRaw >= 1;
    const page = paginated ? pageRaw : 1;
    const perPage = Math.min(
      Number.isInteger(perPageRaw) && perPageRaw > 0 ? perPageRaw : 50,
      MAX_PAGE_SIZE
    );

    const where: Prisma.ProductWhereInput = {};

    if (category) where.category = category as Category;
    if (brand) where.brand = brand;
    if (draftsOnly) where.isDraft = true;
    // جلب مُوجَّه بمعرّفات (يتجاهل البحث النصي عند وجوده)
    if (ids) where.id = { in: ids };

    // فلترة على مستوى المقاسات (الفرع/المقاس)
    const variantWhere: Prisma.ProductVariantWhereInput = {};
    if (branch) variantWhere.branch = branch as Branch;
    if (size) variantWhere.size = size;
    const hasVariantFilter = Object.keys(variantWhere).length > 0;

    if (hasVariantFilter) {
      where.variants = { some: variantWhere };
    }

    // البحث النصي: نُضيّق المرشّحين على مستوى SQL (تطبيع عربي خام كمجموعة
    // فائقة) بدل تحميل كل المنتجات وتصفيتها في الذاكرة. النتيجة النهائية تبقى
    // محكومة بـ normalizeArabic الدقيق أدناه لضمان تطابق النتائج تماماً.
    let searchTerms: string[] | null = null;
    if (search && !ids) {
      const nq = normalizeArabic(search);
      if (nq) {
        searchTerms = expandBrandQuery(nq);
        where.id = { in: await searchProductIds(searchTerms) };
      }
    }

    const productInclude = {
      productType: true,
      variants: {
        where: hasVariantFilter ? variantWhere : undefined,
        orderBy: [{ branch: "asc" }, { size: "asc" }],
      },
    } satisfies Prisma.ProductInclude;

    let soldMap: Map<string, number> | null = null;
    if (withSales || bestselling || mostSold) {
      // تجميع الكميات المباعة خلال آخر 90 يوماً فقط، مع تخزين مؤقت للنتيجة
      // (تُستدعى مع كل تحميل للمخزون وكل جلب لـ«الأكثر مبيعاً» في نقطة البيع).
      const cutoff = new Date(Date.now() - BESTSELLER_WINDOW_MS);
      const grouped = await cached(
        "products:sold:90d",
        60_000,
        () =>
          prisma.saleItem.groupBy({
            by: ["productId"],
            _sum: { quantity: true },
            where: { sale: { createdAt: { gte: cutoff } } },
          })
      );
      soldMap = new Map(grouped.map((g) => [g.productId, g._sum.quantity ?? 0]));
    }

    // فلاتر حالة المخزون المشتركة (للقائمة وأعداد التبويبات)
    const statusFilters: StatusQueryFilters = {
      category,
      brand,
      branch,
      size,
      drafts: draftsOnly,
    };

    // معالجة في JS مطلوبة للبحث النصي الدقيق أو الترتيب المحسوب
    // (الأكثر مبيعاً/الأقل كمية) الذي لا يُعبَّر عنه بـ orderBy مباشر.
    const needsJs = !!searchTerms || bestselling || mostSold || lowestQty;

    // مسار سريع للترقيم على مستوى قاعدة البيانات (skip/take + count).
    if (paginated && !needsJs) {
      // معرّفات الحالة (للتصفية والعدّ) + إجمالي المسودات — بالتوازي.
      const [lowIds, outIds, draftsTotal] = await Promise.all([
        withCounts || status === "low"
          ? selectStatusProductIds("low", statusFilters)
          : Promise.resolve<string[] | null>(null),
        withCounts || status === "out"
          ? selectStatusProductIds("out", statusFilters)
          : Promise.resolve<string[] | null>(null),
        withCounts
          ? prisma.product.count({ where: { isDraft: true } })
          : Promise.resolve(0),
      ]);

      const statusIds =
        status === "low" ? lowIds : status === "out" ? outIds : null;
      const listWhere: Prisma.ProductWhereInput = statusIds
        ? { ...where, id: { in: statusIds } }
        : where;

      const [total, rows, allCount] = await Promise.all([
        prisma.product.count({ where: listWhere }),
        prisma.product.findMany({
          where: listWhere,
          include: productInclude,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        withCounts ? prisma.product.count({ where }) : Promise.resolve(0),
      ]);

      return ok(
        {
          items: rows.map((p) =>
            toProductDTO(p, soldMap ? soldMap.get(p.id) ?? 0 : undefined)
          ),
          total,
          page,
          perPage,
          ...(withCounts
            ? {
                counts: {
                  all: allCount,
                  low: lowIds?.length ?? 0,
                  out: outIds?.length ?? 0,
                  draftsTotal,
                },
              }
            : {}),
        },
        200,
        CACHE_NONE
      );
    }

    const allProducts = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { createdAt: "desc" },
    });

    // تطبيق التطبيع العربي الدقيق على المرشّحين لضمان تطابق النتائج مع السابق
    // (يطابق الاسم/البراند/الكود/الباركود/كود الصنف مع إزالة «ال» وتوحيد الهمزة).
    const products = searchTerms
      ? allProducts.filter((p) => {
          const fields = [
            p.name,
            p.brand,
            p.barcode ?? "",
            ...p.variants.map((v) => v.sku ?? ""),
          ].map((f) => normalizeArabic(f));
          return searchTerms!.some((t) => fields.some((f) => f.includes(t)));
        })
      : allProducts;

    // مُحدِّدات الحالة على الأصناف المحمّلة (مطابقة لتعريف lib/low-stock ونطاق
    // الفرع/المقاس — الأصناف مُصفّاة على النطاق ضمن productInclude عند وجود فلتر).
    const isOut = (p: (typeof products)[number]) =>
      p.variants.some((v) => v.quantity === 0);
    const isLow = (p: (typeof products)[number]) =>
      p.variants.some(
        (v) => v.quantity > 0 && v.alertOnLowStock && v.quantity <= v.minQuantity
      );

    // أعداد التبويبات تُحسب قبل تطبيق فلتر الحالة (all يتجاهل الحالة).
    const counts = withCounts
      ? {
          all: products.length,
          low: products.filter(isLow).length,
          out: products.filter(isOut).length,
          draftsTotal: await prisma.product.count({ where: { isDraft: true } }),
        }
      : null;

    // فلتر الحالة النشط
    let output =
      status === "low"
        ? products.filter(isLow)
        : status === "out"
          ? products.filter(isOut)
          : products;

    // الترتيب المحسوب في JS
    if (bestselling && soldMap) {
      // «الأكثر مبيعاً» لنقطة البيع: المنتجات المباعة فقط تنازلياً.
      const sold = soldMap;
      output = [...output]
        .filter((p) => (sold.get(p.id) ?? 0) > 0)
        .sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0));
    } else if (mostSold && soldMap) {
      // ترتيب المخزون بالأكثر مبيعاً: كل المنتجات (غير المباعة في النهاية).
      const sold = soldMap;
      output = [...output].sort(
        (a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0)
      );
    } else if (lowestQty) {
      const qty = (p: (typeof output)[number]) =>
        p.variants.reduce((s, v) => s + v.quantity, 0);
      output = [...output].sort((a, b) => qty(a) - qty(b));
    }

    if (limit) output = output.slice(0, limit);

    // ترقيم في الذاكرة للمسارات التي تُصفّى/تُرتّب في JS (بحث دقيق/ترتيب محسوب)
    if (paginated) {
      const total = output.length;
      const items = output
        .slice((page - 1) * perPage, (page - 1) * perPage + perPage)
        .map((p) =>
          toProductDTO(p, soldMap ? soldMap.get(p.id) ?? 0 : undefined)
        );
      return ok(
        { items, total, page, perPage, ...(counts ? { counts } : {}) },
        200,
        CACHE_NONE
      );
    }

    return ok(
      output.map((p) =>
        toProductDTO(p, soldMap ? soldMap.get(p.id) ?? 0 : undefined)
      ),
      200,
      CACHE_NONE
    );
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/products — إنشاء منتج جديد
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseProductInput(body);

    if (MOCK_MODE) return ok(mockCreateProduct(input), 201);

    // اجلب كود النوع لاستخدامه في توليد SKU التلقائي
    let typeCode: string | null = null;
    if (input.productTypeId) {
      const t = await prisma.productType.findUnique({
        where: { id: input.productTypeId },
        select: { code: true },
      });
      if (!t) throw new ValidationError("نوع المنتج المختار غير موجود");
      typeCode = t.code;
    }

    // أنشئ المنتج أولاً للحصول على معرفه (يُستخدم في الـ SKU)، ثم أنشئ الأصناف.
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: input.name,
          brand: input.brand,
          category: input.category as Category,
          description: input.description,
          sku: null,
          barcode: input.barcode ?? null,
          images: input.images,
          productTypeId: input.productTypeId ?? null,
          isDraft: input.isDraft ?? false,
        },
      });

      const takenSku = new Set<string>();
      const variantData = input.variants.map((v) => {
        const explicit = v.sku?.trim();
        const sku = explicit
          ? uniquifySku(explicit, takenSku)
          : uniquifySku(
              buildVariantSku({
                productId: created.id,
                typeCode,
                size: v.size,
                branch: v.branch,
                color: v.color,
              }),
              takenSku
            );
        return {
          productId: created.id,
          size: v.size,
          color: v.color,
          branch: v.branch as Branch,
          quantity: v.quantity,
          minQuantity: v.minQuantity,
          alertOnLowStock: v.alertOnLowStock ?? false,
          price: v.price,
          sku,
          skuManual: !!explicit && v.skuManual !== false,
        };
      });
      await tx.productVariant.createMany({ data: variantData });

      return tx.product.findUniqueOrThrow({
        where: { id: created.id },
        include: { productType: true, variants: true },
      });
    });

    // تسجيل البراند ضمن سجل البراندات للفئة
    await prisma.brand.upsert({
      where: {
        name_category: {
          name: input.brand,
          category: input.category as Category,
        },
      },
      update: {},
      create: { name: input.brand, category: input.category as Category },
    });

    return ok(toProductDTO(product), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
