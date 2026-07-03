"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Printer, Pencil, Clock, Ban } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { InvoiceDocument } from "@/components/invoice-document";
import { InvoiceTemplatePicker } from "@/components/invoice-template-picker";
import { PrintInvoiceModal } from "@/components/print-invoice-modal";
import {
  loadInvoiceTemplate,
  saveInvoiceTemplate,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";
import { formatDateTime } from "@/lib/format";
import type { SaleDTO } from "@/lib/types";

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useFetch<SaleDTO>(`/api/sales/${params.id}`);

  const [template, setTemplate] = useState<InvoiceTemplate>("classic");
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    setTemplate(loadInvoiceTemplate());
  }, []);

  function changeTemplate(t: InvoiceTemplate) {
    setTemplate(t);
    saveInvoiceTemplate(t);
  }

  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <Card className="p-6 text-center text-danger">
        {error || "الفاتورة غير موجودة"}
      </Card>
    );

  const cancelled = data.status === "CANCELLED";

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
          {!cancelled && (
            <Link
              href={`/sales/${data.id}/edit`}
              className="btn btn-secondary h-9 text-sm"
            >
              <Pencil className="h-4 w-4" />
              تعديل
            </Link>
          )}
          <button
            onClick={() => setPrintOpen(true)}
            className="btn btn-primary h-9 text-sm"
          >
            <Printer className="h-4 w-4" />
            طباعة
          </button>
        </div>
      </div>

      {/* حالة الفاتورة + آخر تعديل */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        {cancelled && (
          <span className="badge bg-[rgba(217,83,79,0.14)] text-danger">
            <Ban className="ml-1 h-3.5 w-3.5" />
            ملغية{data.cancellationReason ? ` — ${data.cancellationReason}` : ""}
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
        <InvoiceDocument sale={data} template={template} size="a4" />
      </div>

      <PrintInvoiceModal
        sale={data}
        template={template}
        open={printOpen}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
