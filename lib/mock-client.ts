// موجّه وضع المعاينة من جهة المتصفح:
// يحاكي مسارات الـ API بالكامل اعتماداً على المتجر التجريبي في الذاكرة،
// بحيث تعمل الواجهة دون أي خادم أو قاعدة بيانات.
import {
  mockListProducts,
  mockGetProduct,
  mockGetProductBySku,
  mockCreateProduct,
  mockUpdateProduct,
  mockDeleteProduct,
  mockImportInventory,
  mockLowStock,
  mockHomeStats,
  mockListBrands,
  mockCreateBrand,
  mockListProductTypes,
  mockCreateProductType,
  mockDeleteProductType,
  mockSeedProductTypes,
  mockListActivity,
  mockCreateActivity,
  mockListAccessRequests,
  mockGetAccessRequest,
  mockCreateAccessRequest,
  mockUpdateAccessRequestStatus,
  mockGetAdminRecovery,
  mockSetupAdminRecovery,
  mockVerifyAdminRecovery,
  mockListCustomers,
  mockGetCustomer,
  mockCreateCustomer,
  mockUpdateCustomer,
  mockListSales,
  mockGetSale,
  mockCreateSale,
  mockCancelSale,
  mockListDelivery,
  mockUpdateDeliveryStatus,
  mockDashboard,
  mockReports,
  mockUploadUrl,
} from "./mock-store";
import {
  parseAccessRequestInput,
  parseAccessRequestStatus,
  parseActivityInput,
  parseAdminRecoveryBody,
  parseBrandInput,
  parseCustomerInput,
  parseCustomerUpdateInput,
  parseDeliveryStatus,
  parseImportRows,
  parseProductInput,
  parseProductTypeInput,
  parseSaleInput,
} from "./validate";

