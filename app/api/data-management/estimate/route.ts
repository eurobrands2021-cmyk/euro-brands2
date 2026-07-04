import { ok, handleServerError } from "@/lib/api";
import { MOCK_MODE } from "@/lib/mock-store";
import {
  countByType,
  resolveRange,
  DATA_TYPE_KEYS,
  isDataType,
  type DataTypeKey,
} from "@/lib/data-management";

export const dynamic = "force-dynamic";

// POST /api/data-management/estimate — عدد السجلات لكل نوع ضمن المدى المختار
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const types: DataTypeKey[] = Array.isArray(body.types)
      ? body.types.filter(isDataType)
      : DATA_TYPE_KEYS;
    const range = resolveRange(body.preset, body.from, body.to);

    if (MOCK_MODE) {
      const zero = Object.fromEntries(DATA_TYPE_KEYS.map((k) => [k, 0]));
      return ok({ counts: zero, mock: true });
    }

    const counts = await countByType(types, range);
    return ok({ counts });
  } catch (error) {
    return handleServerError(error);
  }
}
