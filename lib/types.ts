import type {
  BranchValue,
  CategoryValue,
  DeliveryMethodValue,
  DeliveryStatusValue,
  DiscountTypeValue,
  OrderSourceValue,
  PaymentMethodValue,
  TransferMethodValue,
  SaleStatusValue,
  StockTransferStatusValue,
} from "./constants";

// الأنواع المشتركة بين الواجهة والـ API (نسخة قابلة للتسلسل JSON)

export interface VariantDTO {
  id: string;
  productId: string;
  size: string;
  color: string | null;
  quantity: number;
  minQuantity: number;
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
}

// استيراد الجرد من Excel
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

export interface CustomerInput {
  name: string;
  phone: string;
  branch?: BranchValue | null;
  notes?: string | null;
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

// تحويل المخزون بين الفروع
export interface StockTransferItemDTO {
  id: string;
  productId: string;
  variantId: string;
  size: string;
  color: string | null;
  quantity: number;
  productName: string;
  brand: string;
  sku: string | null;
  availableQuantity: number; // الكمية المتاحة حالياً في فرع المصدر
}

export interface StockTransferDTO {
  id: string;
  fromBranch: BranchValue;
  toBranch: BranchValue;
  status: StockTransferStatusValue;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
  items: StockTransferItemDTO[];
  itemsCount: number;
}

export interface StockTransferItemInput {
  variantId: string;
  quantity: number;
}

export interface StockTransferInput {
  fromBranch: BranchValue;
  toBranch: BranchValue;
  notes?: string | null;
  createdBy?: string | null;
  items: StockTransferItemInput[];
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
  dailySales: { date: string; total: number }[];
  byCategory: { category: CategoryValue; total: number; qty: number }[];
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
