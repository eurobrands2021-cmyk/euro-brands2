"use client";

import { useEffect } from "react";
import { Wallet, RotateCcw, RefreshCcw } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { formatCurrency } from "@/lib/format";
import { BRANCH_LABELS, type BranchValue } from "@/lib/constants";
import type { HomeStats } from "@/lib/types";

// ملخّص نقدية اليوم للفرع الحالي داخل نقطة البيع (مبيعات − مرتجعات = صافي).
// يُحدَّث تلقائياً كل 60 ثانية + زر تحديث يدوي.
export function PosTodaySummary({ branch }: { branch: BranchValue }) {
  const { data, loading, refetch } = useFetch<HomeStats>("/api/home-stats");

  useEffect(() => {
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, [refetch]);

  const b = data?.byBranch.find((x) => x.branch === branch)?.today;

  return (
    <div className="card card-accent mb-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Wallet className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-xs text-muted">
              نقدية اليوم — {BRANCH_LABELS[branch]}
            </p>
            <p className="text-xl font-extrabold text-text nums">
              {loading ? "…" : formatCurrency(b?.netCash ?? 0)}
            </p>
          </div>
        </div>
        <button
          onClick={refetch}
          className="btn btn-ghost h-8 px-2 text-xs"
          title="تحديث"
          aria-label="تحديث ملخّص اليوم"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>

      {!loading && b && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-3 text-xs">
          <span className="text-muted">
            المبيعات:{" "}
            <span className="font-bold text-text nums">
              {formatCurrency(b.sales)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-muted">
            <RotateCcw className="h-3.5 w-3.5" />
            المرتجعات:{" "}
            <span className="font-bold text-danger nums">
              − {formatCurrency(b.refunds)}
            </span>
          </span>
          {b.exchangeUpcharge > 0 && (
            <span className="text-muted">
              فرق استبدال:{" "}
              <span className="font-bold text-success nums">
                + {formatCurrency(b.exchangeUpcharge)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
