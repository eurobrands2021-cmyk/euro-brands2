"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  X,
  ReceiptText,
  FileSpreadsheet,
  FileDown,
  Ban,
  Eye,
  Pencil,
  Truck,
  Banknote,
  Wallet,
  Tag,
  XCircle,
} from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPost } from "@/lib/client";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { PageHeader } from "@/components/ui/page-header";
import { Card, StatCard } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { BranchBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import {
  BRANCHES,
  BRANCH_LABELS,
  SALE_STATUS_LABELS,
} from "@/lib/constants";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSaleNumber,
} from "@/lib/format";
import {
  computeSalesSummary,
  generateSalesExcel,
  generateSalesPdf,
  paymentLabel,
} from "@/lib/sales-export";
import type { SaleDTO } from "@/lib/types";

const PAYMENT_FILTERS = [
  { value: "CASH", label: "كاش" },
  { value: "VISA", label: "فيزا" },
  { value: "VODAFONE_CASH", label: "فودافون كاش" },
  { value: "INSTAPAY", label: "انستا باي" },
];
const STATUS_FILTERS = [
  { value: "COMPLETED", label: "مكتملة" },
  { value: "CANCELLED", label: "ملغية" },
  { value: "REMAINING", label: "رصيد متبقٍ" },
];

