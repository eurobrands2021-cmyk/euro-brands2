import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toCustomerDTO, toSaleDTO } from "@/lib/serializers";
import { parseCustomerUpdateInput, ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockGetCustomer,
  mockUpdateCustomer,
} from "@/lib/mock-store";
import type { CustomerDetailDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const saleInclude = {
  items: {
    include: {
      product: { select: { name: true, brand: true } },
      variant: { select: { size: true, color: true, sku: true } },
    },
  },
} satisfies Prisma.SaleInclude;

// GET /api/customers/[id] — عميل واحد مع كامل تاريخ مشترياته
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const dto = mockGetCustomer(params.id, new URL(req.url).searchParams);
      return dto ? ok(dto) : fail("العميل غير موجود", 404);
    }

    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
    });
    if (!customer) return fail("العميل غير موجود", 404);

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const pageRaw = Number(searchParams.get("page"));
    const perPageRaw = Number(searchParams.get("perPage"));
    const paginated = Number.isInteger(pageRaw) && pageRaw >= 1;
    const page = paginated ? pageRaw : 1;
    const perPage = Math.min(
      Number.isInteger(perPageRaw) && perPageRaw > 0 ? perPageRaw : 20,
      200
    );

    // نطاق التاريخ الاختياري على الفواتير (لفلتر تاريخ المشتريات)
    const saleWhere: Prisma.SaleWhereInput = { customerPhone: customer.phone };
    if (from || to) {
      saleWhere.createdAt = {};
      if (from) saleWhere.createdAt.gte = new Date(from);
      if (to) saleWhere.createdAt.lte = new Date(to);
    }

    // ترقيم فعلي على مستوى قاعدة البيانات (skip/take) بدل جلب كامل تاريخ العميل.
    const [salesTotal, sales] = await Promise.all([
      prisma.sale.count({ where: saleWhere }),
      prisma.sale.findMany({
        where: saleWhere,
        include: saleInclude,
        orderBy: { createdAt: "desc" },
        ...(paginated
          ? { skip: (page - 1) * perPage, take: perPage }
          : {}),
      }),
    ]);

    const response: CustomerDetailDTO = {
      ...toCustomerDTO(customer),
      sales: sales.map(toSaleDTO),
      salesTotal,
    };
    return ok(response);
  } catch (error) {
    return handleServerError(error);
  }
}

// PUT /api/customers/[id] — تعديل الاسم/الملاحظات/الفرع
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const input = parseCustomerUpdateInput(body);

    if (MOCK_MODE) {
      const dto = mockUpdateCustomer(params.id, input);
      return dto ? ok(dto) : fail("العميل غير موجود", 404);
    }

    const updated = await prisma.customer.update({
      where: { id: params.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.branch !== undefined ? { branch: input.branch } : {}),
      },
    });
    return ok(toCustomerDTO(updated));
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return fail("العميل غير موجود", 404);
    }
    return handleServerError(error);
  }
}
