import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toProductDTO } from "@/lib/serializers";
import { toPublicProduct } from "@/lib/public-product";
import { MOCK_MODE, mockGetProductBySku } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/public/products/[sku]
// نقطة عامة (بدون مصادقة) لصفحة المنتج التي يفتحها العميل عبر QR.
// تُرجع بيانات آمنة فقط (بدون كمية/تكلفة/كود).
export async function GET(
  _req: Request,
  { params }: { params: { sku: string } }
) {
  try {
    const sku = decodeURIComponent(params.sku ?? "").trim();
    if (!sku) return fail("كود المنتج مطلوب", 400);

    if (MOCK_MODE) {
      const p = mockGetProductBySku(sku);
      if (!p) return fail("المنتج غير موجود", 404);
      return ok(toPublicProduct(p));
    }

    const product = await prisma.product.findFirst({
      where: { variants: { some: { sku: { equals: sku, mode: "insensitive" } } } },
      include: {
        productType: true,
        variants: { orderBy: [{ branch: "asc" }, { size: "asc" }] },
      },
    });

    if (!product) return fail("المنتج غير موجود", 404);
    return ok(toPublicProduct(toProductDTO(product)));
  } catch (error) {
    return handleServerError(error);
  }
}
