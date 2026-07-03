"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { QrCode, Barcode128 } from "@/components/code-visuals";
import { publicProductUrl } from "@/lib/public-url";
import { formatCurrency } from "@/lib/format";

// ============================================================
//  Feature 2 — طباعة تيكيت قابل للتخصيص
//  - اختيار الحقول الظاهرة، مقاس الورق، والتخطيط
//  - الإعدادات محفوظة في localStorage
//  - الطباعة عبر window.print() مع CSS مخصّص (body.ticket-open)
// ============================================================

export interface TicketItem {
  sku: string;
  productName: string;
  brand: string;
  size: string;
  color: string | null;
  price: number;
}

type FieldKey =
  | "name"
  | "brand"
  | "size"
  | "color"
  | "price"
  | "qr"
  | "barcode"
  | "store";

type PaperKey = "58mm" | "80mm" | "A4" | "custom";
type LayoutKey = "qrTop" | "barcodeH" | "card";

interface TicketSettings {
  fields: Record<FieldKey, boolean>;
  paper: PaperKey;
  customW: number;
  customH: number;
  layout: LayoutKey;
}

const STORE_NAME = "Euro Brands";
const STORAGE_KEY = "eb-ticket-settings";

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "اسم المنتج",
  brand: "البراند",
  size: "المقاس",
  color: "اللون",
  price: "السعر",
  qr: "QR Code",
  barcode: "Barcode",
  store: "اسم المتجر",
};

const PAPER_LABELS: Record<PaperKey, string> = {
  "58mm": "58mm حراري",
  "80mm": "80mm حراري",
  A4: "A4",
  custom: "مخصّص",
};

const LAYOUT_LABELS: Record<LayoutKey, string> = {
  qrTop: "QR كبير فوق",
  barcodeH: "باركود أفقي",
  card: "بطاقة أنيقة",
};

const DEFAULT_SETTINGS: TicketSettings = {
  fields: {
    name: true,
    brand: true,
    size: true,
    color: true,
    price: true,
    qr: true,
    barcode: true,
    store: true,
  },
  paper: "58mm",
  customW: 50,
  customH: 30,
  layout: "qrTop",
};

