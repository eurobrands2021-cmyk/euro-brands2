-- المرتجعات والاستبدال (Returns & Exchanges)
-- هذا المشروع يستخدم `prisma db push` + INIT_SQL (lib/init-sql.ts) بدل نظام الهجرات،
-- لذا يُشغَّل هذا الملف يدوياً مرّة واحدة على قاعدة البيانات (أو عبر مسار /api/seed).
-- كل العبارات آمنة للتكرار (IF NOT EXISTS / تجاهُل القيود المكررة).

-- 1) رأس عملية المرتجع/الاستبدال (مرتبطة بفاتورة)
CREATE TABLE IF NOT EXISTS "Return" (
    "id"                 TEXT NOT NULL,
    "saleId"             TEXT NOT NULL,
    "branch"             "Branch" NOT NULL,
    "type"               TEXT NOT NULL DEFAULT 'RETURN',   -- 'RETURN' | 'EXCHANGE'
    "reason"             TEXT,
    "refundMethod"       TEXT,                             -- ملاحظة: cash / card / store_credit
    "refundTotal"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeDifference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy"          TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- 2) بنود المرتجع (يمكن إرجاع جزء من أصناف الفاتورة)
CREATE TABLE IF NOT EXISTS "ReturnItem" (
    "id"                TEXT NOT NULL,
    "returnId"          TEXT NOT NULL,
    "saleItemId"        TEXT NOT NULL,
    "variantId"         TEXT NOT NULL,
    "quantity"          INTEGER NOT NULL,
    "refundAmount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeVariantId" TEXT,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- 3) الفهارس
CREATE INDEX IF NOT EXISTS "Return_saleId_idx"    ON "Return"("saleId");
CREATE INDEX IF NOT EXISTS "Return_createdAt_idx" ON "Return"("createdAt");
CREATE INDEX IF NOT EXISTS "Return_branch_idx"    ON "Return"("branch");
CREATE INDEX IF NOT EXISTS "Return_type_idx"      ON "Return"("type");
CREATE INDEX IF NOT EXISTS "ReturnItem_returnId_idx"   ON "ReturnItem"("returnId");
CREATE INDEX IF NOT EXISTS "ReturnItem_saleItemId_idx" ON "ReturnItem"("saleItemId");
CREATE INDEX IF NOT EXISTS "ReturnItem_variantId_idx"  ON "ReturnItem"("variantId");

-- 4) المفاتيح الأجنبية (شغّلها مرّة واحدة؛ تتجاهلها إعادة التشغيل بخطأ 42710)
ALTER TABLE "Return" ADD CONSTRAINT "Return_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_saleItemId_fkey"
    FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_exchangeVariantId_fkey"
    FOREIGN KEY ("exchangeVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
