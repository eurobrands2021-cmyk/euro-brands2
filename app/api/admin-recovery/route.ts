import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError } from "@/lib/api";
import { parseAdminRecoveryBody, ValidationError } from "@/lib/validate";
import {
  normalizeAnswer,
  ADMIN_RECOVERY_QUESTION_KEY,
  ADMIN_RECOVERY_ANSWER_KEY,
} from "@/lib/recovery";
import type { AdminRecoveryStatus } from "@/lib/types";
import {
  MOCK_MODE,
  mockGetAdminRecovery,
  mockSetupAdminRecovery,
  mockVerifyAdminRecovery,
} from "@/lib/mock-store";

export const dynamic = "force-dynamic";

function hashAnswer(answer: string): string {
  return createHash("sha256").update(normalizeAnswer(answer)).digest("hex");
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// GET /api/admin-recovery — هل سؤال الأمان معدّ؟ وما نصّه (بدون الإجابة)
export async function GET() {
  try {
    if (MOCK_MODE) return ok(mockGetAdminRecovery());

    const question = await getSetting(ADMIN_RECOVERY_QUESTION_KEY);
    const answerHash = await getSetting(ADMIN_RECOVERY_ANSWER_KEY);
    const res: AdminRecoveryStatus = {
      configured: !!(question && answerHash),
      question: question ?? null,
    };
    return ok(res);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/admin-recovery — إعداد سؤال الأمان أو التحقق من الإجابة
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = parseAdminRecoveryBody(body);

    if (parsed.action === "setup") {
      if (MOCK_MODE)
        return ok(mockSetupAdminRecovery(parsed.question, parsed.answer));
      await setSetting(ADMIN_RECOVERY_QUESTION_KEY, parsed.question);
      await setSetting(ADMIN_RECOVERY_ANSWER_KEY, hashAnswer(parsed.answer));
      const res: AdminRecoveryStatus = {
        configured: true,
        question: parsed.question,
      };
      return ok(res);
    }

    // action === "verify"
    if (MOCK_MODE) return ok(mockVerifyAdminRecovery(parsed.answer));

    const answerHash = await getSetting(ADMIN_RECOVERY_ANSWER_KEY);
    if (!answerHash) return fail("لم يتم إعداد سؤال الأمان بعد", 409);
    return ok({ ok: hashAnswer(parsed.answer) === answerHash });
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
