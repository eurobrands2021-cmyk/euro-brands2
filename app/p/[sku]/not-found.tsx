import { Package } from "lucide-react";
import { Logo } from "@/components/logo";

// صفحة 404 نظيفة بالعربية — تظهر عند عدم وجود منتج بهذا الكود.
export default function ProductNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
        <Package className="h-9 w-9" />
      </div>
      <h1 className="text-xl font-extrabold">المنتج غير متوفر</h1>
      <p className="max-w-xs text-sm text-muted">
        لم نعثر على المنتج المطلوب. قد يكون الكود غير صحيح أو أن المنتج لم يعد
        متاحاً.
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm font-bold">
        <Logo size={22} className="rounded" />
        Euro Brands
      </div>
    </div>
  );
}
