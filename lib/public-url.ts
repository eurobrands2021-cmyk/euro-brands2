// روابط صفحة المنتج العامة (/p/[sku]) واستخراج الـ SKU من قيمة ممسوحة.
// الـ QR يشفّر رابط /p/[sku]، والباركود يشفّر الـ SKU نفسه.

// المسار النسبي لصفحة المنتج العامة.
export function publicProductPath(sku: string): string {
  return `/p/${encodeURIComponent(sku.trim())}`;
}

// الرابط الكامل (يُستخدم داخل الـ QR ليفتح على هاتف العميل).
// على الخادم لا نعرف الأصل، فنكتفي بالمسار النسبي.
export function publicProductUrl(sku: string): string {
  const path = publicProductPath(sku);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

// يستخرج الـ SKU من قيمة ممسوحة قد تكون:
//   - رابطاً كاملاً:  https://site.com/p/ABC-123
//   - مساراً نسبياً:  /p/ABC-123
//   - الـ SKU نفسه (باركود Code128): ABC-123
// أي شيء لا يطابق نمط /p/ يُعاد كما هو (مع إزالة الفراغات).
export function extractSkuFromScan(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return value;

  // جرّب تحليله كرابط كامل أولاً
  let pathname = value;
  try {
    if (/^https?:\/\//i.test(value)) {
      pathname = new URL(value).pathname;
    }
  } catch {
    // ليس رابطاً صالحاً — نكمل بالقيمة كما هي
  }

  const match = pathname.match(/\/p\/([^/?#]+)/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  return value;
}
