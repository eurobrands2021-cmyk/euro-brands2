import { cn } from "@/lib/cn";
import {
  BRANCH_LABELS,
  CATEGORY_LABELS,
  LOW_STOCK_THRESHOLD,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";

export function BranchBadge({ branch }: { branch: BranchValue }) {
  return (
    <span className="badge bg-accent-soft text-accent">
      {BRANCH_LABELS[branch]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: CategoryValue }) {
  return (
    <span className="badge bg-[var(--surface-2)] text-muted">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// شارة حالة المخزون حسب الكمية
export function StockBadge({ quantity }: { quantity: number }) {
  if (quantity <= 0) {
    return (
      <span className="badge bg-[rgba(217,83,79,0.14)] text-danger">
        نفذت الكمية
      </span>
    );
  }
  if (quantity <= LOW_STOCK_THRESHOLD) {
    return (
      <span className="badge bg-[rgba(201,133,26,0.14)] text-warning nums">
        كمية محدودة ({quantity})
      </span>
    );
  }
  return (
    <span className="badge bg-[rgba(59,154,110,0.14)] text-success nums">
      متوفر ({quantity})
    </span>
  );
}

// شارة المنتجات المسودة (أُضيفت سريعاً من POS وتحتاج إكمال بياناتها)
export function DraftBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "badge bg-[rgba(201,133,26,0.14)] text-warning",
        className
      )}
    >
      يحتاج إكمال
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("badge bg-[var(--surface-2)] text-muted", className)}>
      {children}
    </span>
  );
}
