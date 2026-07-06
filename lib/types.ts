import type {
  BranchValue,
  CategoryValue,
  DefectReasonValue,
  DeliveryMethodValue,
  DeliveryStatusValue,
  DiscountTypeValue,
  OrderSourceValue,
  PaymentMethodValue,
  TransferMethodValue,
  SaleStatusValue,
} from "./constants";

// الأنواع المشتركة بين الواجهة والـ API (نسخة قابلة للتسلسل JSON)

export interface VariantDTO {
  id: string;
  productId: string;
  size: string;
  color: string | null;
  quantity: number;
  minQuantity: number;
  alertOnLowStock: boolean;
  branch: BranchValue;
  price: number;
  sku: string | null;
  skuManual: boolean;
}

export interface ProductDTO {
  id: string;
  name: string;
  brand: string;
  category: CategoryValue;
  description: string | null;
  sku: string | null; // (مهجور) محفوظ على المنتجات القديمة فقط
  barcode: string | null;
  images: string[];
  productTypeId: string | null;
  productType: ProductTypeDTO | null;
  variants: VariantDTO[];
  totalQuantity: number;
  isDraft: boolean; // مسودة أُضيفت سريعاً من POS وتحتاج إكمال بياناتها
  soldCount?: number; // إجمالي القطع المباعة (للترتيب بالأكثر مبيعاً)
  createdAt: string;
  updatedAt: string;
}

export interface BrandDTO {
  id: string;
  name: string;
  category: CategoryValue;
}

export interface BrandInput {
  name: string;
  category: CategoryValue;
}

// أنواع المنتجات
export interface ProductTypeDTO {
  id: string;
  name: string;
  code: string;
  category: CategoryValue;
}

export interface ProductTypeInput {
  name: string;
  code: string;
  category: CategoryValue;
}

// تنبيهات قلة المخزون (الكمية <= الحد الأدنى للمقاس)
export interface LowStockItem {
  id: string;
  productName: string;
  brand: string;
  branch: BranchValue;
  size: string;
  color: string | null;
  quantity: number;
  minQuantity: number;
  alertOnLowStock: boolean; // هل فُعِّل التنبيه لهذا الصنف (يُستخدم لجرس الإشعارات)
}

export interface LowStockResponse {
  count: number;
  items: LowStockItem[];
}

export interface HomeStats {
  today: { sales: number; count: number };
  yesterday: { sales: number; count: number };
}

export interface SaleItemDTO {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  productName: string;
  brand: string;
  size: string;
  color: string | null;
  sku: string | null;
}

export interface SaleDTO {
  id: string;
  saleNumber: number;
  branch: BranchValue;
  totalAmount: number;
  discountType: DiscountTypeValue | null;
  discountValue: number;
  finalAmount: number;
  customerName: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  paymentMethod: PaymentMethodValue;
  transferMethod: TransferMethodValue | null;
  invoiceNotes: string | null;
  paidAmount: number;
  remainingAmount: number;
  changeAmount: number | null; // الباقي للعميل عند الدفع نقداً (اختياري)
  cashierName: string | null;
  status: SaleStatusValue;
  cancellationReason: string | null;
  isDelivery: boolean;
  orderSource: OrderSourceValue | null;
  deliveryMethod: DeliveryMethodValue | null;
  deliveryAddress: string | null;
  addressNotes: string | null;
  trackingNumber: string | null;
  deliveryStatus: DeliveryStatusValue | null;
  createdAt: string;
  lastEditedAt?: string | null; // آخر تعديل على الفاتورة (من سجل النشاط)
  unlockedAt: string | null; // وقت فتح القفل يدوياً (إن وُجد)
  unlockReason: string | null; // سبب فتح القفل
  items: SaleItemDTO[];
  itemsCount?: number;
}

export interface DeliveryInput {
  orderSource: OrderSourceValue;
  deliveryMethod: DeliveryMethodValue;
  deliveryAddress: string;
  addressNotes?: string | null;
  trackingNumber?: string | null;
}

// مدخلات إنشاء/تعديل المنتج
export interface VariantInput {
  id?: string; // موجود عند التعديل، غير موجود عند الإضافة
  size: string;
  color: string | null;
  quantity: number;
  minQuantity: number;
  alertOnLowStock?: boolean; // تفعيل جرس التنبيه عند بلوغ الحد الأدنى لهذا الصنف
  branch: BranchValue;
  price: number;
  sku: string | null; // إن غاب أو فضل null يُولَّد تلقائياً، وإن جاء معتمداً يُعتَبر يدوي
  skuManual?: boolean;
}

