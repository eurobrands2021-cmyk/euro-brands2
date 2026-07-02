// تصدير الأقسام المختارة إلى Excel — كل قسم في ورقة منفصلة.
import { format } from "date-fns";
import type { ReportsData } from "@/lib/types";
import { buildSectionContent } from "./export-data";
import type { SectionId } from "./sections";

function sanitizeSheetName(name: string): string {
  // Excel يمنع : \ / ? * [ ] ويحدّ الاسم بـ 31 حرفاً
  return name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "ورقة";
}

export async function generateReportsExcel(
  data: ReportsData,
  range: { from: string; to: string },
  ids: SectionId[]
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  const used = new Set<string>();

  for (const id of ids) {
    const sec = buildSectionContent(data, id);
    const aoa: (string | number)[][] = [[sec.title], []];

    if (sec.metrics?.length) {
      aoa.push(["البيان", "القيمة"]);
      for (const m of sec.metrics) aoa.push([m.label, m.value]);
      aoa.push([]);
    }
    if (sec.note) {
      aoa.push([sec.note]);
      aoa.push([]);
    }
    if (sec.table) {
      aoa.push(sec.table.columns);
      for (const r of sec.table.rows) aoa.push(r);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const colCount = Math.max(sec.table?.columns.length ?? 0, 2);
    ws["!cols"] = Array.from({ length: colCount }, (_, i) => ({
      wch: i === 0 ? 30 : 16,
    }));

    let name = sanitizeSheetName(sec.title);
    let k = 2;
    const base = name;
    while (used.has(name)) name = sanitizeSheetName(`${base} ${k++}`);
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  if (!ids.length) {
    const ws = XLSX.utils.aoa_to_sheet([["لم يتم اختيار أي أقسام"]]);
    XLSX.utils.book_append_sheet(wb, ws, "التقرير");
  }

  const fromD = format(new Date(range.from), "yyyy-MM-dd");
  const toD = format(new Date(range.to), "yyyy-MM-dd");
  XLSX.writeFile(wb, `euro-brands-report-${fromD}_${toD}.xlsx`);
}
