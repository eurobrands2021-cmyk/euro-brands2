import {
  startOfDay,
  endOfDay,
  subDays,
  eachDayOfInterval,
  format,
  setHours,
} from "date-fns";
import { calcDiscount, calcItemNet, round2 } from "./sale-utils";
import { normalizeArabic } from "./normalize";
import { expandBrandQuery, matchesWithBrandAliases } from "./brand-map";
import {
  BRANCHES,
  DEFAULT_PRODUCT_TYPES,
  DEFECT_REASONS,
  LOW_STOCK_THRESHOLD,
  RENAMED_PRODUCT_TYPES,
  type BranchValue,
  type CategoryValue,
  type DefectReasonValue,
  type DeliveryMethodValue,
  type DeliveryStatusValue,
  type DiscountTypeValue,
  type OrderSourceValue,
  type PaymentMethodValue,
  type TransferMethodValue,
  type SaleStatusValue,
  type ExpenseCategoryValue,
  EXPENSE_CATEGORIES,
} from "./constants";
import { ValidationError } from "./validate";
import { computeShiftReport } from "./shift-report";
import { buildDefectReport } from "./defect-report";
import {
  normalizeAnswer,
  ADMIN_RECOVERY_QUESTION_KEY,
  ADMIN_RECOVERY_ANSWER_KEY,
} from "./recovery";
import type { NormProduct, NormSale } from "./insights-analytics";
import type {
  AccessRequestDTO,
  AccessRequestStatus,
  ActivityLogDTO,
  ActivityLogInput,
  AdminRecoveryStatus,
  BrandDTO,
  CustomerDTO,
  CustomerInput,
  CustomerListResponse,
  CustomerUpdateInput,
  DamagedInput,
  DamagedItemDTO,
  DashboardStats,
  DefectReport,
  DefectReportPage,
  DeliveryListResponse,
  ImportResult,
  ImportRow,
  LowStockResponse,
  Paginated,
  ProductDTO,
  ProductInput,
  ProductListPage,
  ProductTypeDTO,
  ProductTypeInput,
  ReportsData,
  ReturnDTO,
  ReturnInput,
  ReturnsListResponse,
  SaleDTO,
  SaleInput,
  SalesListResponse,
  VariantDTO,
  VipCustomerDTO,
  ShiftCloseDTO,
  ShiftCloseInput,
  ShiftFinalizeInput,
  ShiftListResponse,
  ShiftDetailResponse,
  SupplierDTO,
  SupplierInput,
  StockReceiptDTO,
  StockReceiptInput,
  StockReceiptsListResponse,
  ExpenseDTO,
  ExpenseInput,
  ExpensesListResponse,
} from "./types";
import type { ReturnTypeValue, RefundMethodValue } from "./constants";
import { buildVariantSku, uniquifySku } from "./sku";
import {
  sumReturnCash,
  computeNetCash,
  groupReturnCashByBranch,
  emptyCashRefunds,
  type ReturnCashRow,
} from "./returns-cash";
import type { DailyCash, HomeStats } from "./types";

// "وضع المعاينة": يعمل تلقائياً عند غياب DATABASE_URL، أو يُفرض عبر MOCK_DATA=1
export const MOCK_MODE =
  !process.env.DATABASE_URL ||
  process.env.MOCK_DATA === "true" ||
  process.env.MOCK_DATA === "1";

// ----------------------------------------------------
//  النماذج الداخلية (قابلة للتعديل في الذاكرة)
// ----------------------------------------------------
interface MVariant {
  id: string;
  productId: string;
  size: string;
  color: string | null;
  quantity: number;
  minQuantity: number;
  alertOnLowStock: boolean;
  branch: BranchValue;
  price: number;
  cost?: number; // تكلفة الوحدة (متوسط مرجّح) — Part D
  sku: string | null;
  skuManual: boolean;
}
interface MProduct {
  id: string;
  name: string;
  brand: string;
  category: CategoryValue;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  images: string[];
  productTypeId: string | null;
  isDraft: boolean;
  variants: MVariant[];
  createdAt: Date;
  updatedAt: Date;
}
interface MProductType {
  id: string;
  name: string;
  code: string;
  category: CategoryValue;
}
interface MActivityLog {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  details: string | null;
  createdAt: Date;
}
interface MAccessRequest {
  id: string;
  name: string;
  status: AccessRequestStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}
interface MItem {
  id: string;
  saleId: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  note?: string | null;
  itemDiscount?: number;
  itemDiscountType?: DiscountTypeValue;
}
interface MSale {
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
  changeAmount: number | null;
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
  createdAt: Date;
  unlockedAt?: Date | null;
  unlockedBy?: string | null;
  unlockReason?: string | null;
  items: MItem[];
}

// الديفو — سجل تلف داخل المتجر التجريبي (أسماء الأعمدة كما في قاعدة البيانات)
interface MDamaged {
  id: string;
  productId: string;
  variantId: string | null;
  branch: BranchValue;
  quantity: number;
  reason: string | null; // كود السبب
  detail: string | null; // نص حر
  unitCost: number;
  photoUrl: string | null;
  createdAt: Date;
}

// المرتجعات/الاستبدال داخل المتجر التجريبي
interface MReturnItem {
  id: string;
  saleItemId: string;
  variantId: string;
  quantity: number;
  refundAmount: number;
  exchangeVariantId: string | null;
}
interface MReturn {
  id: string;
  saleId: string;
  branch: BranchValue;
  type: ReturnTypeValue;
  reason: string | null;
  refundMethod: RefundMethodValue | null;
  refundTotal: number;
  exchangeDifference: number;
  createdBy: string | null;
  createdAt: Date;
  items: MReturnItem[];
}

interface MBrand {
  id: string;
  name: string;
  category: CategoryValue;
}

