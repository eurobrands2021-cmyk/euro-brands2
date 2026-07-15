import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ok, handleServerError, CACHE_LISTING } from "@/lib/api";
import { MOCK_MODE, mockNormalizedData } from "@/lib/mock-store";
import {
  computeInsights,
  fallbackAi,
  type AiContext,
  type NormProduct,
  type NormSale,
} from "@/lib/insights-analytics";
import type { BranchValue, CategoryValue } from "@/lib/constants";
import type { InsightsData } from "@/lib/types";

export const dynamic = "force-dynamic";

async function gatherData(
  now: Date
): Promise<{ sales: NormSale[]; products: NormProduct[] }> {
  if (MOCK_MODE) return mockNormalizedData();

  const from = subDays(now, 30);
  const [sales, products] = await Promise.all([
    prisma.sale.findMany({
      where: { createdAt: { gte: from }, status: { not: "CANCELLED" } },
      // نختار الحقول اللازمة فقط للتحليل بدل صفوف كاملة
      select: {
        branch: true,
        finalAmount: true,
        totalAmount: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            subtotal: true,
            product: { select: { name: true, brand: true, category: true } },
          },
        },
      },
    }),
    // نحمّل الحقول الدنيا اللازمة للتحليل (مخزون/قلة مخزون) بدل صفوف المنتجات
    // والأصناف كاملة.
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        variants: {
          select: {
            quantity: true,
            minQuantity: true,
            branch: true,
            size: true,
          },
        },
      },
    }),
  ]);

  const normSales: NormSale[] = sales.map((s) => ({
    branch: s.branch as BranchValue,
    finalAmount: s.finalAmount,
    totalAmount: s.totalAmount,
    createdAt: s.createdAt,
    items: s.items.map((it) => ({
      productId: it.productId,
      name: it.product.name,
      brand: it.product.brand,
      category: it.product.category as CategoryValue,
      quantity: it.quantity,
      subtotal: it.subtotal,
    })),
  }));
  const normProducts: NormProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category as CategoryValue,
    totalQuantity: p.variants.reduce((s, v) => s + v.quantity, 0),
    variants: p.variants.map((v) => ({
      quantity: v.quantity,
      minQuantity: v.minQuantity,
      branch: v.branch as BranchValue,
      size: v.size,
    })),
  }));
  return { sales: normSales, products: normProducts };
}

// ---- Gemini: نصائح ذكية ----
async function geminiAi(ctx: AiContext): Promise<InsightsData["ai"] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const prompt = `أنت مستشار تجزئة خبير لمتجر ملابس وأحذية وعطور في مصر اسمه "Euro Brands".
حلّل بيانات آخر 30 يوماً (الشهر ${ctx.month}) وأعطِ توصيات عملية بالعربية.
أعد فقط كائن JSON بالشكل التالي دون أي نص إضافي:
{
  "promotions": [{"product": "اسم المنتج", "reason": "سبب مقنع"}],  // 3 منتجات تحتاج عروضاً الآن
  "adIdeas": ["فكرة إعلانية مبتكرة", "فكرة أخرى"],                    // فكرتان مبنيتان على المخزون والاتجاهات
  "seasonal": "فرصة موسمية قادمة (مثل رمضان، العودة للمدارس، كأس العالم) واقتراح للاستفادة منها",
  "pricing": [{"product": "اسم منتج راكد", "suggestion": "اقتراح تسعير"}]  // للمنتجات بطيئة الحركة
}
البيانات:
${JSON.stringify(ctx)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        }),
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const text: string | undefined =
      json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return parseAi(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseAi(text?: string): InsightsData["ai"] | null {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const strArr = (a: unknown): string[] =>
    Array.isArray(a)
      ? a.filter((x) => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 4)
      : [];
  const pairArr = (a: unknown, k1: string, k2: string) =>
    Array.isArray(a)
      ? a
          .filter((x) => x && typeof x === "object")
          .map((x: any) => ({
            [k1]: String(x[k1] ?? x.product ?? "").slice(0, 120),
            [k2]: String(x[k2] ?? "").slice(0, 300),
          }))
          .filter((x: any) => x[k1])
          .slice(0, 5)
      : [];

  const promotions = pairArr(obj.promotions, "product", "reason") as {
    product: string;
    reason: string;
  }[];
  const pricing = pairArr(obj.pricing, "product", "suggestion") as {
    product: string;
    suggestion: string;
  }[];
  const adIdeas = strArr(obj.adIdeas);
  const seasonal =
    typeof obj.seasonal === "string" ? obj.seasonal.slice(0, 400) : "";

  if (!promotions.length && !adIdeas.length && !seasonal && !pricing.length)
    return null;
  return { promotions, adIdeas, seasonal, pricing };
}

// GET /api/insights — صفحة الذكاء المتقدمة
export async function GET() {
  try {
    const now = new Date();
    const { sales, products } = await gatherData(now);
    const { alerts, performance, aiContext } = computeInsights(
      sales,
      products,
      now
    );

    const aiResult = await geminiAi(aiContext);
    const ai = aiResult ?? fallbackAi(aiContext);

    const result: InsightsData = {
      generatedAt: now.toISOString(),
      aiSource: aiResult ? "ai" : "rules",
      alerts,
      performance,
      ai,
    };
    return ok(result, 200, CACHE_LISTING);
  } catch (error) {
    return handleServerError(error);
  }
}
