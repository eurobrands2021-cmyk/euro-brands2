import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { toShiftCloseDTO } from "@/lib/serializers";
import { computeShiftReportFromDb } from "@/lib/shift-server";
import { MOCK_MODE, mockGetShift } from "@/lib/mock-store";
import type { ShiftDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/shifts/[id] — تفاصيل الشيفت + ملخّص X/Z (للعرض/الطباعة)
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const res = mockGetShift(params.id);
      if (!res) return fail("الشيفت غير موجود", 404);
      return ok(res, 200, CACHE_NONE);
    }

    const shift = await prisma.shiftClose.findUnique({
      where: { id: params.id },
    });
    if (!shift) return fail("الشيفت غير موجود", 404);

    const report = await computeShiftReportFromDb(shift);
    const payload: ShiftDetailResponse = {
      shift: toShiftCloseDTO(shift),
      report,
    };
    return ok(payload, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}
