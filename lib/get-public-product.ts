// جلب بيانات المنتج العامة من جهة الخادم (لصفحة /p/[sku] وواجهة /api/public).
// يعمل في وضع المعاينة (mock-store) وفي الإنتاج (Prisma) على حدّ سواء.
// مغلَّف بـ React cache() لمنع تكرار الاستعلام داخل نفس الطلب (page + metadata).
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { toProductDTO } from "@/lib/serializers";
import { toPublicProduct, type PublicProductDTO } from "@/lib/public-product";
import { MOCK_MODE, mockGetProductBySku } from "@/lib/mock-store";

export const getPublicProduct = cache(
  async (sku: string): Promise<PublicProductDTO | null> => {
    const clean = (sku ?? "").trim();
    if (!clean) return null;

    if (MOCK_MODE) {
      const p = mockGetProductBySku(clean);
      return p ? toPublicProduct(p) : null;
    }

    const product = await prisma.product.findFirst({
      where: {
        variants: { some: { sku: { equals: clean, mode: "insensitive" } } },
      },
      include: {
        productType: true,
        variants: { orderBy: [{ branch: "asc" }, { size: "asc" }] },
      },
    });

    return product ? toPublicProduct(toProductDTO(product)) : null;
  }
);

// أكواد SKU للأصناف المتاحة — تُستخدم في generateStaticParams لتوليد الصفحات
// الأكثر أهمية وقت البناء. تُرجع قائمة فارغة بأمان إذا تعذّر الوصول للقاعدة.
export async function getPublicProductSkus(limit = 100): Promise<string[]> {
  try {
    if (MOCK_MODE) return [];
    const variants = await prisma.productVariant.findMany({
      where: { sku: { not: null }, quantity: { gt: 0 } },
      select: { sku: true },
      take: limit,
      orderBy: { id: "asc" },
    });
    return variants
      .map((v) => v.sku)
      .filter((s): s is string => !!s && !!s.trim());
  } catch {
    return [];
  }
}
