"use client";

import { useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { SizeSelect, ColorSelect } from "@/components/ui/variant-selects";
import { apiPost } from "@/lib/client";
import { cn } from "@/lib/cn";
import { normalizeArabic } from "@/lib/normalize";
import {
  ALL_SIZES,
  BRANCHES,
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  COMMON_COLORS,
  sizesForCategory,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type {
  ImportAction,
  ImportResult,
  ImportRow,
  ProductDTO,
} from "@/lib/types";

// ترتيب أعمدة القالب الجديد (أ→ي): اسم المنتج، البراند، الفئة، النوع، اللون،
// المقاس، الفرع، الكمية، السعر، الكود (SKU).
const HEADERS = [
  "اسم المنتج",
  "البراند",
  "الفئة",
  "النوع",
  "اللون",
  "المقاس",
  "الفرع",
  "الكمية",
  "السعر",
  "الكود (SKU)",
];

const CATEGORY_BY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [CATEGORY_LABELS[c], c])
) as Record<string, CategoryValue>;
const BRANCH_BY_LABEL = Object.fromEntries(
  BRANCHES.map((b) => [BRANCH_LABELS[b], b])
) as Record<string, BranchValue>;

// حالة الصف: جديد كلياً / تحديث لصنف موجود / خطأ في البيانات
type RowStatus = "new" | "update" | "error";

// الحقول القابلة للتحرير المباشر داخل جدول المعاينة
type EditableField =
  | "name"
  | "brand"
  | "size"
  | "color"
  | "quantity"
  | "price";

interface PreviewRow {
  // القيم الخام (قابلة للتحرير)
  name: string;
  brand: string;
  categoryLabel: string;
  productType: string;
  branchLabel: string;
  size: string;
  color: string;
  quantity: string;
  price: string;
  sku: string;
  // مشتقّات
  parsed?: ImportRow;
  valid: boolean;
  error?: string;
  status: RowStatus;
  currentQuantity: number | null; // كمية الصنف الحالية في القاعدة (عند التحديث)
  action: ImportAction; // إجراء التعامل مع التعارض
  edited: boolean; // عُدِّل يدوياً في المعاينة
}

