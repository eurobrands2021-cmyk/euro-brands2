import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toCustomerDTO } from "@/lib/serializers";
import { parseCustomerInput, ValidationError } from "@/lib/validate";
import {
  MOCK_MODE,
  mockListCustomers,
  mockCreateCustomer,
} from "@/lib/mock-store";
import { matchesWithBrandAliases } from "@/lib/brand-map";
import type { CustomerListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/customers — قائمة العملاء مع البحث والترتيب والتصفح
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListCustomers(searchParams));

    // بحث مطابق تماماً برقم الهاتف (يُستخدم لملء اسم العميل تلقائياً في POS)
    const phone = searchParams.get("phone")?.trim();
    if (phone) {
      const c = await prisma.customer.findUnique({ where: { phone } });
      const response: CustomerListResponse = {
        customers: c ? [toCustomerDTO(c)] : [],
        total: c ? 1 : 0,
        page: 1,
        pageSize: 1,
      };
      return ok(response);
    }

    const search = searchParams.get("search")?.trim();
    const sort = searchParams.get("sort"); // totalSpent | lastVisitAt
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      Math.max(Number(searchParams.get("pageSize")) || 20, 1),
      100
    );

    const orderBy: Prisma.CustomerOrderByWithRelationInput =
      sort === "totalSpent"
        ? { totalSpent: "desc" }
        : sort === "lastVisitAt"
          ? { lastVisitAt: "desc" }
          : { createdAt: "desc" };

    let customers;
    let total: number;

    if (search) {
      // بحث موحّد عربي↔إنجليزي: نطبّع النص ونطابق الاسم/الهاتف بعد الجلب
      // (توحيد الهمزة/«ال» + مرادفات البراند) ثم نصفّح النتيجة في الذاكرة.
      const all = await prisma.customer.findMany({ orderBy });
      const matched = all.filter((c) =>
        matchesWithBrandAliases([c.name, c.phone], search)
      );
      total = matched.length;
      customers = matched.slice((page - 1) * pageSize, page * pageSize);
    } else {
      [customers, total] = await Promise.all([
        prisma.customer.findMany({
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.customer.count(),
      ]);
    }

    const response: CustomerListResponse = {
      customers: customers.map(toCustomerDTO),
      total,
      page,
      pageSize,
    };
    return ok(response);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/customers — إنشاء عميل جديد
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseCustomerInput(body);

    if (MOCK_MODE) return ok(mockCreateCustomer(input), 201);

    // فحص التكرار على الهاتف فقط عند وجوده (العملاء بلا هاتف مسموح بتكرارهم)
    if (input.phone) {
      const existing = await prisma.customer.findUnique({
        where: { phone: input.phone },
      });
      if (existing)
        throw new ValidationError("يوجد عميل مسجّل بهذا الرقم بالفعل");
    }

    const created = await prisma.customer.create({
      data: {
        name: input.name,
        phone: input.phone,
        branch: input.branch ?? null,
        notes: input.notes ?? null,
      },
    });
    return ok(toCustomerDTO(created), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
