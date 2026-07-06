// طابور الفواتير غير المتزامنة (وضع عدم الاتصال) — مخزَّن في IndexedDB.
// يُشارَك نفس الاسم/الصيغة مع عامل الخدمة (public/sw.js) حتى يستطيع الطرفان
// القراءة والكتابة في نفس الطابور. كل عنصر يحمل جسم طلب POST /api/sales كما هو.

export const OFFLINE_DB = "eb-offline";
export const OFFLINE_DB_VERSION = 1;
export const PENDING_STORE = "pendingSales";

export interface PendingSale {
  id: string; // معرّف محلي فريد
  payload: unknown; // جسم POST /api/sales
  branch: string;
  itemsCount: number;
  total: number;
  createdAt: string; // ISO
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB غير مدعوم"));
      return;
    }
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

export async function addPendingSale(sale: PendingSale): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).put(sale);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readonly");
    const req = tx.objectStore(PENDING_STORE).getAll();
    req.onsuccess = () => {
      db.close();
      const rows = (req.result as PendingSale[]) ?? [];
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePendingSale(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function countPendingSales(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readonly");
    const req = tx.objectStore(PENDING_STORE).count();
    req.onsuccess = () => {
      db.close();
      resolve(req.result ?? 0);
    };
    req.onerror = () => reject(req.error);
  });
}