interface MCustomer {
  id: string;
  name: string;
  phone: string | null;
  totalSpent: number;
  visitCount: number;
  lastVisitAt: Date | null;
  branch: BranchValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---- العمليات اليومية (Parts A–C) داخل المتجر التجريبي ----
interface MShiftClose {
  id: string;
  branch: BranchValue;
  cashierName: string | null;
  openingCash: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number;
  notes: string | null;
  openedAt: Date;
  closedAt: Date | null;
}
interface MSupplier {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
}
interface MStockReceiptItem {
  id: string;
  variantId: string;
  quantity: number;
  unitCost: number;
}
interface MStockReceipt {
  id: string;
  supplierId: string;
  branch: BranchValue;
  invoiceNumber: string | null;
  totalCost: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  items: MStockReceiptItem[];
}
interface MExpense {
  id: string;
  branch: BranchValue;
  category: ExpenseCategoryValue;
  amount: number;
  description: string | null;
  date: Date;
  createdBy: string | null;
  createdAt: Date;
}

interface Store {
  products: MProduct[];
  sales: MSale[];
  brands: MBrand[];
  productTypes: MProductType[];
  activityLogs: MActivityLog[];
  customers: MCustomer[];
  accessRequests: MAccessRequest[];
  damaged: MDamaged[];
  returns: MReturn[];
  shifts: MShiftClose[];
  suppliers: MSupplier[];
  stockReceipts: MStockReceipt[];
  expenses: MExpense[];
  settings: Record<string, string>;
  seq: number;
}

// ----------------------------------------------------
//  مولّد أرقام شبه عشوائي ثابت (لبيانات معاينة مستقرة)
// ----------------------------------------------------
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const IMG = (seed: string) =>
  `https://images.unsplash.com/${seed}?w=600&auto=format&fit=crop`;

// ----------------------------------------------------
//  بناء البيانات التجريبية
// ----------------------------------------------------
function buildStore(): Store {
  const store: Store = {
    products: [],
    sales: [],
    brands: [],
    productTypes: [],
    activityLogs: [],
    customers: [],
    accessRequests: [],
    damaged: [],
    returns: [],
    shifts: [],
    suppliers: [],
    stockReceipts: [],
    expenses: [],
    settings: {},
    seq: 0,
  };
  const id = (p: string) => `${p}_${++store.seq}`;

  type VSpec = [size: string, branch: BranchValue, qty: number, price: number];
  const def = (
    name: string,
    brand: string,
    category: CategoryValue,
    description: string,
    image: string,
    specs: VSpec[]
  ): MProduct => {
    const pid = id("p");
    const n = pid.split("_")[1];
    const code = brand.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    return {
      id: pid,
      name,
      brand,
      category,
      description,
      sku: null,
      barcode: `62${String(n).padStart(10, "0")}`,
      images: [image],
      productTypeId: null,
      isDraft: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      variants: specs.map(([size, branch, quantity, price], idx) => {
        const vid = id("v");
        const sku = `${code}-${String(n).padStart(3, "0")}-${size}-${branch === "HADAYEK" ? "H" : "Z"}${idx}`;
        return {
          id: vid,
          productId: pid,
          size,
          color: null,
          quantity,
          minQuantity: 5,
          alertOnLowStock: false,
          branch,
          price,
          sku,
          skuManual: false,
        };
      }),
    };
  };

  const H: BranchValue = "HADAYEK";
  const Z: BranchValue = "ZAHRAA";

  store.products = [
    def(
      "تيشيرت قطن كلاسيك",
      "Zara",
      "CLOTHES",
      "تيشيرت قطني مريح بقصة كلاسيكية مناسب للارتداء اليومي.",
      IMG("photo-1521572163474-6864f9cf17ab"),
      [
        ["S", H, 14, 350],
        ["M", H, 22, 350],
        ["L", H, 10, 350],
        ["XL", H, 3, 350],
        ["M", Z, 12, 350],
        ["L", Z, 8, 350],
        ["XL", Z, 0, 350],
      ]
    ),
    def(
      "قميص كاجوال مقلّم",
      "H&M",
      "CLOTHES",
      "قميص كاجوال بأكمام طويلة وخامة قطنية ناعمة.",
      IMG("photo-1602810318383-e386cc2a3ccf"),
      [
        ["M", H, 9, 480],
        ["L", H, 11, 480],
        ["XL", H, 6, 480],
        ["L", Z, 7, 480],
        ["2XL", Z, 2, 480],
      ]
    ),
    def(
      "هودي بقلنسوة",
      "Adidas",
      "CLOTHES",
      "هودي رياضي دافئ بقلنسوة وجيب أمامي.",
      IMG("photo-1556821840-3a63f95609a7"),
      [
        ["M", H, 8, 890],
        ["L", H, 5, 890],
        ["XL", H, 1, 890],
        ["M", Z, 6, 890],
        ["L", Z, 9, 890],
      ]
    ),
    def(
      "بنطلون جينز سليم",
      "Levi's",
      "PANTS",
      "بنطلون جينز بقصة سليم عصرية وخامة متينة.",
      IMG("photo-1542272604-787c3835535d"),
      [
        ["M", H, 7, 720],
        ["L", H, 12, 720],
        ["XL", H, 4, 720],
        ["L", Z, 9, 720],
        ["2XL", Z, 3, 720],
      ]
    ),
    def(
      "بنطلون تشينو",
      "Tommy Hilfiger",
      "PANTS",
      "بنطلون تشينو أنيق مناسب للإطلالات شبه الرسمية.",
      IMG("photo-1473966968600-fa801b869a1a"),
      [
        ["M", H, 5, 950],
        ["L", H, 6, 950],
        ["L", Z, 4, 950],
        ["XL", Z, 2, 950],
      ]
    ),
    def(
      "حذاء رياضي خفيف",
      "Nike",
      "SHOES",
      "حذاء رياضي خفيف الوزن مناسب للجري والمشي.",
      IMG("photo-1542291026-7eec264c27ff"),
      [
        ["41", H, 6, 1450],
        ["42", H, 10, 1450],
        ["43", H, 4, 1450],
        ["42", Z, 7, 1450],
        ["44", Z, 0, 1450],
      ]
    ),
    def(
      "حذاء كلاسيك جلد",
      "Clarks",
      "SHOES",
      "حذاء جلد طبيعي بتصميم كلاسيكي أنيق للمناسبات الرسمية.",
      IMG("photo-1449505278894-297fdb3edbc1"),
      [
        ["40", H, 5, 1850],
        ["41", H, 7, 1850],
        ["42", Z, 3, 1850],
        ["43", Z, 6, 1850],
      ]
    ),
    def(
      "حذاء جري احترافي",
      "Puma",
      "SHOES",
      "حذاء جري بنعل مرن يوفر دعماً ممتازاً للقدم.",
      IMG("photo-1608231387042-66d1773070a5"),
      [
        ["42", H, 8, 1650],
        ["43", H, 2, 1650],
        ["41", Z, 5, 1650],
        ["42", Z, 9, 1650],
      ]
    ),
    def(
      "عطر شرقي فاخر",
      "Lattafa",
      "PERFUMES",
      "عطر شرقي فاخر بمزيج من العود والمسك يدوم طويلاً.",
      IMG("photo-1592945403244-b3fbafd7f539"),
      [
        ["100ml", H, 18, 600],
        ["100ml", Z, 13, 600],
        ["50ml", H, 9, 400],
      ]
    ),
    def(
      "عطر خشبي منعش",
      "Armaf",
      "PERFUMES",
      "عطر خشبي منعش يناسب الاستخدام اليومي بثبات عالٍ.",
      IMG("photo-1541643600914-78b084683601"),
      [
        ["100ml", H, 15, 520],
        ["100ml", Z, 11, 520],
        ["50ml", Z, 2, 360],
      ]
    ),
  ];

  // ---- توليد فواتير على مدى آخر 30 يوماً ----
  const rng = makeRng(987654321);
  const now = new Date();
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const customers: [string, string][] = [
    ["أحمد محمد", "01001234567"],
    ["منى سعيد", "01122334455"],
    ["خالد عبد الله", "01098765432"],
    ["سارة إبراهيم", "01234567890"],
    ["", ""],
    ["", ""],
  ];

  // كاشيرون تجريبيون لإظهار قسم «أداء الكاشيرين»
  const cashiers = ["مدير النظام", "محمود", "ندى", "يوسف"];

  const totalSalesToGenerate = 42;
  for (let i = 0; i < totalSalesToGenerate; i++) {
    // أول 5 فواتير تكون اليوم لإظهار "مبيعات اليوم"
    const dayOffset = i < 5 ? 0 : Math.floor(rng() * 30);
    const branch = pick(BRANCHES as unknown as BranchValue[]);

    // المقاسات المتاحة في هذا الفرع بكمية كافية
    const available: { product: MProduct; variant: MVariant }[] = [];
    for (const product of store.products) {
      for (const variant of product.variants) {
        if (variant.branch === branch && variant.quantity >= 3) {
          available.push({ product, variant });
        }
      }
    }
    if (available.length === 0) continue;

    const lineCount = 1 + Math.floor(rng() * 3);
    const items: MItem[] = [];
    const usedVariants = new Set<string>();
    let totalAmount = 0;

    const saleId = id("s");
    for (let l = 0; l < lineCount; l++) {
      const choice = pick(available);
      if (usedVariants.has(choice.variant.id)) continue;
      if (choice.variant.quantity < 1) continue;
      usedVariants.add(choice.variant.id);

      const qty = 1 + Math.floor(rng() * Math.min(2, choice.variant.quantity));
      const subtotal = round2(choice.variant.price * qty);
      totalAmount += subtotal;
      choice.variant.quantity -= qty; // خصم المخزون

      items.push({
        id: id("si"),
        saleId,
        productId: choice.product.id,
        variantId: choice.variant.id,
        quantity: qty,
        unitPrice: choice.variant.price,
        subtotal,
      });
    }
    if (items.length === 0) continue;

    totalAmount = round2(totalAmount);

    // خصم على ~ثلث الفواتير
    let discountType: DiscountTypeValue | null = null;
    let discountValue = 0;
    const r = rng();
    if (r < 0.2) {
      discountType = "PERCENTAGE";
      discountValue = pick([5, 10, 15]);
    } else if (r < 0.33) {
      discountType = "FIXED";
      discountValue = pick([50, 100]);
    }
    const { finalAmount } = calcDiscount(totalAmount, discountType, discountValue);

    const [cName, cPhone] = pick(customers);
    const created = setHours(
      subDays(now, dayOffset),
      9 + Math.floor(rng() * 11)
    );

    const pr = rng();
    const paymentMethod: PaymentMethodValue =
      pr < 0.15 ? "TRANSFER" : pr < 0.4 ? "VISA" : "CASH";
    const transferMethod: TransferMethodValue | null =
      paymentMethod === "TRANSFER"
        ? rng() < 0.5
          ? "VODAFONE_CASH"
          : "INSTAPAY"
        : null;
    const partial = rng() < 0.15;
    const paidAmount = partial ? round2(finalAmount * 0.6) : finalAmount;

    // ~25% منها طلبات توصيل بحالات متفاوتة
    const isDelivery = rng() < 0.25;
    const sources: OrderSourceValue[] = [
      "PHONE",
      "FACEBOOK",
      "INSTAGRAM",
      "WHATSAPP",
      "MESSENGER",
    ];
    const addresses = [
      "شارع 9، حدائق المعادي",
      "شارع 200، زهراء المعادي",
      "كورنيش المعادي، أمام نادي الصيد",
      "ميدان الحرية، المعادي الجديدة",
    ];
    const statuses: DeliveryStatusValue[] = [
      "NEW",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "DELIVERED",
      "DELIVERED",
      "RETURNED",
    ];

    let orderSource: OrderSourceValue | null = null;
    let deliveryMethod: DeliveryMethodValue | null = null;
    let deliveryAddress: string | null = null;
    let trackingNumber: string | null = null;
    let deliveryStatus: DeliveryStatusValue | null = null;

    if (isDelivery) {
      orderSource = sources[Math.floor(rng() * sources.length)];
      deliveryMethod = rng() < 0.5 ? "CUSTOM" : "BOSTA";
      deliveryAddress = addresses[Math.floor(rng() * addresses.length)];
      if (deliveryMethod === "BOSTA")
        trackingNumber = `BST-${Math.floor(rng() * 9000000 + 1000000)}`;
      deliveryStatus = statuses[Math.floor(rng() * statuses.length)];
    }

    store.sales.push({
      id: saleId,
      saleNumber: store.sales.length + 1,
      branch,
      totalAmount,
      discountType,
      discountValue,
      finalAmount,
      customerName: cName || null,
      customerPhone: cPhone || null,
      customerNotes: null,
      paymentMethod,
      transferMethod,
      invoiceNotes: null,
      paidAmount,
      remainingAmount: round2(finalAmount - paidAmount),
      changeAmount: null,
      cashierName: cashiers[Math.floor(rng() * cashiers.length)],
      status: "COMPLETED",
      cancellationReason: null,
      isDelivery,
      orderSource,
      deliveryMethod,
      deliveryAddress,
      addressNotes: null,
      trackingNumber,
      deliveryStatus,
      createdAt: created,
      items,
    });
  }

  // ترتيب أرقام الفواتير حسب التاريخ (الأقدم = الأصغر)
  store.sales.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  store.sales.forEach((s, idx) => (s.saleNumber = idx + 1));

  // اشتقاق البراندات من المنتجات (لكل فئة)
  for (const p of store.products) {
    if (
      !store.brands.some(
        (b) => b.name === p.brand && b.category === p.category
      )
    ) {
      store.brands.push({ id: id("b"), name: p.brand, category: p.category });
    }
  }

  // إلغاء آخر فاتورتين للعرض (مع إعادة الكميات للمخزون)
  for (const s of store.sales.slice(-2)) {
    s.status = "CANCELLED";
    s.cancellationReason = "طلب العميل";
    for (const it of s.items) {
      for (const p of store.products) {
        const v = p.variants.find((x) => x.id === it.variantId);
        if (v) {
          v.quantity += it.quantity;
          break;
        }
      }
    }
  }

  // عملاء تجريبيون: مُشتقّون من الفواتير المكتملة ذات اسم/هاتف
  const custByPhone = new Map<string, MCustomer>();
  for (const s of store.sales) {
    if (s.status === "CANCELLED") continue;
    const name = (s.customerName ?? "").trim();
    const phone = (s.customerPhone ?? "").trim();
    if (!name || !phone) continue;
    const existing = custByPhone.get(phone);
    if (existing) {
      existing.totalSpent = round2(existing.totalSpent + s.finalAmount);
      existing.visitCount += 1;
      if (!existing.lastVisitAt || s.createdAt > existing.lastVisitAt) {
        existing.lastVisitAt = s.createdAt;
        existing.branch = s.branch;
      }
    } else {
      custByPhone.set(phone, {
        id: id("cust"),
        name,
        phone,
        totalSpent: round2(s.finalAmount),
        visitCount: 1,
        lastVisitAt: s.createdAt,
        branch: s.branch,
        notes: null,
        createdAt: s.createdAt,
        updatedAt: s.createdAt,
      });
    }
  }
  store.customers = [...custByPhone.values()];

  // سجلات نشاط تجريبية
  const seedLogs: [string, string, string, string | null, number][] = [
    ["مدير النظام", "ADMIN", "تسجيل دخول", null, 0],
    ["محمود", "CASHIER", "تسجيل دخول", null, 0],
    [
      "محمود",
      "CASHIER",
      "إنشاء فاتورة",
      `فاتورة ${store.sales.length} — ${Math.round(
        store.sales[store.sales.length - 1]?.finalAmount ?? 0
      )} ج.م`,
      0,
    ],
    ["مدير النظام", "ADMIN", "إضافة منتج", "تيشيرت قطن كلاسيك", 1],
    ["ندى", "CASHIER", "تغيير حالة توصيل", "جاهز للشحن", 1],
    ["مدير النظام", "ADMIN", "إلغاء فاتورة", "طلب العميل", 2],
  ];
  for (const [userName, userRole, action, details, dayAgo] of seedLogs) {
    store.activityLogs.push({
      id: id("act"),
      userName,
      userRole,
      action,
      details,
      createdAt: setHours(subDays(now, dayAgo), 10 + Math.floor(rng() * 8)),
    });
  }
  store.activityLogs.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return store;
}

// تخزين على globalThis ليبقى عبر إعادة التحميل الساخن (HMR)
const g = globalThis as unknown as { __ebMockStore?: Store };
const store: Store = g.__ebMockStore ?? (g.__ebMockStore = buildStore());
const nextId = (p: string) => `${p}_${++store.seq}`;

// ----------------------------------------------------
//  التحويل إلى DTO
// ----------------------------------------------------
function shapeVariant(v: MVariant): VariantDTO {
  return {
    id: v.id,
    productId: v.productId,
    size: v.size,
    color: v.color,
    quantity: v.quantity,
    minQuantity: v.minQuantity,
    alertOnLowStock: v.alertOnLowStock ?? false,
    branch: v.branch,
    price: v.price,
    cost: v.cost ?? 0,
    sku: v.sku,
    skuManual: v.skuManual,
  };
}

function findProductType(id: string | null): MProductType | null {
  if (!id) return null;
  return store.productTypes.find((t) => t.id === id) ?? null;
}

function shapeProductType(t: MProductType): ProductTypeDTO {
  return { id: t.id, name: t.name, code: t.code, category: t.category };
}

function shapeProduct(
  p: MProduct,
  filter?: (v: MVariant) => boolean
): ProductDTO {
  const variants = (filter ? p.variants.filter(filter) : p.variants).map(
    shapeVariant
  );
  const type = findProductType(p.productTypeId);
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    sku: p.sku,
    barcode: p.barcode,
    images: p.images,
    productTypeId: p.productTypeId,
    productType: type ? shapeProductType(type) : null,
    variants,
    totalQuantity: variants.reduce((s, v) => s + v.quantity, 0),
    isDraft: p.isDraft ?? false,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function findVariant(
  variantId: string
): { product: MProduct; variant: MVariant } | null {
  for (const product of store.products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function shapeSale(s: MSale): SaleDTO {
  return {
    id: s.id,
    saleNumber: s.saleNumber,
    branch: s.branch,
    totalAmount: s.totalAmount,
    discountType: s.discountType,
    discountValue: s.discountValue,
    finalAmount: s.finalAmount,
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    customerNotes: s.customerNotes,
    paymentMethod: s.paymentMethod,
    transferMethod: s.transferMethod,
    invoiceNotes: s.invoiceNotes,
    paidAmount: s.paidAmount,
    remainingAmount: s.remainingAmount,
    changeAmount: s.changeAmount ?? null,
    cashierName: s.cashierName,
    status: s.status,
    cancellationReason: s.cancellationReason,
    isDelivery: s.isDelivery,
    orderSource: s.orderSource,
    deliveryMethod: s.deliveryMethod,
    deliveryAddress: s.deliveryAddress,
    addressNotes: s.addressNotes,
    trackingNumber: s.trackingNumber,
    deliveryStatus: s.deliveryStatus,
    createdAt: s.createdAt.toISOString(),
    unlockedAt: s.unlockedAt ? s.unlockedAt.toISOString() : null,
    unlockReason: s.unlockReason ?? null,
    items: s.items.map((it) => {
      const ref = findVariant(it.variantId);
      return {
        id: it.id,
        productId: it.productId,
        variantId: it.variantId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
        note: it.note ?? null,
        itemDiscount: it.itemDiscount ?? 0,
        itemDiscountType: it.itemDiscountType ?? "FIXED",
        productName: ref?.product.name ?? "—",
        brand: ref?.product.brand ?? "",
        size: ref?.variant.size ?? "—",
        color: ref?.variant.color ?? null,
        sku: ref?.variant.sku ?? null,
      };
    }),
    itemsCount: s.items.reduce((sum, it) => sum + it.quantity, 0),
  };
}

function shapeCustomer(c: MCustomer): CustomerDTO {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    totalSpent: c.totalSpent,
    visitCount: c.visitCount,
    lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
    branch: c.branch,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// تحديث/إنشاء عميل تلقائياً عند تأكيد بيعة برقم هاتف (مطابق لمنطق /api/sales الحقيقي)
function upsertCustomerOnSale(input: {
  phone: string | null;
  name: string | null;
  branch: BranchValue;
  finalAmount: number;
  saveAsNewCustomer: boolean;
}) {
  // يكفي وجود الاسم أو الهاتف
  if (!input.phone && !input.name) return;

  const existing = input.phone
    ? store.customers.find((c) => c.phone === input.phone)
    : undefined;
  if (existing) {
    existing.totalSpent = round2(existing.totalSpent + input.finalAmount);
    existing.visitCount += 1;
    existing.lastVisitAt = new Date();
    existing.updatedAt = new Date();
  } else if (input.saveAsNewCustomer && (input.phone || input.name)) {
    const now = new Date();
    store.customers.unshift({
      id: nextId("cust"),
      // هاتف فقط → اسم افتراضي «عميل»
      name: input.name || "عميل",
      phone: input.phone || null,
      totalSpent: round2(input.finalAmount),
      visitCount: 1,
      lastVisitAt: now,
      branch: input.branch,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ----------------------------------------------------
//  عمليات المنتجات
// ----------------------------------------------------
// ----- البراندات -----
function registerBrand(name: string, category: CategoryValue) {
  if (!name) return;
  if (!store.brands.some((b) => b.name === name && b.category === category)) {
    store.brands.push({ id: nextId("b"), name, category });
  }
}

export function mockListBrands(category?: string | null): BrandDTO[] {
  return store.brands
    .filter((b) => !category || b.category === category)
    .map((b) => ({ id: b.id, name: b.name, category: b.category }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export function mockCreateBrand(input: {
  name: string;
  category: CategoryValue;
}): BrandDTO {
  const found = store.brands.find(
    (b) => b.name === input.name && b.category === input.category
  );
  if (found) return { id: found.id, name: found.name, category: found.category };
  const b: MBrand = {
    id: nextId("b"),
    name: input.name,
    category: input.category,
  };
  store.brands.push(b);
  return { id: b.id, name: b.name, category: b.category };
}

export function mockUpdateBrand(
  id: string,
  name: string
): { ok: true; brand: BrandDTO } | { ok: false; status: number; error: string } {
  const b = store.brands.find((x) => x.id === id);
  if (!b) return { ok: false, status: 404, error: "البراند غير موجود" };
  if (b.name === name)
    return { ok: true, brand: { id: b.id, name: b.name, category: b.category } };
  // تعارض التفرّد داخل نفس الفئة
  if (
    store.brands.some(
      (x) => x.id !== id && x.name === name && x.category === b.category
    )
  )
    return { ok: false, status: 409, error: "يوجد براند بنفس الاسم في هذه الفئة" };
  // مزامنة المنتجات (نفس الفئة + الاسم القديم)
  for (const p of store.products) {
    if (p.brand === b.name && p.category === b.category) p.brand = name;
  }
  b.name = name;
  return { ok: true, brand: { id: b.id, name: b.name, category: b.category } };
}

export function mockDeleteBrand(id: string): boolean {
  const idx = store.brands.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  store.brands.splice(idx, 1);
  return true;
}

function soldCountByProduct(): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of store.sales)
    for (const it of s.items)
      m.set(it.productId, (m.get(it.productId) ?? 0) + it.quantity);
  return m;
}

export function mockListProducts(
  sp: URLSearchParams
): ProductDTO[] | ProductListPage {
  const search = sp.get("search")?.trim().toLowerCase();
  const branch = sp.get("branch") as BranchValue | null;
  const category = sp.get("category");
  const brand = sp.get("brand");
  const size = sp.get("size");
  const idsParam = sp.get("ids");
  const ids = idsParam
    ? new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  const withSales = sp.get("withSales") === "1";
  const sort = sp.get("sort");
  const bestselling = sort === "bestselling";
  const mostSold = sort === "mostSold";
  const lowestQty = sort === "lowestQty";
  const draftsOnly = sp.get("drafts") === "1";
  const statusParam = sp.get("status");
  const status =
    statusParam === "low" || statusParam === "out" ? statusParam : null;
  const withCounts = sp.get("withCounts") === "1";
  const limitRaw = Number(sp.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null;
  const pageRaw = Number(sp.get("page"));
  const perPageRaw = Number(sp.get("perPage"));
  const paginated = Number.isInteger(pageRaw) && pageRaw >= 1;
  const page = paginated ? pageRaw : 1;
  const perPage = Math.min(
    Number.isInteger(perPageRaw) && perPageRaw > 0 ? perPageRaw : 50,
    200
  );
  const hasVariantFilter = !!(branch || size);
  const soldMap =
    withSales || bestselling || mostSold ? soldCountByProduct() : null;

  const matchVariant = (v: MVariant) =>
    (!branch || v.branch === branch) && (!size || v.size === size);

  // مُحدِّدات الحالة على مستوى المنتج ضمن نطاق الفرع/المقاس (مطابقة للخادم).
  const inScope = (v: MVariant) => matchVariant(v);
  const isOut = (p: MProduct) =>
    p.variants.some((v) => inScope(v) && v.quantity === 0);
  const isLow = (p: MProduct) =>
    p.variants.some(
      (v) =>
        inScope(v) &&
        v.quantity > 0 &&
        (v.alertOnLowStock ?? false) &&
        v.quantity <= v.minQuantity
    );

  const base = store.products.filter((p) => {
    if (ids && !ids.has(p.id)) return false;
    if (draftsOnly && !(p.isDraft ?? false)) return false;
    if (category && p.category !== category) return false;
    if (brand && p.brand !== brand) return false;
    if (search && !ids) {
      const variantSkus = p.variants
        .map((v) => v.sku ?? "")
        .filter(Boolean)
        .join(" ");
      const nq = normalizeArabic(search);
      const hay = normalizeArabic(
        `${p.name} ${p.brand} ${p.sku ?? ""} ${p.barcode ?? ""} ${variantSkus}`
      );
      // مرادفات البراند (نايك ↔ Nike)
      if (nq && !expandBrandQuery(nq).some((t) => hay.includes(t))) return false;
    }
    if (hasVariantFilter && !p.variants.some(matchVariant)) return false;
    return true;
  });

  const counts = withCounts
    ? {
        all: base.length,
        low: base.filter(isLow).length,
        out: base.filter(isOut).length,
        draftsTotal: store.products.filter((p) => p.isDraft ?? false).length,
      }
    : null;

  // فلتر الحالة النشط
  const filtered =
    status === "low"
      ? base.filter(isLow)
      : status === "out"
        ? base.filter(isOut)
        : base;

  // الترتيب
  let ordered: MProduct[];
  if (bestselling && soldMap) {
    ordered = filtered
      .filter((p) => (soldMap.get(p.id) ?? 0) > 0)
      .sort((a, b) => (soldMap.get(b.id) ?? 0) - (soldMap.get(a.id) ?? 0));
  } else if (mostSold && soldMap) {
    ordered = [...filtered].sort(
      (a, b) => (soldMap.get(b.id) ?? 0) - (soldMap.get(a.id) ?? 0)
    );
  } else if (lowestQty) {
    const qty = (p: MProduct) =>
      p.variants.reduce((s, v) => s + v.quantity, 0);
    ordered = [...filtered].sort((a, b) => qty(a) - qty(b));
  } else {
    ordered = [...filtered].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  if (limit) ordered = ordered.slice(0, limit);

  const shape = (p: MProduct) => {
    const dto = shapeProduct(p, hasVariantFilter ? matchVariant : undefined);
    if (soldMap) dto.soldCount = soldMap.get(p.id) ?? 0;
    return dto;
  };

  if (paginated) {
    const total = ordered.length;
    const items = ordered
      .slice((page - 1) * perPage, (page - 1) * perPage + perPage)
      .map(shape);
    return {
      items,
      total,
      page,
      perPage,
      ...(counts ? { counts } : {}),
    };
  }

  return ordered.map(shape);
}

export function mockGetProduct(id: string): ProductDTO | null {
  const p = store.products.find((x) => x.id === id);
  return p ? shapeProduct(p) : null;
}

// البحث عن منتج عبر كود SKU لأي من أصنافه (لصفحة المنتج العامة)
export function mockGetProductBySku(sku: string): ProductDTO | null {
  const needle = sku.trim().toLowerCase();
  const p = store.products.find((x) =>
    x.variants.some((v) => (v.sku ?? "").toLowerCase() === needle)
  );
  return p ? shapeProduct(p) : null;
}

// بيانات موحّدة لصفحة الذكاء (وضع المعاينة)
export function mockNormalizedData(): {
  sales: NormSale[];
  products: NormProduct[];
} {
  const products: NormProduct[] = store.products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    totalQuantity: p.variants.reduce((s, v) => s + v.quantity, 0),
    variants: p.variants.map((v) => ({
      quantity: v.quantity,
      minQuantity: v.minQuantity,
      branch: v.branch,
      size: v.size,
      color: v.color,
    })),
  }));
  const sales: NormSale[] = store.sales
    .filter((s) => s.status !== "CANCELLED")
    .map((s) => ({
    branch: s.branch,
    finalAmount: s.finalAmount,
    totalAmount: s.totalAmount,
    createdAt: s.createdAt,
    items: s.items.map((it) => {
      const ref = findVariant(it.variantId);
      return {
        productId: it.productId,
        name: ref?.product.name ?? "—",
        brand: ref?.product.brand ?? "",
        category: ref?.product.category ?? "CLOTHES",
        quantity: it.quantity,
        subtotal: it.subtotal,
      };
    }),
  }));
  return { sales, products };
}

export function mockHomeStats(): HomeStats {
  const now = new Date();
  const returnsIn = (from: Date, to: Date): ReturnCashRow[] =>
    store.returns
      .filter((r) => r.createdAt >= from && r.createdAt <= to)
      .map((r) => ({
        branch: r.branch,
        type: r.type,
        refundTotal: r.refundTotal,
        exchangeDifference: r.exchangeDifference,
      }));

  const daily = (from: Date, to: Date, branch?: BranchValue): DailyCash => {
    let sales = 0;
    let count = 0;
    for (const s of store.sales)
      if (
        s.status !== "CANCELLED" &&
        s.createdAt >= from &&
        s.createdAt <= to &&
        (!branch || s.branch === branch)
      ) {
        sales += s.finalAmount;
        count++;
      }
    const rows = returnsIn(from, to).filter((r) => !branch || r.branch === branch);
    const rc = sumReturnCash(rows);
    const s = round2(sales);
    return {
      sales: s,
      count,
      refunds: rc.refunds,
      exchangeUpcharge: rc.exchangeUpcharge,
      netCash: computeNetCash(s, rc),
    };
  };

  const tFrom = startOfDay(now);
  const tTo = endOfDay(now);

  return {
    today: daily(tFrom, tTo),
    yesterday: daily(startOfDay(subDays(now, 1)), endOfDay(subDays(now, 1))),
    byBranch: BRANCHES.map((branch) => ({
      branch,
      today: daily(tFrom, tTo, branch),
    })),
  };
}

export function mockLowStock(): LowStockResponse {
  const items = store.products.flatMap((p) =>
    p.variants
      .filter((v) => v.quantity <= v.minQuantity)
      .map((v) => ({
        id: v.id,
        productName: p.name,
        brand: p.brand,
        branch: v.branch,
        size: v.size,
        color: v.color,
        quantity: v.quantity,
        minQuantity: v.minQuantity,
        alertOnLowStock: v.alertOnLowStock ?? false,
      }))
  );
  items.sort((a, b) => a.quantity - a.minQuantity - (b.quantity - b.minQuantity));
  return { count: items.length, items };
}

export function mockCreateProduct(input: ProductInput): ProductDTO {
  const pid = nextId("p");
  const type = findProductType(input.productTypeId ?? null);
  const takenSku = new Set<string>(
    store.products.flatMap((p) =>
      p.variants.map((v) => v.sku ?? "").filter(Boolean)
    )
  );
  const product: MProduct = {
    id: pid,
    name: input.name,
    brand: input.brand,
    category: input.category,
    description: input.description ?? null,
    sku: null,
    barcode: input.barcode ?? null,
    images: input.images,
    productTypeId: input.productTypeId ?? null,
    isDraft: input.isDraft ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: input.variants.map((v) => {
      const skuManual = !!v.sku && v.skuManual !== false;
      const sku = v.sku?.trim()
        ? uniquifySku(v.sku.trim(), takenSku)
        : uniquifySku(
            buildVariantSku({
              productId: pid,
              typeCode: type?.code ?? null,
              size: v.size,
              branch: v.branch,
              color: v.color,
            }),
            takenSku
          );
      return {
        id: nextId("v"),
        productId: pid,
        size: v.size,
        color: v.color,
        branch: v.branch,
        quantity: v.quantity,
        minQuantity: v.minQuantity,
        alertOnLowStock: v.alertOnLowStock ?? false,
        price: v.price,
        sku,
        skuManual,
      };
    }),
  };
  store.products.unshift(product);
  registerBrand(product.brand, product.category);
  return shapeProduct(product);
}

export function mockUpdateProduct(
  id: string,
  input: ProductInput
): ProductDTO | null {
  const product = store.products.find((x) => x.id === id);
  if (!product) return null;

  const keptIds = new Set(
    input.variants.map((v) => v.id).filter(Boolean) as string[]
  );
  const referenced = new Set(
    store.sales.flatMap((s) => s.items.map((it) => it.variantId))
  );

  // المقاسات المحذوفة: تُحذف ما لم تكن مرتبطة بفواتير (حينها تُصفّر)
  product.variants = product.variants.filter((v) => {
    if (keptIds.has(v.id)) return true;
    if (referenced.has(v.id)) {
      v.quantity = 0;
      return true;
    }
    return false;
  });

  const type = findProductType(input.productTypeId ?? null);
  // SKUs المستخدَمة عبر كل المنتجات (باستثناء أصناف هذا المنتج التي ستُعاد توليدها)
  const takenSku = new Set<string>();
  for (const p of store.products) {
    for (const v of p.variants) {
      if (p.id === product.id && !keptIds.has(v.id)) continue;
      if (v.sku) takenSku.add(v.sku);
    }
  }

  for (const vi of input.variants) {
    const existing = vi.id
      ? product.variants.find((v) => v.id === vi.id)
      : undefined;
    if (existing) {
      existing.size = vi.size;
      existing.color = vi.color;
      existing.branch = vi.branch;
      existing.quantity = vi.quantity;
      existing.minQuantity = vi.minQuantity;
      existing.alertOnLowStock = vi.alertOnLowStock ?? false;
      existing.price = vi.price;
      const explicit = vi.sku?.trim();
      if (explicit) {
        // SKU يدوي (أو محرَّر) — نمنع التكرار مع الباقي
        if (existing.sku) takenSku.delete(existing.sku);
        existing.sku = uniquifySku(explicit, takenSku);
        existing.skuManual = vi.skuManual !== false;
      } else if (!existing.skuManual) {
        // إعادة التوليد فقط لو لم يكن يدوياً
        if (existing.sku) takenSku.delete(existing.sku);
        existing.sku = uniquifySku(
          buildVariantSku({
            productId: product.id,
            typeCode: type?.code ?? null,
            size: vi.size,
            branch: vi.branch,
            color: vi.color,
          }),
          takenSku
        );
      } else if (existing.sku) {
        takenSku.add(existing.sku);
      }
    } else {
      const explicit = vi.sku?.trim();
      const sku = explicit
        ? uniquifySku(explicit, takenSku)
        : uniquifySku(
            buildVariantSku({
              productId: product.id,
              typeCode: type?.code ?? null,
              size: vi.size,
              branch: vi.branch,
              color: vi.color,
            }),
            takenSku
          );
      product.variants.push({
        id: nextId("v"),
        productId: product.id,
        size: vi.size,
        color: vi.color,
        branch: vi.branch,
        quantity: vi.quantity,
        minQuantity: vi.minQuantity,
        alertOnLowStock: vi.alertOnLowStock ?? false,
        price: vi.price,
        sku,
        skuManual: !!explicit && vi.skuManual !== false,
      });
    }
  }

  product.name = input.name;
  product.brand = input.brand;
  product.category = input.category;
  product.description = input.description ?? null;
  product.barcode = input.barcode ?? null;
  product.images = input.images;
  product.productTypeId = input.productTypeId ?? null;
  // إكمال المنتج عبر نموذج التعديل الكامل يُلغي علم المسودة
  product.isDraft = false;
  product.updatedAt = new Date();
  registerBrand(product.brand, product.category);

  return shapeProduct(product);
}

export function mockDeleteProduct(
  id: string
): { ok: true } | { ok: false; status: number; error: string } {
  const product = store.products.find((x) => x.id === id);
  if (!product) return { ok: false, status: 404, error: "المنتج غير موجود" };

  const hasSales = store.sales.some((s) =>
    s.items.some((it) => it.productId === id)
  );
  if (hasSales)
    return {
      ok: false,
      status: 409,
      error:
        "لا يمكن حذف منتج مرتبط بفواتير سابقة. يمكنك تصفير كمياته بدلاً من ذلك.",
    };

  store.products = store.products.filter((x) => x.id !== id);
  return { ok: true };
}

// استيراد الجرد بالجملة: تحديث الكميات/الأسعار وإضافة الجديد
export function mockImportInventory(rows: ImportRow[]): ImportResult {
  const result: ImportResult = {
    totalRows: rows.length,
    newProducts: 0,
    newVariants: 0,
    updatedVariants: 0,
  };

  for (const row of rows) {
    if (row.action === "skip") continue;
    const key = (s: string) => s.trim().toLowerCase();
    let product = store.products.find(
      (p) => key(p.name) === key(row.name) && key(p.brand) === key(row.brand)
    );

    // نوع المنتج (يُنشأ تلقائياً عند الحاجة)
    let typeId: string | null = null;
    if (row.productType) {
      let pt = store.productTypes.find(
        (t) =>
          t.name.trim().toLowerCase() === row.productType!.trim().toLowerCase() &&
          t.category === row.category
      );
      if (!pt) {
        const code = row.productType
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 4)
          .toUpperCase() || "GEN";
        pt = {
          id: nextId("pt"),
          name: row.productType,
          code,
          category: row.category,
        };
        store.productTypes.push(pt);
      }
      typeId = pt.id;
    }

    if (!product) {
      product = {
        id: nextId("p"),
        name: row.name,
        brand: row.brand,
        category: row.category,
        description: null,
        sku: null,
        barcode: null,
        images: [],
        productTypeId: typeId,
        isDraft: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        variants: [],
      };
      store.products.unshift(product);
      registerBrand(product.brand, product.category);
      result.newProducts++;
    } else if (typeId && !product.productTypeId) {
      product.productTypeId = typeId;
    }

    const variant = product.variants.find(
      (v) =>
        v.size === row.size &&
        v.branch === row.branch &&
        (v.color ?? null) === (row.color ?? null)
    );
    if (variant) {
      variant.quantity =
        row.action === "merge" ? variant.quantity + row.quantity : row.quantity;
      variant.price = row.price;
      if (row.sku) {
        variant.sku = row.sku;
        variant.skuManual = true;
      }
      result.updatedVariants++;
    } else {
      const type = findProductType(product.productTypeId);
      const takenSku = new Set<string>(
        store.products.flatMap((p) =>
          p.variants.map((v) => v.sku ?? "").filter(Boolean)
        )
      );
      const sku = row.sku
        ? uniquifySku(row.sku, takenSku)
        : uniquifySku(
            buildVariantSku({
              productId: product.id,
              typeCode: type?.code ?? null,
              size: row.size,
              branch: row.branch,
              color: row.color,
            }),
            takenSku
          );
      product.variants.push({
        id: nextId("v"),
        productId: product.id,
        size: row.size,
        color: row.color,
        branch: row.branch,
        quantity: row.quantity,
        minQuantity: 5,
        alertOnLowStock: false,
        price: row.price,
        sku,
        skuManual: !!row.sku,
      });
      result.newVariants++;
    }
    product.updatedAt = new Date();
  }

  return result;
}

// ----- أنواع المنتجات -----
// مزامنة أنواع المنتجات في الذاكرة مع القائمة الافتراضية الموحّدة — بنفس منطق
// مسار /api/seed/product-types: idempotent، تُضيف الناقص وتُحدّث الأكواد فقط،
// ولا تحذف أنواع المستخدم، وتُهاجر الأنواع المُعاد تسميتها (بلوزة → قميص).
export function mockSeedProductTypes(): {
  added: number;
  updated: number;
  total: number;
  mode: "mock";
} {
  let added = 0;
  let updated = 0;

  for (const def of DEFAULT_PRODUCT_TYPES) {
    const found = store.productTypes.find(
      (t) => t.name === def.name && t.category === def.category
    );
    if (!found) {
      store.productTypes.push({
        id: nextId("pt"),
        name: def.name,
        code: def.code,
        category: def.category,
      });
      added++;
    } else if (found.code !== def.code) {
      found.code = def.code;
      updated++;
    }
  }

  // هجرة الأنواع المُعاد تسميتها: إعادة ربط المنتجات بالنوع البديل ثم حذف القديم
  for (const ren of RENAMED_PRODUCT_TYPES) {
    const fromIdx = store.productTypes.findIndex(
      (t) => t.name === ren.from && t.category === ren.category
    );
    if (fromIdx === -1) continue;
    const fromType = store.productTypes[fromIdx];
    const target = store.productTypes.find(
      (t) => t.name === ren.to && t.category === ren.category
    );
    if (target) {
      for (const p of store.products) {
        if (p.productTypeId === fromType.id) p.productTypeId = target.id;
      }
    }
    store.productTypes.splice(fromIdx, 1);
  }

  return { added, updated, total: store.productTypes.length, mode: "mock" };
}

export function mockListProductTypes(
  category?: string | null
): ProductTypeDTO[] {
  // مزامنة تلقائية مع أحدث الأنواع الافتراضية عند فتح القائمة (دون إعادة تشغيل)
  mockSeedProductTypes();
  return store.productTypes
    .filter((t) => !category || t.category === category)
    .map(shapeProductType)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export function mockCreateProductType(input: ProductTypeInput): ProductTypeDTO {
  const found = store.productTypes.find(
    (t) => t.name === input.name && t.category === input.category
  );
  if (found) {
    found.code = input.code; // ندعم التحديث (idempotent مع تعديل الكود)
    return shapeProductType(found);
  }
  const t: MProductType = {
    id: nextId("pt"),
    name: input.name,
    code: input.code,
    category: input.category,
  };
  store.productTypes.push(t);
  return shapeProductType(t);
}

export function mockUpdateProductType(
  id: string,
  input: ProductTypeInput
):
  | { ok: true; type: ProductTypeDTO }
  | { ok: false; status: number; error: string } {
  const t = store.productTypes.find((x) => x.id === id);
  if (!t) return { ok: false, status: 404, error: "النوع غير موجود" };
  if (
    store.productTypes.some(
      (x) =>
        x.id !== id &&
        x.name === input.name &&
        x.category === input.category
    )
  )
    return { ok: false, status: 409, error: "يوجد نوع بنفس الاسم في هذه الفئة" };
  t.name = input.name;
  t.code = input.code;
  t.category = input.category;
  return { ok: true, type: shapeProductType(t) };
}

export function mockDeleteProductType(id: string): boolean {
  const idx = store.productTypes.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.productTypes.splice(idx, 1);
  // FK behaviour: SET NULL على المنتجات
  for (const p of store.products) {
    if (p.productTypeId === id) p.productTypeId = null;
  }
  return true;
}

// ----- سجل النشاط -----
function shapeActivity(a: MActivityLog): ActivityLogDTO {
  return {
    id: a.id,
    userName: a.userName,
    userRole: a.userRole,
    action: a.action,
    details: a.details,
    createdAt: a.createdAt.toISOString(),
  };
}

export function mockListActivity(
  sp: URLSearchParams
): ActivityLogDTO[] | Paginated<ActivityLogDTO> {
  const user = sp.get("user")?.trim();
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  const limit = Math.min(Number(sp.get("limit")) || 200, 1000);

  const matched = store.activityLogs
    .filter((a) => {
      if (user && a.userName !== user) return false;
      if (from && a.createdAt < from) return false;
      if (to && a.createdAt > to) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(shapeActivity);

  const pageRaw = Number(sp.get("page"));
  if (Number.isInteger(pageRaw) && pageRaw >= 1) {
    const perPage = Math.min(Number(sp.get("perPage")) || 20, 200);
    const items = matched.slice((pageRaw - 1) * perPage, pageRaw * perPage);
    return { items, total: matched.length, page: pageRaw, perPage };
  }

  return matched.slice(0, limit);
}

export function mockCreateActivity(input: ActivityLogInput): ActivityLogDTO {
  const log: MActivityLog = {
    id: nextId("act"),
    userName: input.userName,
    userRole: input.userRole,
    action: input.action,
    details: input.details ?? null,
    createdAt: new Date(),
  };
  store.activityLogs.unshift(log);
  return shapeActivity(log);
}

// ----- طلبات دخول الكاشير (نسيت كلمة المرور) -----
function shapeAccessRequest(a: MAccessRequest): AccessRequestDTO {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
  };
}

export function mockListAccessRequests(
  sp: URLSearchParams
): AccessRequestDTO[] | Paginated<AccessRequestDTO> {
  const status = sp.get("status")?.trim();
  const limit = Math.min(Number(sp.get("limit")) || 100, 500);
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;

  const matched = store.accessRequests
    .filter((a) => {
      if (status && a.status !== status) return false;
      if (from && a.createdAt < from) return false;
      if (to && a.createdAt > to) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(shapeAccessRequest);

  const pageRaw = Number(sp.get("page"));
  if (Number.isInteger(pageRaw) && pageRaw >= 1) {
    const perPage = Math.min(Number(sp.get("perPage")) || 20, 200);
    const items = matched.slice((pageRaw - 1) * perPage, pageRaw * perPage);
    return { items, total: matched.length, page: pageRaw, perPage };
  }

  return matched.slice(0, limit);
}

export function mockGetAccessRequest(id: string): AccessRequestDTO | null {
  const a = store.accessRequests.find((x) => x.id === id);
  return a ? shapeAccessRequest(a) : null;
}

export function mockCreateAccessRequest(input: {
  name: string;
}): AccessRequestDTO {
  const a: MAccessRequest = {
    id: nextId("areq"),
    name: input.name,
    status: "PENDING",
    createdAt: new Date(),
    resolvedAt: null,
  };
  store.accessRequests.unshift(a);
  return shapeAccessRequest(a);
}

export function mockUpdateAccessRequestStatus(
  id: string,
  status: "APPROVED" | "REJECTED"
): AccessRequestDTO | null {
  const a = store.accessRequests.find((x) => x.id === id);
  if (!a) return null;
  a.status = status;
  a.resolvedAt = new Date();
  return shapeAccessRequest(a);
}

// ----- استرجاع حساب المدير (سؤال الأمان) -----
export function mockGetAdminRecovery(): AdminRecoveryStatus {
  const question = store.settings[ADMIN_RECOVERY_QUESTION_KEY] ?? null;
  const answer = store.settings[ADMIN_RECOVERY_ANSWER_KEY] ?? null;
  return { configured: !!(question && answer), question };
}

export function mockSetupAdminRecovery(
  question: string,
  answer: string
): AdminRecoveryStatus {
  store.settings[ADMIN_RECOVERY_QUESTION_KEY] = question;
  store.settings[ADMIN_RECOVERY_ANSWER_KEY] = normalizeAnswer(answer);
  return { configured: true, question };
}

export function mockVerifyAdminRecovery(answer: string): { ok: boolean } {
  const stored = store.settings[ADMIN_RECOVERY_ANSWER_KEY] ?? null;
  if (!stored) return { ok: false };
  return { ok: normalizeAnswer(answer) === stored };
}

// ----------------------------------------------------
//  عمليات العملاء
// ----------------------------------------------------
export function mockListCustomers(sp: URLSearchParams): CustomerListResponse {
  // مطابقة تامة برقم الهاتف (للملء التلقائي في POS)
  const phone = sp.get("phone")?.trim();
  if (phone) {
    const c = store.customers.find((x) => x.phone === phone);
    return {
      customers: c ? [shapeCustomer(c)] : [],
      total: c ? 1 : 0,
      page: 1,
      pageSize: 1,
    };
  }

  const search = sp.get("search")?.trim();
  const sort = sp.get("sort"); // totalSpent | lastVisitAt
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("pageSize")) || 20, 1), 100);

  let list = [...store.customers];
  if (search) {
    // بحث موحّد عربي↔إنجليزي (نفس منطق الخادم)
    list = list.filter((c) => matchesWithBrandAliases([c.name, c.phone], search));
  }

  if (sort === "totalSpent") list.sort((a, b) => b.totalSpent - a.totalSpent);
  else if (sort === "lastVisitAt")
    list.sort(
      (a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0)
    );
  else list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = list.length;
  const start = (page - 1) * pageSize;
  const customers = list.slice(start, start + pageSize).map(shapeCustomer);

  return { customers, total, page, pageSize };
}

// كبار العملاء (VIP) — يعكس كل فلاتر /api/customers/vip على بيانات المحاكاة
export function mockListVipCustomers(sp: URLSearchParams): VipCustomerDTO[] {
  const LIMIT = 50;
  const filter = sp.get("filter") ?? "spenders";
  const branch = sp.get("branch");
  const category = sp.get("category") ?? "CLOTHES";
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const toDto = (c: MCustomer): VipCustomerDTO => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    visitCount: c.visitCount,
    totalSpent: c.totalSpent,
    avgSale: c.visitCount > 0 ? round2(c.totalSpent / c.visitCount) : 0,
    lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
    branch: c.branch,
  });

  let list = [...store.customers];

  switch (filter) {
    case "frequent":
      list.sort(
        (a, b) => b.visitCount - a.visitCount || b.totalSpent - a.totalSpent
      );
      break;
    case "branch":
      list = list
        .filter((c) => !branch || c.branch === branch)
        .sort((a, b) => b.totalSpent - a.totalSpent);
      break;
    case "atrisk":
      list = list
        .filter((c) => c.lastVisitAt && c.lastVisitAt.getTime() < cutoff)
        .sort((a, b) => b.totalSpent - a.totalSpent);
      break;
    case "new":
      list = list
        .filter((c) => c.createdAt.getTime() >= cutoff)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      break;
    case "avg":
      list = list
        .filter((c) => c.visitCount > 0)
        .sort(
          (a, b) => b.totalSpent / b.visitCount - a.totalSpent / a.visitCount
        );
      break;
    case "category": {
      // الفئة الأكثر شراءً لكل عميل عبر هاتف الفاتورة
      const byPhone = new Map<string, Map<string, number>>();
      for (const s of store.sales) {
        if (s.status === "CANCELLED") continue;
        const phone = s.customerPhone;
        if (!phone) continue;
        for (const it of s.items) {
          const prod = store.products.find((p) => p.id === it.productId);
          if (!prod) continue;
          const m = byPhone.get(phone) ?? new Map<string, number>();
          m.set(prod.category, (m.get(prod.category) ?? 0) + it.quantity);
          byPhone.set(phone, m);
        }
      }
      const phones = new Set<string>();
      for (const [phone, m] of byPhone) {
        let bestCat: string | null = null;
        let best = -1;
        for (const [cat, q] of m) {
          if (q > best) {
            best = q;
            bestCat = cat;
          }
        }
        if (bestCat === category) phones.add(phone);
      }
      list = list
        .filter((c) => c.phone != null && phones.has(c.phone))
        .sort((a, b) => b.totalSpent - a.totalSpent);
      break;
    }
    case "spenders":
    default:
      list.sort((a, b) => b.totalSpent - a.totalSpent);
  }

  return list.slice(0, LIMIT).map(toDto);
}

export function mockGetCustomer(
  id: string,
  sp?: URLSearchParams
): (CustomerDTO & { sales: SaleDTO[]; salesTotal: number }) | null {
  const c = store.customers.find((x) => x.id === id);
  if (!c) return null;
  const from = sp?.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp?.get("to") ? new Date(sp.get("to")!) : null;

  const matched = store.sales
    .filter((s) => {
      if (s.customerPhone !== c.phone) return false;
      if (from && s.createdAt < from) return false;
      if (to && s.createdAt > to) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const pageRaw = Number(sp?.get("page"));
  let paged = matched;
  if (Number.isInteger(pageRaw) && pageRaw >= 1) {
    const perPage = Math.min(Number(sp?.get("perPage")) || 20, 200);
    paged = matched.slice((pageRaw - 1) * perPage, pageRaw * perPage);
  }

  return {
    ...shapeCustomer(c),
    sales: paged.map(shapeSale),
    salesTotal: matched.length,
  };
}

export function mockCreateCustomer(input: CustomerInput): CustomerDTO {
  if (input.phone && store.customers.some((c) => c.phone === input.phone))
    throw new ValidationError("يوجد عميل مسجّل بهذا الرقم بالفعل");
  const now = new Date();
  const c: MCustomer = {
    id: nextId("cust"),
    name: input.name,
    phone: input.phone,
    totalSpent: 0,
    visitCount: 0,
    lastVisitAt: null,
    branch: input.branch ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  store.customers.unshift(c);
  return shapeCustomer(c);
}

export function mockUpdateCustomer(
  id: string,
  input: CustomerUpdateInput
): CustomerDTO | null {
  const c = store.customers.find((x) => x.id === id);
  if (!c) return null;
  if (input.name !== undefined) c.name = input.name;
  if (input.notes !== undefined) c.notes = input.notes;
  if (input.branch !== undefined) c.branch = input.branch;
  c.updatedAt = new Date();
  return shapeCustomer(c);
}

// ----------------------------------------------------
//  عمليات الفواتير
// ----------------------------------------------------
export function mockListSales(
  sp: URLSearchParams
): SaleDTO[] | SalesListResponse {
  const branch = sp.get("branch") as BranchValue | null;
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  const search = sp.get("search")?.trim();
  const payment = sp.get("payment"); // CASH/VISA/VODAFONE_CASH/INSTAPAY
  const status = sp.get("status"); // COMPLETED/CANCELLED/REMAINING
  const limit = Math.min(Number(sp.get("limit")) || 500, 100000);
  const pageRaw = Number(sp.get("page"));
  const paginated = Number.isInteger(pageRaw) && pageRaw >= 1;
  const page = paginated ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number(sp.get("pageSize")) || 50, 1), 200);

  const productName = (variantId: string) =>
    findVariant(variantId)?.product.name ?? "";

  let list = [...store.sales];
  if (branch) list = list.filter((s) => s.branch === branch);
  if (from) list = list.filter((s) => s.createdAt >= from);
  if (to) list = list.filter((s) => s.createdAt <= to);

  if (payment === "CASH" || payment === "VISA")
    list = list.filter((s) => s.paymentMethod === payment);
  else if (payment === "VODAFONE_CASH" || payment === "INSTAPAY")
    list = list.filter(
      (s) => s.paymentMethod === "TRANSFER" && s.transferMethod === payment
    );

  if (status === "COMPLETED") list = list.filter((s) => s.status === "COMPLETED");
  else if (status === "CANCELLED")
    list = list.filter((s) => s.status === "CANCELLED");
  else if (status === "REMAINING")
    list = list.filter((s) => s.status !== "CANCELLED" && s.remainingAmount > 0);

  if (search) {
    const num = Number(search.replace(/[#\s]/g, ""));
    const q = search.toLowerCase();
    list = list.filter(
      (s) =>
        (Number.isInteger(num) && s.saleNumber === num) ||
        (s.customerName ?? "").toLowerCase().includes(q) ||
        (s.customerPhone ?? "").includes(search) ||
        s.items.some((it) => productName(it.variantId).toLowerCase().includes(q))
    );
  }

  const sorted = list.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  if (!paginated) {
    return sorted.slice(0, limit).map(shapeSale);
  }

  // ملخّص كامل المجموعة المفلترة (لا الصفحة الحالية)
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let totalSales = 0;
  let count = 0;
  let discounts = 0;
  let remaining = 0;
  let cancelledCount = 0;
  let cancelledValue = 0;
  for (const s of sorted) {
    if (s.status === "CANCELLED") {
      cancelledCount++;
      cancelledValue += s.finalAmount;
    } else {
      count++;
      totalSales += s.finalAmount;
      discounts += s.totalAmount - s.finalAmount;
      remaining += s.remainingAmount;
    }
  }
  const total = sorted.length;
  const pageItems = sorted
    .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    .map(shapeSale);
  return {
    sales: pageItems,
    total,
    page,
    pageSize,
    summary: {
      totalSales: r2(totalSales),
      count,
      discounts: r2(discounts),
      remaining: r2(remaining),
      cancelledCount,
      cancelledValue: r2(cancelledValue),
    },
  };
}

export function mockGetSale(id: string): SaleDTO | null {
  const s = store.sales.find((x) => x.id === id);
  return s ? shapeSale(s) : null;
}

interface MockMergedItem {
  quantity: number;
  note: string | null;
  itemDiscount: number;
  itemDiscountType: DiscountTypeValue;
}

// دمج الأصناف المكررة (وضع المعاينة): تجميع الكمية مع إبقاء ملاحظة/خصم الصنف
function mockMergeItems(items: SaleInput["items"]): Map<string, MockMergedItem> {
  const merged = new Map<string, MockMergedItem>();
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

export function mockCreateSale(input: SaleInput): SaleDTO {
  const merged = mockMergeItems(input.items);

  let totalAmount = 0;
  const items: MItem[] = [];
  const saleId = nextId("s");

  for (const [variantId, m] of merged.entries()) {
    const ref = findVariant(variantId);
    if (!ref) throw new ValidationError("أحد المنتجات لم يعد متاحاً في المخزون");
    if (ref.variant.branch !== input.branch)
      throw new ValidationError(
        `المنتج "${ref.product.name}" لا ينتمي للفرع المحدد`
      );
    if (ref.variant.quantity < m.quantity)
      throw new ValidationError(
        `الكمية غير كافية من "${ref.product.name}" مقاس ${ref.variant.size} (المتاح: ${ref.variant.quantity})`
      );

    const { net } = calcItemNet(
      ref.variant.price,
      m.quantity,
      m.itemDiscount,
      m.itemDiscountType
    );
    totalAmount += net;
    items.push({
      id: nextId("si"),
      saleId,
      productId: ref.product.id,
      variantId,
      quantity: m.quantity,
      unitPrice: ref.variant.price,
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

  // خصم المخزون
  for (const [variantId, m] of merged.entries()) {
    findVariant(variantId)!.variant.quantity -= m.quantity;
  }

  const saleNumber =
    store.sales.reduce((max, s) => Math.max(max, s.saleNumber), 0) + 1;

  const paidAmount =
    input.paidAmount == null
      ? finalAmount
      : Math.min(Math.max(input.paidAmount, 0), finalAmount);

  const sale: MSale = {
    id: saleId,
    saleNumber,
    branch: input.branch,
    totalAmount,
    discountType: input.discountType,
    discountValue: input.discountValue,
    finalAmount,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    customerNotes: input.customerNotes ?? null,
    paymentMethod: input.paymentMethod,
    transferMethod: input.transferMethod ?? null,
    invoiceNotes: input.invoiceNotes ?? null,
    paidAmount: round2(paidAmount),
    remainingAmount: round2(finalAmount - paidAmount),
    changeAmount:
      input.changeAmount == null ? null : round2(Math.max(input.changeAmount, 0)),
    cashierName: input.cashierName ?? null,
    status: "COMPLETED",
    cancellationReason: null,
    isDelivery: !!input.delivery,
    orderSource: input.delivery?.orderSource ?? null,
    deliveryMethod: input.delivery?.deliveryMethod ?? null,
    deliveryAddress: input.delivery?.deliveryAddress ?? null,
    addressNotes: input.delivery?.addressNotes ?? null,
    trackingNumber: input.delivery?.trackingNumber ?? null,
    deliveryStatus: input.delivery ? "NEW" : null,
    createdAt: new Date(),
    items,
  };
  store.sales.push(sale);

  upsertCustomerOnSale({
    phone: input.customerPhone ?? null,
    name: input.customerName ?? null,
    branch: input.branch,
    finalAmount: sale.finalAmount,
    saveAsNewCustomer: !!input.saveAsNewCustomer,
  });

  return shapeSale(sale);
}

// قائمة طلبات التوصيل (للفلاتر)
const ACTIVE_DELIVERY_STATUSES: DeliveryStatusValue[] = [
  "NEW",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
];

export function mockListDelivery(
  sp: URLSearchParams
): SaleDTO[] | DeliveryListResponse {
  const branch = sp.get("branch") as BranchValue | null;
  const status = sp.get("status");
  const method = sp.get("method") as DeliveryMethodValue | null;
  const source = sp.get("source");
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  const pageRaw = Number(sp.get("page"));
  const paginated = Number.isInteger(pageRaw) && pageRaw >= 1;
  const page = paginated ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number(sp.get("pageSize")) || 20, 1), 100);

  // القاعدة بدون فلتر الحالة (لأعداد الحالات)
  let base = store.sales.filter((s) => s.isDelivery);
  if (branch) base = base.filter((s) => s.branch === branch);
  if (method) base = base.filter((s) => s.deliveryMethod === method);
  if (source) base = base.filter((s) => s.orderSource === source);
  if (from) base = base.filter((s) => s.createdAt >= from);
  if (to) base = base.filter((s) => s.createdAt <= to);

  // فلتر الحالة للقائمة
  const matchesStatus = (s: (typeof base)[number]) =>
    status === "ACTIVE"
      ? ACTIVE_DELIVERY_STATUSES.includes(s.deliveryStatus as DeliveryStatusValue)
      : status
        ? s.deliveryStatus === status
        : true;

  const list = base
    .filter(matchesStatus)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (!paginated) return list.map(shapeSale);

  const inTransit = base.filter((s) =>
    ACTIVE_DELIVERY_STATUSES.includes(s.deliveryStatus as DeliveryStatusValue)
  ).length;
  const delivered = base.filter((s) => s.deliveryStatus === "DELIVERED").length;
  const returned = base.filter((s) => s.deliveryStatus === "RETURNED").length;

  return {
    orders: list
      .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
      .map(shapeSale),
    total: list.length,
    page,
    pageSize,
    summary: { total: base.length, inTransit, delivered, returned },
  };
}

// تحديث حالة التوصيل — مع إعادة الكميات للمخزون عند «مرتجع»
export function mockUpdateDeliveryStatus(
  id: string,
  status: DeliveryStatusValue
): { ok: true; sale: SaleDTO } | { ok: false; status: number; error: string } {
  const sale = store.sales.find((s) => s.id === id);
  if (!sale) return { ok: false, status: 404, error: "الطلب غير موجود" };
  if (!sale.isDelivery)
    return { ok: false, status: 422, error: "هذه ليست فاتورة توصيل" };
  if (sale.deliveryStatus === status) {
    return { ok: true, sale: shapeSale(sale) };
  }

  // إذا انتقلنا إلى «مرتجع» من حالة غير مرتجعة، أعد الكميات للمخزون
  const wasReturned = sale.deliveryStatus === "RETURNED";
  if (status === "RETURNED" && !wasReturned) {
    for (const it of sale.items) {
      const ref = findVariant(it.variantId);
      if (ref) ref.variant.quantity += it.quantity;
    }
  } else if (wasReturned && status !== "RETURNED") {
    // إذا تراجعت عن «مرتجع» إلى حالة أخرى، اخصم الكميات مجدداً
    for (const it of sale.items) {
      const ref = findVariant(it.variantId);
      if (ref)
        ref.variant.quantity = Math.max(0, ref.variant.quantity - it.quantity);
    }
  }

  sale.deliveryStatus = status;
  return { ok: true, sale: shapeSale(sale) };
}

// إلغاء فاتورة وإعادة الكميات للمخزون
export function mockCancelSale(
  id: string,
  reason: string
): { ok: true; sale: SaleDTO } | { ok: false; status: number; error: string } {
  const sale = store.sales.find((s) => s.id === id);
  if (!sale) return { ok: false, status: 404, error: "الفاتورة غير موجودة" };
  if (sale.status === "CANCELLED")
    return { ok: false, status: 409, error: "الفاتورة ملغية بالفعل" };

  for (const it of sale.items) {
    const ref = findVariant(it.variantId);
    if (ref) ref.variant.quantity += it.quantity;
  }
  sale.status = "CANCELLED";
  sale.cancellationReason = reason || "—";
  return { ok: true, sale: shapeSale(sale) };
}

// تعديل كامل للفاتورة — إرجاع الكميات القديمة ثم خصم الجديدة وإعادة حساب الإجماليات
export function mockUpdateSale(
  id: string,
  input: SaleInput
): { ok: true; sale: SaleDTO } | { ok: false; status: number; error: string } {
  const sale = store.sales.find((s) => s.id === id);
  if (!sale) return { ok: false, status: 404, error: "الفاتورة غير موجودة" };
  if (sale.status === "CANCELLED")
    return { ok: false, status: 409, error: "لا يمكن تعديل فاتورة ملغية" };

  // 1) إرجاع كميات العناصر القديمة
  for (const it of sale.items) {
    const ref = findVariant(it.variantId);
    if (ref) ref.variant.quantity += it.quantity;
  }

  // 2) التحقق من العناصر الجديدة (بعد الإرجاع)
  const merged = mockMergeItems(input.items);

  const rollback = () => {
    // إعادة الحالة كما كانت: اخصم القديمة مرة أخرى
    for (const it of sale.items) {
      const ref = findVariant(it.variantId);
      if (ref) ref.variant.quantity -= it.quantity;
    }
  };

  let totalAmount = 0;
  const items: MItem[] = [];
  for (const [variantId, m] of merged.entries()) {
    const ref = findVariant(variantId);
    if (!ref) {
      rollback();
      return {
        ok: false,
        status: 422,
        error: "أحد المنتجات لم يعد متاحاً في المخزون",
      };
    }
    if (ref.variant.branch !== input.branch) {
      rollback();
      return {
        ok: false,
        status: 422,
        error: `المنتج "${ref.product.name}" لا ينتمي للفرع المحدد`,
      };
    }
    if (ref.variant.quantity < m.quantity) {
      // احسب المتاح قبل الاسترجاع كي تُظهر الرسالة الرقم الصحيح
      const avail = ref.variant.quantity;
      rollback();
      return {
        ok: false,
        status: 422,
        error: `الكمية غير كافية من "${ref.product.name}" مقاس ${ref.variant.size} (المتاح: ${avail})`,
      };
    }
    const { net } = calcItemNet(
      ref.variant.price,
      m.quantity,
      m.itemDiscount,
      m.itemDiscountType
    );
    totalAmount += net;
    items.push({
      id: nextId("si"),
      saleId: sale.id,
      productId: ref.product.id,
      variantId,
      quantity: m.quantity,
      unitPrice: ref.variant.price,
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

  // 3) خصم الكميات الجديدة
  for (const [variantId, m] of merged.entries()) {
    findVariant(variantId)!.variant.quantity -= m.quantity;
  }

  const paidAmount =
    input.paidAmount == null
      ? finalAmount
      : Math.min(Math.max(input.paidAmount, 0), finalAmount);

  // 4) تحديث بيانات الفاتورة
  sale.branch = input.branch;
  sale.totalAmount = totalAmount;
  sale.discountType = input.discountType;
  sale.discountValue = input.discountValue;
  sale.finalAmount = finalAmount;
  sale.customerName = input.customerName ?? null;
  sale.customerPhone = input.customerPhone ?? null;
  sale.customerNotes = input.customerNotes ?? null;
  sale.paymentMethod = input.paymentMethod;
  sale.transferMethod = input.transferMethod ?? null;
  sale.invoiceNotes = input.invoiceNotes ?? null;
  sale.paidAmount = round2(paidAmount);
  sale.remainingAmount = round2(finalAmount - paidAmount);
  sale.isDelivery = !!input.delivery;
  sale.orderSource = input.delivery?.orderSource ?? null;
  sale.deliveryMethod = input.delivery?.deliveryMethod ?? null;
  sale.deliveryAddress = input.delivery?.deliveryAddress ?? null;
  sale.addressNotes = input.delivery?.addressNotes ?? null;
  sale.trackingNumber = input.delivery?.trackingNumber ?? null;
  sale.deliveryStatus = input.delivery
    ? sale.deliveryStatus ?? "NEW"
    : null;
  sale.items = items;

  const dto = shapeSale(sale);
  dto.lastEditedAt = new Date().toISOString();
  return { ok: true, sale: dto };
}

// ----------------------------------------------------
//  لوحة التحكم والتقارير
// ----------------------------------------------------
function rangeBounds(sp: URLSearchParams, defaultDays: number) {
  const now = new Date();
  const from = sp.get("from")
    ? new Date(sp.get("from")!)
    : subDays(startOfDay(now), defaultDays);
  const to = sp.get("to") ? new Date(sp.get("to")!) : endOfDay(now);
  return { from, to, now };
}

type PaymentKey = "CASH" | "VISA" | "VODAFONE_CASH" | "INSTAPAY";

export function mockDashboard(sp: URLSearchParams): DashboardStats {
  const { from, to, now } = rangeBounds(sp, 6);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yStart = startOfDay(subDays(now, 1));
  const yEnd = endOfDay(subDays(now, 1));

  const inRange = store.sales.filter(
    (s) => s.status !== "CANCELLED" && s.createdAt >= from && s.createdAt <= to
  );
  const todayList = store.sales.filter(
    (s) =>
      s.status !== "CANCELLED" &&
      s.createdAt >= todayStart &&
      s.createdAt <= todayEnd
  );
  const yList = store.sales.filter(
    (s) =>
      s.status !== "CANCELLED" && s.createdAt >= yStart && s.createdAt <= yEnd
  );

  const branchMap = new Map<BranchValue, { total: number; count: number }>();
  for (const b of BRANCHES) branchMap.set(b, { total: 0, count: 0 });

  const dayBuckets = new Map<string, number>();
  for (const d of eachDayOfInterval({ start: from, end: to }))
    dayBuckets.set(format(d, "yyyy-MM-dd"), 0);

  const categoryMap = new Map<CategoryValue, { total: number; qty: number }>();
  const productMap = new Map<
    string,
    {
      name: string;
      brand: string;
      qty: number;
      revenue: number;
      cost: number;
      image: string | null;
    }
  >();
  const brandMap = new Map<string, { qty: number; revenue: number }>();
  const sizeMap = new Map<string, { qty: number; revenue: number }>();
  let cogs = 0; // Part D
  const customerMap = new Map<
    string,
    { name: string; phone: string | null; total: number; count: number }
  >();
  const paymentMap = new Map<PaymentKey, { total: number; count: number }>();
  const cashierMap = new Map<
    string,
    { count: number; total: number; max: number }
  >();

  const customerKey = (name: string | null, phone: string | null) =>
    `${(name ?? "").trim()}|${(phone ?? "").trim()}`;

  let rangeTotal = 0;
  let grossSales = 0;
  let discountedCount = 0;
  let itemsSold = 0;
  let maxInvoice = 0;
  let deliveryCount = 0;
  let pickupCount = 0;
  let returnedCount = 0;

  for (const sale of inRange) {
    rangeTotal += sale.finalAmount;
    grossSales += sale.totalAmount;
    if (sale.finalAmount > maxInvoice) maxInvoice = sale.finalAmount;
    if (sale.totalAmount - sale.finalAmount > 0.001) discountedCount++;

    const cname = (sale.customerName ?? "").trim();
    if (cname || sale.customerPhone) {
      const ck = customerKey(sale.customerName, sale.customerPhone);
      const cust = customerMap.get(ck) ?? {
        name: cname || "—",
        phone: sale.customerPhone ?? null,
        total: 0,
        count: 0,
      };
      cust.total += sale.finalAmount;
      cust.count += 1;
      customerMap.set(ck, cust);
    }

    const b = branchMap.get(sale.branch)!;
    b.total += sale.finalAmount;
    b.count += 1;

    const cashier = (sale.cashierName ?? "").trim();
    if (cashier) {
      const cs = cashierMap.get(cashier) ?? { count: 0, total: 0, max: 0 };
      cs.count += 1;
      cs.total += sale.finalAmount;
      if (sale.finalAmount > cs.max) cs.max = sale.finalAmount;
      cashierMap.set(cashier, cs);
    }

    const key = format(sale.createdAt, "yyyy-MM-dd");
    if (dayBuckets.has(key))
      dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + sale.finalAmount);

    let pk: PaymentKey;
    if (sale.paymentMethod === "TRANSFER") {
      pk = sale.transferMethod === "INSTAPAY" ? "INSTAPAY" : "VODAFONE_CASH";
    } else {
      pk = sale.paymentMethod === "VISA" ? "VISA" : "CASH";
    }
    const pm = paymentMap.get(pk) ?? { total: 0, count: 0 };
    pm.total += sale.finalAmount;
    pm.count += 1;
    paymentMap.set(pk, pm);

    if (sale.isDelivery) {
      deliveryCount += 1;
      if (sale.deliveryStatus === "RETURNED") returnedCount += 1;
    } else {
      pickupCount += 1;
    }

    for (const item of sale.items) {
      itemsSold += item.quantity;
      const ref = findVariant(item.variantId);
      const cat = ref?.product.category ?? "CLOTHES";
      const c = categoryMap.get(cat) ?? { total: 0, qty: 0 };
      c.total += item.subtotal;
      c.qty += item.quantity;
      categoryMap.set(cat, c);

      const lineCost = (ref?.variant.cost ?? 0) * item.quantity; // Part D
      cogs += lineCost;

      const p = productMap.get(item.productId) ?? {
        name: ref?.product.name ?? "—",
        brand: ref?.product.brand ?? "",
        qty: 0,
        revenue: 0,
        cost: 0,
        image: ref?.product.images?.[0] ?? null,
      };
      p.qty += item.quantity;
      p.revenue += item.subtotal;
      p.cost += lineCost;
      productMap.set(item.productId, p);

      const brandName = ref?.product.brand ?? "";
      if (brandName) {
        const br = brandMap.get(brandName) ?? { qty: 0, revenue: 0 };
        br.qty += item.quantity;
        br.revenue += item.subtotal;
        brandMap.set(brandName, br);
      }

      const size = ref?.variant.size ?? "";
      if (size) {
        const sz = sizeMap.get(size) ?? { qty: 0, revenue: 0 };
        sz.qty += item.quantity;
        sz.revenue += item.subtotal;
        sizeMap.set(size, sz);
      }
    }
  }

  let topDay: DashboardStats["topDay"] = null;
  for (const [date, total] of dayBuckets) {
    if (total > (topDay?.total ?? 0)) topDay = { date, total: round2(total) };
  }

  // مقارنة الأسبوع الحالي والأسبوع السابق
  const thisWeekBuckets = new Map<string, number>();
  const lastWeekBuckets = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    thisWeekBuckets.set(format(subDays(now, i), "yyyy-MM-dd"), 0);
    lastWeekBuckets.set(format(subDays(now, i + 7), "yyyy-MM-dd"), 0);
  }
  const weekStart = startOfDay(subDays(now, 13));
  for (const s of store.sales) {
    if (s.status === "CANCELLED") continue;
    if (s.createdAt < weekStart || s.createdAt > todayEnd) continue;
    const key = format(s.createdAt, "yyyy-MM-dd");
    if (thisWeekBuckets.has(key))
      thisWeekBuckets.set(
        key,
        (thisWeekBuckets.get(key) ?? 0) + s.finalAmount
      );
    else if (lastWeekBuckets.has(key))
      lastWeekBuckets.set(
        key,
        (lastWeekBuckets.get(key) ?? 0) + s.finalAmount
      );
  }

  // عملاء جدد في الفترة
  const priorKeys = new Set<string>();
  for (const s of store.sales) {
    if (s.status === "CANCELLED") continue;
    if (s.createdAt >= from) continue;
    if (!s.customerName && !s.customerPhone) continue;
    priorKeys.add(customerKey(s.customerName, s.customerPhone));
  }
  let newCustomersCount = 0;
  for (const k of customerMap.keys()) {
    if (!priorKeys.has(k)) newCustomersCount += 1;
  }

  let topBrand: DashboardStats["topBrand"] = null;
  for (const [brand, v] of brandMap) {
    if (v.qty > (topBrand?.qty ?? 0))
      topBrand = { brand, qty: v.qty, revenue: round2(v.revenue) };
  }

  // اليوم vs الأمس
  const todaySales = round2(todayList.reduce((s, x) => s + x.finalAmount, 0));
  const yesterdaySales = round2(yList.reduce((s, x) => s + x.finalAmount, 0));
  const todayChangePct =
    yesterdaySales > 0
      ? round2(((todaySales - yesterdaySales) / yesterdaySales) * 100)
      : todaySales > 0
        ? 100
        : 0;

  // الأثر النقدي للمرتجعات (اليوم + الفترة موزّعة على الفروع)
  const returnRows = (f: Date, t: Date): ReturnCashRow[] =>
    store.returns
      .filter((r) => r.createdAt >= f && r.createdAt <= t)
      .map((r) => ({
        branch: r.branch,
        type: r.type,
        refundTotal: r.refundTotal,
        exchangeDifference: r.exchangeDifference,
      }));
  const todayRefundCash = sumReturnCash(returnRows(todayStart, todayEnd));
  const refundsToday = todayRefundCash.refunds;
  const netCashToday = computeNetCash(todaySales, todayRefundCash);
  const rangeRefundByBranch = groupReturnCashByBranch(returnRows(from, to));

  // ملخّص المرتجعات (الفترة) + بطاقة اليوم
  const rangeReturnsList = store.returns.filter(
    (r) => r.createdAt >= from && r.createdAt <= to
  );
  const todayReturnsList = store.returns.filter(
    (r) => r.createdAt >= todayStart && r.createdAt <= todayEnd
  );
  let retCount = 0;
  let exchCount = 0;
  const retProdMap = new Map<
    string,
    { name: string; brand: string; qty: number; refund: number }
  >();
  for (const r of rangeReturnsList) {
    if (r.type === "EXCHANGE") exchCount++;
    else retCount++;
    for (const it of r.items) {
      const ref = findVariant(it.variantId);
      const name = ref?.product.name ?? "—";
      const brand = ref?.product.brand ?? "";
      const k = `${name}|${brand}`;
      const e = retProdMap.get(k) ?? { name, brand, qty: 0, refund: 0 };
      e.qty += it.quantity;
      e.refund = round2(e.refund + it.refundAmount);
      retProdMap.set(k, e);
    }
  }
  const rangeRefundCash = sumReturnCash(returnRows(from, to));
  const returnsSummary = {
    returnCount: retCount,
    exchangeCount: exchCount,
    refundTotal: rangeRefundCash.refunds,
    exchangeUpcharge: rangeRefundCash.exchangeUpcharge,
    netRefunded: round2(rangeRefundCash.refunds - rangeRefundCash.exchangeUpcharge),
    topReturnedProducts: [...retProdMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10),
  };
  const returnsToday = { count: todayReturnsList.length, value: refundsToday };

  // إجمالي الرصيد المتبقي (كل الوقت)
  const remainingTotal = round2(
    store.sales
      .filter((s) => s.status !== "CANCELLED")
      .reduce((s, x) => s + (x.remainingAmount > 0 ? x.remainingAmount : 0), 0)
  );

  const lowStock = store.products
    .flatMap((p) =>
      p.variants
        .filter((v) => v.quantity <= LOW_STOCK_THRESHOLD)
        .map((v) => ({
          id: v.id,
          productName: p.name,
          brand: p.brand,
          size: v.size,
          branch: v.branch,
          quantity: v.quantity,
        }))
    )
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 100);

  const slowMoving = store.products
    .filter(
      (p) =>
        !productMap.has(p.id) &&
        p.variants.reduce((s, v) => s + v.quantity, 0) > 0
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      quantity: p.variants.reduce((s, v) => s + v.quantity, 0),
    }))
    .slice(0, 50);

  const paymentLabels: Record<PaymentKey, string> = {
    CASH: "كاش",
    VISA: "فيزا",
    VODAFONE_CASH: "فودافون كاش",
    INSTAPAY: "انستا باي",
  };

  // ---- تقارير المخزون والجرد ----
  const stockBranchMap = new Map<
    BranchValue,
    { quantity: number; value: number }
  >();
  for (const b of BRANCHES) stockBranchMap.set(b, { quantity: 0, value: 0 });
  const stockCategoryMap = new Map<
    CategoryValue,
    { quantity: number; value: number }
  >();
  const stockBrandMap = new Map<string, { quantity: number; value: number }>();

  let inventoryValue = 0;
  let variantsCount = 0;
  const outOfStock: DashboardStats["outOfStock"] = [];

  for (const p of store.products) {
    let productStock = 0;
    for (const v of p.variants) {
      variantsCount += 1;
      productStock += v.quantity;
      const value = v.quantity * v.price;
      inventoryValue += value;

      const sb = stockBranchMap.get(v.branch);
      if (sb) {
        sb.quantity += v.quantity;
        sb.value += value;
      }
      const sc = stockCategoryMap.get(p.category) ?? { quantity: 0, value: 0 };
      sc.quantity += v.quantity;
      sc.value += value;
      stockCategoryMap.set(p.category, sc);

      if (p.brand) {
        const sbr = stockBrandMap.get(p.brand) ?? { quantity: 0, value: 0 };
        sbr.quantity += v.quantity;
        sbr.value += value;
        stockBrandMap.set(p.brand, sbr);
      }
    }
    if (productStock <= 0) {
      outOfStock.push({
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
      });
    }
  }

  const newProducts = store.products
    .filter((p) => p.createdAt >= from && p.createdAt <= to)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      createdAt: p.createdAt.toISOString(),
    }))
    .slice(0, 100);

  // ---- Part D: مصروفات الفترة (وضع المعاينة) ----
  const dashExpCatMap = new Map<ExpenseCategoryValue, number>();
  for (const c of EXPENSE_CATEGORIES) dashExpCatMap.set(c, 0);
  let dashExpensesTotal = 0;
  for (const e of store.expenses) {
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    dashExpensesTotal = round2(dashExpensesTotal + e.amount);
    dashExpCatMap.set(
      e.category,
      round2((dashExpCatMap.get(e.category) ?? 0) + e.amount)
    );
  }
  const dashExpensesByCategory = [...dashExpCatMap.entries()].map(
    ([category, total]) => ({ category, total })
  );

  return {
    todaySales,
    todaySalesCount: todayList.length,
    yesterdaySales,
    yesterdaySalesCount: yList.length,
    todayChangePct,
    refundsToday,
    netCashToday,
    returnsToday,
    returnsSummary,
    rangeSales: round2(rangeTotal),
    rangeSalesCount: inRange.length,
    avgInvoice: inRange.length ? round2(rangeTotal / inRange.length) : 0,
    topDay,
    remainingTotal,

    branchComparison: [...branchMap.entries()].map(([branch, v]) => {
      const rc = rangeRefundByBranch.get(branch) ?? emptyCashRefunds();
      const total = round2(v.total);
      return {
        branch,
        total,
        count: v.count,
        refunds: rc.refunds,
        netCash: computeNetCash(total, rc),
      };
    }),
    weekComparison: {
      thisWeek: [...thisWeekBuckets.entries()].map(([date, total]) => ({
        date,
        total: round2(total),
      })),
      lastWeek: [...lastWeekBuckets.entries()].map(([date, total]) => ({
        date,
        total: round2(total),
      })),
    },
    paymentBreakdown: (
      ["CASH", "VISA", "VODAFONE_CASH", "INSTAPAY"] as PaymentKey[]
    ).map((key) => {
      const v = paymentMap.get(key) ?? { total: 0, count: 0 };
      return {
        key,
        label: paymentLabels[key],
        total: round2(v.total),
        count: v.count,
      };
    }),

    topProducts: [...productMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((p) => ({ ...p, revenue: round2(p.revenue) })),
    topBrand,
    newCustomersCount,

    deliveryStats: {
      deliveryCount,
      pickupCount,
      returnedCount,
      returnedPct: deliveryCount
        ? round2((returnedCount / deliveryCount) * 100)
        : 0,
    },

    cashierStats: [...cashierMap.entries()]
      .map(([name, v]) => ({
        name,
        count: v.count,
        total: round2(v.total),
        avgInvoice: v.count ? round2(v.total / v.count) : 0,
        maxInvoice: round2(v.max),
      }))
      .sort((a, b) => b.total - a.total),

    grossSales: round2(grossSales),
    discountTotal: round2(grossSales - rangeTotal),
    discountedCount,
    itemsSold,
    maxInvoice: round2(maxInvoice),
    dailySales: [...dayBuckets.entries()].map(([date, total]) => ({
      date,
      total: round2(total),
    })),
    byCategory: [...categoryMap.entries()].map(([category, v]) => ({
      category,
      total: round2(v.total),
      qty: v.qty,
    })),
    topBrands: [...brandMap.entries()]
      .map(([brand, v]) => ({ brand, qty: v.qty, revenue: round2(v.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    bySize: [...sizeMap.entries()]
      .map(([size, v]) => ({ size, qty: v.qty, revenue: round2(v.revenue) }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 15),
    topCustomers: [...customerMap.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((c) => ({ ...c, total: round2(c.total) })),
    lowStock,
    slowMoving,

    inventoryValue: round2(inventoryValue),
    productsCount: store.products.length,
    variantsCount,
    outOfStock: outOfStock.slice(0, 100),
    stockByBranch: [...stockBranchMap.entries()].map(([branch, v]) => ({
      branch,
      quantity: v.quantity,
      value: round2(v.value),
    })),
    stockByCategory: [...stockCategoryMap.entries()].map(([category, v]) => ({
      category,
      quantity: v.quantity,
      value: round2(v.value),
    })),
    stockByBrand: [...stockBrandMap.entries()]
      .map(([brand, v]) => ({
        brand,
        quantity: v.quantity,
        value: round2(v.value),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15),
    topProfit: [...productMap.values()]
      .map((p) => ({
        name: p.name,
        brand: p.brand,
        qty: p.qty,
        revenue: round2(p.revenue),
        cost: round2(p.cost),
        profit: round2(p.revenue - p.cost),
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10),
    cogs: round2(cogs),
    grossProfit: round2(rangeTotal - cogs),
    expensesTotal: dashExpensesTotal,
    netProfit: round2(rangeTotal - cogs - dashExpensesTotal),
    expensesByCategory: dashExpensesByCategory,
    newProducts,
    damagedItems: [],
    stockTransfers: [],
  };
}

export function mockReports(sp: URLSearchParams): ReportsData {
  const { from, to } = rangeBounds(sp, 29);
  const inRange = store.sales.filter(
    (s) => s.status !== "CANCELLED" && s.createdAt >= from && s.createdAt <= to
  );

  const branchMap = new Map<BranchValue, { total: number; count: number }>();
  for (const b of BRANCHES) branchMap.set(b, { total: 0, count: 0 });

  const categoryMap = new Map<CategoryValue, { total: number; qty: number }>();
  const productMap = new Map<
    string,
    {
      name: string;
      brand: string;
      qty: number;
      revenue: number;
      image: string | null;
    }
  >();
  const customerMap = new Map<
    string,
    { name: string; phone: string | null; total: number; count: number }
  >();

  const dayBuckets = new Map<string, number>();
  for (const d of eachDayOfInterval({ start: from, end: to }))
    dayBuckets.set(format(d, "yyyy-MM-dd"), 0);

  let totalSales = 0;
  let grossSales = 0;
  let discountedCount = 0;
  let itemsSold = 0;

  for (const sale of inRange) {
    totalSales += sale.finalAmount;
    grossSales += sale.totalAmount;
    if (sale.totalAmount - sale.finalAmount > 0.001) discountedCount++;
    const cname = (sale.customerName ?? "").trim();
    if (cname) {
      const ck = `${cname}|${sale.customerPhone ?? ""}`;
      const cust = customerMap.get(ck) ?? {
        name: cname,
        phone: sale.customerPhone ?? null,
        total: 0,
        count: 0,
      };
      cust.total += sale.finalAmount;
      cust.count += 1;
      customerMap.set(ck, cust);
    }
    const b = branchMap.get(sale.branch)!;
    b.total += sale.finalAmount;
    b.count += 1;

    const key = format(sale.createdAt, "yyyy-MM-dd");
    if (dayBuckets.has(key))
      dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + sale.finalAmount);

    for (const item of sale.items) {
      itemsSold += item.quantity;
      const ref = findVariant(item.variantId);
      const cat = ref?.product.category ?? "CLOTHES";
      const c = categoryMap.get(cat) ?? { total: 0, qty: 0 };
      c.total += item.subtotal;
      c.qty += item.quantity;
      categoryMap.set(cat, c);

      const p = productMap.get(item.productId) ?? {
        name: ref?.product.name ?? "—",
        brand: ref?.product.brand ?? "",
        qty: 0,
        revenue: 0,
        image: ref?.product.images?.[0] ?? null,
      };
      p.qty += item.quantity;
      p.revenue += item.subtotal;
      productMap.set(item.productId, p);
    }
  }

  const lowStock = store.products
    .flatMap((p) =>
      p.variants
        .filter((v) => v.quantity <= LOW_STOCK_THRESHOLD)
        .map((v) => ({
          id: v.id,
          productName: p.name,
          brand: p.brand,
          size: v.size,
          branch: v.branch,
          quantity: v.quantity,
        }))
    )
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 100);

  // منتجات راكدة: في المخزون (كمية > 0) وبلا مبيعات في الفترة
  const slowMoving = store.products
    .filter(
      (p) =>
        !productMap.has(p.id) &&
        p.variants.reduce((s, v) => s + v.quantity, 0) > 0
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      quantity: p.variants.reduce((s, v) => s + v.quantity, 0),
    }))
    .slice(0, 50);

  const topCustomers = [...customerMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((c) => ({ ...c, total: round2(c.total) }));

  return {
    totalSales: round2(totalSales),
    grossSales: round2(grossSales),
    discountTotal: round2(grossSales - totalSales),
    discountedCount,
    invoicesCount: inRange.length,
    itemsSold,
    avgInvoice: inRange.length ? round2(totalSales / inRange.length) : 0,
    byBranch: [...branchMap.entries()].map(([branch, v]) => ({
      branch,
      total: round2(v.total),
      count: v.count,
    })),
    byCategory: [...categoryMap.entries()].map(([category, v]) => ({
      category,
      total: round2(v.total),
      qty: v.qty,
    })),
    dailySales: [...dayBuckets.entries()].map(([date, total]) => ({
      date,
      total: round2(total),
    })),
    topProducts: [...productMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((p) => ({ ...p, revenue: round2(p.revenue) })),
    topCustomers,
    slowMoving,
    lowStock,
  };
}

// ----------------------------------------------------
//  الإعدادات (وضع المعاينة) — تُخزَّن كـ JSON تحت مفتاح واحد
// ----------------------------------------------------
const MOCK_SETTINGS_KEY = "app.settings";

export function mockGetSettings(): Record<string, unknown> {
  const raw = store.settings[MOCK_SETTINGS_KEY];
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function mockSaveSettings(
  value: Record<string, unknown>
): Record<string, unknown> {
  store.settings[MOCK_SETTINGS_KEY] = JSON.stringify(value);
  return value;
}

// ----------------------------------------------------
//  الديفو (وضع المعاينة) — تسجيل تلف يخصم المخزون
// ----------------------------------------------------
function shapeDamaged(d: MDamaged): DamagedItemDTO {
  const ref = d.variantId ? findVariant(d.variantId) : null;
  const product = ref?.product ?? store.products.find((p) => p.id === d.productId);
  const reasonCode = DEFECT_REASONS.includes(d.reason as DefectReasonValue)
    ? (d.reason as DefectReasonValue)
    : "OTHER";
  return {
    id: d.id,
    productId: d.productId,
    variantId: d.variantId,
    productName: product?.name ?? "—",
    brand: product?.brand ?? "",
    size: ref?.variant.size ?? null,
    color: ref?.variant.color ?? null,
    branch: d.branch,
    quantity: d.quantity,
    reasonCode,
    detail: d.detail ?? (reasonCode === "OTHER" ? d.reason : null),
    unitCost: d.unitCost,
    loss: round2(d.unitCost * d.quantity),
    photoUrl: d.photoUrl,
    createdAt: d.createdAt.toISOString(),
  };
}

export function mockCreateDamaged(input: DamagedInput): DamagedItemDTO {
  const ref = findVariant(input.variantId);
  if (!ref) throw new ValidationError("الصنف غير موجود في المخزون");
  if (input.quantity <= 0) throw new ValidationError("الكمية غير صحيحة");
  if (ref.variant.quantity < input.quantity)
    throw new ValidationError(
      `الكمية غير كافية من "${ref.product.name}" مقاس ${ref.variant.size} (المتاح: ${ref.variant.quantity})`
    );

  // خصم المخزون
  ref.variant.quantity -= input.quantity;

  const unitCost =
    input.unitCost != null && input.unitCost >= 0
      ? input.unitCost
      : ref.variant.price;

  const row: MDamaged = {
    id: nextId("dmg"),
    productId: ref.product.id,
    variantId: ref.variant.id,
    branch: ref.variant.branch,
    quantity: input.quantity,
    reason: input.reasonCode, // كود السبب في عمود reason
    detail: input.detail ?? null,
    unitCost,
    photoUrl: input.photoUrl ?? null,
    createdAt: new Date(),
  };
  store.damaged.unshift(row);
  return shapeDamaged(row);
}

export function mockDefectReport(
  sp: URLSearchParams
): DefectReport | DefectReportPage {
  const branch = sp.get("branch") as BranchValue | null;
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;

  let rows = [...store.damaged];
  if (branch) rows = rows.filter((d) => d.branch === branch);
  if (from) rows = rows.filter((d) => d.createdAt >= from);
  if (to) rows = rows.filter((d) => d.createdAt <= to);

  const items = rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(shapeDamaged);
  const report = buildDefectReport(items);

  const pageRaw = Number(sp.get("page"));
  if (Number.isInteger(pageRaw) && pageRaw >= 1) {
    const perPage = Math.min(Number(sp.get("perPage")) || 20, 200);
    const pageItems = report.items.slice(
      (pageRaw - 1) * perPage,
      pageRaw * perPage
    );
    return {
      ...report,
      items: pageItems,
      total: report.items.length,
      page: pageRaw,
      perPage,
    };
  }

  return report;
}

// ----------------------------------------------------
//  المرتجعات والاستبدال (وضع المعاينة)
// ----------------------------------------------------
function shapeReturn(r: MReturn): ReturnDTO {
  const sale = store.sales.find((s) => s.id === r.saleId);
  return {
    id: r.id,
    saleId: r.saleId,
    saleNumber: sale?.saleNumber ?? 0,
    branch: r.branch,
    type: r.type,
    reason: r.reason,
    refundMethod: r.refundMethod,
    refundTotal: r.refundTotal,
    exchangeDifference: r.exchangeDifference,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    items: r.items.map((it) => {
      const ref = findVariant(it.variantId);
      const ex = it.exchangeVariantId
        ? findVariant(it.exchangeVariantId)
        : null;
      return {
        id: it.id,
        saleItemId: it.saleItemId,
        variantId: it.variantId,
        productName: ref?.product.name ?? "—",
        brand: ref?.product.brand ?? "",
        size: ref?.variant.size ?? "—",
        color: ref?.variant.color ?? null,
        quantity: it.quantity,
        refundAmount: it.refundAmount,
        exchangeVariantId: it.exchangeVariantId,
        exchangeSize: ex?.variant.size ?? null,
        exchangeColor: ex?.variant.color ?? null,
        exchangeUnitPrice: ex?.variant.price ?? null,
      };
    }),
  };
}

export function mockCreateReturn(
  input: ReturnInput
):
  | { ok: true; data: ReturnDTO }
  | { ok: false; status: number; error: string } {
  const sale = store.sales.find((s) => s.id === input.saleId);
  if (!sale) return { ok: false, status: 404, error: "الفاتورة غير موجودة" };
  if (sale.status === "CANCELLED")
    return { ok: false, status: 409, error: "لا يمكن إرجاع فاتورة ملغية" };

  const itemById = new Map(sale.items.map((it) => [it.id, it]));
  const returnedBefore = new Map<string, number>();
  for (const r of store.returns) {
    if (r.saleId !== sale.id) continue;
    for (const it of r.items)
      returnedBefore.set(
        it.saleItemId,
        (returnedBefore.get(it.saleItemId) ?? 0) + it.quantity
      );
  }

  const ratio = sale.totalAmount > 0 ? sale.finalAmount / sale.totalAmount : 1;
  let returnedValue = 0;
  let replacementValue = 0;
  const items: MReturnItem[] = [];

  for (const line of input.items) {
    const saleItem = itemById.get(line.saleItemId);
    if (!saleItem)
      return { ok: false, status: 422, error: "بند غير موجود في هذه الفاتورة" };

    const already = returnedBefore.get(saleItem.id) ?? 0;
    if (already + line.quantity > saleItem.quantity)
      return {
        ok: false,
        status: 422,
        error: `الكمية المطلوب إرجاعها تتجاوز المتاح (المتبقي: ${saleItem.quantity - already})`,
      };

    const refundAmount = round2(
      (saleItem.subtotal / saleItem.quantity) * ratio * line.quantity
    );
    returnedValue = round2(returnedValue + refundAmount);

    const ref = findVariant(saleItem.variantId);
    if (ref) ref.variant.quantity += line.quantity;

    if (input.type === "EXCHANGE") {
      const ex = line.exchangeVariantId
        ? findVariant(line.exchangeVariantId)
        : null;
      if (!ex)
        return { ok: false, status: 422, error: "الصنف البديل غير موجود" };
      if (ex.variant.quantity < line.quantity)
        return {
          ok: false,
          status: 422,
          error: `الكمية غير كافية من الصنف البديل "${ex.product.name}" مقاس ${ex.variant.size} (المتاح: ${ex.variant.quantity})`,
        };
      ex.variant.quantity -= line.quantity;
      replacementValue = round2(
        replacementValue + ex.variant.price * line.quantity
      );
    }

    items.push({
      id: nextId("ri"),
      saleItemId: saleItem.id,
      variantId: saleItem.variantId,
      quantity: line.quantity,
      refundAmount,
      exchangeVariantId:
        input.type === "EXCHANGE" ? line.exchangeVariantId ?? null : null,
    });
  }

  const exchangeDifference =
    input.type === "EXCHANGE" ? round2(replacementValue - returnedValue) : 0;
  const refundTotal = input.type === "RETURN" ? returnedValue : 0;

  const rec: MReturn = {
    id: nextId("ret"),
    saleId: sale.id,
    branch: sale.branch,
    type: input.type,
    reason: input.reason ?? null,
    refundMethod: input.refundMethod ?? null,
    refundTotal,
    exchangeDifference,
    createdBy: input.createdBy ?? null,
    createdAt: new Date(),
    items,
  };
  store.returns.unshift(rec);

  if (sale.customerPhone) {
    const cust = store.customers.find((c) => c.phone === sale.customerPhone);
    if (cust) {
      const delta = input.type === "RETURN" ? -refundTotal : exchangeDifference;
      cust.totalSpent = round2(cust.totalSpent + delta);
      cust.updatedAt = new Date();
    }
  }

  store.activityLogs.unshift({
    id: nextId("a"),
    userName: input.createdBy || "النظام",
    userRole: "ADMIN",
    action: "إرجاع/استبدال",
    details: `${input.type === "RETURN" ? "إرجاع" : "استبدال"} — فاتورة #${sale.saleNumber}`,
    createdAt: new Date(),
  });

  return { ok: true, data: shapeReturn(rec) };
}

export function mockListReturns(sp: URLSearchParams): ReturnsListResponse {
  const branch = sp.get("branch") as BranchValue | null;
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  const type = sp.get("type");
  const saleId = sp.get("saleId");

  let list = [...store.returns];
  if (branch) list = list.filter((r) => r.branch === branch);
  if (saleId) list = list.filter((r) => r.saleId === saleId);
  if (type === "RETURN" || type === "EXCHANGE")
    list = list.filter((r) => r.type === type);
  if (from) list = list.filter((r) => r.createdAt >= from);
  if (to) list = list.filter((r) => r.createdAt <= to);

  list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const returns = list.map(shapeReturn);
  const summary = returns.reduce(
    (acc, r) => {
      acc.count += 1;
      if (r.type === "EXCHANGE") acc.exchangeCount += 1;
      else acc.returnCount += 1;
      acc.refundTotal = round2(acc.refundTotal + r.refundTotal);
      return acc;
    },
    { count: 0, returnCount: 0, exchangeCount: 0, refundTotal: 0 }
  );
  return { returns, total: returns.length, summary };
}

export function mockUnlockSale(
  id: string,
  reason: string,
  by: string
): { ok: boolean; error?: string; status?: number; sale?: SaleDTO } {
  const s = store.sales.find((x) => x.id === id);
  if (!s) return { ok: false, error: "الفاتورة غير موجودة", status: 404 };
  s.unlockedAt = new Date();
  s.unlockedBy = by;
  s.unlockReason = reason;
  return { ok: true, sale: shapeSale(s) };
}

// ====================================================
//  العمليات اليومية (Parts A–D) — وضع المعاينة
// ====================================================

const genId = (p: string) => `${p}_${++store.seq}`;

function inRange(d: Date, from: string | null, to: string | null): boolean {
  if (from && d < new Date(from)) return false;
  if (to && d > new Date(to)) return false;
  return true;
}

// ---- Part A: إقفال الصندوق ----
function shapeShift(s: MShiftClose): ShiftCloseDTO {
  return {
    id: s.id,
    branch: s.branch,
    cashierName: s.cashierName,
    openingCash: s.openingCash,
    expectedCash: s.expectedCash,
    countedCash: s.countedCash,
    difference: s.difference,
    notes: s.notes,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt ? s.closedAt.toISOString() : null,
  };
}

// حساب ملخّص الشيفت من فواتير/مرتجعات نافذة الشيفت داخل المتجر التجريبي
function shiftReportFor(s: MShiftClose) {
  const from = s.openedAt;
  const to = s.closedAt ?? new Date();
  const sales = store.sales.filter(
    (x) =>
      x.branch === s.branch &&
      x.status !== "CANCELLED" &&
      x.createdAt >= from &&
      x.createdAt <= to
  );
  const returnRows: ReturnCashRow[] = store.returns
    .filter((r) => r.branch === s.branch && r.createdAt >= from && r.createdAt <= to)
    .map((r) => ({
      branch: r.branch,
      type: r.type,
      refundTotal: r.refundTotal,
      exchangeDifference: r.exchangeDifference,
    }));
  return computeShiftReport(
    s.openingCash,
    sales.map((x) => ({
      paymentMethod: x.paymentMethod,
      transferMethod: x.transferMethod,
      finalAmount: x.finalAmount,
    })),
    returnRows
  );
}

export function mockListShifts(sp: URLSearchParams): ShiftListResponse {
  const branch = sp.get("branch");
  const from = sp.get("from");
  const to = sp.get("to");
  const status = sp.get("status");

  let rows = [...store.shifts];
  if (branch) rows = rows.filter((s) => s.branch === branch);
  if (status === "open") rows = rows.filter((s) => !s.closedAt);
  else if (status === "closed") rows = rows.filter((s) => s.closedAt);
  rows = rows.filter((s) => inRange(s.openedAt, from, to));
  rows.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());

  const shifts = rows.map(shapeShift);
  let openShift: ShiftCloseDTO | null = null;
  if (branch) {
    const open = store.shifts.find((s) => s.branch === branch && !s.closedAt);
    openShift = open ? shapeShift(open) : null;
  }

  const closed = shifts.filter((s) => s.closedAt);
  const summary = closed.reduce(
    (acc, s) => {
      acc.count += 1;
      acc.totalDifference = round2(acc.totalDifference + s.difference);
      if (s.difference > 0.001) acc.overCount += 1;
      else if (s.difference < -0.001) acc.shortCount += 1;
      return acc;
    },
    { count: 0, totalDifference: 0, overCount: 0, shortCount: 0 }
  );

  return { shifts, openShift, total: shifts.length, summary };
}

export function mockStartShift(
  input: ShiftCloseInput
): { ok: boolean; error?: string; status?: number; data?: ShiftCloseDTO } {
  const existing = store.shifts.find(
    (s) => s.branch === input.branch && !s.closedAt
  );
  if (existing)
    return {
      ok: false,
      error: "يوجد شيفت مفتوح بالفعل لهذا الفرع — أقفله أولاً",
      status: 409,
    };
  const s: MShiftClose = {
    id: genId("shift"),
    branch: input.branch,
    cashierName: input.cashierName,
    openingCash: input.openingCash,
    expectedCash: input.openingCash,
    countedCash: null,
    difference: 0,
    notes: null,
    openedAt: new Date(),
    closedAt: null,
  };
  store.shifts.push(s);
  return { ok: true, data: shapeShift(s) };
}

export function mockGetShift(id: string): ShiftDetailResponse | null {
  const s = store.shifts.find((x) => x.id === id);
  if (!s) return null;
  return { shift: shapeShift(s), report: shiftReportFor(s) };
}

export function mockCloseShift(
  id: string,
  input: ShiftFinalizeInput
): { ok: boolean; error?: string; status?: number; data?: ShiftDetailResponse } {
  const s = store.shifts.find((x) => x.id === id);
  if (!s) return { ok: false, error: "الشيفت غير موجود", status: 404 };
  if (s.closedAt) return { ok: false, error: "هذا الشيفت مُقفل بالفعل", status: 409 };
  s.closedAt = new Date();
  const report = shiftReportFor(s);
  s.expectedCash = report.expectedCash;
  s.countedCash = input.countedCash;
  s.difference = round2(input.countedCash - report.expectedCash);
  s.notes = input.notes;
  return { ok: true, data: { shift: shapeShift(s), report } };
}

// ---- Part B: الموردون والاستلام ----
function shapeSupplier(s: MSupplier): SupplierDTO {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    receiptsCount: store.stockReceipts.filter((r) => r.supplierId === s.id)
      .length,
  };
}

export function mockListSuppliers(): {
  suppliers: SupplierDTO[];
  total: number;
} {
  const suppliers = [...store.suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, "ar"))
    .map(shapeSupplier);
  return { suppliers, total: suppliers.length };
}

export function mockCreateSupplier(input: SupplierInput): SupplierDTO {
  const s: MSupplier = {
    id: genId("sup"),
    name: input.name,
    phone: input.phone,
    notes: input.notes,
    createdAt: new Date(),
  };
  store.suppliers.push(s);
  return shapeSupplier(s);
}

export function mockUpdateSupplier(
  id: string,
  input: SupplierInput
): SupplierDTO | null {
  const s = store.suppliers.find((x) => x.id === id);
  if (!s) return null;
  s.name = input.name;
  s.phone = input.phone;
  s.notes = input.notes;
  return shapeSupplier(s);
}

export function mockDeleteSupplier(
  id: string
): { ok: boolean; error?: string; status?: number } {
  const idx = store.suppliers.findIndex((x) => x.id === id);
  if (idx === -1) return { ok: false, error: "المورد غير موجود", status: 404 };
  if (store.stockReceipts.some((r) => r.supplierId === id))
    return {
      ok: false,
      error: "لا يمكن حذف مورد له عمليات استلام مسجّلة",
      status: 409,
    };
  store.suppliers.splice(idx, 1);
  return { ok: true };
}

function shapeReceipt(r: MStockReceipt): StockReceiptDTO {
  const supplier = store.suppliers.find((s) => s.id === r.supplierId);
  const items = r.items.map((it) => {
    const found = findVariant(it.variantId);
    return {
      id: it.id,
      variantId: it.variantId,
      productName: found?.product.name ?? "—",
      brand: found?.product.brand ?? "",
      size: found?.variant.size ?? "",
      color: found?.variant.color ?? null,
      quantity: it.quantity,
      unitCost: it.unitCost,
      lineTotal: round2(it.unitCost * it.quantity),
    };
  });
  return {
    id: r.id,
    supplierId: r.supplierId,
    supplierName: supplier?.name ?? "—",
    branch: r.branch,
    invoiceNumber: r.invoiceNumber,
    totalCost: r.totalCost,
    notes: r.notes,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    itemsCount: items.length,
    quantity: items.reduce((s, it) => s + it.quantity, 0),
    items,
  };
}

export function mockListStockReceipts(
  sp: URLSearchParams
): StockReceiptsListResponse {
  const supplierId = sp.get("supplierId");
  const branch = sp.get("branch");
  const from = sp.get("from");
  const to = sp.get("to");

  let rows = [...store.stockReceipts];
  if (supplierId) rows = rows.filter((r) => r.supplierId === supplierId);
  if (branch) rows = rows.filter((r) => r.branch === branch);
  rows = rows.filter((r) => inRange(r.createdAt, from, to));
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const receipts = rows.map(shapeReceipt);
  const summary = receipts.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.totalCost = round2(acc.totalCost + r.totalCost);
      acc.totalQuantity += r.quantity;
      return acc;
    },
    { count: 0, totalCost: 0, totalQuantity: 0 }
  );
  return { receipts, total: receipts.length, summary };
}

export function mockCreateStockReceipt(
  input: StockReceiptInput
): { ok: boolean; error?: string; status?: number; data?: StockReceiptDTO } {
  const supplier = store.suppliers.find((s) => s.id === input.supplierId);
  if (!supplier) return { ok: false, error: "المورد غير موجود", status: 404 };

  let totalCost = 0;
  const items: MStockReceiptItem[] = [];
  for (const line of input.items) {
    const found = findVariant(line.variantId);
    if (!found)
      return {
        ok: false,
        error: "أحد الأصناف غير موجود في المخزون",
        status: 422,
      };
    // متوسط مرجّح للتكلفة + زيادة الكمية
    const oldQty = found.variant.quantity;
    const oldCost = found.variant.cost ?? 0;
    const newQty = oldQty + line.quantity;
    found.variant.cost =
      newQty > 0
        ? round2((oldQty * oldCost + line.quantity * line.unitCost) / newQty)
        : round2(line.unitCost);
    found.variant.quantity = newQty;
    totalCost = round2(totalCost + line.unitCost * line.quantity);
    items.push({
      id: genId("sri"),
      variantId: line.variantId,
      quantity: line.quantity,
      unitCost: line.unitCost,
    });
  }

  const r: MStockReceipt = {
    id: genId("rcpt"),
    supplierId: input.supplierId,
    branch: input.branch,
    invoiceNumber: input.invoiceNumber,
    totalCost,
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: new Date(),
    items,
  };
  store.stockReceipts.push(r);
  return { ok: true, data: shapeReceipt(r) };
}

// ---- Part C: المصروفات ----
function shapeExpense(e: MExpense): ExpenseDTO {
  return {
    id: e.id,
    branch: e.branch,
    category: e.category,
    amount: e.amount,
    description: e.description,
    date: e.date.toISOString(),
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
  };
}

export function mockListExpenses(sp: URLSearchParams): ExpensesListResponse {
  const branch = sp.get("branch");
  const category = sp.get("category");
  const from = sp.get("from");
  const to = sp.get("to");

  let rows = [...store.expenses];
  if (branch) rows = rows.filter((e) => e.branch === branch);
  if (category) rows = rows.filter((e) => e.category === category);
  rows = rows.filter((e) => inRange(e.date, from, to));
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  const expenses = rows.map(shapeExpense);
  const catMap = new Map<ExpenseCategoryValue, number>();
  for (const c of EXPENSE_CATEGORIES) catMap.set(c, 0);
  const branchMap = new Map<BranchValue, number>();
  for (const b of BRANCHES) branchMap.set(b, 0);
  let totalAmount = 0;
  for (const e of expenses) {
    totalAmount = round2(totalAmount + e.amount);
    catMap.set(e.category, round2((catMap.get(e.category) ?? 0) + e.amount));
    branchMap.set(e.branch, round2((branchMap.get(e.branch) ?? 0) + e.amount));
  }
  return {
    expenses,
    total: expenses.length,
    summary: {
      count: expenses.length,
      totalAmount,
      byCategory: [...catMap.entries()].map(([category, total]) => ({
        category,
        total,
      })),
      byBranch: [...branchMap.entries()].map(([branch, total]) => ({
        branch,
        total,
      })),
    },
  };
}

export function mockCreateExpense(input: ExpenseInput): ExpenseDTO {
  const e: MExpense = {
    id: genId("exp"),
    branch: input.branch,
    category: input.category,
    amount: input.amount,
    description: input.description,
    date: input.date ? new Date(input.date) : new Date(),
    createdBy: input.createdBy,
    createdAt: new Date(),
  };
  store.expenses.push(e);
  return shapeExpense(e);
}

export function mockDeleteExpense(id: string): boolean {
  const idx = store.expenses.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  store.expenses.splice(idx, 1);
  return true;
}

// صورة بديلة (Data URI) لزر الرفع في وضع المعاينة — بدون اتصال شبكة
export function mockUploadUrl(): string {
  const colors = ["6c63ff", "3b9a6e", "c9851a", "4f9cf9"];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='450'><rect width='100%' height='100%' fill='%23${c}'/><text x='50%' y='50%' fill='white' font-family='sans-serif' font-size='48' font-weight='bold' text-anchor='middle' dominant-baseline='middle'>EB</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}
