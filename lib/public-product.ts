// تحويل منتج داخلي إلى بيانات آمنة لصفحة العميل العامة (/p/[sku]).
// لا تتضمّن: الكمية، كود SKU، أو التكلفة — فقط ما يهمّ العميل.
import type { ProductDTO } from "./types";
import type { BranchValue, CategoryValue } from "./constants";
import { BRANCHES } from "./constants";

export interface PublicBranchAvailability {
  branch: BranchValue;
  sizes: string[];
  colors: string[];
}

export interface PublicProductDTO {
  name: string;
  brand: string;
  category: CategoryValue;
  productType: string | null;
  description: string | null;
  images: string[];
  priceMin: number;
  priceMax: number;
  branches: PublicBranchAvailability[];
}

export function toPublicProduct(p: ProductDTO): PublicProductDTO {
  // نعتمد على الأصناف المتاحة (كمية > 0) للعرض؛ فإن لم يتوفر شيء نرجع لكل الأصناف
  const inStock = p.variants.filter((v) => v.quantity > 0);
  const source = inStock.length ? inStock : p.variants;

  const prices = source.map((v) => v.price).filter((n) => n > 0);
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;

  const branches: PublicBranchAvailability[] = BRANCHES.map((branch) => {
    const vs = inStock.filter((v) => v.branch === branch);
    return {
      branch,
      sizes: [...new Set(vs.map((v) => v.size))],
      colors: [
        ...new Set(
          vs.map((v) => v.color).filter((c): c is string => !!c && !!c.trim())
        ),
      ],
    };
  }).filter((b) => b.sizes.length > 0);

  return {
    name: p.name,
    brand: p.brand,
    category: p.category,
    productType: p.productType?.name ?? null,
    description: p.description,
    images: p.images,
    priceMin,
    priceMax,
    branches,
  };
}
