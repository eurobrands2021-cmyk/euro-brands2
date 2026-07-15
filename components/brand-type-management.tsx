"use client";

import { useMemo, useState } from "react";
import {
  Tag,
  Layers,
  Boxes,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TextOnlyInput } from "@/components/ui/inputs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFetch } from "@/lib/use-fetch";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/client";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type CategoryValue,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { BrandDTO, ProductListPage, ProductTypeDTO } from "@/lib/types";

// تبويب «البراندات والأنواع» في الإعدادات (للمدير فقط):
// إدارة الفئات (قراءة فقط) + البراندات + أنواع المنتجات.
export function BrandTypeManagementCard() {
  return (
    <div className="space-y-6">
      <CategoriesSection />
      <BrandsSection />
      <ProductTypesSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1) الفئات — عرض للقراءة فقط (ثابتة في النظام)
// ---------------------------------------------------------------------------
function CategoriesSection() {
  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text">
        <Boxes className="h-5 w-5 text-accent" />
        الفئات
      </h2>
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted">
        <Lock className="h-3.5 w-3.5" />
        الفئات ثابتة في النظام ولا يمكن تغييرها.
      </p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <span
            key={c}
            className="inline-flex cursor-default items-center gap-1.5 rounded-full border bg-[var(--surface-2)] px-3 py-1.5 text-sm font-medium text-muted"
            title="فئة ثابتة في النظام"
          >
            <Lock className="h-3 w-3" />
            {CATEGORY_LABELS[c]}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2) البراندات — قائمة مجمّعة بالفئة + إضافة/تعديل/حذف + بحث
// ---------------------------------------------------------------------------
function BrandsSection() {
  const { data, loading, refetch } = useFetch<BrandDTO[]>("/api/brands");
  const brands = useMemo(() => data ?? [], [data]);

  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<CategoryValue>(CATEGORIES[0]);
  const [adding, setAdding] = useState(false);

  // حالة التعديل المضمّن
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // حالة الحذف (مع تحذير عند وجود منتجات تستخدم البراند)
  const [pendingDelete, setPendingDelete] = useState<{
    brand: BrandDTO;
    productCount: number;
  } | null>(null);
  const [checkingDelete, setCheckingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? brands.filter((b) => b.name.toLowerCase().includes(q)) : brands;
  }, [brands, search]);

  const grouped = useMemo(() => {
    const m = new Map<CategoryValue, BrandDTO[]>();
    for (const c of CATEGORIES) m.set(c, []);
    for (const b of filtered) m.get(b.category)?.push(b);
    for (const c of CATEGORIES)
      m.get(c)!.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return m;
  }, [filtered]);

  async function addBrand() {
    const name = newName.trim();
    if (!name) return toast.error("اسم البراند مطلوب");
    setAdding(true);
    try {
      await apiPost<BrandDTO>("/api/brands", { name, category: newCategory });
      toast.success("تمت إضافة البراند");
      setNewName("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إضافة البراند");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(b: BrandDTO) {
    setEditId(b.id);
    setEditName(b.name);
  }

  async function saveEdit(b: BrandDTO) {
    const name = editName.trim();
    if (!name) return toast.error("اسم البراند مطلوب");
    if (name === b.name) {
      setEditId(null);
      return;
    }
    setSavingEdit(true);
    try {
      await apiPut<BrandDTO>(`/api/brands/${b.id}`, { name });
      toast.success("تم تعديل البراند");
      setEditId(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تعديل البراند");
    } finally {
      setSavingEdit(false);
    }
  }

  // قبل الحذف: احسب عدد المنتجات التي تستخدم هذا البراند لإظهار تحذير
  async function requestDelete(b: BrandDTO) {
    setCheckingDelete(b.id);
    try {
      // عدّ خفيف عبر الترقيم (نطلب صفحة واحدة بعنصر واحد ونقرأ total) بدل جلب
      // كل المنتجات المطابقة إلى الذاكرة لمجرد العدّ.
      const res = await apiGet<ProductListPage>(
        `/api/products?category=${b.category}&brand=${encodeURIComponent(
          b.name
        )}&page=1&perPage=1`
      );
      setPendingDelete({ brand: b, productCount: res.total });
    } catch {
      // تعذّر الفحص — نتابع الحذف دون عدد دقيق
      setPendingDelete({ brand: b, productCount: -1 });
    } finally {
      setCheckingDelete(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/brands/${pendingDelete.brand.id}`);
      toast.success("تم حذف البراند");
      setPendingDelete(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حذف البراند");
    } finally {
      setDeleting(false);
    }
  }

  const deleteMessage = pendingDelete
    ? pendingDelete.productCount > 0
      ? `يوجد ${pendingDelete.productCount} منتج يستخدم هذا البراند. حذفه من القائمة لن يحذف تلك المنتجات — ستحتفظ باسمها لكنه لن يظهر في قوائم الاختيار.`
      : pendingDelete.productCount === 0
        ? "لا توجد منتجات تستخدم هذا البراند. سيُحذف من قائمة الاختيار."
        : "سيُحذف البراند من قائمة الاختيار."
    : "";

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
        <Tag className="h-5 w-5 text-accent" />
        البراندات
      </h2>

      {/* إضافة براند جديد */}
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border bg-[var(--surface-2)] p-3 sm:grid-cols-[1fr_auto_auto]">
        <TextOnlyInput
          className="input"
          value={newName}
          onChange={setNewName}
          placeholder="اسم البراند الجديد"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addBrand();
            }
          }}
        />
        <select
          className="input sm:w-40"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as CategoryValue)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addBrand}
          disabled={adding}
          className="btn btn-primary"
        >
          {adding ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          إضافة
        </button>
      </div>

      {/* بحث */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          className="input pr-9"
          placeholder="بحث في البراندات…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">جارٍ التحميل…</p>
      ) : brands.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          لا توجد براندات بعد — أضف أول براند من الأعلى.
        </p>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map((c) => {
            const list = grouped.get(c)!;
            if (list.length === 0) return null;
            return (
              <div key={c}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-muted">
                  {CATEGORY_LABELS[c]}
                  <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold nums">
                    {list.length}
                  </span>
                </h3>
                <div className="space-y-1.5">
                  {list.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      {editId === b.id ? (
                        <>
                          <TextOnlyInput
                            autoFocus
                            className="input h-9 flex-1"
                            value={editName}
                            onChange={setEditName}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                saveEdit(b);
                              } else if (e.key === "Escape") {
                                setEditId(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(b)}
                            disabled={savingEdit}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-success hover:bg-[var(--surface-2)]"
                            aria-label="حفظ"
                          >
                            {savingEdit ? (
                              <Spinner className="h-4 w-4" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditId(null)}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-2)]"
                            aria-label="إلغاء"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate text-sm text-text">
                            {b.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(b)}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-2)] hover:text-accent"
                            aria-label="تعديل"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(b)}
                            disabled={checkingDelete === b.id}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-2)] hover:text-danger"
                            aria-label="حذف"
                          >
                            {checkingDelete === b.id ? (
                              <Spinner className="h-4 w-4" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              لا توجد براندات مطابقة للبحث.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`حذف البراند «${pendingDelete?.brand.name ?? ""}»؟`}
        message={deleteMessage}
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3) أنواع المنتجات — قائمة مجمّعة بالفئة + إضافة/تعديل/حذف
// ---------------------------------------------------------------------------
function ProductTypesSection() {
  const { data, loading, refetch } =
    useFetch<ProductTypeDTO[]>("/api/product-types");
  const types = useMemo(() => data ?? [], [data]);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCategory, setNewCategory] = useState<CategoryValue>(CATEGORIES[0]);
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<ProductTypeDTO | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<CategoryValue, ProductTypeDTO[]>();
    for (const c of CATEGORIES) m.set(c, []);
    for (const t of types) m.get(t.category)?.push(t);
    for (const c of CATEGORIES)
      m.get(c)!.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return m;
  }, [types]);

  const cleanCode = (s: string) =>
    s.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);

  async function addType() {
    const name = newName.trim();
    const code = cleanCode(newCode);
    if (!name) return toast.error("اسم النوع مطلوب");
    if (!code) return toast.error("كود النوع (بادئة لاتينية) مطلوب");
    setAdding(true);
    try {
      await apiPost<ProductTypeDTO>("/api/product-types", {
        name,
        code,
        category: newCategory,
      });
      toast.success("تمت إضافة النوع");
      setNewName("");
      setNewCode("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إضافة النوع");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(t: ProductTypeDTO) {
    setEditId(t.id);
    setEditName(t.name);
    setEditCode(t.code);
  }

  async function saveEdit(t: ProductTypeDTO) {
    const name = editName.trim();
    const code = cleanCode(editCode);
    if (!name) return toast.error("اسم النوع مطلوب");
    if (!code) return toast.error("كود النوع مطلوب");
    setSavingEdit(true);
    try {
      await apiPut<ProductTypeDTO>(`/api/product-types/${t.id}`, {
        name,
        code,
        category: t.category,
      });
      toast.success("تم تعديل النوع");
      setEditId(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تعديل النوع");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/product-types/${pendingDelete.id}`);
      toast.success("تم حذف النوع");
      setPendingDelete(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حذف النوع");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text">
        <Layers className="h-5 w-5 text-accent" />
        أنواع المنتجات
      </h2>
      <p className="mb-4 text-xs text-muted">
        الكود (بادئة لاتينية قصيرة) يظهر في كود SKU التلقائي لكل صنف من هذا النوع.
      </p>

      {/* إضافة نوع جديد */}
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border bg-[var(--surface-2)] p-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <TextOnlyInput
          className="input"
          value={newName}
          onChange={setNewName}
          placeholder="اسم النوع (مثال: تيشيرت)"
        />
        <input
          className="input uppercase nums sm:w-24"
          value={newCode}
          onChange={(e) => setNewCode(cleanCode(e.target.value))}
          placeholder="TSH"
          maxLength={6}
        />
        <select
          className="input sm:w-40"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as CategoryValue)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addType}
          disabled={adding}
          className="btn btn-primary"
        >
          {adding ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          إضافة
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">جارٍ التحميل…</p>
      ) : types.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          لا توجد أنواع بعد — أضف أول نوع من الأعلى.
        </p>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map((c) => {
            const list = grouped.get(c)!;
            if (list.length === 0) return null;
            return (
              <div key={c}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-muted">
                  {CATEGORY_LABELS[c]}
                  <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold nums">
                    {list.length}
                  </span>
                </h3>
                <div className="space-y-1.5">
                  {list.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      {editId === t.id ? (
                        <>
                          <TextOnlyInput
                            autoFocus
                            className="input h-9 flex-1"
                            value={editName}
                            onChange={setEditName}
                          />
                          <input
                            className="input h-9 w-20 uppercase nums"
                            value={editCode}
                            onChange={(e) => setEditCode(cleanCode(e.target.value))}
                            maxLength={6}
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(t)}
                            disabled={savingEdit}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-success hover:bg-[var(--surface-2)]"
                            aria-label="حفظ"
                          >
                            {savingEdit ? (
                              <Spinner className="h-4 w-4" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditId(null)}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-2)]"
                            aria-label="إلغاء"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate text-sm text-text">
                            {t.name}
                          </span>
                          <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold text-muted nums">
                            {t.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-2)] hover:text-accent"
                            aria-label="تعديل"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(t)}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-2)] hover:text-danger"
                            aria-label="حذف"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`حذف النوع «${pendingDelete?.name ?? ""}»؟`}
        message="المنتجات المرتبطة بهذا النوع ستبقى، وسيُزال ارتباطها بالنوع فقط."
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}
