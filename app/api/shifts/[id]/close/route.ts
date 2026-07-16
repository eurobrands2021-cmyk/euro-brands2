import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { parseShiftFinalizeInput, ValidationError } from "@/lib/validate";
import { round2 } from "@/lib/sale-utils";
import { toShiftCloseDTO } from "@/lib/serializers";
import { computeShiftReportFromDb } from "@/lib/shift-server";
import { MOCK_MODE, mockCloseShift } from "@/lib/mock-store";
import type { ShiftDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST /api/shifts/[id]/close — إقفال الشيفت: يحسب المتوقع، يسجّل المعدود والفرق
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const input = parseShiftFinalizeInput(await req.json());

    if (MOCK_MODE) {
      const res = mockCloseShift(params.id, input);
      return res.ok ? ok(res.data) : fail(res.error ?? "خطأ", res.status);
    }

    const shift = await prisma.shiftClose.findUnique({
      where: { id: params.id },
    });
    if (!shift) return fail("الشيفت غير موجود", 404);
    if (shift.closedAt) return fail("هذا الشيفت مُقفل بالفعل", 409);

    // ملخّص X/Z محسوب من فواتير/مرتجعات نافذة الشيفت (حتى الآن)
    const closingTime = new Date();
    const report = await computeShiftReportFromDb({
      branch: shift.branch,
      openingCash: shift.openingCash,
      openedAt: shift.openedAt,
      closedAt: closingTime,
    });

    const difference = round2(input.countedCash - report.expectedCash);

    const updated = await prisma.shiftClose.update({
      where: { id: shift.id },
      data: {
        expectedCash: report.expectedCash,
        countedCash: input.countedCash,
        difference,
        notes: input.notes,
        closedAt: closingTime,
      },
    });

    const diffLabel =
      difference > 0.001
        ? `زيادة ${difference} ج.م`
        : difference < -0.001
          ? `عجز ${Math.abs(difference)} ج.م`
          : "مطابق";
    await prisma.activityLog.create({
      data: {
        userName: shift.cashierName || "النظام",
        userRole: "CASHIER",
        action: "إقفال الشيفت",
        details: `متوقع ${report.expectedCash} — معدود ${input.countedCash} — ${diffLabel}`,
      },
    });

    const payload: ShiftDetailResponse = {
      shift: toShiftCloseDTO(updated),
      report,
    };
    return ok(payload);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
