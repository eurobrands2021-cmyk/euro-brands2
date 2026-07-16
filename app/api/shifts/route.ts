import { Prisma, type Branch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { parseShiftCloseInput, ValidationError } from "@/lib/validate";
import { round2 } from "@/lib/sale-utils";
import { toShiftCloseDTO } from "@/lib/serializers";
import { MOCK_MODE, mockListShifts, mockStartShift } from "@/lib/mock-store";
import type { ShiftCloseDTO, ShiftListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/shifts — قائمة إقفالات الصندوق + الشيفت المفتوح حالياً (بفلاتر)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListShifts(searchParams), 200, CACHE_NONE);

    const branch = searchParams.get("branch");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status"); // open | closed | all

    const where: Prisma.ShiftCloseWhereInput = {};
    if (branch) where.branch = branch as Branch;
    if (status === "open") where.closedAt = null;
    else if (status === "closed") where.closedAt = { not: null };
    if (from || to) {
      where.openedAt = {};
      if (from) where.openedAt.gte = new Date(from);
      if (to) where.openedAt.lte = new Date(to);
    }

    const rows = await prisma.shiftClose.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: 1000,
    });

    const shifts: ShiftCloseDTO[] = rows.map(toShiftCloseDTO);

    // الشيفت المفتوح حالياً — يُعاد فقط عند تحديد فرع واحد
    let openShift: ShiftCloseDTO | null = null;
    if (branch) {
      const open = await prisma.shiftClose.findFirst({
        where: { branch: branch as Branch, closedAt: null },
        orderBy: { openedAt: "desc" },
      });
      openShift = open ? toShiftCloseDTO(open) : null;
    }

    const closed = shifts.filter((s) => s.closedAt);
    const summary = closed.reduce(
      (acc, s) => {
        acc.count += 1;
        acc.totalDifference = round2(acc.totalDifference + s.difference);
        if (s.difference > 0.001) acc.overCount += 1;
        else if (s.difference < -0.001) acc.shortCount += 1;
        return acc;
      },
      { count: 0, totalDifference: 0, overCount: 0, shortCount: 0 }
    );

    const payload: ShiftListResponse = {
      shifts,
      openShift,
      total: shifts.length,
      summary,
    };
    return ok(payload, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/shifts — بدء الشيفت (تسجيل عهدة البداية)
export async function POST(req: Request) {
  try {
    const input = parseShiftCloseInput(await req.json());

    if (MOCK_MODE) {
      const res = mockStartShift(input);
      return res.ok ? ok(res.data, 201) : fail(res.error ?? "خطأ", res.status);
    }

    // منع فتح شيفت جديد قبل إقفال المفتوح لنفس الفرع
    const existing = await prisma.shiftClose.findFirst({
      where: { branch: input.branch as Branch, closedAt: null },
    });
    if (existing)
      return fail("يوجد شيفت مفتوح بالفعل لهذا الفرع — أقفله أولاً", 409);

    const created = await prisma.shiftClose.create({
      data: {
        branch: input.branch as Branch,
        cashierName: input.cashierName,
        openingCash: input.openingCash,
        expectedCash: input.openingCash, // يُعاد حسابه عند الإقفال
        difference: 0,
      },
    });

    await prisma.activityLog.create({
      data: {
        userName: input.cashierName || "النظام",
        userRole: "CASHIER",
        action: "بدء الشيفت",
        details: `عهدة البداية ${input.openingCash} ج.م`,
      },
    });

    return ok(toShiftCloseDTO(created), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
