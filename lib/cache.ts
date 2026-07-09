// ذاكرة تخزين مؤقت بسيطة داخل الذاكرة (per-instance) مع مدة صلاحية.
// مفيدة للتجميعات الثقيلة (إحصاءات لوحة التحكم) لتفادي إعادة الحساب مع كل طلب
// خلال فترة قصيرة. على Vercel تبقى فعّالة داخل نفس نسخة الـ lambda الساخنة،
// وتتكامل مع Cache-Control على الـ CDN للطلبات المتكرّرة.

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();

// يُرجع القيمة المخزّنة إن كانت صالحة، وإلا يحسبها عبر `compute` ويخزّنها.
export async function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;

  const value = await compute();
  store.set(key, { value, expires: now + ttlMs });

  // تنظيف كسول للمفاتيح المنتهية حتى لا تنمو الخريطة بلا حدود.
  if (store.size > 100) {
    for (const [k, e] of store) {
      if (e.expires <= now) store.delete(k);
    }
  }
  return value;
}

// إبطال المفاتيح التي تبدأ ببادئة معيّنة (تُستدعى بعد عمليات الكتابة).
export function invalidate(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
