/* عامل خدمة Euro Brands — دعم وضع عدم الاتصال لنقطة البيع.
 *
 * الاستراتيجية:
 *  - أصول ثابتة وصور المنتجات: Cache-first (تُخبَّأ عند أول جلب).
 *  - GET /api/products: Network-first مع الرجوع للتخبئة عند انقطاع الشبكة،
 *    فتعمل نقطة البيع بالأسعار والكميات المخبّأة عند عدم الاتصال.
 *  - POST /api/sales: إن فشلت الشبكة تُخزَّن الفاتورة في IndexedDB (نفس
 *    طابور العميل) وتُعاد استجابة 202 {queued:true} حتى تُزامَن لاحقاً.
 */

const CACHE_VERSION = "eb-cache-v1";
const API_CACHE = "eb-api-v1";
const OFFLINE_DB = "eb-offline";
const OFFLINE_DB_VERSION = 1;
const PENDING_STORE = "pendingSales";

// أصول التطبيق الأساسية التي نحاول تخبئتها عند التثبيت (تجاهل الفشل بأمان).
const APP_SHELL = ["/", "/pos", "/manifest.json", "/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(APP_SHELL.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== API_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ---- IndexedDB داخل عامل الخدمة (طابور الفواتير) ----
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueSale(payload) {
  const db = await openDb();
  const id = `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const itemsCount = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).put({
      id,
      payload,
      branch: payload?.branch ?? "",
      itemsCount,
      total: 0,
      createdAt: new Date().toISOString(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

function isProductsApi(url) {
  return url.pathname === "/api/products";
}
function isSalesApi(url) {
  return url.pathname === "/api/sales";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // نتعامل فقط مع طلبات نفس الأصل
  if (url.origin !== self.location.origin) return;

  // GET /api/products — Network-first ثم التخبئة
  if (request.method === "GET" && isProductsApi(url)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(API_CACHE);
          cache.put(request, res.clone());
          return res;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  // POST /api/sales — عند فشل الشبكة: أضِف للطابور وأعِد 202
  if (request.method === "POST" && isSalesApi(url)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request.clone());
        } catch (err) {
          try {
            const payload = await request.clone().json();
            const id = await queueSale(payload);
            return new Response(
              JSON.stringify({ queued: true, id }),
              {
                status: 202,
                headers: { "Content-Type": "application/json" },
              }
            );
          } catch (e) {
            return new Response(
              JSON.stringify({ error: "تعذّر حفظ الفاتورة دون اتصال" }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      })()
    );
    return;
  }

  // طلبات التنقّل (فتح صفحة) — Network-first ثم الصفحة المخبّأة ثم "/"
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, res.clone());
          return res;
        } catch (err) {
          const cached =
            (await caches.match(request)) || (await caches.match("/"));
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // الصور والأصول الثابتة — Cache-first
  const dest = request.destination;
  if (
    request.method === "GET" &&
    (dest === "image" || dest === "style" || dest === "script" || dest === "font")
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put(request, res.clone());
          }
          return res;
        } catch (err) {
          return cached || Response.error();
        }
      })()
    );
  }
});

// السماح للصفحة بطلب تفعيل التحديث فوراً
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
