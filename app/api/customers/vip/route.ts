import { Prisma, type Branch, type Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError } from "@/lib/api";
import { round2 } from "@/lib/sale-utils";
import { MOCK_MODE, mockListVipCustomers } from "@/lib/mock-store";
import { BRANCHES, CATEGORIES } from "@/lib/constants";
import type { BranchValue, CategoryValue } from "@/lib/constants";
import { VIP_FILTERS, type VipCustomerDTO, type VipFilter } from "@/lib/types";

export const dynamic = "force-dynamic";

const LIMIT = 50;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  totalSpent: number;
  lastVisitAt: Date | null;
  branch: Branch | null;
};

function toVipDTO(c: CustomerRow): VipCustomerDTO {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    visitCount: c.visitCount,
    totalSpent: c.totalSpent,
    avgSale: c.visitCount > 0 ? round2(c.totalSpent / c.visitCount) : 0,
    lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
    branch: (c.branch as BranchValue | null) ?? null,
  };
}

// GET /api/customers/vip — أفضل 50 عميلاً حسب الفلتر المختار
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListVipCustomers(searchParams));

    const filterRaw = searchParams.get("filter") ?? "spenders";
    const filter: VipFilter = VIP_FILTERS.includes(filterRaw as VipFilter)
      ? (filterRaw as VipFilter)
      : "spenders";
    const branchParam = searchParams.get("branch");
    const branch =
      branchParam && BRANCHES.includes(branchParam as BranchValue)
        ? (branchParam as Branch)
        : null;
    const categoryParam = searchParams.get("category");
    const category =
      categoryParam && CATEGORIES.includes(categoryParam as CategoryValue)
        ? (categoryParam as Category)
        : ("CLOTHES" as Category);

    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    let rows: CustomerRow[];

    switch (filter) {
      case "frequent":
        rows = await prisma.customer.findMany({
          orderBy: [{ visitCount: "desc" }, { totalSpent: "desc" }],
          take: LIMIT,
        });
        break;

      case "branch":
        rows = await prisma.customer.findMany({
          where: branch ? { branch } : {},
          orderBy: { totalSpent: "desc" },
          take: LIMIT,
        });
        break;

      case "atrisk":
        // آخر زيارة أقدم من 30 يوماً
        rows = await prisma.customer.findMany({
          where: { lastVisitAt: { not: null, lt: cutoff } },
          orderBy: { totalSpent: "desc" },
          take: LIMIT,
        });
        break;

      case "new":
        rows = await prisma.customer.findMany({
          where: { createdAt: { gte: cutoff } },
          orderBy: { createdAt: "desc" },
          take: LIMIT,
        });
        break;

      case "avg": {
        // متوسط الفاتورة = totalSpent / visitCount (يُحسب ثم يُرتَّب)
        const all = await prisma.customer.findMany({
          where: { visitCount: { gt: 0 } },
        });
        all.sort(
          (a, b) =>
            b.totalSpent / b.visitCount - a.totalSpent / a.visitCount
        );
        rows = all.slice(0, LIMIT);
        break;
      }

      case "category": {
        // الفئة الأكثر شراءً لكل عميل (عبر هاتف الفاتورة) ثم فلترة المطابقين
        const items = await prisma.saleItem.findMany({
          where: {
            sale: { status: "COMPLETED", customerPhone: { not: null } },
          },
          select: {
            quantity: true,
            product: { select: { category: true } },
            sale: { select: { customerPhone: true } },
          },
        });
        const byPhone = new Map<string, Map<string, number>>();
        for (const it of items) {
          const phone = it.sale.customerPhone;
          if (!phone) continue;
          const m = byPhone.get(phone) ?? new Map<string, number>();
          m.set(
            it.product.category,
            (m.get(it.product.category) ?? 0) + it.quantity
          );
          byPhone.set(phone, m);
        }
        const phones: string[] = [];
        for (const [phone, m] of byPhone) {
          let bestCat: string | null = null;
          let best = -1;
          for (const [cat, q] of m) {
            if (q > best) {
              best = q;
              bestCat = cat;
            }
          }
          if (bestCat === category) phones.push(phone);
        }
        rows = await prisma.customer.findMany({
          where: { phone: { in: phones } },
          orderBy: { totalSpent: "desc" },
          take: LIMIT,
        });
        break;
      }

      case "spenders":
      default:
        rows = await prisma.customer.findMany({
          orderBy: { totalSpent: "desc" },
          take: LIMIT,
        });
    }

    return ok(rows.map(toVipDTO));
  } catch (error) {
    // فهرس/جدول العملاء قد يكون فارغاً — أعِد قائمة فارغة بدل خطأ
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return ok([] as VipCustomerDTO[]);
    }
    return handleServerError(error);
  }
}
