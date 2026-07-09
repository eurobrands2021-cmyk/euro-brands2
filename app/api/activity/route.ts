import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { toActivityDTO } from "@/lib/serializers";
import { parseActivityInput, ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockListActivity,
  mockCreateActivity,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/activity?user=&from=&to=&limit= — سجل النشاط (مفلتر بالمستخدم/التاريخ)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListActivity(searchParams));

    const user = searchParams.get("user")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(Number(searchParams.get("limit")) || 200, 1000);

    const where: Prisma.ActivityLogWhereInput = {};
    if (user) where.userName = user;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok(logs.map(toActivityDTO), 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/activity — تسجيل نشاط جديد
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseActivityInput(body);
    if (MOCK_MODE) return ok(mockCreateActivity(input), 201);

    const log = await prisma.activityLog.create({
      data: {
        userName: input.userName,
        userRole: input.userRole,
        action: input.action,
        details: input.details ?? null,
      },
    });
    return ok(toActivityDTO(log), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
