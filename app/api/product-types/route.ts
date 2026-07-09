import { type Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_STATIC } from "@/lib/api";
import { toProductTypeDTO } from "@/lib/serializers";
import { parseProductTypeInput, ValidationError } from "@/lib/validate";
import { CATEGORIES, type CategoryValue } from "@/lib/constants";
import {
  MOCK_MODE,
  mockListProductTypes,
  mockCreateProductType,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/product-types?category= — قائمة أنواع المنتجات (اختيارياً مفلترة بالفئة)
// قيمة category غير صالحة/فارغة/قديمة تُتجاهَل بدلاً من التسبب في خطأ 500
// (تُرجع كل الأنواع بدلاً من ذلك).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCategory = searchParams.get("category");
    const category = CATEGORIES.includes(rawCategory as CategoryValue)
      ? (rawCategory as CategoryValue)
      : null;
    if (MOCK_MODE) return ok(mockListProductTypes(category));

    const types = await prisma.productType.findMany({
      where: category ? { category: category as Category } : undefined,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return ok(types.map(toProductTypeDTO), 200, CACHE_STATIC);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/product-types — إضافة نوع جديد (idempotent — يرجع النوع الموجود لو سبق إنشاؤه)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseProductTypeInput(body);
    if (MOCK_MODE) return ok(mockCreateProductType(input), 201);

    const type = await prisma.productType.upsert({
      where: {
        name_category: {
          name: input.name,
          category: input.category as Category,
        },
      },
      update: { code: input.code },
      create: {
        name: input.name,
        code: input.code,
        category: input.category as Category,
      },
    });
    return ok(toProductTypeDTO(type), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
