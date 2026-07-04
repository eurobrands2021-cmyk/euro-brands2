import { ok, fail, handleServerError } from "@/lib/api";
import { MOCK_MODE } from "@/lib/mock-store";
import {
  collectExport,
  resolveRange,
  isDataType,
  type DataTypeKey,
} from "@/lib/data-management";

export const dynamic = "force-dynamic";

// POST /api/data-management/export — بيانات التصدير (صفوف جاهزة لكل نوع مختار)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const types: DataTypeKey[] = Array.isArray(body.types)
      ? body.types.filter(isDataType)
      : [];
    if (types.length === 0) return fail("اختر نوعاً واحداً على الأقل للتصدير", 422);
    const range = resolveRange(body.preset, body.from, body.to);

    if (MOCK_MODE)
      return fail("التصدير غير متاح في وضع المعاينة (لا توجد قاعدة بيانات).", 400);

    const sheets = await collectExport(types, range);
    return ok({ sheets });
  } catch (error) {
    return handleServerError(error);
  }
}
