"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Printer,
  Zap,
  Pencil,
  Clock,
  Ban,
  Lock,
  LockOpen,
  RotateCcw,
  Repeat,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { apiPost } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { InvoiceDocument } from "@/components/invoice-document";
import { InvoiceTemplatePicker } from "@/components/invoice-template-picker";
import { PrintInvoiceModal } from "@/components/print-invoice-modal";
import { InvoicePrintSurface } from "@/components/invoice-print-surface";
import { ReturnModal } from "@/components/return-modal";
import { useSettings } from "@/components/settings-provider";
import { useInvoiceBranding } from "@/lib/use-invoice-branding";
import { usePrintSettings } from "@/lib/use-print-settings";
import { triggerInvoicePrint } from "@/lib/print-trigger";
import type { PrintFontSize, PrintSize } from "@/lib/print-settings";
import { invoiceLockInfo } from "@/lib/invoice-lock";
import {
  loadInvoiceTemplate,
  saveInvoiceTemplate,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  RETURN_TYPE_LABELS,
  REFUND_METHOD_LABELS,
} from "@/lib/constants";
import type { SaleDTO, ReturnsListResponse } from "@/lib/types";

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error, refetch, setData } = useFetch<SaleDTO>(
    `/api/sales/${params.id}`
  );
  const { data: returnsData, refetch: refetchReturns } =
    useFetch<ReturnsListResponse>(`/api/returns?saleId=${params.id}`);
  const returns = returnsData?.returns ?? [];
  const { settings } = useSettings();
  const branding = useInvoiceBranding();
  const { settings: printSettings } = usePrintSettings();

  const [template, setTemplate] = useState<InvoiceTemplate>("classic");
  const [printOpen, setPrintOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // مقاس/خط الطباعة الحالي للحاوية المخفية — يبدأ من الإعدادات المحفوظة.
  const [printSize, setPrintSize] = useState<PrintSize>("80mm");
  const [printFontSize, setPrintFontSize] = useState<PrintFontSize>("medium");
  const [printNonce, setPrintNonce] = useState(0);
  const pendingPrint = useRef(false);

  useEffect(() => {
    setTemplate(loadInvoiceTemplate());
  }, []);

  // زامن مقاس/خط الطباعة مع الإعدادات المحفوظة (للطباعة المباشرة الافتراضية).
  useEffect(() => {
    setPrintSize(printSettings.size);
    setPrintFontSize(printSettings.fontSize);
  }, [printSettings.size, printSettings.fontSize]);

  // بعد أن تعكس الحاوية المخفية المقاس المطلوب، شغّل الطباعة.
  useEffect(() => {
    if (!pendingPrint.current) return;
    pendingPrint.current = false;
    triggerInvoicePrint(printSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printNonce]);

  function requestPrint(size: PrintSize, fontSize: PrintFontSize) {
    setPrintSize(size);
    setPrintFontSize(fontSize);
    pendingPrint.current = true;
    setPrintNonce((n) => n + 1);
  }

  function changeTemplate(t: InvoiceTemplate) {
    setTemplate(t);
    saveInvoiceTemplate(t);
  }

  async function handleUnlock() {
    if (!data) return;
    if (!reason.trim()) {
      toast.error("سبب فتح القفل مطلوب");
      return;
    }
    setUnlocking(true);
    try {
      const updated = await apiPost<SaleDTO>(`/api/sales/${data.id}/unlock`, {
        reason: reason.trim(),
        by: getSession()?.name ?? "المدير",
      });
      setData(updated);
      toast.success("تم فتح القفل — يمكنك الآن تعديل الفاتورة");
      setUnlockOpen(false);
      setReason("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر فتح القفل");
    } finally {
      setUnlocking(false);
    }
  }

  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <Card className="p-6 text-center text-danger">
        {error || "الفاتورة غير موجودة"}
      </Card>
    );

  const cancelled = data.status === "CANCELLED";
  const lock = invoiceLockInfo(
    data.createdAt,
    settings.lockDays,
    data.unlockedAt
  );
  const isAdmin = getSession()?.role === "ADMIN";
  const canEdit = !cancelled && !lock.locked;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/sales"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع إلى السجل
        </Link>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link
              href={`/sales/${data.id}/edit`}
              className="btn btn-secondary h-9 text-sm"
            >
              <Pencil className="h-4 w-4" />
              تعديل
            </Link>
          )}
          {lock.locked && isAdmin && (
            <button
              onClick={() => setUnlockOpen(true)}
              className="btn btn-secondary h-9 text-sm"
            >
              <LockOpen className="h-4 w-4" />
              فتح القفل
            </button>
          )}
          {!cancelled && (
            <button
              onClick={() => setReturnOpen(true)}
              className="btn btn-secondary h-9 text-sm"
              title="إرجاع أو استبدال أصناف من هذه الفاتورة"
            >
              <RotateCcw className="h-4 w-4" />
              إرجاع / استبدال
            </button>
          )}
          <button
            onClick={() => requestPrint(printSettings.size, printSettings.fontSize)}
            className="btn btn-secondary h-9 text-sm"
            title="طباعة بالمقاس والإعدادات المحفوظة مباشرة"
          >
            <Zap className="h-4 w-4" />
            طباعة مباشرة
          </button>
          <button
            onClick={() => setPrintOpen(true)}
            className="btn btn-primary h-9 text-sm"
          >
            <Printer className="h-4 w-4" />
            طباعة
          </button>
        </div>
      </div>

      {/* حالة الفاتورة + القفل + آخر تعديل */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        {cancelled && (
          <span className="badge bg-[rgba(217,83,79,0.14)] text-danger">
            <Ban className="ml-1 h-3.5 w-3.5" />
            ملغية{data.cancellationReason ? ` — ${data.cancellationReason}` : ""}
          </span>
        )}
        {lock.locked && (
          <span className="badge bg-[rgba(201,133,26,0.14)] text-warning">
            <Lock className="ml-1 h-3.5 w-3.5" />
            مقفلة (أقدم من {settings.lockDays} يوم)
          </span>
        )}
        {lock.wasUnlocked && !lock.locked && (
          <span className="badge bg-accent-soft text-accent">
            <LockOpen className="ml-1 h-3.5 w-3.5" />
            فُتح القفل يدوياً
            {data.unlockReason ? ` — ${data.unlockReason}` : ""}
          </span>
        )}
        {data.lastEditedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5" />
            آخر تعديل: <span className="nums">{formatDateTime(data.lastEditedAt)}</span>
          </span>
        )}
      </div>

      {/* منتقي القالب */}
      <Card className="no-print mb-4 p-4">
        <p className="mb-2 text-sm font-medium text-text">قالب الفاتورة</p>
        <InvoiceTemplatePicker value={template} onChange={changeTemplate} />
      </Card>

      {/* المعاينة الحيّة بالقالب المختار */}
      <div className="overflow-x-auto rounded-xl border bg-[var(--surface-2)] p-3 sm:p-5">
        <InvoiceDocument
          sale={data}
          template={template}
          size="a4"
          branding={branding}
        />
      </div>

      {/* سجل المرتجعات/الاستبدال على هذه الفاتورة */}
      {returns.length > 0 && (
        <Card className="no-print mt-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-text">
              سجل الإرجاع والاستبدال
            </h2>
          </div>
          <div className="space-y-3">
            {returns.map((r) => (
              <div
                key={r.id}
                className="rounded-[var(--radius-md)] border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="nums">{formatDateTime(r.createdAt)}</span>
                    {r.createdBy ? ` · ${r.createdBy}` : ""}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {r.items.map((it) => (
                    <li key={it.id} className="nums">
                      • {it.productName} — مقاس {it.size}
                      {it.color ? ` / ${it.color}` : ""} × {it.quantity}
                      {it.exchangeSize
                        ? ` ← بديل: مقاس ${it.exchangeSize}${it.exchangeColor ? ` / ${it.exchangeColor}` : ""}`
                        : ""}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs">
                  {r.refundMethod && (
                    <span className="text-muted">
                      الاسترداد: {REFUND_METHOD_LABELS[r.refundMethod]}
                    </span>
                  )}
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
              </div>
            ))}
          </div>
        </Card>
      )}

      <ReturnModal
        sale={data}
        returns={returns}
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        onDone={() => {
          refetch();
          refetchReturns();
        }}
      />

      <PrintInvoiceModal
        sale={data}
        template={template}
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        onPrint={(size, fontSize) => {
          setPrintOpen(false);
          requestPrint(size, fontSize);
        }}
      />

      {/* حاوية الطباعة المخفية — تُطبَع وحدها بالمقاس المختار */}
      <InvoicePrintSurface
        sale={data}
        template={template}
        branding={branding}
        settings={{
          ...printSettings,
          size: printSize,
          fontSize: printFontSize,
        }}
      />

      {/* نافذة فتح القفل (للمدير) — تتطلب سبباً يُسجَّل في التدقيق */}
      <Modal
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        title="فتح قفل الفاتورة"
        footer={
          <>
            <button
              onClick={handleUnlock}
              disabled={unlocking}
              className="btn btn-primary w-full sm:w-auto"
            >
              <LockOpen className="h-4 w-4" />
              {unlocking ? "جارٍ…" : "فتح القفل"}
            </button>
            <button
              onClick={() => setUnlockOpen(false)}
              className="btn btn-ghost w-full sm:w-auto"
            >
              إلغاء
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          فتح قفل فاتورة قديمة يتيح تعديلها. سيُسجَّل السبب في سجل التدقيق.
        </p>
        <label className="label">سبب فتح القفل</label>
        <textarea
          className="input min-h-[90px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="مثال: تصحيح خطأ في الكمية بطلب من الإدارة"
        />
      </Modal>
    </div>
  );
}
