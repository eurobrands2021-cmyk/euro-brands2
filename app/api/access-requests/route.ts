import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toAccessRequestDTO } from "@/lib/serializers";
import { parseAccessRequestInput, ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockListAccessRequests,
  mockCreateAccessRequest,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/access-requests?status=PENDING&limit= — قائمة طلبات دخول الكاشير
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListAccessRequests(searchParams));

    const status = searchParams.get("status")?.trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.AccessRequestWhereInput = {};
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    // ترقيم اختياري (skip/take) — يعيد { items, total, page, perPage } بوجود
    // page، وإلا يُبقي السلوك القديم (مصفوفة).
    const pageRaw = Number(searchParams.get("page"));
    const perPageRaw = Number(searchParams.get("perPage"));
    if (Number.isInteger(pageRaw) && pageRaw >= 1) {
      const perPage = Math.min(
        Number.isInteger(perPageRaw) && perPageRaw > 0 ? perPageRaw : 20,
        200
      );
      const [total, rows] = await Promise.all([
        prisma.accessRequest.count({ where }),
        prisma.accessRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (pageRaw - 1) * perPage,
          take: perPage,
        }),
      ]);
      return ok({
        items: rows.map(toAccessRequestDTO),
        total,
        page: pageRaw,
        perPage,
      });
    }

    const rows = await prisma.accessRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok(rows.map(toAccessRequestDTO));
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/access-requests — إنشاء طلب دخول جديد (من الكاشير)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseAccessRequestInput(body);
    if (MOCK_MODE) return ok(mockCreateAccessRequest(input), 201);

    const row = await prisma.accessRequest.create({
      data: { name: input.name, status: "PENDING" },
    });
    return ok(toAccessRequestDTO(row), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
