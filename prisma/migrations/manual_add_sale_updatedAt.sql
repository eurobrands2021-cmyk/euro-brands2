-- M6 — إضافة عمود Sale.updatedAt (يُدار تلقائياً عبر Prisma @updatedAt)
-- هذا المشروع يستخدم `prisma db push` بدل نظام الهجرات، لذا يُشغَّل هذا الملف
-- يدوياً مرّة واحدة على قاعدة البيانات (أو عبر `prisma db push` بعد تحديث المخطّط).

-- 1) إضافة العمود
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- 2) تعبئة الصفوف القائمة بقيمة createdAt حتى لا تبقى NULL
--    (Prisma يعامل updatedAt كعمود غير قابل لـ NULL)
UPDATE "Sale" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- 3) فرض القيد مستقبلاً
ALTER TABLE "Sale" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
