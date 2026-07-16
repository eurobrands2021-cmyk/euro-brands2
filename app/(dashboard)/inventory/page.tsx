"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  X,
  FileSpreadsheet,
  Copy,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFetch } from "@/lib/use-fetch";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useVirtualWindow } from "@/lib/use-virtual-window";
import { apiDelete, apiPost } from "@/lib/client";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";
import { ImportInventoryModal } from "@/components/import-inventory-modal";
import { AddBrandModal } from "@/components/add-brand-modal";
import { PrintQrButton } from "@/components/print-qr-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { CategoryBadge, StockBadge, Badge, DraftBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type {
  BrandDTO,
  ProductDTO,
  ProductInput,
  ProductListPage,
} from "@/lib/types";
import {
  ALL_SIZES,
  BRANCHES,
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  sizesForCategory,
  type BranchValue,
  type CategoryValue,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

interface Filters {
  search: string;
  branch: string;
  category: string;
  brand: string;
  size: string;
}
type SortKey = "newest" | "mostSold" | "lowestQty";
type StatusFilter = "all" | "low" | "out";

const EMPTY_FILTERS: Filters = {
  search: "",
  branch: "",
  category: "",
  brand: "",
  size: "",
};

// عدد العناصر في صفحة الخادم الواحدة. القيمة > 50 لتفعيل النافذة الافتراضية
// في عرض القائمة (virtualization) على الصفحة الحالية فقط.
const PER_PAGE = 60;

export default function InventoryPage() {
  const router = useRouter();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<ProductDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // تفضيل العرض من localStorage
  useEffect(() => {
    const v = localStorage.getItem("eb-inv-view");
    if (v === "list" || v === "grid") setView(v);
  }, []);
  useEffect(() => {
    localStorage.setItem("eb-inv-view", view);
  }, [view]);

  // البحث النصي يُؤجَّل 300ms حتى لا يُطلق طلباً مع كل ضغطة مفتاح.
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  // أي تغيير في الفلاتر/الترتيب/الحالة يعيدنا للصفحة الأولى.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.branch,
    filters.category,
    filters.brand,
    filters.size,
    status,
    draftsOnly,
    sort,
  ]);

  // بناء رابط الطلب مع الترقيم على مستوى الخادم (search/category/brand/branch/
  // size/sort/page/perPage) بدل تحميل كل المنتجات وتصفيتها في المتصفح.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("withSales", "1");
    p.set("withCounts", "1");
    p.set("page", String(page));
    p.set("perPage", String(PER_PAGE));
    const q = debouncedSearch.trim();
    if (q) p.set("search", q);
    if (filters.branch) p.set("branch", filters.branch);
    if (filters.category) p.set("category", filters.category);
    if (filters.brand) p.set("brand", filters.brand);
    if (filters.size) p.set("size", filters.size);
    if (status !== "all") p.set("status", status);
    if (draftsOnly) p.set("drafts", "1");
    if (sort === "mostSold") p.set("sort", "mostSold");
    else if (sort === "lowestQty") p.set("sort", "lowestQty");
    return p.toString();
  }, [page, debouncedSearch, filters, status, draftsOnly, sort]);

  const { data, loading, error, refetch } = useFetch<ProductListPage>(
    `/api/products?${query}`
  );
  const { data: brandsData, refetch: refetchBrands } =
    useFetch<BrandDTO[]>("/api/brands");

  // قائمة كل المنتجات تُحمَّل عند فتح نافذة الاستيراد فقط (لمطابقة الأصناف
  // الموجودة أثناء الاستيراد) — بدل تحميلها دائماً مع الصفحة.
  const { data: importProductsData } = useFetch<ProductDTO[]>(
    importOpen ? "/api/products" : null
  );
  const importProducts = importProductsData ?? [];

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts;
  const statusCounts = {
    all: counts?.all ?? 0,
    low: counts?.low ?? 0,
    out: counts?.out ?? 0,
  };
  const draftsCount = counts?.draftsTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const brandOptions = useMemo(() => {
    const list = (brandsData ?? [])
      .filter((b) => !filters.category || b.category === filters.category)
      .map((b) => b.name);
    return [...new Set(list)].sort();
  }, [brandsData, filters.category]);

  // خيارات المقاس من القائمة المعيارية (حسب الفئة) بدل اشتقاقها من كل المنتجات.
  const sizes = useMemo<readonly string[]>(
    () =>
      filters.category
        ? sizesForCategory(filters.category as CategoryValue)
        : ALL_SIZES,
    [filters.category]
  );

  const hasActiveFilters =
    Object.values(filters).some(Boolean) || draftsOnly || status !== "all";

  // التمرير لأعلى عند تغيير الصفحة (نتجاهل أول عرض).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/products/${toDelete.id}`);
      void logActivity(ACTIVITY_ACTIONS.DELETE_PRODUCT, toDelete.name);
      toast.success("تم حذف المنتج بنجاح");
      setToDelete(null);
      // إن كان آخر عنصر في صفحة > 1، ارجع صفحة (سيعيد التأثير الجلب).
      if (items.length === 1 && page > 1) setPage((p) => p - 1);
      else refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حذف المنتج");
    } finally {
      setDeleting(false);
    }
  }

  // مثبَّتة المرجع (useCallback) حتى تستفيد بطاقات القائمة من React.memo
  // فلا يُعاد عرضها جميعاً عند تغيّر البحث/الفلاتر.
  const openDelete = useCallback((product: ProductDTO) => {
    setToDelete(product);
  }, []);

  const handleDuplicate = useCallback(async (product: ProductDTO) => {
    setDuplicatingId(product.id);
    try {
      const payload: ProductInput = {
        name: `نسخة من ${product.name}`,
        brand: product.brand,
        category: product.category,
        description: product.description,
        barcode: null,
        images: product.images,
        productTypeId: product.productTypeId,
        variants: product.variants.map((v) => ({
          branch: v.branch,
          size: v.size,
          color: v.color,
          quantity: v.quantity,
          minQuantity: v.minQuantity,
          price: v.price,
          sku: null, // عند التكرار: ندَع التوليد التلقائي يُنشئ SKUs جديدة
        })),
      };
      const created = await apiPost<ProductDTO>("/api/products", payload);
      toast.success("تم إنشاء نسخة — يمكنك تعديلها");
      router.push(`/inventory/${created.id}/edit`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر نسخ المنتج");
    } finally {
      setDuplicatingId(null);
    }
  }, [router]);

  // نافذة افتراضية لعرض القائمة (list view) على الصفحة الحالية فقط عند تجاوز 50.
  const listVirtualize = view === "list" && items.length > 50;
  const listVirtual = useVirtualWindow({
    count: items.length,
    rowHeight: 72,
    enabled: listVirtualize,
  });
  const visibleListItems = listVirtualize
    ? items.slice(listVirtual.start, listVirtual.end)
    : items;

  return (
    <div>
      <PageHeader
        title="المخزون"
        description="إدارة المنتجات والكميات في الفرعين"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="btn btn-secondary"
            >
              <FileSpreadsheet className="h-4 w-4" />
              استيراد الجرد
            </button>
            <Link href="/inventory/new" className="btn btn-primary">
              <Plus className="h-4 w-4" />
              إضافة منتج
            </Link>
          </div>
        }
      />

      {/* شريط الفلاتر — قابل للطي مع حفظ الحالة */}
      <CollapsiblePanel
        storageKey="eb-inventory-filters"
        title="الفلاتر"
        icon={<SlidersHorizontal className="h-5 w-5 text-accent" />}
        className="mb-6"
        bodyClassName="pt-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pr-9"
              placeholder="بحث بالاسم أو البراند أو الكود..."
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
            />
          </div>

          <select
            className="input"
            value={filters.branch}
            onChange={(e) =>
              setFilters((f) => ({ ...f, branch: e.target.value }))
            }
          >
            <option value="">كل الفروع</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {BRANCH_LABELS[b]}
              </option>
            ))}
          </select>

          {/* الفئة أولاً */}
          <select
            className="input"
            value={filters.category}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                category: e.target.value,
                brand: "", // إعادة ضبط البراند عند تغيير الفئة
                size: "", // والمقاس (قائمة المقاسات تعتمد على الفئة)
              }))
            }
          >
            <option value="">كل الفئات</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>

          {/* البراند (حسب الفئة) — قائمة قابلة للبحث + زر إضافة */}
          <div className="flex gap-2">
            <SearchableSelect
              className="flex-1"
              value={filters.brand}
              onChange={(v) => setFilters((f) => ({ ...f, brand: v }))}
              options={brandOptions.map((b) => ({ value: b, label: b }))}
              placeholder="كل البراندات"
              searchPlaceholder="ابحث عن براند…"
              ariaLabel="فلترة بالبراند"
              emptyMessage="لا توجد براندات"
            />
            <button
              type="button"
              className="btn btn-secondary flex-shrink-0"
              disabled={!filters.category}
              title={
                filters.category ? "إضافة براند للفئة" : "اختر الفئة أولاً"
              }
              onClick={() => setBrandModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              براند
            </button>
          </div>

          <select
            className="input"
            value={filters.size}
            onChange={(e) => setFilters((f) => ({ ...f, size: e.target.value }))}
          >
            <option value="">كل المقاسات</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* أدوات الترتيب والعرض */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">ترتيب:</span>
            <select
              className="input w-auto py-1.5 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="newest">الأحدث</option>
              <option value="mostSold">الأكثر مبيعاً</option>
              <option value="lowestQty">الأقل كمية</option>
            </select>
            <button
              onClick={() => setDraftsOnly((v) => !v)}
              className={cn(
                "btn h-8 px-2.5 text-xs",
                draftsOnly ? "btn-primary" : "btn-secondary"
              )}
              title="عرض المسودات التي تحتاج إكمال فقط"
            >
              مسودات{draftsCount > 0 ? ` (${formatNumber(draftsCount)})` : ""}
            </button>
            {hasActiveFilters && (
              <button
                className="btn btn-ghost h-8 px-2 text-xs"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setDraftsOnly(false);
                  setStatus("all");
                }}
              >
                <X className="h-4 w-4" />
                مسح الفلاتر
              </button>
            )}
          </div>

          <div className="flex rounded-lg border bg-surface p-1">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "flex h-8 w-9 items-center justify-center rounded-md",
                view === "grid" ? "bg-accent text-white" : "text-muted"
              )}
              aria-label="عرض شبكي"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex h-8 w-9 items-center justify-center rounded-md",
                view === "list" ? "bg-accent text-white" : "text-muted"
              )}
              aria-label="عرض قائمة"
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CollapsiblePanel>

      {/* تبويبات حالة المخزون */}
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "الكل", count: statusCounts.all },
            { key: "low", label: "منخفض المخزون", count: statusCounts.low },
            { key: "out", label: "نفذ المخزون", count: statusCounts.out },
          ] as const
        ).map((t) => {
          const active = status === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? t.key === "out"
                    ? "border-danger bg-[rgba(217,83,79,0.12)] text-danger"
                    : t.key === "low"
                      ? "border-warning bg-[rgba(201,133,26,0.14)] text-warning"
                      : "border-accent bg-accent-soft text-accent"
                  : "border-[var(--border)] text-muted hover:text-text"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold nums",
                  active ? "bg-white/25" : "bg-[var(--surface-2)] text-muted"
                )}
              >
                {formatNumber(t.count)}
              </span>
            </button>
          );
        })}
      </div>

      {loading && <TableSkeleton />}
      {error && (
        <Card className="p-6 text-center text-danger">
          تعذّر تحميل المنتجات: {error}
        </Card>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<Package className="h-7 w-7" />}
          title={
            !hasActiveFilters && total === 0
              ? "لا توجد منتجات بعد"
              : "لا توجد نتائج مطابقة"
          }
          description={
            !hasActiveFilters && total === 0
              ? "ابدأ بإضافة أول منتج إلى المخزون."
              : "جرّب تعديل الفلاتر أو كلمة البحث."
          }
          action={
            !hasActiveFilters && total === 0 ? (
              <Link href="/inventory/new" className="btn btn-primary">
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Link>
            ) : undefined
          }
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          {/* عدّاد النتائج ونطاق الصفحة الحالية */}
          <div className="mb-3 flex items-center justify-between text-xs text-muted nums">
            <span>
              عرض {formatNumber((page - 1) * PER_PAGE + 1)}–
              {formatNumber((page - 1) * PER_PAGE + items.length)} من{" "}
              {formatNumber(total)}
            </span>
          </div>

          {view === "grid" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  branchFilter={filters.branch as BranchValue | ""}
                  duplicating={duplicatingId === product.id}
                  onDelete={openDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          )}

          {view === "list" && (
            <Card className="p-0">
              <div
                ref={listVirtual.scrollRef}
                className={cn(listVirtualize && "max-h-[70vh] overflow-y-auto")}
              >
                <div
                  className="divide-y divide-[var(--border)]"
                  style={{
                    paddingTop: listVirtual.padTop,
                    paddingBottom: listVirtual.padBottom,
                  }}
                >
                  {visibleListItems.map((product) => (
                    <ProductListRow
                      key={product.id}
                      product={product}
                      branchFilter={filters.branch as BranchValue | ""}
                      duplicating={duplicatingId === product.id}
                      onDelete={openDelete}
                      onDuplicate={handleDuplicate}
                    />
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* ترقيم الصفحات */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                className="btn btn-secondary h-9 px-4 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                السابق
              </button>
              <span className="text-sm text-muted nums">
                صفحة {formatNumber(page)} من {formatNumber(totalPages)}
              </span>
              <button
                type="button"
                className="btn btn-secondary h-9 px-4 text-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="حذف المنتج"
        message={`هل أنت متأكد من حذف "${toDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />

      <ImportInventoryModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refetch}
        products={importProducts}
      />

      {filters.category && (
        <AddBrandModal
          open={brandModalOpen}
          category={filters.category as CategoryValue}
          onClose={() => setBrandModalOpen(false)}
          onAdded={() => refetchBrands()}
        />
      )}
    </div>
  );
}

function branchQty(product: ProductDTO, branch: BranchValue) {
  return product.variants
    .filter((v) => v.branch === branch)
    .reduce((s, v) => s + v.quantity, 0);
}

const ProductCard = memo(function ProductCard({
  product,
  branchFilter,
  duplicating,
  onDelete,
  onDuplicate,
}: {
  product: ProductDTO;
  branchFilter: BranchValue | "";
  duplicating: boolean;
  onDelete: (product: ProductDTO) => void;
  onDuplicate: (product: ProductDTO) => void;
}) {
  const variants = branchFilter
    ? product.variants.filter((v) => v.branch === branchFilter)
    : product.variants;
  const totalQty = variants.reduce((s, v) => s + v.quantity, 0);
  const image = product.images[0];

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full bg-[var(--surface-2)]">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
            loading="lazy"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <Package className="h-10 w-10" />
          </div>
        )}
        {product.productType && (
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {product.productType.name}
          </span>
        )}
        {product.isDraft && (
          <span className="absolute left-2 top-2">
            <DraftBadge />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-bold leading-tight text-text">{product.name}</h3>
        <p className="text-sm text-muted">{product.brand}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CategoryBadge category={product.category} />
          <StockBadge quantity={totalQty} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {BRANCHES.filter((b) => !branchFilter || b === branchFilter).map(
            (b) => (
              <Badge key={b} className="text-[11px]">
                {BRANCH_LABELS[b]}: {formatNumber(branchQty(product, b))}
              </Badge>
            )
          )}
        </div>

        <div className="mt-4 flex gap-2 border-t pt-3">
          <Link
            href={`/inventory/${product.id}/edit`}
            className="btn btn-secondary h-10 flex-1 text-sm"
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </Link>
          <PrintQrButton product={product} className="h-10 w-10" />
          <button
            onClick={() => onDuplicate(product)}
            disabled={duplicating}
            className="btn btn-ghost h-10 w-10 !px-0 text-accent hover:bg-accent-soft"
            aria-label="نسخ"
            title="نسخ المنتج"
          >
            {duplicating ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => onDelete(product)}
            className="btn btn-ghost h-10 w-10 !px-0 text-danger hover:bg-[rgba(217,83,79,0.12)]"
            aria-label="حذف"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
});

const ProductListRow = memo(function ProductListRow({
  product,
  branchFilter,
  duplicating,
  onDelete,
  onDuplicate,
}: {
  product: ProductDTO;
  branchFilter: BranchValue | "";
  duplicating: boolean;
  onDelete: (product: ProductDTO) => void;
  onDuplicate: (product: ProductDTO) => void;
}) {
  const variants = branchFilter
    ? product.variants.filter((v) => v.branch === branchFilter)
    : product.variants;
  const totalQty = variants.reduce((s, v) => s + v.quantity, 0);
  const image = product.images[0];

  return (
    <div className="flex items-center gap-3 p-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="48px"
            loading="lazy"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <Package className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-text">{product.name}</p>
          {product.isDraft && <DraftBadge />}
          {product.productType && (
            <span className="hidden text-xs text-muted sm:inline">
              · {product.productType.name}
            </span>
          )}
        </div>
        <p className="text-xs text-muted">{product.brand}</p>
      </div>

      <div className="hidden sm:block">
        <CategoryBadge category={product.category} />
      </div>
      <div className="hidden md:block">
        <StockBadge quantity={totalQty} />
      </div>
      <span className="hidden text-xs text-muted nums lg:inline">
        مبيع: {formatNumber(product.soldCount ?? 0)}
      </span>

      <div className="flex shrink-0 gap-1">
        <Link
          href={`/inventory/${product.id}/edit`}
          className="btn btn-ghost h-9 w-9 !px-0"
          aria-label="تعديل"
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <PrintQrButton product={product} className="h-9 w-9" />
        <button
          onClick={() => onDuplicate(product)}
          disabled={duplicating}
          className="btn btn-ghost h-9 w-9 !px-0 text-accent"
          aria-label="نسخ"
        >
          {duplicating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => onDelete(product)}
          className="btn btn-ghost h-9 w-9 !px-0 text-danger"
          aria-label="حذف"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
