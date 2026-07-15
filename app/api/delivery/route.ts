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

// الحالات «النشطة» (قيد التوصيل) — كل ما عدا «تم التوصيل» و«مرتجع».
const ACTIVE_STATUSES: DeliveryStatus[] = [
  "NEW",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
];

const deliveryInclude = {
  items: {
    include: {
      product: { select: { name: true, brand: true } },
      variant: { select: { size: true, color: true, sku: true } },
    },
  },
} satisfies Prisma.SaleInclude;

// GET /api/delivery — فواتير التوصيل مع الفلاتر والترقيم وأعداد الحالات
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

    const pageRaw = Number(searchParams.get("page"));
    const paginated = Number.isInteger(pageRaw) && pageRaw >= 1;
    const page = paginated ? pageRaw : 1;
    const pageSize = Math.min(
      Math.max(Number(searchParams.get("pageSize")) || 20, 1),
      100
    );

    // القاعدة (بدون فلتر الحالة) — تُستخدم لأعداد الحالات كي تبقى البطاقات
    // نظرة شاملة على النطاق المحدد بغض النظر عن فلتر الحالة المُختار للقائمة.
    const baseWhere: Prisma.SaleWhereInput = { isDelivery: true };
    if (branch) baseWhere.branch = branch as Branch;
    if (methodParam) baseWhere.deliveryMethod = methodParam as DeliveryMethod;
    if (source) baseWhere.orderSource = source as OrderSource;
    if (from || to) {
      baseWhere.createdAt = {};
      if (from) baseWhere.createdAt.gte = new Date(from);
      if (to) baseWhere.createdAt.lte = new Date(to);
    }

    // فلتر الحالة للقائمة (ACTIVE = مجموعة الحالات النشطة)
    const statusCond: Prisma.SaleWhereInput =
      status === "ACTIVE"
        ? { deliveryStatus: { in: ACTIVE_STATUSES } }
        : status
          ? { deliveryStatus: status as DeliveryStatus }
          : {};
    const listWhere: Prisma.SaleWhereInput = { AND: [baseWhere, statusCond] };

    // المسار القديم (بدون page) — مصفوفة كاملة (للتوافق)
    if (!paginated) {
      const sales = await prisma.sale.findMany({
        where: listWhere,
        include: deliveryInclude,
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return ok(sales.map(toSaleDTO), 200, CACHE_NONE);
    }

    // أعداد الحالات محسوبة على مستوى الخادم فوق القاعدة (النطاق) كاملةً
    const [orders, total, delivered, returned, inTransit] = await Promise.all([
      prisma.sale.findMany({
        where: listWhere,
        include: deliveryInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.sale.count({ where: listWhere }),
      prisma.sale.count({
        where: { AND: [baseWhere, { deliveryStatus: "DELIVERED" }] },
      }),
      prisma.sale.count({
        where: { AND: [baseWhere, { deliveryStatus: "RETURNED" }] },
      }),
      prisma.sale.count({
        where: { AND: [baseWhere, { deliveryStatus: { in: ACTIVE_STATUSES } }] },
      }),
    ]);

    // «الإجمالي» في البطاقات = كل طلبات النطاق (نظرة شاملة، غير محكومة بفلتر
    // الحالة)؛ بينما total هو عدد نتائج القائمة الحالية.
    const summaryTotal = await prisma.sale.count({ where: baseWhere });

    return ok(
      {
        orders: orders.map(toSaleDTO),
        total,
        page,
        pageSize,
        summary: {
          total: summaryTotal,
          inTransit,
          delivered,
          returned,
        },
      },
      200,
      CACHE_NONE
    );
  } catch (error) {
    return handleServerError(error);
  }
}
