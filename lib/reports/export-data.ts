// يحوّل ReportsData إلى تمثيل موحّد لكل قسم (بطاقات + جدول) يستهلكه مصدّرا PDF و Excel.
import { format } from "date-fns";
import {
  BRANCH_LABELS,
  CATEGORY_LABELS,
  CURRENCY,
} from "@/lib/constants";
import type { ReportsData } from "@/lib/types";
import { SECTION_LABEL, type SectionId } from "./sections";

const num = (x: number) =>
  (x ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const money = (x: number) => `${num(x)} ${CURRENCY}`;
const day = (iso: string) => format(new Date(iso), "yyyy/MM/dd");
const saleNo = (n: number) => `#${String(n).padStart(6, "0")}`;

export interface SectionTable {
  columns: string[];
  rows: (string | number)[][];
}

// أعمدة تُعرض كعملة (للعرض في الشاشة و PDF فقط — يبقى Excel أرقاماً خام)
const MONEY_HEADERS = [
  "الإجمالي",
  "الإيراد",
  "القيمة",
  "الربح",
  "المبيعات",
  "أعلى فاتورة",
  "متوسط الفاتورة",
];

export function isMoneyColumn(header: string): boolean {
  return MONEY_HEADERS.some((h) => header.includes(h));
}

// تنسيق خلية للعرض: عملة للأعمدة المالية، وإلا رقم مجمّع أو نص كما هو
export function displayCell(value: string | number, header: string): string {
  if (typeof value === "number") {
    return isMoneyColumn(header) ? money(value) : num(value);
  }
  return value;
}

export interface SectionContent {
  id: SectionId;
  title: string;
  metrics?: { label: string; value: string }[];
  table?: SectionTable;
  note?: string; // حالة فارغة أو ملاحظة توضيحية
}

export function buildSectionContent(
  data: ReportsData,
  id: SectionId
): SectionContent {
  const title = SECTION_LABEL[id];
  switch (id) {
    // ===== المبيعات =====
    case "totalSales":
      return {
        id,
        title,
        metrics: [
          { label: "إجمالي المبيعات (الصافي)", value: money(data.totalSales) },
          { label: "قبل الخصم", value: money(data.grossSales) },
          { label: "القطع المباعة", value: num(data.itemsSold) },
        ],
      };
    case "invoicesCount":
      return {
        id,
        title,
        metrics: [
          { label: "عدد الفواتير", value: num(data.invoicesCount) },
          { label: "القطع المباعة", value: num(data.itemsSold) },
        ],
      };
    case "avgInvoice":
      return {
        id,
        title,
        metrics: [
          { label: "متوسط قيمة الفاتورة", value: money(data.avgInvoice) },
        ],
      };
    case "maxInvoice":
      return data.maxInvoice
        ? {
            id,
            title,
            metrics: [
              { label: "قيمة أعلى فاتورة", value: money(data.maxInvoice.amount) },
              { label: "رقم الفاتورة", value: saleNo(data.maxInvoice.saleNumber) },
              { label: "الفرع", value: BRANCH_LABELS[data.maxInvoice.branch] },
              { label: "الكاشير", value: data.maxInvoice.cashierName || "—" },
              { label: "التاريخ", value: day(data.maxInvoice.date) },
            ],
          }
        : { id, title, note: "لا توجد فواتير في الفترة." };
    case "byBranch":
      return {
        id,
        title,
        table: {
          columns: ["الفرع", "عدد الفواتير", "الإجمالي"],
          rows: data.byBranch.map((b) => [
            BRANCH_LABELS[b.branch],
            b.count,
            b.total,
          ]),
        },
      };
    case "byCategory":
      return {
        id,
        title,
        table: {
          columns: ["الفئة", "الكمية", "الإيراد"],
          rows: data.byCategory.map((c) => [
            CATEGORY_LABELS[c.category],
            c.qty,
            c.total,
          ]),
        },
      };
    case "byBrand":
      return {
        id,
        title,
        note: data.byBrand.length ? undefined : "لا توجد مبيعات في الفترة.",
        table: {
          columns: ["البراند", "الكمية", "الإيراد"],
          rows: data.byBrand.map((b) => [b.brand, b.qty, b.revenue]),
        },
      };
    case "topProducts":
      return {
        id,
        title,
        note: data.topProducts.length ? undefined : "لا توجد مبيعات في الفترة.",
        table: {
          columns: ["المنتج", "البراند", "الكمية", "الإيراد"],
          rows: data.topProducts.map((p) => [p.name, p.brand, p.qty, p.revenue]),
        },
      };
    case "cashiers":
      return {
        id,
        title,
        note: data.cashiers.length
          ? undefined
          : "لا توجد فواتير مسجّلة باسم كاشير في الفترة.",
        table: {
          columns: [
            "الكاشير",
            "عدد الفواتير",
            "الإجمالي",
            "متوسط الفاتورة",
            "أعلى فاتورة",
          ],
          rows: data.cashiers.map((c) => [
            c.name,
            c.count,
            c.total,
            c.avgInvoice,
            c.maxInvoice,
          ]),
        },
      };
    case "byPayment":
      return {
        id,
        title,
        table: {
          columns: ["الطريقة", "عدد الفواتير", "الإجمالي"],
          rows: data.byPayment.map((p) => [p.label, p.count, p.total]),
        },
      };
    case "discount":
      return {
        id,
        title,
        metrics: [
          { label: "إجمالي الخصومات", value: money(data.discount.total) },
          { label: "عدد الفواتير المخصومة", value: num(data.discount.count) },
          { label: "نسبة الخصم من المبيعات", value: `${num(data.discount.pct)}%` },
        ],
      };
    case "deliveryVsPickup":
      return {
        id,
        title,
        table: {
          columns: ["النوع", "عدد الطلبات", "الإجمالي"],
          rows: [
            [
              "توصيل",
              data.deliveryVsPickup.deliveryCount,
              data.deliveryVsPickup.deliveryTotal,
            ],
            [
              "استلام من المحل",
              data.deliveryVsPickup.pickupCount,
              data.deliveryVsPickup.pickupTotal,
            ],
          ],
        },
      };
    case "salesTrend":
      return {
        id,
        title,
        table: {
          columns: ["التاريخ", "عدد الفواتير", "المبيعات"],
          rows: data.dailySales.map((d) => [day(d.date), d.count, d.total]),
        },
      };

    // ===== المنتجات والجرد =====
    case "inventoryValue":
      return {
        id,
        title,
        metrics: [
          { label: "قيمة المخزون (تكلفة)", value: money(data.inventoryValue.cost) },
          { label: "قيمة المخزون (سعر البيع)", value: money(data.inventoryValue.retail) },
          { label: "إجمالي الوحدات", value: num(data.inventoryValue.units) },
        ],
      };
    case "productsCount":
      return {
        id,
        title,
        metrics: [
          { label: "عدد المنتجات", value: num(data.productsCount.products) },
          { label: "عدد الأصناف", value: num(data.productsCount.variants) },
        ],
      };
    case "lowStock":
      return {
        id,
        title,
        note: data.lowStock.length
          ? undefined
          : "لا توجد أصناف منخفضة المخزون.",
        table: {
          columns: ["المنتج", "البراند", "الفرع", "المقاس", "الكمية", "الحد الأدنى"],
          rows: data.lowStock.map((v) => [
            v.productName,
            v.brand,
            BRANCH_LABELS[v.branch],
            v.size,
            v.quantity,
            v.minQuantity,
          ]),
        },
      };
    case "outOfStock":
      return {
        id,
        title,
        note: data.outOfStock.length
          ? undefined
          : "لا توجد أصناف نفد مخزونها.",
        table: {
          columns: ["المنتج", "البراند", "الفرع", "المقاس"],
          rows: data.outOfStock.map((v) => [
            v.productName,
            v.brand,
            BRANCH_LABELS[v.branch],
            v.size,
          ]),
        },
      };
    case "stockByBranch":
      return {
        id,
        title,
        table: {
          columns: ["الفرع", "الوحدات", "القيمة (سعر البيع)"],
          rows: data.stockByBranch.map((b) => [
            BRANCH_LABELS[b.branch],
            b.units,
            b.retail,
          ]),
        },
      };
    case "stockByCategory":
      return {
        id,
        title,
        table: {
          columns: ["الفئة", "الوحدات", "القيمة (سعر البيع)"],
          rows: data.stockByCategory.map((c) => [
            CATEGORY_LABELS[c.category],
            c.units,
            c.retail,
          ]),
        },
      };
    case "stockByBrand":
      return {
        id,
        title,
        note: data.stockByBrand.length ? undefined : "لا يوجد مخزون.",
        table: {
          columns: ["البراند", "الوحدات", "القيمة (سعر البيع)"],
          rows: data.stockByBrand.map((b) => [b.brand, b.units, b.retail]),
        },
      };
    case "slowMoving":
      return {
        id,
        title,
        note: data.slowMoving.length
          ? undefined
          : "لا توجد منتجات راكدة في الفترة.",
        table: {
          columns: ["المنتج", "البراند", "المخزون"],
          rows: data.slowMoving.map((p) => [p.name, p.brand, p.quantity]),
        },
      };
    case "mostProfitable":
      return {
        id,
        title,
        note: data.mostProfitable.length
          ? "الربح = الإيراد − التكلفة (سعر الشراء). أدخِل سعر التكلفة للأصناف لضبط الأرقام."
          : "لا توجد مبيعات في الفترة.",
        table: {
          columns: ["المنتج", "البراند", "الكمية المباعة", "الإيراد", "الربح"],
          rows: data.mostProfitable.map((p) => [
            p.name,
            p.brand,
            p.qty,
            p.revenue,
            p.profit,
          ]),
        },
      };
    case "damaged":
      return {
        id,
        title,
        note: data.damaged.length
          ? undefined
          : "لا توجد سجلات ديفو في الفترة (يتطلب تسجيل التالف/المعيب).",
        table: {
          columns: ["المنتج", "البراند", "المقاس", "الفرع", "الكمية", "السبب", "التاريخ"],
          rows: data.damaged.map((d) => [
            d.productName,
            d.brand,
            d.size ?? "—",
            BRANCH_LABELS[d.branch],
            d.quantity,
            d.reason ?? "—",
            day(d.date),
          ]),
        },
      };
    case "transfers":
      return {
        id,
        title,
        note: data.transfers.length
          ? undefined
          : "لا توجد تحويلات مخزون في الفترة (يتطلب تسجيل التحويلات).",
        table: {
          columns: ["المنتج", "البراند", "المقاس", "من فرع", "إلى فرع", "الكمية", "التاريخ"],
          rows: data.transfers.map((t) => [
            t.productName,
            t.brand,
            t.size ?? "—",
            BRANCH_LABELS[t.fromBranch],
            BRANCH_LABELS[t.toBranch],
            t.quantity,
            day(t.date),
          ]),
        },
      };
    case "newProducts":
      return {
        id,
        title,
        note: data.newProducts.length
          ? undefined
          : "لم تُضَف منتجات جديدة في الفترة.",
        table: {
          columns: ["المنتج", "البراند", "الفئة", "الوحدات", "تاريخ الإضافة"],
          rows: data.newProducts.map((p) => [
            p.name,
            p.brand,
            CATEGORY_LABELS[p.category],
            p.units,
            day(p.createdAt),
          ]),
        },
      };
    case "sizeReport":
      return {
        id,
        title,
        table: {
          columns: ["الفئة", "أكثر مقاس مبيعاً", "الكمية المباعة"],
          rows: data.sizeReport.map((c) => {
            const top = c.topSize
              ? c.sizes.find((s) => s.size === c.topSize)?.qty ?? 0
              : 0;
            return [
              CATEGORY_LABELS[c.category],
              c.topSize ?? "—",
              top,
            ];
          }),
        },
      };
    default: {
      const _exhaustive: never = id;
      return { id: _exhaustive, title };
    }
  }
}
