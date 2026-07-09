/* عامل خدمة Euro Brands — دعم وضع عدم الاتصال لنقطة البيع.
 *
 * الاستراتيجية:
 *  - قشرة التطبيق (HTML) + الأصول الثابتة (JS/CSS/صور/خطوط): تُخبَّأ عند أول
 *    جلب ناجح وتُخدَم من التخبئة عند عدم الاتصال (Cache-first للأصول المُجزّأة
 *    غير المتغيّرة تحت /_next/static، وNetwork-first للتنقّل بين الصفحات).
 *  - GET /api/products: Network-first مع الرجوع للتخبئة عند انقطاع الشبكة،
 *    فتعمل نقطة البيع بالأسعار والكميات المخبّأة عند عدم الاتصال.
 *  - POST /api/sales: إن فشلت الشبكة تُخزَّن الفاتورة في IndexedDB (نفس
 *    طابور العميل) وتُعاد استجابة 202 {queued:true} حتى تُزامَن لاحقاً.
 *  - أي تنقّل يفشل دون وجود نسخة مخبّأة: تُخدَم صفحة offline.html بدل شاشة
 *    فارغة، فلا تصبح الصفحة بيضاء أبداً عند انقطاع الاتصال.
 */

const CACHE_VERSION = "eb-cache-v3";
const API_CACHE = "eb-api-v3";
const OFFLINE_URL = "/offline.html";
const OFFLINE_DB = "eb-offline";
const OFFLINE_DB_VERSION = 1;
const PENDING_STORE = "pendingSales";

// أصول قشرة التطبيق التي نحاول تخبئتها عند التثبيت (تجاهل الفشل بأمان).
// الأصول المُجزّأة (JS/CSS) تُخبَّأ لحظياً عند أول جلب لأن أسماءها ديناميكية.
const APP_SHELL = [
  "/",
  "/pos",
  "/inventory",
  "/dashboard",
  "/login",
  OFFLINE_URL,
  "/manifest.json",
  "/logo.svg",
];

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
// بيانات بطيئة التغيّر (البراندات وأنواع المنتجات) — مرشّحة لاستراتيجية SWR.
function isSlowChangingApi(url) {
  return (
    url.pathname === "/api/brands" || url.pathname === "/api/product-types"
  );
}

// Stale-While-Revalidate: يخدم النسخة المخبّأة فوراً (سرعة) ويحدّثها في
// الخلفية من الشبكة. عند عدم وجود نسخة: ينتظر الشبكة، ثم يرجع لقائمة فارغة
// صالحة عند تعذّر الاتصال بدل رمي خطأ.
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);
  const fetchAndUpdate = fetch(request)
    .then((res) => {
      if (res && res.ok && !res.redirected) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cachedResponse) {
    event.waitUntil(fetchAndUpdate);
    return cachedResponse;
  }
  const res = await fetchAndUpdate;
  if (res) return res;
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
// الأصول الثابتة المُجزّأة من Next لا تتغيّر (أسماؤها تحمل بصمة) — Cache-first.
function isImmutableAsset(url, request) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/_next/image")) return true;
  const dest = request.destination;
  return (
    dest === "image" ||
    dest === "style" ||
    dest === "script" ||
    dest === "font"
  );
}

// خبّئ الاستجابة بأمان: فقط الاستجابات الناجحة وغير المُعاد توجيهها.
async function cachePut(cacheName, request, response) {
  if (!response || !response.ok || response.redirected) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    /* تجاهل أخطاء التخبئة (استجابات غير قابلة للتخزين) */
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // نتعامل فقط مع طلبات GET/POST من نفس الأصل
  if (url.origin !== self.location.origin) return;

  // GET /api/brands و /api/product-types — بيانات بطيئة التغيّر: SWR
  if (request.method === "GET" && isSlowChangingApi(url)) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  // GET /api/products — قوائم المنتجات: Stale-While-Revalidate
  // (عرض فوري من التخبئة + تحديث في الخلفية؛ صحّة الكميات تُتحقَّق عند البيع).
  if (request.method === "GET" && isProductsApi(url)) {
    event.respondWith(staleWhileRevalidate(event, request));
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
            return new Response(JSON.stringify({ queued: true, id }), {
              status: 202,
              headers: { "Content-Type": "application/json" },
            });
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

  // بقية الطلبات نتعامل معها كـ GET فقط
  if (request.method !== "GET") return;

  // طلبات التنقّل (فتح صفحة) — Network-first ثم الصفحة المخبّأة ثم القشرة
  // ثم صفحة عدم الاتصال (كي لا تصبح الصفحة بيضاء أبداً).
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          await cachePut(CACHE_VERSION, request, res);
          return res;
        } catch (err) {
          const cached =
            (await caches.match(request, { ignoreSearch: true })) ||
            (await caches.match("/pos")) ||
            (await caches.match("/")) ||
            (await caches.match(OFFLINE_URL));
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // الأصول الثابتة المُجزّأة — Cache-first (لا تتغيّر)
  if (isImmutableAsset(url, request)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          await cachePut(CACHE_VERSION, request, res);
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
