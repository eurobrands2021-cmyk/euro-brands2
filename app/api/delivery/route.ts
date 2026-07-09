import {
  Prisma,
  type Branch,
  type DeliveryMethod,
  type DeliveryStatus,
  type OrderSource,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError, CACHE_NONE } from "@/lib/api";
import { toSaleDTO } from "@/lib/serializers";
import { MOCK_MODE, mockListDelivery } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/delivery — كل فواتير التوصيل مع الفلاتر
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListDelivery(searchParams));

    const branch = searchParams.get("branch");
    const status = searchParams.get("status");
    const methodParam = searchParams.get("method");
    const source = searchParams.get("source");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.SaleWhereInput = { isDelivery: true };
    if (branch) where.branch = branch as Branch;
    if (status) where.deliveryStatus = status as DeliveryStatus;
    if (methodParam) where.deliveryMethod = methodParam as DeliveryMethod;
    if (source) where.orderSource = source as OrderSource;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { name: true, brand: true } },
            variant: { select: { size: true, color: true, sku: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return ok(sales.map(toSaleDTO), 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}