export interface ProductInput {
  name: string;
  brand: string;
  category: CategoryValue;
  description?: string | null;
  barcode?: string | null;
  images: string[];
  productTypeId?: string | null;
  variants: VariantInput[];
  isDraft?: boolean; // عند الإنشاء: يعلّم المنتج كمسودة (إضافة سريعة من POS)
}

// استيراد الجرد من Excel

// إجراء التعامل مع الصف المتعارض (الصنف موجود مسبقاً):
//   replace = استبدال الكمية بالقيمة الجديدة
//   merge   = تجميع (الكمية الحالية + الكمية الجديدة)
//   skip    = تخطي الصف (لا يُرسَل للخادم عادةً، لكن يُحترم أيضاً هناك)
export type ImportAction = "replace" | "merge" | "skip";

export interface ImportRow {
  name: string;
  brand: string;
  category: CategoryValue;
  branch: BranchValue;
  size: string;
  color: string | null;
  quantity: number;
  price: number;
  sku: string | null;
  productType: string | null; // اسم النوع — يُنشأ إن لم يكن موجوداً
  action?: ImportAction; // كيفية التعامل مع الصنف الموجود (افتراضي: replace)
}

export interface ImportResult {
  totalRows: number;
  newProducts: number;
  newVariants: number;
  updatedVariants: number;
}

// مدخلات إنشاء فاتورة
export interface SaleItemInput {
  variantId: string;
  quantity: number;
}

export interface SaleInput {
  branch: BranchValue;
  items: SaleItemInput[];
  discountType: DiscountTypeValue | null;
  discountValue: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerNotes?: string | null;
  paymentMethod: PaymentMethodValue;
  transferMethod?: TransferMethodValue | null;
  invoiceNotes?: string | null;
  paidAmount?: number | null; // المبلغ المدفوع الآن (للدفع الجزئي)
  changeAmount?: number | null; // الباقي النقدي للعميل (حاسبة الباقي في POS)
  cashierName?: string | null; // اسم الكاشير (من الجلسة)
  delivery?: DeliveryInput | null; // بيانات التوصيل (اختيارية)
  saveAsNewCustomer?: boolean; // احفظ رقم/اسم العميل كعميل جديد إن لم يكن مسجلاً
}

