import { NextResponse } from "next/server";
import { fail, handleServerError } from "@/lib/api";
import { getPublicProduct } from "@/lib/get-public-product";

// نقطة عامة (بدون مصادقة) لصفحة المنتج التي يفتحها العميل عبر QR.
// تُرجع بيانات آمنة فقط (بدون كمية/تكلفة/كود) مع ترويسات تخزين مؤقت
// تسمح لِـ CDN بتقديم الاستجابة بسرعة وتحديثها كل ساعة.
export const revalidate = 3600;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(
  _req: Request,
  { params }: { params: { sku: string } }
) {
  try {
    const sku = decodeURIComponent(params.sku ?? "").trim();
    if (!sku) return fail("كود المنتج مطلوب", 400);

    const product = await getPublicProduct(sku);
    if (!product) return fail("المنتج غير موجود", 404);

    return NextResponse.json(product, { headers: CACHE_HEADERS });
  } catch (error) {
    return handleServerError(error);
  }
}
