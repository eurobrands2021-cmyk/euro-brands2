"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RotateCcw, Repeat, ArrowLeftRight, Coins } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import {
  BRANCHES,
  BRANCH_LABELS,
  RETURN_TYPES,
  RETURN_TYPE_LABELS,
  REFUND_METHOD_LABELS,
  type BranchValue,
} from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, StatCard } from "@/components/ui/card";
import { BranchBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import type { ReturnsListResponse } from "@/lib/types";

export default function ReturnsPage() {
  const [branch, setBranch] = useState<BranchValue | "">("");
  const [type, setType] = useState<"" | "RETURN" | "EXCHANGE">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const url = useMemo(() => {
    const sp = new URLSearchParams();
    if (branch) sp.set("branch", branch);
    if (type) sp.set("type", type);
    if (from) sp.set("from", new Date(from).toISOString());
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      sp.set("to", end.toISOString());
    }
    const qs = sp.toString();
    return `/api/returns${qs ? `?${qs}` : ""}`;
  }, [branch, type, from, to]);

  const { data, loading, error } = useFetch<ReturnsListResponse>(url);
  const returns = data?.returns ?? [];
  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="المرتجعات والاستبدال"
        description="سجل عمليات الإرجاع واستبدال الأصناف على الفواتير"
      />

      {/* المؤشّرات */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="إجمالي العمليات"
          value={formatNumber(summary?.count ?? 0)}
          icon={<ArrowLeftRight className="h-5 w-5" />}
        />
        <StatCard
          title="عمليات إرجاع"
          value={formatNumber(summary?.returnCount ?? 0)}
          tone="success"
          icon={<RotateCcw className="h-5 w-5" />}
        />
        <StatCard
          title="عمليات استبدال"
          value={formatNumber(summary?.exchangeCount ?? 0)}
          icon={<Repeat className="h-5 w-5" />}
        />
        <StatCard
          title="إجمالي المُسترَد"
          value={formatCurrency(summary?.refundTotal ?? 0)}
          tone="warning"
          icon={<Coins className="h-5 w-5" />}
        />
      </div>

      {/* الفلاتر */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">الفرع</label>
            <select
              className="input"
              value={branch}
              onChange={(e) => setBranch(e.target.value as BranchValue | "")}
            >
              <option value="">كل الفروع</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {BRANCH_LABELS[b]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">النوع</label>
            <select
              className="input"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "" | "RETURN" | "EXCHANGE")
              }
            >
              <option value="">الكل</option>
              {RETURN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RETURN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">من تاريخ</label>
            <input
              type="date"
              className="input nums"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">إلى تاريخ</label>
            <input
              type="date"
              className="input nums"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {loading && <TableSkeleton />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل المرتجعات: {error}
        </Card>
      )}

      {!loading && !error && returns.length === 0 && (
        <EmptyState
          icon={<ArrowLeftRight className="h-7 w-7" />}
          title="لا توجد مرتجعات"
          description="تظهر هنا عمليات الإرجاع والاستبدال المسجّلة على الفواتير."
        />
      )}

      {!loading && !error && returns.length > 0 && (
        <div className="space-y-3">
          {returns.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`badge ${
                      r.type === "EXCHANGE"
                        ? "bg-accent-soft text-accent"
                        : "bg-[rgba(59,154,110,0.14)] text-success"
                    }`}
                  >
                    {r.type === "EXCHANGE" ? (
                      <Repeat className="ml-1 h-3.5 w-3.5" />
                    ) : (
                      <RotateCcw className="ml-1 h-3.5 w-3.5" />
                    )}
                    {RETURN_TYPE_LABELS[r.type]}
                  </span>
                  <BranchBadge branch={r.branch} />
                  <Link
                    href={`/sales/${r.saleId}`}
                    className="text-sm font-medium text-accent hover:underline nums"
                  >
                    فاتورة #{formatNumber(r.saleNumber)}
                  </Link>
                </div>
                <span className="text-xs text-muted nums">
                  {formatDateTime(r.createdAt)}
                  {r.createdBy ? ` · ${r.createdBy}` : ""}
                </span>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-muted">
                {r.items.map((it) => (
                  <li key={it.id} className="nums">
                    • {it.productName} — مقاس {it.size}
                    {it.color ? ` / ${it.color}` : ""} × {formatNumber(it.quantity)}
                    {it.exchangeSize
                      ? ` ← بديل: مقاس ${it.exchangeSize}${it.exchangeColor ? ` / ${it.exchangeColor}` : ""}`
                      : ""}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                <span className="text-muted">
                  {r.reason ? `السبب: ${r.reason}` : "—"}
                  {r.refundMethod
                    ? ` · ${REFUND_METHOD_LABELS[r.refundMethod]}`
                    : ""}
                </span>
                <span className="font-bold nums">
                  {r.type === "RETURN" ? (
                    <span className="text-success">
                      استرداد {formatCurrency(r.refundTotal)}
                    </span>
                  ) : r.exchangeDifference >= 0 ? (
                    <span className="text-warning">
                      فرق للدفع {formatCurrency(r.exchangeDifference)}
                    </span>
                  ) : (
                    <span className="text-success">
                      يُرد {formatCurrency(Math.abs(r.exchangeDifference))}
                    </span>
                  )}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
