// قفل الفواتير — دالة خالصة تُستخدم على الواجهة والخادم معاً.
// الفاتورة تُقفل (غير قابلة للتعديل) إذا مرّ عليها أكثر من مدة القفل المحددة،
// ما لم تُفتح يدوياً (unlockedAt). المدير يضبط المدة من الإعدادات.

export interface LockInfo {
  locked: boolean;
  ageDays: number; // عمر الفاتورة بالأيام (تقريباً)
  wasUnlocked: boolean; // فُتحت يدوياً بعد قفلها
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function invoiceLockInfo(
  createdAt: string | Date,
  lockDays: number,
  unlockedAt: string | Date | null
): LockInfo {
  const created = new Date(createdAt).getTime();
  const ageDays = Math.floor((Date.now() - created) / DAY_MS);
  const wasUnlocked = !!unlockedAt;
  // مدة غير صالحة/صفرية → لا قفل
  const past = lockDays > 0 && Date.now() - created > lockDays * DAY_MS;
  return {
    locked: past && !wasUnlocked,
    ageDays,
    wasUnlocked,
  };
}

export function isInvoiceLocked(
  createdAt: string | Date,
  lockDays: number,
  unlockedAt: string | Date | null
): boolean {
  return invoiceLockInfo(createdAt, lockDays, unlockedAt).locked;
}