function norm(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

// قراءة قيمة العمود مع تجاهل الفراغات في رؤوس الأعمدة
function pick(obj: Record<string, unknown>, header: string): unknown {
  if (header in obj) return obj[header];
  const key = Object.keys(obj).find((k) => k.trim() === header);
  return key ? obj[key] : "";
}

// قراءة العمود مع دعم أكثر من اسم رأس (الجديد + القديم) لإبقاء الملفات القديمة قابلة للاستيراد
function pickAny(obj: Record<string, unknown>, ...headers: string[]): unknown {
  for (const h of headers) {
    const v = pick(obj, h);
    if (norm(v) !== "") return v;
  }
  return "";
}

// القيم الخام لصف من ملف Excel
type RawRow = Pick<
  PreviewRow,
  | "name"
  | "brand"
  | "categoryLabel"
  | "productType"
  | "branchLabel"
  | "size"
  | "color"
  | "quantity"
  | "price"
  | "sku"
>;

function rawFromObj(obj: Record<string, unknown>): RawRow {
  return {
    // "اسم المنتج" هو الرأس الجديد، و"المنتج" رأس قديم نبقي عليه للملفات السابقة
    name: norm(pickAny(obj, "اسم المنتج", "المنتج")),
    brand: norm(pick(obj, "البراند")),
    categoryLabel: norm(pick(obj, "الفئة")),
    productType: norm(pick(obj, "النوع")),
    branchLabel: norm(pick(obj, "الفرع")),
    size: norm(pick(obj, "المقاس")),
    color: norm(pick(obj, "اللون")),
    quantity: norm(pick(obj, "الكمية")),
    price: norm(pick(obj, "السعر")),
    // "الكود (SKU)" هو الرأس الجديد، و"SKU" رأس قديم نبقي عليه للملفات السابقة
    sku: norm(pickAny(obj, "الكود (SKU)", "SKU")),
  };
}

export function ImportInventoryModal({
  open,
  onClose,
  onImported,
  products,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  products: ProductDTO[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  // بحث ذكي مطبَّع (اسود=أسود، ابيض=أبيض...) لمطابقة المنتج/الصنف الموجود.
  // نُعيد أيضاً المنتج والصنف المطابقين كي نُرسل قيمهما «الرسمية» للخادم فيُحدِّث
  // الصنف الصحيح تماماً (لأن مطابقة الخادم حرفية لا مطبَّعة).
  function findExistingVariant(
    raw: RawRow,
    branch: BranchValue | undefined
  ): { product: ProductDTO; variant: ProductDTO["variants"][number] } | null {
    if (!branch) return null;
    const nName = normalizeArabic(raw.name);
    const nBrand = normalizeArabic(raw.brand);
    const p = products.find(
      (x) =>
        normalizeArabic(x.name) === nName &&
        normalizeArabic(x.brand) === nBrand
    );
    if (!p) return null;
    const nSize = normalizeArabic(raw.size);
    const nColor = normalizeArabic(raw.color);
    const v = p.variants.find(
      (vr) =>
        normalizeArabic(vr.size) === nSize &&
        vr.branch === branch &&
        normalizeArabic(vr.color ?? "") === nColor
    );
    return v ? { product: p, variant: v } : null;
  }

  // إعادة حساب مشتقّات الصف من قيمه الخام (بعد التحرير أو عند القراءة الأولى)
  function compute(
    raw: RawRow,
    action: ImportAction,
    edited: boolean
  ): PreviewRow {
    const category =
      CATEGORY_BY_LABEL[raw.categoryLabel] ??
      (CATEGORIES.includes(raw.categoryLabel as CategoryValue)
        ? (raw.categoryLabel as CategoryValue)
        : undefined);
    const branch =
      BRANCH_BY_LABEL[raw.branchLabel] ??
      (BRANCHES.includes(raw.branchLabel as BranchValue)
        ? (raw.branchLabel as BranchValue)
        : undefined);
    const qty = Number(raw.quantity);
    const prc = Number(raw.price);

    let error: string | undefined;
    if (!raw.name) error = "اسم المنتج مفقود";
    else if (!raw.brand) error = "البراند مفقود";
    else if (!category) error = "فئة غير معروفة";
    else if (!branch) error = "فرع غير معروف";
    else if (!raw.size) error = "المقاس مفقود";
    else if (!Number.isFinite(qty) || qty < 0) error = "كمية غير صحيحة";
    else if (!Number.isFinite(prc) || prc < 0) error = "سعر غير صحيح";

    const valid = !error;
    const existing = valid ? findExistingVariant(raw, branch) : null;
    const status: RowStatus = !valid ? "error" : existing ? "update" : "new";

    const parsed: ImportRow | undefined = valid
      ? {
          // عند التحديث نُرسل القيم الرسمية للصنف الموجود لتطابق الخادم الحرفي؛
          // وعند الجديد نُرسل ما كتبه المستخدم كما هو.
          name: existing ? existing.product.name : raw.name,
          brand: existing ? existing.product.brand : raw.brand,
          category: category!,
          branch: branch!,
          size: existing ? existing.variant.size : raw.size,
          color: existing ? existing.variant.color : raw.color || null,
          quantity: Math.floor(qty),
          price: prc,
          sku: raw.sku || null,
          productType: raw.productType || null,
          action: status === "update" ? action : "replace",
        }
      : undefined;

    return {
      ...raw,
      parsed,
      valid,
      error,
      status,
      currentQuantity: existing ? existing.variant.quantity : null,
      action,
      edited,
    };
  }

  async function handleDownloadTemplate() {
    try {
      const XLSX = await import("xlsx");
      // صف الرؤوس فقط — بدون أي بيانات تجريبية
      const ws = XLSX.utils.aoa_to_sheet([HEADERS]);

      // عرض كل عمود مضبوط حسب نوع الحقل (بالترتيب الجديد)
      ws["!cols"] = [
        { wch: 26 }, // A اسم المنتج
        { wch: 14 }, // B البراند
        { wch: 12 }, // C الفئة
        { wch: 14 }, // D النوع
        { wch: 12 }, // E اللون
        { wch: 8 }, // F المقاس
        { wch: 16 }, // G الفرع
        { wch: 8 }, // H الكمية
        { wch: 10 }, // I السعر
        { wch: 18 }, // J الكود (SKU)
      ];

      // تثبيت صف الرؤوس (الصف الأول) عند التمرير
      ws["!view"] = { freeze: { xSplit: 0, ySplit: 1, topLeftCell: "A2" } };

      // قوائم تحقّق منسدلة على الأعمدة المرتبطة بقيم محددة بعد إعادة الترتيب:
      //   C = الفئة، E = اللون، F = المقاس، G = الفرع.
      // ملاحظة: نسخة SheetJS المجتمعية (xlsx 0.18.5) تتجاهل هذه الخاصية عند
      // الكتابة، لذا لن تظهر القوائم فعلياً إلا بترقية SheetJS Pro. نتركها هنا
      // لتوثيق النية وتفعيلها تلقائياً عند الترقية. قائمة المقاسات تجمع كل
      // الفئات (ملابس/أحذية/عطور) لأن تحقّق Excel لا يتغيّر حسب الفئة.
      const catList = `"${CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(",")}"`;
      const branchList = `"${BRANCHES.map((b) => BRANCH_LABELS[b]).join(",")}"`;
      const colorList = `"${COMMON_COLORS.join(",")}"`;
      const sizeList = `"${ALL_SIZES.join(",")}"`;
      ws["!dataValidation"] = [
        { sqref: "C2:C1000", type: "list", formula1: catList },
        { sqref: "E2:E1000", type: "list", formula1: colorList },
        { sqref: "F2:F1000", type: "list", formula1: sizeList },
        { sqref: "G2:G1000", type: "list", formula1: branchList },
      ];

      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, "الجرد");
      XLSX.writeFile(wb, "euro-brands-inventory-template.xlsx");
    } catch {
      toast.error("تعذّر إنشاء القالب");
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
      });
      if (json.length === 0) {
        toast.error("الملف لا يحتوي على بيانات");
        return;
      }
      setPreview(json.map((o) => compute(rawFromObj(o), "replace", false)));
    } catch {
      toast.error("تعذّر قراءة ملف Excel");
    } finally {
      setParsing(false);
    }
  }

  // تحرير خلية مباشرة في المعاينة — يُعيد حساب الحالة/التعارض ويعلّم الصف كمعدَّل
  function editCell(index: number, field: EditableField, value: string) {
    setPreview((prev) =>
      prev
        ? prev.map((r, i) =>
            i === index ? compute({ ...r, [field]: value }, r.action, true) : r
          )
        : prev
    );
  }

  // تغيير إجراء التعارض لصف واحد
  function setRowAction(index: number, action: ImportAction) {
    setPreview((prev) =>
      prev
        ? prev.map((r, i) =>
            i === index && r.status === "update"
              ? compute(r, action, r.edited)
              : r
          )
        : prev
    );
  }

  // تطبيق الإجراء نفسه على كل صفوف التحديث دفعةً واحدة
  function applyActionToAll(action: ImportAction) {
    setPreview((prev) =>
      prev
        ? prev.map((r) =>
            r.status === "update" ? compute(r, action, r.edited) : r
          )
        : prev
    );
  }

  async function handleConfirm() {
    const rows = (preview ?? [])
      .filter((r) => r.valid && r.action !== "skip")
      .map((r) => r.parsed!);
    if (rows.length === 0) {
      toast.error("لا توجد صفوف صالحة للاستيراد");
      return;
    }
    setImporting(true);
    try {
      const res = await apiPost<ImportResult>("/api/products/import", { rows });
      toast.success(
        `تم الاستيراد: ${res.updatedVariants} تحديث · ${res.newVariants} صنف جديد · ${res.newProducts} منتج جديد`
      );
      onImported();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الاستيراد");
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setPreview(null);
    onClose();
  }

  const stats = useMemo(() => {
    const rows = preview ?? [];
    return {
      newCount: rows.filter((r) => r.status === "new").length,
      updateCount: rows.filter((r) => r.status === "update").length,
      errorCount: rows.filter((r) => r.status === "error").length,
      skipCount: rows.filter((r) => r.action === "skip").length,
      importCount: rows.filter((r) => r.valid && r.action !== "skip").length,
    };
  }, [preview]);

  const hasConflicts = stats.updateCount > 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="استيراد الجرد من Excel"
      size="xl"
    >
      {!preview ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            نزّل القالب، املأ الصفوف بالأعمدة: اسم المنتج، البراند، الفئة،
            النوع، اللون، المقاس، الفرع، الكمية، السعر، الكود (SKU)، ثم ارفع
            الملف لمعاينته وتعديله قبل التأكيد. «النوع» و«اللون» و«الكود (SKU)»
            اختيارية — لو تركت الكود فارغاً سيُولَّد تلقائياً.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleDownloadTemplate}
              className="btn btn-secondary h-11 flex-1"
            >
              <Download className="h-4 w-4" />
              تنزيل القالب
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="btn btn-primary h-11 flex-1"
            >
              {parsing ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              رفع ملف Excel
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted">
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            بعد الرفع يمكنك تعديل أي خلية مباشرةً، وسيُكتشف تلقائياً الأصناف
            الموجودة مسبقاً (نفس المنتج والفرع والمقاس واللون) لتختار: استبدال
            الكمية أو تجميعها أو تخطي الصف.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ملخّص الحالات */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="h-4 w-4" />
              {formatNumber(stats.newCount)} جديد
            </span>
            <span className="flex items-center gap-1.5 text-warning">
              <AlertTriangle className="h-4 w-4" />
              {formatNumber(stats.updateCount)} تحديث
            </span>
            {stats.errorCount > 0 && (
              <span className="flex items-center gap-1.5 text-danger">
                <AlertTriangle className="h-4 w-4" />
                {formatNumber(stats.errorCount)} خطأ
              </span>
            )}
            {stats.skipCount > 0 && (
              <span className="flex items-center gap-1.5 text-muted">
                {formatNumber(stats.skipCount)} متخطّى
              </span>
            )}
          </div>

          {/* تطبيق الإجراء على كل صفوف التعارض دفعة واحدة */}
          {hasConflicts && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-[var(--surface-2)] p-2.5 text-xs">
              <span className="font-medium text-text">
                تطبيق على كل التعارضات:
              </span>
              <button
                onClick={() => applyActionToAll("replace")}
                className="btn btn-secondary h-8 px-3 text-xs"
              >
                استبدال الكل
              </button>
              <button
                onClick={() => applyActionToAll("merge")}
                className="btn btn-secondary h-8 px-3 text-xs"
              >
                تجميع الكل
              </button>
              <button
                onClick={() => applyActionToAll("skip")}
                className="btn btn-secondary h-8 px-3 text-xs"
              >
                تخطّي الكل
              </button>
            </div>
          )}

          <div className="max-h-[52vh] overflow-auto rounded-lg border">
            <table className="w-full min-w-[1040px] text-right text-xs">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b text-muted">
                  <th className="px-2 py-2 font-medium">المنتج</th>
                  <th className="px-2 py-2 font-medium">البراند</th>
                  <th className="px-2 py-2 font-medium">الفئة</th>
                  <th className="px-2 py-2 font-medium">الفرع</th>
                  <th className="px-2 py-2 font-medium">المقاس</th>
                  <th className="px-2 py-2 font-medium">اللون</th>
                  <th className="px-2 py-2 font-medium">الكمية</th>
                  <th className="px-2 py-2 font-medium">السعر</th>
                  <th className="px-2 py-2 font-medium">الحالة / التعارض</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((r, i) => (
                  <PreviewRowView
                    key={i}
                    row={r}
                    index={i}
                    onEdit={editCell}
                    onAction={setRowAction}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 200 && (
            <p className="text-xs text-muted">
              يتم عرض أول 200 صف فقط في المعاينة، وسيُستورد الجميع.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleConfirm}
              disabled={importing || stats.importCount === 0}
              className="btn btn-primary h-11 sm:w-auto"
            >
              {importing ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              تأكيد الاستيراد ({formatNumber(stats.importCount)})
            </button>
            <button
              onClick={() => setPreview(null)}
              disabled={importing}
              className="btn btn-secondary h-11 sm:w-auto"
            >
              اختيار ملف آخر
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// خلية قابلة للتحرير — نصية أو رقمية
function EditableCell({
  value,
  onChange,
  type = "text",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
  className?: string;
}) {
  return (
    <input
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-text outline-none transition-colors hover:border-[var(--border)] focus:border-accent focus:bg-surface",
        type === "number" && "nums",
        className
      )}
    />
  );
}

// نمط خلية القائمة المنسدلة داخل الجدول — يحاكي شكل EditableCell (بلا حدود حتى المرور).
const CELL_SELECT =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-text outline-none transition-colors hover:border-[var(--border)] focus:border-accent focus:bg-surface";

function PreviewRowView({
  row,
  index,
  onEdit,
  onAction,
}: {
  row: PreviewRow;
  index: number;
  onEdit: (i: number, field: EditableField, v: string) => void;
  onAction: (i: number, a: ImportAction) => void;
}) {
  // مقاسات الفئة المكتشفة للصف — تعرض أحجام العطور عند الفئة «عطور».
  const rowCategory = CATEGORY_BY_LABEL[row.categoryLabel];
  const sizeOptions = sizesForCategory(rowCategory ?? "CLOTHES");
  // لون الصف حسب الحالة: أصفر (تحديث)، أخضر (جديد)، أحمر (خطأ)
  const tone =
    row.status === "error"
      ? "bg-[rgba(217,83,79,0.08)]"
      : row.action === "skip"
        ? "bg-[var(--surface-2)] opacity-60"
        : row.status === "update"
          ? "bg-[rgba(201,133,26,0.08)]"
          : "bg-[rgba(59,154,110,0.06)]";

  // الكمية بعد تطبيق الإجراء (لعرض «سيصبح»)
  const incoming = Number(row.quantity);
  const current = row.currentQuantity ?? 0;
  const next =
    row.action === "merge"
      ? current + (Number.isFinite(incoming) ? incoming : 0)
      : row.action === "skip"
        ? current
        : Number.isFinite(incoming)
          ? incoming
          : 0;
  const diff = next - current;

  return (
    <tr className={cn("border-b border-[var(--border)] align-top", tone)}>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <EditableCell
            value={row.name}
            onChange={(v) => onEdit(index, "name", v)}
          />
          {row.edited && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-[rgba(108,99,255,0.14)] px-1.5 py-0.5 text-[10px] font-bold text-accent">
              <Pencil className="h-2.5 w-2.5" />
              تم التعديل
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <EditableCell
          value={row.brand}
          onChange={(v) => onEdit(index, "brand", v)}
        />
      </td>
      <td className="px-2 py-1.5 text-muted">{row.categoryLabel || "—"}</td>
      <td className="px-2 py-1.5 text-muted">{row.branchLabel || "—"}</td>
      <td className="px-2 py-1.5">
        <SizeSelect
          value={row.size}
          options={sizeOptions}
          onChange={(v) => onEdit(index, "size", v)}
          selectClassName={cn(CELL_SELECT, "nums")}
          placeholder="—"
          customPlaceholder="مقاس مخصّص"
        />
      </td>
      <td className="px-2 py-1.5">
        <ColorSelect
          value={row.color}
          onChange={(v) => onEdit(index, "color", v)}
          selectClassName={CELL_SELECT}
        />
      </td>
      <td className="px-2 py-1.5">
        <EditableCell
          type="number"
          value={row.quantity}
          onChange={(v) => onEdit(index, "quantity", v)}
        />
      </td>
      <td className="px-2 py-1.5">
        <EditableCell
          type="number"
          value={row.price}
          onChange={(v) => onEdit(index, "price", v)}
        />
      </td>
      <td className="px-2 py-1.5">
        {row.status === "error" ? (
          <span className="text-danger">{row.error}</span>
        ) : row.status === "new" ? (
          <span className="font-medium text-success">منتج/صنف جديد</span>
        ) : (
          <div className="space-y-1">
            <p className="nums text-[11px] text-muted">
              كان: <span className="font-bold text-text">{current}</span> |
              سيصبح: <span className="font-bold text-text">{next}</span> |
              الفرق:{" "}
              <span
                className={cn(
                  "font-bold",
                  diff > 0
                    ? "text-success"
                    : diff < 0
                      ? "text-danger"
                      : "text-muted"
                )}
              >
                {diff > 0 ? `+${diff}` : diff}
              </span>
            </p>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["replace", "استبدال"],
                  ["merge", "تجميع"],
                  ["skip", "تخطي"],
                ] as [ImportAction, string][]
              ).map(([act, label]) => (
                <button
                  key={act}
                  onClick={() => onAction(index, act)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    row.action === act
                      ? "border-accent bg-accent text-white"
                      : "border-[var(--border)] text-muted hover:text-text"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