// العملاء
export interface CustomerDTO {
  id: string;
  name: string;
  phone: string;
  totalSpent: number;
  visitCount: number;
  lastVisitAt: string | null;
  branch: BranchValue | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetailDTO extends CustomerDTO {
  sales: SaleDTO[]; // تاريخ المشتريات الكامل
}

// كبار العملاء (VIP) — عميل مع متوسط الفاتورة المحسوب
export interface VipCustomerDTO {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  totalSpent: number;
  avgSale: number; // totalSpent / visitCount
  lastVisitAt: string | null;
  branch: BranchValue | null;
}

// خيارات فلترة صفحة كبار العملاء
export const VIP_FILTERS = [
  "spenders", // الأكثر إنفاقاً
  "frequent", // الأكثر تكراراً
  "branch", // حسب الفرع
  "atrisk", // في خطر (آخر زيارة > 30 يوم)
  "new", // عملاء جدد (آخر 30 يوم)
  "avg", // متوسط الفاتورة
  "category", // المفضّل فئة
] as const;
export type VipFilter = (typeof VIP_FILTERS)[number];

export interface CustomerInput {
  name: string;
  phone: string;
  branch?: BranchValue | null;
  notes?: string | null;
}

// ----------------------------------------------------
//  الديفو — المنتجات التالفة/المعيبة
// ----------------------------------------------------
export interface DamagedItemDTO {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  brand: string;
  size: string | null;
  color: string | null;
  branch: BranchValue;
  quantity: number;
  reasonCode: DefectReasonValue; // كود السبب (عمود reason في قاعدة البيانات)
  detail: string | null; // تفاصيل/سبب حر (عمود detail)
  unitCost: number;
  loss: number; // الكمية × تكلفة الوحدة
  photoUrl: string | null; // صورة العيب (عمود photoUrl)
  createdAt: string;
}

// مدخلات تسجيل تلف — يخصم الكمية من المخزون داخل معاملة
export interface DamagedInput {
  variantId: string; // الصنف المُتلف (يُخصَم منه)
  quantity: number;
  reasonCode: DefectReasonValue; // يُخزَّن في عمود reason
  detail?: string | null; // تفاصيل إضافية (مطلوبة عند «أخرى») — عمود detail
  photoUrl?: string | null; // عمود photoUrl
  unitCost?: number | null; // تكلفة الوحدة (تُشتق من سعر الصنف إن غابت)
  createdBy?: string | null; // اسم من سجّل التلف (لسجل التدقيق فقط، لا يُخزَّن في الجدول)
}

// تقرير الديفو: القائمة + الملخّص (إجمالي الخسارة + السبب الأكثر تكراراً)
export interface DefectReport {
  items: DamagedItemDTO[];
  totalLoss: number; // إجمالي الخسارة بالجنيه (Σ الكمية × التكلفة)
  totalQuantity: number; // إجمالي عدد القطع التالفة
  topReason: DefectReasonValue | null; // السبب الأكثر تكراراً
  topReasonCount: number;
  reasonBreakdown: { reason: DefectReasonValue; count: number; loss: number }[];
}

export interface CustomerUpdateInput {
  name?: string;
  notes?: string | null;
  branch?: BranchValue | null;
}

export interface CustomerListResponse {
  customers: CustomerDTO[];
  total: number;
  page: number;
  pageSize: number;
}

// سجل النشاط
export interface ActivityLogDTO {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  details: string | null;
  createdAt: string;
}

export interface ActivityLogInput {
  userName: string;
  userRole: string;
  action: string;
  details?: string | null;
}

// طلبات دخول الكاشير (نسيت كلمة المرور)
export type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AccessRequestDTO {
  id: string;
  name: string;
  status: AccessRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
}

// حالة استرجاع حساب المدير (سؤال الأمان)
export interface AdminRecoveryStatus {
  configured: boolean;
  question: string | null;
}

// إحصائيات لوحة التحكم — موحّدة (الرئيسية + التقارير)
export interface DashboardStats {
  // القسم 1 — بطاقات سريعة
  todaySales: number;
  todaySalesCount: number;
  yesterdaySales: number;
  yesterdaySalesCount: number;
  todayChangePct: number; // النسبة المئوية للتغيّر مقارنة بالأمس
  rangeSales: number;
  rangeSalesCount: number;
  avgInvoice: number;
  topDay: { date: string; total: number } | null;
  remainingTotal: number; // إجمالي الرصيد المتبقي عند العملاء (كل الوقت)

  // القسم 2 — رسوم بيانية
  branchComparison: { branch: BranchValue; total: number; count: number }[];
  weekComparison: {
    thisWeek: { date: string; total: number }[]; // 7 أيام تنتهي باليوم
    lastWeek: { date: string; total: number }[]; // 7 أيام تسبق الأسبوع الحالي
  };
  paymentBreakdown: {
    key: "CASH" | "VISA" | "VODAFONE_CASH" | "INSTAPAY";
    label: string;
    total: number;
    count: number;
  }[];

  // القسم 3 — جداول
  topProducts: {
    name: string;
    brand: string;
    qty: number;
    revenue: number;
    image: string | null;
  }[];
  topBrand: { brand: string; qty: number; revenue: number } | null;
  newCustomersCount: number; // عملاء جدد في الفترة (لم يظهروا قبلها)

  // القسم 4 — التوصيل
  deliveryStats: {
    deliveryCount: number;
    pickupCount: number;
    returnedCount: number;
    returnedPct: number;
  };

  // أداء الكاشيرين (ضمن الفترة المختارة)
  cashierStats: {
    name: string;
    count: number; // عدد الفواتير
    total: number; // إجمالي المبيعات
    avgInvoice: number; // متوسط الفاتورة
    maxInvoice: number; // أعلى فاتورة
  }[];

