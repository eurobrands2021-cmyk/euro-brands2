import { ok, handleServerError } from "@/lib/api";
import { MOCK_MODE } from "@/lib/mock-store";
import {
  sweepAndListArchived,
  ARCHIVE_RETENTION_HOURS,
} from "@/lib/data-management";

export const dynamic = "force-dynamic";

// GET /api/data-management/status — يكنس المؤرشفات المنتهية (>72h) ويُعيد ملخّص المتبقّي
export async function GET() {
  try {
    if (MOCK_MODE)
      return ok({ archived: [], retentionHours: ARCHIVE_RETENTION_HOURS });

    const archived = await sweepAndListArchived();
    return ok({ archived, retentionHours: ARCHIVE_RETENTION_HOURS });
  } catch (error) {
    return handleServerError(error);
  }
}
