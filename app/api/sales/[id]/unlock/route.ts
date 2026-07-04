import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toSaleDTO } from "@/lib/serializers";
import { formatSaleNumber } from "@/lib/format";
import { MOCK_MODE, mockUnlockSale } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

const saleInclude = {
  items: {
    include: {
      product: { select: { name: true, brand: true } },
      variant: { select: { size: true, color: true, sku: true } },
    },
  },
} as const;

// POST /api/sales/[id]/unlock — فتح فاتورة مقفلة يدوياً بسبب (يُسجَّل في التدقيق)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" ? body.reason.trim() : "";
    const by =
      typeof body?.by === "string" && body.by.trim() ? body.by.trim() : "المدير";

    if (!reason) return fail("سبب فتح القفل مطلوب", 422);

    if (MOCK_MODE) {
      const res = mockUnlockSale(params.id, reason, by);
      return res.ok ? ok(res.sale) : fail(res.error!, res.status);
    }

    const sale = await prisma.sale.findUnique({ where: { id: params.id } });
    if (!sale) return fail("الفاتورة غير موجودة", 404);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.sale.update({
        where: { id: params.id },
        data: {
          unlockedAt: new Date(),
          unlockedBy: by,
          unlockReason: reason,
        },
        include: saleInclude,
      });
      // سجل تدقيق لعملية فتح القفل
      await tx.activityLog.create({
        data: {
          userName: by,
          userRole: "ADMIN",
          action: "فتح قفل فاتورة",
          details: `فاتورة رقم ${formatSaleNumber(u.saleNumber)} — السبب: ${reason}`,
        },
      });
      return u;
    });

    return ok(toSaleDTO(updated));
  } catch (error) {
    return handleServerError(error);
  }
}
