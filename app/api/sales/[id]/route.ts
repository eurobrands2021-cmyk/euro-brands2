import {
  Prisma,
  type Branch,
  type DeliveryMethod,
  type DiscountType,
  type OrderSource,
  type PaymentMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { toSaleDTO } from "@/lib/serializers";
import { parseSaleInput, ValidationError } from "@/lib/validate";
import { calcDiscount, calcItemNet, round2 } from "@/lib/sale-utils";
import type { DiscountTypeValue } from "@/lib/constants";
import { formatSaleNumber } from "@/lib/format";
import { isInvoiceLocked } from "@/lib/invoice-lock";
import { readServerSettings } from "@/lib/server-settings";
import {
  MOCK_MODE,
  mockGetSale,
  mockUpdateSale,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

const saleInclude = {
  items: {
    include: {
      product: { select: { name: true, brand: true } },
      variant: { select: { size: true, color: true, sku: true } },
    },
  },
} satisfies Prisma.SaleInclude;

// وصف الإجراء المسجَّل عند تعديل الفاتورة (يُستخدم أيضاً لجلب «آخر تعديل»)
const EDIT_ACTION = "تعديل فاتورة";

// GET /api/sales/[id] — تفاصيل فاتورة كاملة (مع طابع آخر تعديل من سجل النشاط)
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (MOCK_MODE) {
      const dto = mockGetSale(params.id);
      return dto ? ok(dto) : fail("الفاتورة غير موجودة", 404);
    }
    const sale = await prisma.sale.findUnique({
      where: { id: params.id },
      include: saleInclude,
    });
    if (!sale) return fail("الفاتورة غير موجودة", 404);

    const dto = toSaleDTO(sale);
    // «آخر تعديل»: من عمود updatedAt مباشرةً (يُضبط تلقائياً عند أي تعديل) بدل
    // مسح سجل النشاط بمطابقة نصية هشّة. نعرضه فقط إذا اختلف عن وقت الإنشاء
    // (أي عُدِّلت الفاتورة فعلاً بعد إنشائها).
    dto.lastEditedAt =
      sale.updatedAt.getTime() > sale.createdAt.getTime()
        ? sale.updatedAt.toISOString()
        : null;

    return ok(dto);
  } catch (error) {
    return handleServerError(error);
  }
}

