"use client";

import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePersistentCollapse } from "@/lib/use-persistent-collapse";
import { cn } from "@/lib/cn";

// لوحة قابلة للطي مع حفظ حالتها في localStorage.
// الترويسة (العنوان + أيقونة + سهم) تعمل كزرّ طيّ/فتح، ومنطقة المحتوى تنطوي
// بسلاسة. يمكن تمرير عناصر تبقى ظاهرة دائماً في الترويسة عبر headerExtra.
export function CollapsiblePanel({
  storageKey,
  title,
  icon,
  defaultOpen = true,
  headerExtra,
  children,
  className,
  bodyClassName,
}: {
  storageKey: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = usePersistentCollapse(storageKey, defaultOpen);

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2 text-base font-bold text-text"
        >
          {icon}
          <span className="truncate">{title}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
        {headerExtra}
      </div>

      {/* منطقة قابلة للطي بسلاسة (grid-rows trick) */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className={cn("pt-4", bodyClassName)}>{children}</div>
        </div>
      </div>
    </Card>
  );
}
