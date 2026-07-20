import {
  Prisma,
  type Branch,
  type DeliveryMethod,
  type DiscountType,
  type OrderSource,
  type PaymentMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { toSaleDTO } from "@/lib/serializers";
import { parseSaleInput, ValidationError } from "@/lib/validate";
import { calcDiscount, round2 } from "@/lib/sale-utils";
import { splitSaleLine, type DiscountRecordLite } from "@/lib/damage-discount";
import type { DiscountTypeValue } from "@/lib/constants";
import { MOCK_MODE, mockListSales, mockCreateSale } from "@/lib/mock-store";

// عنصر مدموج: كمية مجمّعة + ملاحظة وخصم الصنف (من الفاتورة)
interface MergedSaleItem {
  quantity: number;
  note: string | null;
  itemDiscount: number;
  itemDiscountType: DiscountTypeValue;
}

// دمج الأصناف المكررة: تجميع الكمية مع إبقاء آخر ملاحظة/خصم للصنف
function mergeItems(
  items: { variantId: string; quantity: number; note?: string | null; itemDiscount?: number; itemDiscountType?: DiscountTypeValue }[]
): Map<string, MergedSaleItem> {
  const merged = new Map<string, MergedSaleItem>();
  for (const it of items) {
    const prev = merged.get(it.variantId);
    merged.set(it.variantId, {
      quantity: (prev?.quantity ?? 0) + it.quantity,
      note: it.note ?? prev?.note ?? null,
      itemDiscount: it.itemDiscount ?? prev?.itemDiscount ?? 0,
      itemDiscountType: it.itemDiscountType ?? prev?.itemDiscountType ?? "FIXED",
    });
  }
  return merged;
}

export const dynamic = "force-dynamic";

const saleInclude = {
  items: {
    include: {
      product: { select: { name: true, brand: true } },
      variant: { select: { size: true, color: true, sku: true } },
    },
  },
} satisfies Prisma.SaleInclude;

// GET /api/sales — سجل الفواتير مع الفلاتر
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListSales(searchParams));
    const branch = searchParams.get("branch");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const search = searchParams.get("search")?.trim();
    const payment = searchParams.get("payment");
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit")) || 500, 100000);

    // ترقيم اختياري: يُفعَّل بوجود page ويُرجع { sales, total, page, pageSize,
    // summary }. غيابه يُبقي السلوك القديم (مصفوفة) — يُستخدم في التصدير.
    const pageRaw = Number(searchParams.get("page"));
    const paginated = Number.isInteger(pageRaw) && pageRaw >= 1;
    const page = paginated ? pageRaw : 1;
    const pageSize = Math.min(
      Math.max(Number(searchParams.get("pageSize")) || 50, 1),
      200
    );

    const where: Prisma.SaleWhereInput = {};
    if (branch) where.branch = branch as Branch;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    // فلتر طريقة الدفع (مع تمييز نوع التحويل)
    if (payment === "CASH" || payment === "VISA")
      where.paymentMethod = payment;
    else if (payment === "VODAFONE_CASH" || payment === "INSTAPAY") {
      where.paymentMethod = "TRANSFER";
      where.transferMethod = payment;
    }

    // فلتر الحالة
    if (status === "COMPLETED") where.status = "COMPLETED";
    else if (status === "CANCELLED") where.status = "CANCELLED";
    else if (status === "REMAINING") {
      where.status = "COMPLETED";
      where.remainingAmount = { gt: 0 };
    }

    if (search) {
      const or: Prisma.SaleWhereInput[] = [
        { customerName: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search } },
        {
          items: {
            some: { product: { name: { contains: search, mode: "insensitive" } } },
          },
        },
      ];
      const asNumber = Number(search.replace(/[#\s]/g, ""));
      if (Number.isInteger(asNumber)) or.push({ saleNumber: asNumber });
      where.OR = or;
    }

    // ملخّص الإجماليات محسوب على مستوى الخادم فوق كامل المجموعة المفلترة
    // (لا الصفحة الحالية) — تجميعان: غير الملغية + الملغية.
    async function computeSummary() {
      const activeWhere: Prisma.SaleWhereInput = {
        AND: [where, { status: { not: "CANCELLED" } }],
      };
      const cancelledWhere: Prisma.SaleWhereInput = {
        AND: [where, { status: "CANCELLED" }],
      };
      const [active, cancelled] = await Promise.all([
        prisma.sale.aggregate({
          where: activeWhere,
          _sum: { finalAmount: true, totalAmount: true, remainingAmount: true },
          _count: true,
        }),
        prisma.sale.aggregate({
          where: cancelledWhere,
          _sum: { finalAmount: true },
          _count: true,
        }),
      ]);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      return {
        totalSales: r2(active._sum.finalAmount ?? 0),
        count: active._count,
        discounts: r2(
          (active._sum.totalAmount ?? 0) - (active._sum.finalAmount ?? 0)
        ),
        remaining: r2(active._sum.remainingAmount ?? 0),
        cancelledCount: cancelled._count,
        cancelledValue: r2(cancelled._sum.finalAmount ?? 0),
      };
    }

    // المسار القديم (بدون page) — مصفوفة كاملة للتصدير
    if (!paginated) {
      const sales = await prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return ok(sales.map(toSaleDTO), 200, CACHE_NONE);
    }

    // المسار المرقّم — صفحة + إجمالي + ملخّص كامل
    const [sales, total, summary] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.sale.count({ where }),
      computeSummary(),
    ]);

    return ok(
      { sales: sales.map(toSaleDTO), total, page, pageSize, summary },
      200,
      CACHE_NONE
    );
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/sales — تأكيد بيعة جديدة وخصم المخزون
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseSaleInput(body);

    if (MOCK_MODE) return ok(mockCreateSale(input), 201);

    // منع التكرار (idempotency): لو حملت الفاتورة مفتاح تفرّد سبق تسجيله
    // (إعادة إرسال طابور عدم الاتصال أو تكرار الطلب بعد انقطاع الرد)، نُعيد
    // الفاتورة الأصلية بدل إنشاء نسخة ثانية. القراءة دفاعية إن كان العمود غائباً.
    if (input.clientRef) {
      try {
        const existing = await prisma.sale.findUnique({
          where: { clientRef: input.clientRef },
          include: saleInclude,
        });
        if (existing) return ok(toSaleDTO(existing), 200);
      } catch {
        /* عمود clientRef غير مفعّل بعد — نتابع الإنشاء العادي */
      }
    }

    // دمج الكميات المكررة لنفس المقاس (مع ملاحظة/خصم الصنف)
    const merged = mergeItems(input.items);
    const variantIds = [...merged.keys()];

    // لقطة سجلات «يُباع بخصم» النشطة لكل صنف (الأقدم أولاً) — تُقرأ قبل المعاملة
    // دفاعياً (قد لا تكون أعمدة الديفو مفعّلة بعد). تُستهلَك ذرياً داخل المعاملة.
    const discountRecords = new Map<string, DiscountRecordLite[]>();
    try {
      const drows = await prisma.damagedItem.findMany({
        where: { variantId: { in: variantIds }, condition: "SELL_AT_DISCOUNT" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          variantId: true,
          discountPrice: true,
          discountRemaining: true,
          quantity: true,
        },
      });
      for (const r of drows) {
        if (!r.variantId || r.discountPrice == null) continue;
        const remaining = r.discountRemaining ?? r.quantity;
        if (remaining <= 0) continue;
        const list = discountRecords.get(r.variantId) ?? [];
        list.push({ id: r.id, discountPrice: r.discountPrice, remaining });
        discountRecords.set(r.variantId, list);
      }
    } catch {
      /* دفاعي: أعمدة الديفو غير مفعّلة — تُباع كل الكميات بالسعر العادي */
    }

    // محاولة الإنشاء مع إعادة المحاولة عند تعارض رقم الفاتورة (نادر)
    let attempts = 0;
    while (true) {
      try {
        const sale = await prisma.$transaction(async (tx) => {
          const variants = await tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            include: { product: { select: { name: true } } },
          });
          const vmap = new Map(variants.map((v) => [v.id, v]));

          let totalAmount = 0;
          const itemsData = [];
          // استهلاك دفتر البيع بخصم (يُطبَّق ذرياً بعد نجاح فحوص الكمية)
          const consumption: { id: string; take: number }[] = [];
          for (const [variantId, m] of merged.entries()) {
            const v = vmap.get(variantId);
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

            // تقسيم الكمية: الوحدات المخفّضة (الديفو) أولاً بسعرها، والباقي
            // بالسعر الموثوق في الخادم. التسعير مرجعه الخادم لا الواجهة.
            const { splits, consumption: cons } = splitSaleLine({
              fullPrice: v.price,
              quantity: m.quantity,
              itemDiscount: m.itemDiscount,
              itemDiscountType: m.itemDiscountType,
              note: m.note,
              records: discountRecords.get(variantId) ?? [],
            });
            for (const s of splits) {
              totalAmount += s.subtotal;
              itemsData.push({
                productId: v.productId,
                variantId: v.id,
                quantity: s.quantity,
                unitPrice: s.unitPrice,
                subtotal: s.subtotal,
                note: s.note,
                itemDiscount: s.itemDiscount,
                itemDiscountType: s.itemDiscountType,
              });
            }
            consumption.push(...cons);
          }

          totalAmount = round2(totalAmount);
          const { finalAmount } = calcDiscount(
            totalAmount,
            input.discountType,
            input.discountValue
          );

          // الدفع الجزئي: المبلغ المدفوع والمتبقي
          const paidAmount =
            input.paidAmount == null
              ? finalAmount
              : Math.min(Math.max(input.paidAmount, 0), finalAmount);
          const remainingAmount = round2(finalAmount - paidAmount);

          // الباقي النقدي للعميل (حاسبة الباقي — مستقلة عن الدفع الجزئي)
          const changeAmount =
            input.changeAmount == null ? null : round2(Math.max(input.changeAmount, 0));

          // خصم الكميات من مخزون الفرع — تحديث شرطي ذري (updateMany مع شرط
          // الكمية) يمنع البيع الزائد/الرصيد السالب عند وصول طلبين متزامنين
          // يتجاوزان الفحص المبدئي معاً قبل أن يثبّت أيٌّ منهما الخصم.
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

          // استهلاك دفتر البيع بخصم — خصم ذري مشروط يمنع النزول تحت الصفر عند
          // التزامن (لو استُهلِك السجل من عملية أخرى، يُتجاهَل بأمان).
          for (const c of consumption) {
            if (c.take <= 0) continue;
            await tx.damagedItem.updateMany({
              where: { id: c.id, discountRemaining: { gte: c.take } },
              data: { discountRemaining: { decrement: c.take } },
            });
          }

          // رقم فاتورة تصاعدي عام
          const last = await tx.sale.findFirst({
            orderBy: { saleNumber: "desc" },
            select: { saleNumber: true },
          });
          const saleNumber = (last?.saleNumber ?? 0) + 1;

          // تحديث/إنشاء العميل تلقائياً — يكفي وجود الاسم أو الهاتف
          if (input.customerPhone) {
            const existingCustomer = await tx.customer.findUnique({
              where: { phone: input.customerPhone },
            });
            if (existingCustomer) {
              await tx.customer.update({
                where: { phone: input.customerPhone },
                data: {
                  totalSpent: { increment: finalAmount },
                  visitCount: { increment: 1 },
                  lastVisitAt: new Date(),
                },
              });
            } else if (input.saveAsNewCustomer) {
              // هاتف موجود دون اسم → اسم افتراضي «عميل»
              await tx.customer.create({
                data: {
                  name: input.customerName || "عميل",
                  phone: input.customerPhone,
                  branch: input.branch as Branch,
                  totalSpent: finalAmount,
                  visitCount: 1,
                  lastVisitAt: new Date(),
                },
              });
            }
          } else if (input.saveAsNewCustomer && input.customerName) {
            // اسم فقط دون هاتف → عميل بلا رقم
            await tx.customer.create({
              data: {
                name: input.customerName,
                phone: null,
                branch: input.branch as Branch,
                totalSpent: finalAmount,
                visitCount: 1,
                lastVisitAt: new Date(),
              },
            });
          }

          return tx.sale.create({
            data: {
              saleNumber,
              clientRef: input.clientRef ?? null,
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
              changeAmount,
              cashierName: input.cashierName ?? null,
              isDelivery: !!input.delivery,
              orderSource:
                (input.delivery?.orderSource as OrderSource | undefined) ??
                null,
              deliveryMethod:
                (input.delivery?.deliveryMethod as DeliveryMethod | undefined) ??
                null,
              deliveryAddress: input.delivery?.deliveryAddress ?? null,
              addressNotes: input.delivery?.addressNotes ?? null,
              trackingNumber: input.delivery?.trackingNumber ?? null,
              deliveryStatus: input.delivery ? "NEW" : null,
              items: { create: itemsData },
            },
            include: saleInclude,
          });
        });

        return ok(toSaleDTO(sale), 201);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          const target = (err.meta as { target?: string[] } | null)?.target;
          // تعارض على مفتاح التفرّد: طلب متزامن سبقنا لإنشاء نفس الفاتورة —
          // نُعيد النسخة الأصلية بدل إنشاء نسخة ثانية أو إظهار خطأ.
          if (target?.includes("clientRef") && input.clientRef) {
            const winner = await prisma.sale.findUnique({
              where: { clientRef: input.clientRef },
              include: saleInclude,
            });
            if (winner) return ok(toSaleDTO(winner), 200);
          }
          // تعارض رقم الفاتورة التصاعدي — أعد المحاولة
          if (attempts < 4) {
            attempts++;
            continue;
          }
        }
        throw err;
      }
    }
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
