"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Users } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import {
  BRANCHES,
  BRANCH_LABELS,
  CATEGORY_LABELS,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";
import { VIP_FILTERS, type VipCustomerDTO, type VipFilter } from "@/lib/types";

const FILTER_LABELS: Record<VipFilter, string> = {
  spenders: "الأكثر إنفاقاً",
  frequent: "الأكثر تكراراً",
  branch: "حسب الفرع",
  atrisk: "في خطر",
  new: "عملاء جدد",
  avg: "متوسط الفاتورة",
  category: "المفضّل فئة",
};

// فئات فلتر «المفضّل فئة» (حسب المطلوب: ملابس/أحذية/عطور)
const VIP_CATEGORIES: CategoryValue[] = ["CLOTHES", "SHOES", "PERFUMES"];

function VipBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(201,133,26,0.16)] px-2 py-0.5 text-[11px] font-bold text-warning">
      <Crown className="h-3 w-3" />
      VIP
    </span>
  );
}

export default function VipCustomersPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [filter, setFilter] = useState<VipFilter>("spenders");
  const [branch, setBranch] = useState<BranchValue>("HADAYEK");
  const [category, setCategory] = useState<CategoryValue>("CLOTHES");

  // صفحة إدارية فقط
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "ADMIN") {
      setAllowed(false);
      router.replace("/pos");
    } else {
      setAllowed(true);
    }
  }, [router]);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("filter", filter);
    if (filter === "branch") params.set("branch", branch);
    if (filter === "category") params.set("category", category);
    return `/api/customers/vip?${params.toString()}`;
  }, [filter, branch, category]);

  const { data, loading, error } = useFetch<VipCustomerDTO[]>(url);
  const customers = data ?? [];

  // شارة VIP: أعلى 10% إنفاقاً (أعلى 5 من أصل 50)
  const vipIds = useMemo(() => {
    const top = [...customers]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5)
      .map((c) => c.id);
    return new Set(top);
  }, [customers]);

  if (allowed === null) return <PageLoader />;
  if (!allowed) return null;

  return (
    <div>
      <PageHeader
        title="كبار العملاء"
        description="أفضل 50 عميلاً حسب الفلتر المختار — مع شارة VIP لأعلى المنفقين"
      />

      {/* تبويبات الفلترة */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-2">
          {VIP_FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-[var(--border)] text-muted hover:text-text"
                )}
              >
                {FILTER_LABELS[f]}
              </button>
            );
          })}
        </div>

        {/* فلاتر فرعية */}
        {filter === "branch" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted">الفرع:</span>
            <select
              className="input w-auto py-1.5 text-sm"
              value={branch}
              onChange={(e) => setBranch(e.target.value as BranchValue)}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {BRANCH_LABELS[b]}
                </option>
              ))}
            </select>
          </div>
        )}
        {filter === "category" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted">الفئة:</span>
            <select
              className="input w-auto py-1.5 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryValue)}
            >
              {VIP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {loading && <PageLoader />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل العملاء: {error}
        </Card>
      )}

      {!loading && !error && customers.length === 0 && (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="لا يوجد عملاء بعد"
          description="ستظهر هنا بعد تسجيل أول عملية بيع — يُضاف العملاء تلقائياً من نقطة البيع."
        />
      )}

      {!loading && customers.length > 0 && (
        <Card className="overflow-hidden">
          {/* جدول لسطح المكتب */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-right text-sm">
              <thead>
                <tr className="border-b text-muted">
                  <th className="px-3 py-3 font-medium">الاسم</th>
                  <th className="px-3 py-3 font-medium">التليفون</th>
                  <th className="px-3 py-3 font-medium">عدد الزيارات</th>
                  <th className="px-3 py-3 font-medium">إجمالي الإنفاق</th>
                  <th className="px-3 py-3 font-medium">متوسط الفاتورة</th>
                  <th className="px-3 py-3 font-medium">آخر زيارة</th>
                  <th className="px-3 py-3 font-medium">الفرع</th>
                  <th className="px-3 py-3 font-medium">VIP</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-text hover:text-accent"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted nums">{c.phone || "—"}</td>
                    <td className="px-3 py-3 text-text nums">
                      {formatNumber(c.visitCount)}
                    </td>
                    <td className="px-3 py-3 font-bold text-text nums">
                      {formatCurrency(c.totalSpent)}
                    </td>
                    <td className="px-3 py-3 text-text nums">
                      {formatCurrency(c.avgSale)}
                    </td>
                    <td className="px-3 py-3 text-muted nums whitespace-nowrap">
                      {c.lastVisitAt ? formatDateTime(c.lastVisitAt) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {c.branch ? (
                        <BranchBadge branch={c.branch} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {vipIds.has(c.id) ? (
                        <VipBadge />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* قائمة بطاقات للموبايل */}
          <div className="divide-y divide-[var(--border)] md:hidden">
            {customers.map((c) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="block p-4 active:bg-[var(--surface-2)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold text-text">
                      <span className="truncate">{c.name}</span>
                      {vipIds.has(c.id) && <VipBadge />}
                    </p>
                    <p className="mt-0.5 text-xs text-muted nums">{c.phone || "—"}</p>
                  </div>
                  {c.branch && <BranchBadge branch={c.branch} />}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-center text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted">الزيارات</p>
                    <p className="mt-0.5 text-text nums">
                      {formatNumber(c.visitCount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">الإنفاق</p>
                    <p className="mt-0.5 font-bold text-text nums">
                      {formatCurrency(c.totalSpent)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">متوسط الفاتورة</p>
                    <p className="mt-0.5 text-text nums">
                      {formatCurrency(c.avgSale)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">آخر زيارة</p>
                    <p className="mt-0.5 text-text nums">
                      {c.lastVisitAt ? formatDateTime(c.lastVisitAt) : "—"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="border-t px-4 py-3 text-xs text-muted nums">
            {formatNumber(customers.length)} عميل
          </div>
        </Card>
      )}
    </div>
  );
}
