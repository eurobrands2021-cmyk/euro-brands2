import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { parseSupplierInput, ValidationError } from "@/lib/validate";
import { toSupplierDTO } from "@/lib/serializers";
import { MOCK_MODE, mockListSuppliers, mockCreateSupplier } from "@/lib/mock-store";
import type { SupplierDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/suppliers — قائمة الموردين (مع عدد عمليات الاستلام لكل مورد)
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockListSuppliers(), 200, CACHE_NONE);

    const rows = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { receipts: true } } },
    });
    const suppliers: SupplierDTO[] = rows.map(toSupplierDTO);
    return ok({ suppliers, total: suppliers.length }, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/suppliers — إضافة مورد
export async function POST(req: Request) {
  try {
    const input = parseSupplierInput(await req.json());
    if (MOCK_MODE) return ok(mockCreateSupplier(input), 201);

    const created = await prisma.supplier.create({ data: input });
    return ok(toSupplierDTO(created), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