  // حقول إضافية للتصدير (PDF/Excel)
  grossSales: number;
  discountTotal: number;
  discountedCount: number;
  itemsSold: number;
  maxInvoice: number; // أعلى فاتورة في الفترة
  dailySales: { date: string; total: number }[];
  byCategory: { category: CategoryValue; total: number; qty: number }[];
  // المبيعات حسب البراند (Top 10)
  topBrands: { brand: string; qty: number; revenue: number }[];
  // أكثر المقاسات مبيعاً
  bySize: { size: string; qty: number; revenue: number }[];
  topCustomers: {
    name: string;
    phone: string | null;
    total: number;
    count: number;
  }[];
  lowStock: {
    id: string;
    productName: string;
    brand: string;
    size: string;
    branch: BranchValue;
    quantity: number;
  }[];
  slowMoving: {
    id: string;
    name: string;
    brand: string;
    quantity: number;
  }[];

  // ---- تقارير المنتجات والجرد ----
  inventoryValue: number; // إجمالي قيمة المخزون الحالي
  productsCount: number; // عدد المنتجات الكلي
  variantsCount: number; // عدد الأصناف (SKU) الكلي
  outOfStock: {
    id: string;
    name: string;
    brand: string;
    category: CategoryValue;
  }[]; // منتجات نفد مخزونها بالكامل
  stockByBranch: { branch: BranchValue; quantity: number; value: number }[];
  stockByCategory: { category: CategoryValue; quantity: number; value: number }[];
  stockByBrand: { brand: string; quantity: number; value: number }[];
  topProfit: {
    name: string;
    brand: string;
    qty: number;
    revenue: number;
  }[]; // الأكثر ربحية (تقديري بحسب الإيراد المحقّق)
  newProducts: {
    id: string;
    name: string;
    brand: string;
    category: CategoryValue;
    createdAt: string;
  }[]; // منتجات أُضيفت خلال الفترة
  damagedItems: {
    id: string;
    productName: string;
    brand: string;
    branch: BranchValue | null;
    quantity: number;
    reason: string | null;
    createdAt: string;
  }[];
  stockTransfers: {
    id: string;
    fromBranch: BranchValue;
    toBranch: BranchValue;
    status: string;
    itemsCount: number;
    quantity: number;
    createdAt: string;
    completedAt: string | null;
  }[];
}

// رؤية ذكية واحدة (من Gemini أو القواعد)
export interface Insight {
  title: string;
  description: string;
  type: "success" | "warning" | "danger";
  category: string;
}

export interface InsightsResponse {
  insights: Insight[];
  source: "ai" | "rules";
  generatedAt: string;
}

// صفحة الذكاء المتقدمة
export interface InsightsData {
  generatedAt: string;
  aiSource: "ai" | "rules";
  alerts: {
    lowStock: {
      id: string;
      productId: string;
      productName: string;
      brand: string;
      branch: BranchValue;
      size: string;
      quantity: number;
      minQuantity: number;
    }[];
    deadStock: {
      id: string;
      name: string;
      brand: string;
      quantity: number;
    }[];
    branchDrops: {
      branch: BranchValue;
      thisWeek: number;
      lastWeek: number;
      dropPct: number;
    }[];
  };
  performance: {
    topGrowth: {
      productId: string;
      name: string;
      brand: string;
      thisWeekQty: number;
      lastWeekQty: number;
      growthPct: number;
    }[];
    bestBranch: { branch: BranchValue; total: number; share: number } | null;
    peakDays: { day: number; label: string; total: number }[];
    peakHours: { hour: number; total: number }[];
  };
  ai: {
    promotions: { product: string; reason: string }[];
    adIdeas: string[];
    seasonal: string;
    pricing: { product: string; suggestion: string }[];
  };
}

// بيانات صفحة التقارير
export interface ReportsData {
  totalSales: number; // الصافي بعد الخصم
  grossSales: number; // الإجمالي قبل الخصم
  discountTotal: number; // إجمالي الخصومات
  discountedCount: number; // عدد الفواتير التي فيها خصم
  invoicesCount: number;
  itemsSold: number;
  avgInvoice: number;
  byBranch: { branch: BranchValue; total: number; count: number }[];
  byCategory: { category: CategoryValue; total: number; qty: number }[];
  dailySales: { date: string; total: number }[];
  topProducts: {
    name: string;
    brand: string;
    qty: number;
    revenue: number;
    image: string | null;
  }[];
  topCustomers: {
    name: string;
    phone: string | null;
    total: number;
    count: number;
  }[];
  slowMoving: {
    id: string;
    name: string;
    brand: string;
    quantity: number;
  }[];
  lowStock: {
    id: string;
    productName: string;
    brand: string;
    size: string;
    branch: BranchValue;
    quantity: number;
  }[];
}
