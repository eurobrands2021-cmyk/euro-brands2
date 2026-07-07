import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicProductView } from "@/components/public-product-view";
import {
  getPublicProduct,
  getPublicProductSkus,
} from "@/lib/get-public-product";
import type { PublicProductDTO } from "@/lib/public-product";

// صفحة عامة تماماً (بدون مصادقة). تُبنى وتُخزَّن مؤقتاً مع تحديث كل ساعة (ISR)
// لتحميل سريع. لا يوجد جلب من جهة العميل — المحتوى يُرسَم على الخادم.
export const revalidate = 3600;

// توليد الصفحات الأكثر أهمية وقت البناء (مع السماح بالبقية عند الطلب).
// عند تعذّر الوصول للقاعدة أو نقص أعمدة، نُرجع قائمة فارغة فتُبنى الصفحات عند
// الطلب بدلاً من فشل البناء بالكامل.
export async function generateStaticParams() {
  try {
    const skus = await getPublicProductSkus();
    return skus.map((sku) => ({ sku }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { sku: string };
}): Promise<Metadata> {
  const sku = decodeURIComponent(params.sku ?? "");
  try {
    const product = await getPublicProduct(sku);
    if (!product) return { title: "المنتج غير متوفر — Euro Brands" };
    return {
      title: `${product.name} — Euro Brands`,
      description: product.description ?? `${product.name} من ${product.brand}`,
    };
  } catch {
    // خطأ قاعدة البيانات (مثل عمود مفقود) — لا نُفشل البناء
    return { title: "المنتج غير متوفر — Euro Brands" };
  }
}

export default async function PublicProductPage({
  params,
}: {
  params: { sku: string };
}) {
  const sku = decodeURIComponent(params.sku ?? "");

  // نجلب البيانات داخل try/catch حتى لا يفشل التصيير المسبق (prerender) عند
  // تعذّر الوصول للقاعدة أو نقص عمود — نعرض 404 بدلاً من إسقاط البناء.
  let product: PublicProductDTO | null = null;
  try {
    product = await getPublicProduct(sku);
  } catch {
    notFound();
  }
  if (!product) notFound();
  return <PublicProductView product={product} />;
}
