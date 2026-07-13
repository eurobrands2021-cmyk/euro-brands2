import { type Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { toBrandDTO } from "@/lib/serializers";
import { parseBrandInput, ValidationError } from "@/lib/validate";
import { MOCK_MODE, mockListBrands, mockCreateBrand } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

// GET /api/brands?category= — قائمة البراندات (مفلترة بالفئة اختيارياً)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    if (MOCK_MODE) return ok(mockListBrands(category));

    const brands = await prisma.brand.findMany({
      where: category ? { category: category as Category } : undefined,
      orderBy: { name: "asc" },
    });
    // بدون تخزين مؤقت على الحافة (CDN) حتى يظهر البراند الجديد فور إضافته
    return ok(brands.map(toBrandDTO), 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/brands — إضافة براند جديد لفئة (idempotent)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseBrandInput(body);
    if (MOCK_MODE) return ok(mockCreateBrand(input), 201);

    const brand = await prisma.brand.upsert({
      where: {
        name_category: {
          name: input.name,
          category: input.category as Category,
        },
      },
      update: {},
      create: { name: input.name, category: input.category as Category },
    });
    return ok(toBrandDTO(brand), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