// PUT /api/sales/[id] — تعديل كامل للفاتورة مع تصحيح المخزون في معاملة واحدة
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const input = parseSaleInput(body);

    // اسم/دور المُعدِّل لتسجيله في سجل النشاط (اختياري)
    const editorName =
      typeof body?.editorName === "string" && body.editorName.trim()
        ? body.editorName.trim()
        : "النظام";
    const editorRole = body?.editorRole === "CASHIER" ? "CASHIER" : "ADMIN";

    if (MOCK_MODE) {
      const res = mockUpdateSale(params.id, input);
      return res.ok ? ok(res.sale) : fail(res.error, res.status);
    }

    // مدة قفل الفواتير (يقرؤها الخادم لمنع تعديل الفواتير القديمة)
    const { lockDays } = await readServerSettings();

    // دمج الكميات المكررة لنفس الصنف (مع ملاحظة/خصم الصنف)
    interface MergedSaleItem {
      quantity: number;
      note: string | null;
      itemDiscount: number;
      itemDiscountType: DiscountTypeValue;
    }
    const merged = new Map<string, MergedSaleItem>();
    for (const it of input.items) {
      const prev = merged.get(it.variantId);
      merged.set(it.variantId, {
        quantity: (prev?.quantity ?? 0) + it.quantity,
        note: it.note ?? prev?.note ?? null,
        itemDiscount: it.itemDiscount ?? prev?.itemDiscount ?? 0,
        itemDiscountType: it.itemDiscountType ?? prev?.itemDiscountType ?? "FIXED",
      });
    }
    const variantIds = [...merged.keys()];

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: params.id },
        include: { items: true },
      });
      if (!sale)
        return { ok: false as const, error: "الفاتورة غير موجودة", status: 404 };
      if (sale.status === "CANCELLED")
        return {
          ok: false as const,
          error: "لا يمكن تعديل فاتورة ملغية",
          status: 409,
        };
      // فاتورة مقفلة (تجاوزت مدة القفل ولم تُفتح يدوياً) — تُرفض
      if (isInvoiceLocked(sale.createdAt, lockDays, sale.unlockedAt))
        return {
          ok: false as const,
          error: `الفاتورة مقفلة (أقدم من ${lockDays} يوم) — افتح القفل أولاً لتعديلها`,
          status: 423,
        };

      // 1) إرجاع كميات العناصر القديمة للمخزون
      for (const oldItem of sale.items) {
        await tx.productVariant.update({
          where: { id: oldItem.variantId },
          data: { quantity: { increment: oldItem.quantity } },
        });
      }

      // 2) قراءة الأصناف الجديدة بعد الإرجاع (الكمية المتاحة محدَّثة)
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { select: { name: true } } },
      });
      const vmap = new Map(variants.map((v) => [v.id, v]));

      let totalAmount = 0;
      const itemsData: {
        productId: string;
        variantId: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        note: string | null;
        itemDiscount: number;
        itemDiscountType: DiscountTypeValue;
      }[] = [];
      for (const [variantId, m] of merged.entries()) {
        const v = vmap.get(variantId);
        // نرمي ValidationError كي تُلغى المعاملة بالكامل (بما فيها إرجاع
        // الكميات في الخطوة 1) فلا يتضخّم المخزون عند فشل التحقق.
        if (!v)
          throw new ValidationError("أحد المنتجات لم يعد متاحاً في المخزون");
        if (v.branch !== (input.branch as Branch))
          throw new ValidationError(
            `المنتج "${v.product.name}" لا ينتمي للفرع المحدد`
          );
        if (v.quantity < m.quantity)
          throw new ValidationError(
            `الكمية غير كافية من "${v.product.name}" مقاس ${v.size} (المتاح: ${v.quantity})`
          );

        // الصافي بعد خصم الصنف (يُحسب من السعر الموثوق في الخادم)
        const { net } = calcItemNet(
          v.price,
          m.quantity,
          m.itemDiscount,
          m.itemDiscountType
        );
        totalAmount += net;
        itemsData.push({
          productId: v.productId,
          variantId: v.id,
          quantity: m.quantity,
          unitPrice: v.price,
          subtotal: net,
          note: m.note,
          itemDiscount: m.itemDiscount,
          itemDiscountType: m.itemDiscountType,
        });
      }

      totalAmount = round2(totalAmount);
      const { finalAmount } = calcDiscount(
        totalAmount,
        input.discountType,
        input.discountValue
      );

      const paidAmount =
        input.paidAmount == null
          ? finalAmount
          : Math.min(Math.max(input.paidAmount, 0), finalAmount);
      const remainingAmount = round2(finalAmount - paidAmount);

      // 3) خصم الكميات الجديدة من المخزون — تحديث شرطي ذري يمنع الرصيد السالب
      // عند التزامن. فشل الشرط يرمي خطأً يُلغي المعاملة كاملة (بما فيها إرجاع
      // كميات الخطوة 1) فلا يتضخّم أو يتناقص المخزون بشكل خاطئ.
      for (const [variantId, m] of merged.entries()) {
        const dec = await tx.productVariant.updateMany({
          where: { id: variantId, quantity: { gte: m.quantity } },
          data: { quantity: { decrement: m.quantity } },
        });
        if (dec.count === 0) {
          const v = vmap.get(variantId);
          throw new ValidationError(
            `الكمية غير كافية من "${v?.product.name ?? "المنتج"}" مقاس ${v?.size ?? ""}`
          );
        }
      }

      // 4) حالة التوصيل: نُبقيها إن كانت الفاتورة توصيلاً بالفعل، وإلا NEW
      const deliveryStatus = input.delivery
        ? sale.deliveryStatus ?? "NEW"
        : null;

      // 5) استبدال العناصر وتحديث بيانات الفاتورة
      await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          branch: input.branch as Branch,
          totalAmount,
          discountType: (input.discountType as DiscountType | null) ?? null,
          discountValue: input.discountValue,
          finalAmount,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerNotes: input.customerNotes,
          paymentMethod: input.paymentMethod as PaymentMethod,
          transferMethod: input.transferMethod ?? null,
          invoiceNotes: input.invoiceNotes ?? null,
          paidAmount: round2(paidAmount),
          remainingAmount,
          isDelivery: !!input.delivery,
          orderSource:
            (input.delivery?.orderSource as OrderSource | undefined) ?? null,
          deliveryMethod:
            (input.delivery?.deliveryMethod as DeliveryMethod | undefined) ??
            null,
          deliveryAddress: input.delivery?.deliveryAddress ?? null,
          addressNotes: input.delivery?.addressNotes ?? null,
          trackingNumber: input.delivery?.trackingNumber ?? null,
          deliveryStatus,
          items: { create: itemsData },
        },
        include: saleInclude,
      });

      // 6) تسجيل التعديل في سجل النشاط (يُعتمَد عليه لعرض «آخر تعديل»)
      await tx.activityLog.create({
        data: {
          userName: editorName,
          userRole: editorRole,
          action: EDIT_ACTION,
          details: `فاتورة رقم ${formatSaleNumber(updated.saleNumber)}`,
        },
      });

      return { ok: true as const, sale: updated };
    });

    if (!result.ok) return fail(result.error, result.status);
    const dto = toSaleDTO(result.sale);
    // updatedAt ضُبط تلقائياً في هذه المعاملة — نستخدمه كطابع «آخر تعديل»
    dto.lastEditedAt = result.sale.updatedAt.toISOString();
    return ok(dto);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
