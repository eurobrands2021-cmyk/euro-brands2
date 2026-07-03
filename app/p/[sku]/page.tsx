"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Package, MapPin, ShoppingBag, Ruler, Palette } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiGet } from "@/lib/client";
import { formatCurrency } from "@/lib/format";
import {
  BRANCH_LABELS,
  CATEGORY_LABELS,
} from "@/lib/constants";
import type { PublicProductDTO } from "@/lib/public-product";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "notfound" }
  | { status: "ok"; product: PublicProductDTO };

export default function PublicProductPage() {
  const params = useParams<{ sku: string }>();
  const sku = Array.isArray(params.sku) ? params.sku[0] : params.sku;
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!sku) {
      setState({ status: "notfound" });
      return;
    }
    setState({ status: "loading" });
    apiGet<PublicProductDTO>(`/api/public/products/${encodeURIComponent(sku)}`)
      .then((product) => {
        if (!cancelled) setState({ status: "ok", product });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        // رسالة الخادم عند عدم الوجود تحتوي "غير موجود"
        setState({
          status: /غير موجود|not found|404/i.test(msg)
            ? "notfound"
            : "error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [sku]);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* رأس بعلامة Euro Brands */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo size={32} className="rounded-md" />
            <span className="text-sm font-extrabold tracking-tight">
              Euro Brands
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        {state.status === "loading" && <LoadingView />}
        {state.status === "notfound" && <NotFoundView />}
        {state.status === "error" && <ErrorView />}
        {state.status === "ok" && <ProductView product={state.product} />}
      </main>

      <footer className="mx-auto max-w-2xl px-4 pb-10 text-center text-xs text-muted">
        © {new Date().getFullYear()} Euro Brands — كل الحقوق محفوظة
      </footer>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="animate-pulse space-y-4 pt-6">
      <div className="aspect-square w-full rounded-2xl bg-[var(--surface-2)]" />
      <div className="h-6 w-2/3 rounded bg-[var(--surface-2)]" />
      <div className="h-4 w-1/3 rounded bg-[var(--surface-2)]" />
      <div className="h-20 w-full rounded-xl bg-[var(--surface-2)]" />
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
        <Package className="h-9 w-9" />
      </div>
      <h1 className="text-xl font-extrabold">المنتج غير متوفر</h1>
      <p className="max-w-xs text-sm text-muted">
        لم نعثر على المنتج المطلوب. قد يكون الكود غير صحيح أو أن المنتج لم يعد
        متاحاً.
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm font-bold">
        <Logo size={22} className="rounded" />
        Euro Brands
      </div>
    </div>
  );
}

function ErrorView() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-lg font-bold">تعذّر تحميل المنتج</h1>
      <p className="text-sm text-muted">
        حدث خطأ أثناء جلب البيانات. حاول تحديث الصفحة.
      </p>
    </div>
  );
}

function ProductView({ product }: { product: PublicProductDTO }) {
  const [active, setActive] = useState(0);
  const images = product.images.length ? product.images : [];
  const priceText =
    product.priceMin === product.priceMax
      ? formatCurrency(product.priceMin)
      : `${formatCurrency(product.priceMin)} — ${formatCurrency(product.priceMax)}`;

  return (
    <div className="space-y-6">
      {/* الصور */}
      <div>
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
          {images.length ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={images[active]}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <Package className="h-16 w-16" />
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={img + i}
                onClick={() => setActive(i)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  i === active
                    ? "border-accent"
                    : "border-transparent opacity-70"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* الاسم والبراند والسعر */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
            {product.brand}
          </span>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-muted">
            {CATEGORY_LABELS[product.category]}
          </span>
          {product.productType && (
            <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-muted">
              {product.productType}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-extrabold leading-tight">{product.name}</h1>

        <div className="flex items-baseline gap-2">
          <span className="nums text-2xl font-extrabold text-accent">
            {priceText}
          </span>
        </div>

        {product.description && (
          <p className="text-sm leading-relaxed text-muted">
            {product.description}
          </p>
        )}
      </div>

      {/* التوفر حسب الفرع */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <ShoppingBag className="h-4 w-4 text-accent" />
          المتوفر في الفروع
        </h2>

        {product.branches.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-muted">
            غير متوفر حالياً — تواصل معنا للاستفسار عن التوفر.
          </div>
        ) : (
          <div className="space-y-3">
            {product.branches.map((b) => (
              <div
                key={b.branch}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="mb-3 flex items-center gap-2 font-bold">
                  <MapPin className="h-4 w-4 text-accent" />
                  {BRANCH_LABELS[b.branch]}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="ml-1 flex items-center gap-1 text-xs text-muted">
                      <Ruler className="h-3.5 w-3.5" />
                      المقاسات:
                    </span>
                    {b.sizes.map((s) => (
                      <span
                        key={s}
                        className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {b.colors.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="ml-1 flex items-center gap-1 text-xs text-muted">
                        <Palette className="h-3.5 w-3.5" />
                        الألوان:
                      </span>
                      {b.colors.map((c) => (
                        <span
                          key={c}
                          className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
