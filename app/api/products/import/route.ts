import { type Branch, type Category } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { parseImportRows, ValidationError } from "@/lib/validate";
import { MOCK_MODE, mockImportInventory } from "@/lib/mock-store";
import type { ImportResult } from "@/lib/types";
import { buildVariantSku, uniquifySku } from "@/lib/sku";

export const dynamic = "force-dynamic";

// POST /api/products/import — تحديث المخزون بالجملة من ملف Excel
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = parseImportRows(body);

    if (MOCK_MODE) return ok(mockImportInventory(rows));

    const result: ImportResult = {
      totalRows: rows.length,
      newProducts: 0,
      newVariants: 0,
      updatedVariants: 0,
    };

    await prisma.$transaction(
      async (tx) => {
        // SKUs المستخدَمة قبل الاستيراد (لمنع التكرار العالمي عبر صفوف Excel)
        const allSkus = await tx.productVariant.findMany({
          where: { sku: { not: null } },
          select: { sku: true },
        });
        const takenSku = new Set(
          allSkus.map((s) => s.sku!).filter((s): s is string => !!s)
        );

        for (const row of rows) {
          // تخطي الصفوف المعلَّمة بـ «تخطي» من واجهة المعاينة
          if (row.action === "skip") continue;

          // أنواع المنتجات: نُنشئها لو الاسم جاء في الصف ولم يكن موجوداً
          let productTypeId: string | null = null;
          let typeCode: string | null = null;
          if (row.productType) {
            const upserted = await tx.productType.upsert({
              where: {
                name_category: {
                  name: row.productType,
                  category: row.category as Category,
                },
              },
              update: {},
              create: {
                name: row.productType,
                code:
                  row.productType
                    .replace(/[^A-Za-z0-9]/g, "")
                    .slice(0, 4)
                    .toUpperCase() || "GEN",
                category: row.category as Category,
              },
              select: { id: true, code: true },
            });
            productTypeId = upserted.id;
            typeCode = upserted.code;
          }

          const found = await tx.product.findFirst({
            where: {
              name: { equals: row.name, mode: "insensitive" },
              brand: { equals: row.brand, mode: "insensitive" },
            },
            select: {
              id: true,
              productTypeId: true,
              productType: { select: { code: true } },
            },
          });

          let productId: string;
          let existingTypeCode: string | null = null;

          if (!found) {
            const created = await tx.product.create({
              data: {
                name: row.name,
                brand: row.brand,
                category: row.category as Category,
                images: [],
                productTypeId,
              },
              select: {
                id: true,
                productType: { select: { code: true } },
              },
            });
            productId = created.id;
            existingTypeCode = created.productType?.code ?? null;
            result.newProducts++;
          } else {
            productId = found.id;
            existingTypeCode = found.productType?.code ?? null;
            // ربط النوع لو ناقص على المنتج الموجود
            if (productTypeId && !found.productTypeId) {
              await tx.product.update({
                where: { id: found.id },
                data: { productTypeId },
              });
            }
          }

          // كود النوع: من الصف الحالي، وإلا من المنتج الموجود
          const effectiveTypeCode = typeCode ?? existingTypeCode;

          // البحث عن صنف بنفس (المقاس/الفرع/اللون). نستخدم findFirst لأن قيمة
          // NULL في اللون لا تتصرف كمفتاح بحث داخل فهرس Postgres الفريد.
          const existing = await tx.productVariant.findFirst({
            where: {
              productId,
              size: row.size,
              branch: row.branch as Branch,
              color: row.color,
            },
            select: { id: true, sku: true, skuManual: true, quantity: true },
          });

          if (existing) {
            // «تجميع» يضيف الكمية الواردة للكمية الحالية، و«استبدال» يستبدلها
            const nextQuantity =
              row.action === "merge"
                ? existing.quantity + row.quantity
                : row.quantity;
            const update: {
              quantity: number;
              price: number;
              sku?: string;
              skuManual?: boolean;
            } = { quantity: nextQuantity, price: row.price };
            if (row.sku) {
              if (existing.sku) takenSku.delete(existing.sku);
              update.sku = uniquifySku(row.sku, takenSku);
              update.skuManual = true;
            }
            await tx.productVariant.update({
              where: { id: existing.id },
              data: update,
            });
            result.updatedVariants++;
          } else {
            const sku = row.sku
              ? uniquifySku(row.sku, takenSku)
              : uniquifySku(
                  buildVariantSku({
                    productId,
                    typeCode: effectiveTypeCode,
                    size: row.size,
                    branch: row.branch,
                    color: row.color,
                  }),
                  takenSku
                );
            await tx.productVariant.create({
              data: {
                productId,
                size: row.size,
                color: row.color,
                branch: row.branch as Branch,
                quantity: row.quantity,
                price: row.price,
                sku,
                skuManual: !!row.sku,
              },
            });
            result.newVariants++;
          }
        }
      },
      { timeout: 30000 }
    );

    return ok(result);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
