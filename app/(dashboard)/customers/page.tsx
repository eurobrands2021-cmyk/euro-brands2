"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchBadge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import type { CustomerListResponse } from "@/lib/types";

type SortKey = "newest" | "totalSpent" | "lastVisitAt";

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [debounced, sort]);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (sort !== "newest") params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return `/api/customers?${params.toString()}`;
  }, [debounced, sort, page]);

  const { data, loading, error } = useFetch<CustomerListResponse>(url);
  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="العملاء" description="سجل العملاء وتاريخ زياراتهم وإنفاقهم" />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pr-9"
              placeholder="بحث بالاسم أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="newest">الأحدث</option>
            <option value="totalSpent">الأكثر إنفاقاً</option>
            <option value="lastVisitAt">آخر زيارة</option>
          </select>
        </div>
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
          title={debounced ? "لا توجد نتائج مطابقة" : "لا يوجد عملاء بعد"}
          description={
            debounced
              ? "جرّب تعديل كلمة البحث."
              : "يُضاف العملاء تلقائياً عند حفظهم من نقطة البيع."
          }
        />
      )}

      {!loading && customers.length > 0 && (
        <Card className="overflow-hidden">
          {/* جدول لسطح المكتب */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[680px] text-right text-sm">
              <thead>
                <tr className="border-b text-muted">
                  <th className="px-3 py-3 font-medium">الاسم</th>
                  <th className="px-3 py-3 font-medium">التليفون</th>
                  <th className="px-3 py-3 font-medium">عدد الزيارات</th>
                  <th className="px-3 py-3 font-medium">إجمالي الإنفاق</th>
                  <th className="px-3 py-3 font-medium">آخر زيارة</th>
                  <th className="px-3 py-3 font-medium">الفرع</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* قائمة بطاقات للموبايل */}
          <div className="divide-y divide-[var(--border)] sm:hidden">
            {customers.map((c) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="block p-4 active:bg-[var(--surface-2)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-text">{c.name}</p>
                    <p className="mt-0.5 text-xs text-muted nums">{c.phone || "—"}</p>
                  </div>
                  {c.branch && <BranchBadge branch={c.branch} />}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center text-sm">
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
                    <p className="text-xs text-muted">آخر زيارة</p>
                    <p className="mt-0.5 text-text nums">
                      {c.lastVisitAt ? formatDateTime(c.lastVisitAt) : "—"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* التصفح */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
              <span className="text-muted nums">
                صفحة {formatNumber(page)} من {formatNumber(totalPages)} ·{" "}
                {formatNumber(total)} عميل
              </span>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary h-9 px-2 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                  السابق
                </button>
                <button
                  className="btn btn-secondary h-9 px-2 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  التالي
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