function loadSettings(): TicketSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      fields: { ...DEFAULT_SETTINGS.fields, ...(parsed.fields ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// عرض الورق بالمليمتر (للحاوية على الشاشة وللطباعة)
function paperWidthMm(s: TicketSettings): number {
  switch (s.paper) {
    case "58mm":
      return 54; // 58mm ورق ناقص هامش
    case "80mm":
      return 76;
    case "A4":
      return 88; // بطاقة داخل A4
    case "custom":
      return Math.max(20, s.customW);
  }
}

// قاعدة @page المحقونة وقت الطباعة حسب مقاس الورق المختار
function pageRule(s: TicketSettings): string {
  switch (s.paper) {
    case "58mm":
      return "@page { size: 58mm auto; margin: 2mm; }";
    case "80mm":
      return "@page { size: 80mm auto; margin: 2mm; }";
    case "A4":
      return "@page { size: A4; margin: 8mm; }";
    case "custom":
      return `@page { size: ${Math.max(20, s.customW)}mm ${Math.max(
        15,
        s.customH
      )}mm; margin: 2mm; }`;
  }
}

// ------------------------------------------------------------
//  تخطيطات التيكيت
// ------------------------------------------------------------
function TicketBody({
  item,
  s,
  qrSize,
}: {
  item: TicketItem;
  s: TicketSettings;
  qrSize: number;
}) {
  const f = s.fields;
  const qrValue = publicProductUrl(item.sku);
  const colorText =
    f.color && item.color ? item.color : "";

  const store = f.store ? (
    <div className="eb-tk-store">{STORE_NAME}</div>
  ) : null;

  const name = f.name ? <div className="eb-tk-name">{item.productName}</div> : null;
  const brand = f.brand ? <div className="eb-tk-brand">{item.brand}</div> : null;
  const meta =
    f.size || colorText ? (
      <div className="eb-tk-meta">
        {f.size ? <span>المقاس: {item.size}</span> : null}
        {colorText ? <span>اللون: {colorText}</span> : null}
      </div>
    ) : null;
  const price = f.price ? (
    <div className="eb-tk-price">{formatCurrency(item.price)}</div>
  ) : null;
  const qr = f.qr ? (
    <div className="eb-tk-qr">
      <QrCode value={qrValue} size={qrSize} />
    </div>
  ) : null;
  const barcode = f.barcode ? (
    <div className="eb-tk-barcode">
      <Barcode128 value={item.sku} height={38} width={1.4} fontSize={11} />
    </div>
  ) : null;

  if (s.layout === "barcodeH") {
    return (
      <>
        {store}
        {name}
        {brand}
        {meta}
        <div className="eb-tk-row">
          <div className="eb-tk-row-main">
            {barcode}
            {price}
          </div>
          {qr ? (
            <div className="eb-tk-qr eb-tk-qr-sm">
              <QrCode value={qrValue} size={Math.round(qrSize * 0.6)} />
            </div>
          ) : null}
        </div>
      </>
    );
  }

  if (s.layout === "card") {
    return (
      <div className="eb-tk-card">
        {store ? <div className="eb-tk-card-head">{STORE_NAME}</div> : null}
        <div className="eb-tk-card-body">
          <div className="eb-tk-card-info">
            {name}
            {brand}
            {meta}
            {price}
          </div>
          {qr}
        </div>
        {barcode}
      </div>
    );
  }

  // qrTop (افتراضي): QR كبير فوق
  return (
    <>
      {store}
      {qr}
      {name}
      {brand}
      {meta}
      {price}
      {barcode}
    </>
  );
}

export function TicketPrintModal({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: TicketItem[];
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<TicketSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // تحميل الإعدادات المحفوظة عند أول فتح
  useEffect(() => {
    if (open && !loaded) {
      setSettings(loadSettings());
      setLoaded(true);
    }
  }, [open, loaded]);

  // حفظ الإعدادات كلما تغيّرت
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        /* تجاهل */
      }
    }
  }, [settings, loaded]);

  // فئة على body لعزل التيكيت أثناء الطباعة + حقن قاعدة @page
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("ticket-open");
    const style = document.createElement("style");
    style.id = "eb-ticket-page-style";
    style.textContent = `@media print { ${pageRule(settings)} }`;
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove("ticket-open");
      document.getElementById("eb-ticket-page-style")?.remove();
    };
  }, [open, settings]);

  const widthMm = paperWidthMm(settings);
  const qrSize = settings.paper === "58mm" ? 96 : 120;
  const thermal = settings.paper !== "A4";

  const printItems = useMemo(
    () => items.filter((it) => it.sku && it.sku.trim()),
    [items]
  );

  function toggleField(key: FieldKey) {
    setSettings((s) => ({
      ...s,
      fields: { ...s.fields, [key]: !s.fields[key] },
    }));
  }

  if (!open) return null;

  const noSku = printItems.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`طباعة تيكيت — ${printItems.length} صنف`}
      size="xl"
    >
      {noSku ? (
        <p className="py-6 text-center text-sm text-muted">
          لا توجد أصناف لها كود SKU للطباعة. احفظ المنتج أولاً لتوليد الأكواد.
        </p>
      ) : (
        <div className="no-print grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* الإعدادات */}
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-bold text-text">
                البيانات الظاهرة على التيكيت
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={settings.fields[key]}
                      onChange={() => toggleField(key)}
                      className="h-4 w-4 accent-[#6c63ff]"
                    />
                    {FIELD_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">مقاس الورق</label>
                <select
                  className="input"
                  value={settings.paper}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      paper: e.target.value as PaperKey,
                    }))
                  }
                >
                  {(Object.keys(PAPER_LABELS) as PaperKey[]).map((p) => (
                    <option key={p} value={p}>
                      {PAPER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">التخطيط</label>
                <select
                  className="input"
                  value={settings.layout}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      layout: e.target.value as LayoutKey,
                    }))
                  }
                >
                  {(Object.keys(LAYOUT_LABELS) as LayoutKey[]).map((l) => (
                    <option key={l} value={l}>
                      {LAYOUT_LABELS[l]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {settings.paper === "custom" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">العرض (mm)</label>
                  <input
                    type="number"
                    className="input nums"
                    value={settings.customW}
                    min={20}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        customW: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label">الارتفاع (mm)</label>
                  <input
                    type="number"
                    className="input nums"
                    value={settings.customH}
                    min={15}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        customH: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-primary w-full"
            >
              <Printer className="h-4 w-4" />
              طباعة {printItems.length > 1 ? `(${printItems.length})` : ""}
            </button>
          </div>

          {/* المعاينة */}
          <div>
            <p className="mb-2 text-sm font-bold text-text">معاينة</p>
            <div className="flex max-h-[60vh] justify-center overflow-auto rounded-lg bg-[var(--surface-2)] p-4">
              <div
                className="eb-ticket"
                style={{ width: `${widthMm}mm` }}
              >
                <TicketBody item={printItems[0]} s={settings} qrSize={qrSize} />
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted">
              معاينة أول صنف — تُطبع كل الأصناف المحدّدة.
            </p>
          </div>
        </div>
      )}

      {/* حاوية الطباعة الفعلية (تظهر فقط عند الطباعة) */}
      <div className="print-ticket" aria-hidden>
        <div className={thermal ? "eb-tickets-thermal" : "eb-tickets-a4"}>
          {printItems.map((it, i) => (
            <div
              key={`${it.sku}-${i}`}
              className="eb-ticket"
              style={{ width: `${widthMm}mm` }}
            >
              <TicketBody item={it} s={settings} qrSize={qrSize} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
