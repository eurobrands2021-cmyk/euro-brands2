"use client";

import { useState } from "react";
import Image from "next/image";
import { Package, MapPin, ShoppingBag, Ruler, Palette } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { BRANCH_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { PublicProductDTO } from "@/lib/public-product";

// عرض المنتج للعميل — الجزء التفاعلي (معرض الصور) فقط.
// البيانات تُجلب على الخادم (ISR) وتُمرَّر جاهزة.
export function PublicProductView({ product }: { product: PublicProductDTO }) {
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
            <Image
              src={images[active]}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover"
              priority
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
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  i === active
                    ? "border-accent"
                    : "border-transparent opacity-70"
                }`}
              >
                <Image
                  src={img}
                  alt=""
                  fill
                  sizes="64px"
                  loading="lazy"
                  className="object-cover"
                />
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
