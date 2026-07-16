-- العمليات اليومية: إقفال الصندوق / الموردون / استلام البضاعة / المصروفات / تكلفة الصنف
-- (Parts A–D). هذا المشروع يستخدم `prisma db push` + INIT_SQL (lib/init-sql.ts) بدل نظام
-- الهجرات، لذا يُشغَّل هذا الملف يدوياً مرّة واحدة على قاعدة البيانات (أو عبر مسار /api/seed).
-- كل العبارات آمنة للتكرار (IF NOT EXISTS / تجاهُل القيود المكررة 42710).

-- Part D: تكلفة الوحدة (متوسط مرجّح) على الصنف
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "cost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Part A: إقفال الصندوق / تسوية النقدية
CREATE TABLE IF NOT EXISTS "ShiftClose" (
    "id"           TEXT NOT NULL,
    "branch"       "Branch" NOT NULL,
    "cashierName"  TEXT,
    "openingCash"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "countedCash"  DOUBLE PRECISION,
    "difference"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes"        TEXT,
    "openedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt"     TIMESTAMP(3),

    CONSTRAINT "ShiftClose_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShiftClose_branch_idx"   ON "ShiftClose"("branch");
CREATE INDEX IF NOT EXISTS "ShiftClose_openedAt_idx" ON "ShiftClose"("openedAt");
CREATE INDEX IF NOT EXISTS "ShiftClose_closedAt_idx" ON "ShiftClose"("closedAt");

-- Part B: الموردون
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "phone"     TEXT,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name");

-- Part B: استلام البضاعة (رأس + بنود)
CREATE TABLE IF NOT EXISTS "StockReceipt" (
    "id"            TEXT NOT NULL,
    "supplierId"    TEXT NOT NULL,
    "branch"        "Branch" NOT NULL,
    "invoiceNumber" TEXT,
    "totalCost"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes"         TEXT,
    "createdBy"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockReceipt_supplierId_idx" ON "StockReceipt"("supplierId");
CREATE INDEX IF NOT EXISTS "StockReceipt_branch_idx"     ON "StockReceipt"("branch");
CREATE INDEX IF NOT EXISTS "StockReceipt_createdAt_idx"  ON "StockReceipt"("createdAt");

CREATE TABLE IF NOT EXISTS "StockReceiptItem" (
    "id"        TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity"  INTEGER NOT NULL,
    "unitCost"  DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "StockReceiptItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockReceiptItem_receiptId_idx" ON "StockReceiptItem"("receiptId");
CREATE INDEX IF NOT EXISTS "StockReceiptItem_variantId_idx" ON "StockReceiptItem"("variantId");

-- Part C: المصروفات
CREATE TABLE IF NOT EXISTS "Expense" (
    "id"          TEXT NOT NULL,
    "branch"      "Branch" NOT NULL,
    "category"    TEXT NOT NULL DEFAULT 'other',   -- rent / utilities / salaries / other
    "amount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "date"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Expense_branch_idx"   ON "Expense"("branch");
CREATE INDEX IF NOT EXISTS "Expense_category_idx" ON "Expense"("category");
CREATE INDEX IF NOT EXISTS "Expense_date_idx"     ON "Expense"("date");

-- المفاتيح الأجنبية (شغّلها مرّة واحدة؛ تتجاهلها إعادة التشغيل بخطأ 42710)
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "StockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