function rowTone(s: SaleDTO): string {
  if (s.status === "CANCELLED") return "bg-[rgba(217,83,79,0.08)]";
  if (s.remainingAmount > 0) return "bg-[rgba(201,133,26,0.08)]";
  return "bg-[rgba(59,154,110,0.05)]";
}

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [branch, setBranch] = useState("");
  const [payment, setPayment] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cancelTarget, setCancelTarget] = useState<SaleDTO | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    if (debounced) params.set("search", debounced);
    if (payment) params.set("payment", payment);
    if (status) params.set("status", status);
    if (from) params.set("from", startOfDay(new Date(from)).toISOString());
    if (to) params.set("to", endOfDay(new Date(to)).toISOString());
    const qs = params.toString();
    return `/api/sales${qs ? `?${qs}` : ""}`;
  }, [branch, debounced, payment, status, from, to]);

  const { data, loading, error, refetch } = useFetch<SaleDTO[]>(url);
  const sales = data ?? [];
  const summary = useMemo(() => computeSalesSummary(sales), [sales]);
  const hasFilters = !!(search || branch || payment || status || from || to);

  function clearFilters() {
    setSearch("");
    setBranch("");
    setPayment("");
    setStatus("");
    setFrom("");
    setTo("");
  }

  async function doCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiPost(`/api/sales/${cancelTarget.id}/cancel`, {
        reason: cancelReason,
      });
      void logActivity(
        ACTIVITY_ACTIONS.CANCEL_SALE,
        `فاتورة ${formatSaleNumber(cancelTarget.saleNumber)}${
          cancelReason ? ` — ${cancelReason}` : ""
        }`
      );
      toast.success("تم إلغاء الفاتورة وإعادة الكميات للمخزون");
      setCancelTarget(null);
      setCancelReason("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إلغاء الفاتورة");
    } finally {
      setCancelling(false);
    }
  }

  async function exportFile(kind: "excel" | "pdf") {
    if (sales.length === 0) return toast.error("لا توجد فواتير للتصدير");
    setExporting(kind);
    try {
      if (kind === "excel") await generateSalesExcel(sales, summary);
      else await generateSalesPdf(sales, summary);
    } catch {
      toast.error("تعذّر التصدير");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="سجل الفواتير"
        description="جميع الفواتير مرتبة من الأحدث للأقدم"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportFile("excel")}
              disabled={exporting !== null || sales.length === 0}
              className="btn btn-secondary"
            >
              {exporting === "excel" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              تصدير Excel
            </button>
            <button
              onClick={() => exportFile("pdf")}
              disabled={exporting !== null || sales.length === 0}
              className="btn btn-secondary"
            >
              {exporting === "pdf" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              تصدير PDF
            </button>
          </div>
        }
      />

      {/* الفلاتر */}
      <Card className="mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pr-9"
              placeholder="رقم الفاتورة / العميل / الهاتف / اسم منتج"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="">كل الفروع</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {BRANCH_LABELS[b]}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
          >
            <option value="">كل طرق الدفع</option>
            {PAYMENT_FILTERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">كل الحالات</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="من تاريخ"
          />
          <input
            type="date"
            className="input"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="إلى تاريخ"
          />
        </div>
        {hasFilters && (
          <button
            className="btn btn-ghost mt-3 h-8 px-2 text-xs"
            onClick={clearFilters}
          >
            <X className="h-4 w-4" />
            مسح الفلاتر
          </button>
        )}
      </Card>

      {/* بطاقات الملخّص */}
      {!loading && !error && sales.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard
            tone="accent"
            title="إجمالي المبيعات"
            value={formatCurrency(summary.totalSales)}
            icon={<Banknote className="h-5 w-5" />}
          />
          <StatCard
            tone="accent"
            title="عدد الفواتير"
            value={formatNumber(summary.count)}
            icon={<ReceiptText className="h-5 w-5" />}
          />
          <StatCard
            tone="warning"
            title="إجمالي الخصومات"
            value={formatCurrency(summary.discounts)}
            icon={<Tag className="h-5 w-5" />}
          />
          <StatCard
            tone="warning"
            title="الرصيد المتبقي"
            value={formatCurrency(summary.remaining)}
            icon={<Wallet className="h-5 w-5" />}
          />
          <StatCard
            tone="warning"
            title="فواتير ملغية"
            value={formatNumber(summary.cancelledCount)}
            subtitle={`بقيمة ${formatCurrency(summary.cancelledValue)}`}
            icon={<XCircle className="h-5 w-5" />}
          />
        </div>
      )}

      {loading && <PageLoader />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل الفواتير: {error}
        </Card>
      )}

      {!loading && !error && sales.length === 0 && (
        <EmptyState
          icon={<ReceiptText className="h-7 w-7" />}
          title="لا توجد فواتير"
          description={
            hasFilters
              ? "لا توجد فواتير مطابقة للفلاتر المحددة."
              : "ستظهر الفواتير هنا بعد تسجيل أول عملية بيع."
          }
        />
      )}

      {!loading && sales.length > 0 && (
        <Card className="p-2 sm:p-4">
          {/* جدول لسطح المكتب */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[860px] text-right text-sm">
              <thead>
                <tr className="border-b text-muted">
                  <th className="px-3 py-3 font-medium">رقم الفاتورة</th>
                  <th className="px-3 py-3 font-medium">التاريخ</th>
                  <th className="px-3 py-3 font-medium">الفرع</th>
                  <th className="px-3 py-3 font-medium">العميل</th>
                  <th className="px-3 py-3 font-medium">الدفع</th>
                  <th className="px-3 py-3 font-medium">الصافي</th>
                  <th className="px-3 py-3 font-medium">المتبقي</th>
                  <th className="px-3 py-3 font-medium">الحالة</th>
                  <th className="px-3 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className={cn(
                      "border-b border-[var(--border)]",
                      rowTone(sale)
                    )}
                  >
                    <td className="px-3 py-3 font-bold text-accent nums">
                      {formatSaleNumber(sale.saleNumber)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted nums">
                      {formatDateTime(sale.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <BranchBadge branch={sale.branch} />
                    </td>
                    <td className="px-3 py-3 text-text">
                      {sale.customerName || (
                        <span className="text-muted">عميل عابر</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted">{paymentLabel(sale)}</td>
                    <td className="px-3 py-3 font-bold text-text nums">
                      {formatCurrency(sale.finalAmount)}
                    </td>
                    <td className="px-3 py-3 nums">
                      {sale.remainingAmount > 0 ? (
                        <span className="font-medium text-warning">
                          {formatCurrency(sale.remainingAmount)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge sale={sale} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <Link
                          href={`/sales/${sale.id}`}
                          className="btn btn-ghost h-8 w-8 !px-0"
                          aria-label="عرض"
                          title="عرض الفاتورة"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {sale.status !== "CANCELLED" && (
                          <Link
                            href={`/sales/${sale.id}/edit`}
                            className="btn btn-ghost h-8 w-8 !px-0"
                            aria-label="تعديل"
                            title="تعديل الفاتورة"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        )}
                        {sale.status !== "CANCELLED" && (
                          <button
                            onClick={() => setCancelTarget(sale)}
                            className="btn btn-ghost h-8 w-8 !px-0 text-danger"
                            aria-label="إلغاء"
                            title="إلغاء الفاتورة"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* بطاقات للموبايل */}
          <div className="space-y-3 sm:hidden">
            {sales.map((sale) => (
              <div
                key={sale.id}
                className={cn("rounded-xl border p-4", rowTone(sale))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-accent nums">
                      {formatSaleNumber(sale.saleNumber)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted nums">
                      {formatDateTime(sale.createdAt)}
                    </p>
                  </div>
                  <StatusBadge sale={sale} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <BranchBadge branch={sale.branch} />
                  <span className="text-muted">{paymentLabel(sale)}</span>
                  {sale.customerName && (
                    <span className="text-text">· {sale.customerName}</span>
                  )}
                </div>
                <div className="mt-3 flex items-end justify-between border-t pt-3">
                  <div>
                    <p className="text-xs text-muted">الصافي</p>
                    <p className="font-bold text-text nums">
                      {formatCurrency(sale.finalAmount)}
                    </p>
                    {sale.remainingAmount > 0 && (
                      <p className="text-xs font-medium text-warning nums">
                        متبقٍ: {formatCurrency(sale.remainingAmount)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/sales/${sale.id}`}
                      className="btn btn-secondary h-9 text-xs"
                    >
                      <Eye className="h-4 w-4" />
                      عرض
                    </Link>
                    {sale.status !== "CANCELLED" && (
                      <Link
                        href={`/sales/${sale.id}/edit`}
                        className="btn btn-secondary h-9 text-xs"
                      >
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Link>
                    )}
                    {sale.status !== "CANCELLED" && (
                      <button
                        onClick={() => setCancelTarget(sale)}
                        className="btn btn-ghost h-9 text-xs text-danger"
                      >
                        <Ban className="h-4 w-4" />
                        إلغاء
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* نافذة الإلغاء */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="إلغاء الفاتورة"
        size="sm"
        footer={
          <>
            <button
              className="btn btn-danger w-full sm:w-auto"
              onClick={doCancel}
              disabled={cancelling}
            >
              {cancelling && <Spinner className="h-4 w-4" />}
              تأكيد الإلغاء
            </button>
            <button
              className="btn btn-secondary w-full sm:w-auto"
              onClick={() => setCancelTarget(null)}
              disabled={cancelling}
            >
              تراجع
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          سيتم تعليم الفاتورة{" "}
          <span className="font-bold text-text nums">
            {cancelTarget && formatSaleNumber(cancelTarget.saleNumber)}
          </span>{" "}
          كملغية وإعادة كمياتها إلى المخزون. لا يمكن التراجع.
        </p>
        <label className="label mt-3">سبب الإلغاء</label>
        <textarea
          className="input min-h-[70px] resize-y"
          placeholder="مثال: إرجاع العميل، خطأ في الفاتورة..."
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

// شارات الحالة الملوّنة: مكتملة=أخضر · ملغية=أحمر · توصيل=أزرق · رصيد=أصفر
function StatusBadge({ sale }: { sale: SaleDTO }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sale.status === "CANCELLED" ? (
        <span className="badge gap-1 bg-[rgba(217,83,79,0.14)] text-danger">
          <Ban className="h-3 w-3" />
          {SALE_STATUS_LABELS.CANCELLED}
        </span>
      ) : sale.remainingAmount > 0 ? (
        <span className="badge bg-[rgba(201,133,26,0.14)] text-warning">
          رصيد متبقٍ
        </span>
      ) : (
        <span className="badge bg-[rgba(59,154,110,0.14)] text-success">
          مكتملة
        </span>
      )}
      {sale.isDelivery && sale.status !== "CANCELLED" && (
        <span className="badge gap-1 bg-[rgba(72,120,229,0.14)] text-[#4878e5]">
          <Truck className="h-3 w-3" />
          توصيل
        </span>
      )}
    </span>
  );
}
