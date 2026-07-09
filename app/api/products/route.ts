import { Prisma, type Branch, type Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { toProductDTO } from "@/lib/serializers";
import { parseProductInput, ValidationError } from "@/lib/validate";
import { MOCK_MODE, mockListProducts, mockCreateProduct } from "@/lib/mock-store";
import { buildVariantSku, uniquifySku } from "@/lib/sku";
import { normalizeArabic } from "@/lib/normalize";
import { expandBrandQuery } from "@/lib/brand-map";

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
    const withSales = searchParams.get("withSales") === "1";
    const sort = searchParams.get("sort");
    const bestselling = sort === "bestselling";
    const limitRaw = Number(searchParams.get("limit"));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null;

    const where: Prisma.ProductWhereInput = {};

    if (category) where.category = category as Category;
    if (brand) where.brand = brand;
    // ملاحظة: البحث النصي يُطبَّق بعد الجلب باستخدام تطبيع عربي ذكي
    // (توحيد الهمزة + إزالة «ال») حتى يطابق "اديداس" اسم "أديداس".

    // فلترة على مستوى المقاسات (الفرع/المقاس)
    const variantWhere: Prisma.ProductVariantWhereInput = {};
    if (branch) variantWhere.branch = branch as Branch;
    if (size) variantWhere.size = size;
    const hasVariantFilter = Object.keys(variantWhere).length > 0;

    if (hasVariantFilter) {
      where.variants = { some: variantWhere };
    }

    const allProducts = await prisma.product.findMany({
      where,
      include: {
        productType: true,
        variants: {
          where: hasVariantFilter ? variantWhere : undefined,
          orderBy: [{ branch: "asc" }, { size: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // بحث نصي بتطبيع عربي: يطابق الاسم/البراند/الكود/الباركود/كود الصنف
    const products = search
      ? (() => {
          const nq = normalizeArabic(search);
          if (!nq) return allProducts;
          // توسعة العبارة لتشمل مقابل اسم البراند بالّلغة الأخرى (نايك ↔ Nike)
          const terms = expandBrandQuery(nq);
          return allProducts.filter((p) => {
            const fields = [
              p.name,
              p.brand,
              p.sku ?? "",
              p.barcode ?? "",
              ...p.variants.map((v) => v.sku ?? ""),
            ].map((f) => normalizeArabic(f));
            return terms.some((t) => fields.some((f) => f.includes(t)));
          });
        })()
      : allProducts;

    let soldMap: Map<string, number> | null = null;
    if (withSales || bestselling) {
      const grouped = await prisma.saleItem.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
      });
      soldMap = new Map(grouped.map((g) => [g.productId, g._sum.quantity ?? 0]));
    }

    // ترتيب «الأكثر مبيعاً»: حسب إجمالي الكمية المباعة تنازلياً (المنتجات التي بيعت فقط)
    let output = products;
    if (bestselling && soldMap) {
      const sold = soldMap;
      output = [...products]
        .filter((p) => (sold.get(p.id) ?? 0) > 0)
        .sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0));
    }
    if (limit) output = output.slice(0, limit);

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
