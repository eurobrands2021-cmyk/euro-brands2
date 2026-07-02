import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toAccessRequestDTO } from "@/lib/serializers";
import { parseAccessRequestStatus, ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockGetAccessRequest,
  mockUpdateAccessRequestStatus,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/access-requests/[id] — قراءة حالة طلب واحد (يستطلعها الكاشير)
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const dto = mockGetAccessRequest(params.id);
      if (!dto) return fail("الطلب غير موجود", 404);
      return ok(dto);
    }
    const row = await prisma.accessRequest.findUnique({
      where: { id: params.id },
    });
    if (!row) return fail("الطلب غير موجود", 404);
    return ok(toAccessRequestDTO(row));
  } catch (error) {
    return handleServerError(error);
  }
}

// PUT /api/access-requests/[id] — موافقة/رفض المدير على الطلب
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const status = parseAccessRequestStatus(body);

    if (MOCK_MODE) {
      const dto = mockUpdateAccessRequestStatus(params.id, status);
      if (!dto) return fail("الطلب غير موجود", 404);
      return ok(dto);
    }

    const existing = await prisma.accessRequest.findUnique({
      where: { id: params.id },
    });
    if (!existing) return fail("الطلب غير موجود", 404);

    const row = await prisma.accessRequest.update({
      where: { id: params.id },
      data: { status, resolvedAt: new Date() },
    });
    return ok(toAccessRequestDTO(row));
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
