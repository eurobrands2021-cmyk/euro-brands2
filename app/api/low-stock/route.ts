import { prisma } from "@/lib/prisma";
import { ok, handleServerError } from "@/lib/api";
import { MOCK_MODE, mockLowStock } from "@/lib/mock-store";
import type { BranchValue } from "@/lib/constants";
import type { LowStockItem, LowStockResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/low-stock — المقاسات التي كميتها <= الحد الأدنى
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockLowStock());

    const variants = await prisma.productVariant.findMany({
      include: { product: { select: { name: true, brand: true } } },
    });
    const items: LowStockItem[] = variants
      .filter((v) => v.quantity <= v.minQuantity)
      .map((v) => ({
        id: v.id,
        productName: v.product.name,
        brand: v.product.brand,
        branch: v.branch as BranchValue,
        size: v.size,
        color: v.color ?? null,
        quantity: v.quantity,
        minQuantity: v.minQuantity,
        alertOnLowStock: v.alertOnLowStock ?? false,
      }))
      .sort(
        (a, b) => a.quantity - a.minQuantity - (b.quantity - b.minQuantity)
      );

    const res: LowStockResponse = { count: items.length, items };
    return ok(res);
  } catch (error) {
    return handleServerError(error);
  }
}
