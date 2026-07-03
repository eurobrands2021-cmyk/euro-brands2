import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicProductView } from "@/components/public-product-view";
import {
  getPublicProduct,
  getPublicProductSkus,
} from "@/lib/get-public-product";

// صفحة عامة تماماً (بدون مصادقة). تُبنى وتُخزَّن مؤقتاً مع تحديث كل ساعة (ISR)
// لتحميل سريع. لا يوجد جلب من جهة العميل — المحتوى يُرسَم على الخادم.
export const revalidate = 3600;

// توليد الصفحات الأكثر أهمية وقت البناء (مع السماح بالبقية عند الطلب).
export async function generateStaticParams() {
  const skus = await getPublicProductSkus();
  return skus.map((sku) => ({ sku }));
}

export async function generateMetadata({
  params,
}: {
  params: { sku: string };
}): Promise<Metadata> {
  const sku = decodeURIComponent(params.sku ?? "");
  const product = await getPublicProduct(sku);
  if (!product) return { title: "المنتج غير متوفر — Euro Brands" };
  return {
    title: `${product.name} — Euro Brands`,
    description: product.description ?? `${product.name} من ${product.brand}`,
  };
}

export default async function PublicProductPage({
  params,
}: {
  params: { sku: string };
}) {
  const sku = decodeURIComponent(params.sku ?? "");
  const product = await getPublicProduct(sku);
  if (!product) notFound();
  return <PublicProductView product={product} />;
}