type Method = "GET" | "POST" | "PUT" | "DELETE";

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export async function mockApi<T>(
  method: Method,
  url: string,
  body?: unknown
): Promise<T> {
  await delay(); // محاكاة زمن استجابة بسيط لإظهار حالات التحميل

  const parsed = new URL(url, "http://mock.local");
  const path = parsed.pathname;
  const sp = parsed.searchParams;

  // /api/preview-mode
  if (path === "/api/preview-mode") return { mock: true } as T;

  // /api/products
  if (path === "/api/products") {
    if (method === "GET") return mockListProducts(sp) as T;
    if (method === "POST")
      return mockCreateProduct(parseProductInput(body)) as T;
  }

  // /api/products/import (قبل مطابقة المعرّف لأن "import" يطابق النمط)
  if (path === "/api/products/import" && method === "POST")
    return mockImportInventory(parseImportRows(body)) as T;

  // /api/public/products/[sku] — صفحة المنتج العامة (بيانات آمنة)
  const publicMatch = path.match(/^\/api\/public\/products\/([^/]+)$/);
  if (publicMatch && method === "GET") {
    const sku = decodeURIComponent(publicMatch[1]);
    const dto = mockGetProductBySku(sku);
    if (!dto) throw new Error("المنتج غير موجود");
    const { toPublicProduct } = await import("./public-product");
    return toPublicProduct(dto) as T;
  }

  // /api/products/[id]
  const productMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch) {
    const id = decodeURIComponent(productMatch[1]);
    if (method === "GET") {
      const dto = mockGetProduct(id);
      if (!dto) throw new Error("المنتج غير موجود");
      return dto as T;
    }
    if (method === "PUT") {
      const dto = mockUpdateProduct(id, parseProductInput(body));
      if (!dto) throw new Error("المنتج غير موجود");
      return dto as T;
    }
    if (method === "DELETE") {
      const res = mockDeleteProduct(id);
      if (!res.ok) throw new Error(res.error);
      return { success: true } as T;
    }
  }

  // /api/brands
  if (path === "/api/brands") {
    if (method === "GET") return mockListBrands(sp.get("category")) as T;
    if (method === "POST") return mockCreateBrand(parseBrandInput(body)) as T;
  }

  // /api/product-types
  if (path === "/api/product-types") {
    if (method === "GET") return mockListProductTypes(sp.get("category")) as T;
    if (method === "POST")
      return mockCreateProductType(parseProductTypeInput(body)) as T;
  }

  // /api/seed/product-types — مزامنة الأنواع الافتراضية (idempotent)
  if (path === "/api/seed/product-types" && method === "POST") {
    return mockSeedProductTypes() as T;
  }

  // /api/activity — سجل النشاط
  if (path === "/api/activity") {
    if (method === "GET") return mockListActivity(sp) as T;
    if (method === "POST")
      return mockCreateActivity(parseActivityInput(body)) as T;
  }

  // /api/access-requests — طلبات دخول الكاشير
  if (path === "/api/access-requests") {
    if (method === "GET") return mockListAccessRequests(sp) as T;
    if (method === "POST")
      return mockCreateAccessRequest(parseAccessRequestInput(body)) as T;
  }

  // /api/access-requests/[id]
  const accessReqMatch = path.match(/^\/api\/access-requests\/([^/]+)$/);
  if (accessReqMatch) {
    const id = decodeURIComponent(accessReqMatch[1]);
    if (method === "GET") {
      const dto = mockGetAccessRequest(id);
      if (!dto) throw new Error("الطلب غير موجود");
      return dto as T;
    }
    if (method === "PUT") {
      const dto = mockUpdateAccessRequestStatus(
        id,
        parseAccessRequestStatus(body)
      );
      if (!dto) throw new Error("الطلب غير موجود");
      return dto as T;
    }
  }

  // /api/admin-recovery — استرجاع حساب المدير (سؤال الأمان)
  if (path === "/api/admin-recovery") {
    if (method === "GET") return mockGetAdminRecovery() as T;
    if (method === "POST") {
      const parsed = parseAdminRecoveryBody(body);
      if (parsed.action === "setup")
        return mockSetupAdminRecovery(parsed.question, parsed.answer) as T;
      return mockVerifyAdminRecovery(parsed.answer) as T;
    }
  }

  // /api/product-types/[id]
  const ptMatch = path.match(/^\/api\/product-types\/([^/]+)$/);
  if (ptMatch && method === "DELETE") {
    const removed = mockDeleteProductType(decodeURIComponent(ptMatch[1]));
    if (!removed) throw new Error("النوع غير موجود");
    return { id: ptMatch[1] } as T;
  }

  // /api/customers
  if (path === "/api/customers") {
    if (method === "GET") return mockListCustomers(sp) as T;
    if (method === "POST")
      return mockCreateCustomer(parseCustomerInput(body)) as T;
  }

  // /api/customers/[id]
  const customerMatch = path.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch) {
    const id = decodeURIComponent(customerMatch[1]);
    if (method === "GET") {
      const dto = mockGetCustomer(id);
      if (!dto) throw new Error("العميل غير موجود");
      return dto as T;
    }
    if (method === "PUT") {
      const dto = mockUpdateCustomer(id, parseCustomerUpdateInput(body));
      if (!dto) throw new Error("العميل غير موجود");
      return dto as T;
    }
  }

  // /api/sales
  if (path === "/api/sales") {
    if (method === "GET") return mockListSales(sp) as T;
    if (method === "POST") return mockCreateSale(parseSaleInput(body)) as T;
  }

  // /api/sales/[id]/cancel
  const cancelMatch = path.match(/^\/api\/sales\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const res = mockCancelSale(
      decodeURIComponent(cancelMatch[1]),
      String((body as { reason?: string })?.reason ?? "")
    );
    if (!res.ok) throw new Error(res.error);
    return res.sale as T;
  }

  // /api/delivery
  if (path === "/api/delivery" && method === "GET")
    return mockListDelivery(sp) as T;

  // /api/delivery/[id]/status
  const statusMatch = path.match(/^\/api\/delivery\/([^/]+)\/status$/);
  if (statusMatch && method === "POST") {
    const status = parseDeliveryStatus(body);
    const res = mockUpdateDeliveryStatus(
      decodeURIComponent(statusMatch[1]),
      status
    );
    if (!res.ok) throw new Error(res.error);
    return res.sale as T;
  }

  // /api/sales/[id]
  const saleMatch = path.match(/^\/api\/sales\/([^/]+)$/);
  if (saleMatch) {
    const dto = mockGetSale(decodeURIComponent(saleMatch[1]));
    if (!dto) throw new Error("الفاتورة غير موجودة");
    return dto as T;
  }

  // /api/low-stock
  if (path === "/api/low-stock") return mockLowStock() as T;

  // /api/home-stats
  if (path === "/api/home-stats") return mockHomeStats() as T;

  // /api/dashboard
  if (path === "/api/dashboard") return mockDashboard(sp) as T;

  // /api/reports
  if (path === "/api/reports") return mockReports(sp) as T;

  // /api/upload
  if (path === "/api/upload") return { url: mockUploadUrl() } as T;

  throw new Error(`وضع المعاينة: مسار غير مدعوم (${method} ${path})`);
}
