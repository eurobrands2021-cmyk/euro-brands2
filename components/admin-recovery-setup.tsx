"use client";

import { useEffect, useState } from "react";
import { ShieldQuestion, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { apiGet, apiPost } from "@/lib/client";
import { getSession } from "@/lib/auth";
import { ADMIN_SECURITY_QUESTIONS } from "@/lib/recovery";
import type { AdminRecoveryStatus } from "@/lib/types";

const CUSTOM = "__custom__";
const SNOOZE_KEY = "eb-recovery-setup-snoozed";

// نموذج الإعداد المشترك (يُستخدم في الإعدادات وفي التنبيه التلقائي)
function RecoveryForm({
  configured,
  currentQuestion,
  onSaved,
  onCancel,
  cancelLabel,
}: {
  configured: boolean;
  currentQuestion: string | null;
  onSaved: (status: AdminRecoveryStatus) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const preset =
    currentQuestion && ADMIN_SECURITY_QUESTIONS.includes(currentQuestion)
      ? currentQuestion
      : currentQuestion
        ? CUSTOM
        : ADMIN_SECURITY_QUESTIONS[0];
  const [choice, setChoice] = useState<string>(preset);
  const [custom, setCustom] = useState(
    currentQuestion && !ADMIN_SECURITY_QUESTIONS.includes(currentQuestion)
      ? currentQuestion
      : ""
  );
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const question = (choice === CUSTOM ? custom : choice).trim();
    if (!question) return setError("اكتب سؤال الأمان");
    if (!answer.trim()) return setError("اكتب إجابة سؤال الأمان");
    setBusy(true);
    setError(null);
    try {
      const status = await apiPost<AdminRecoveryStatus>("/api/admin-recovery", {
        action: "setup",
        question,
        answer: answer.trim(),
      });
      toast.success("تم حفظ سؤال الأمان");
      onSaved(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="label">سؤال الأمان</label>
        <select
          className="input"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {ADMIN_SECURITY_QUESTIONS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
          <option value={CUSTOM}>سؤال مخصص…</option>
        </select>
      </div>

      {choice === CUSTOM && (
        <div>
          <label className="label">اكتب سؤالك</label>
          <input
            className="input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="مثال: ما هو اسم أول منتج أضفته؟"
          />
        </div>
      )}

      <div>
        <label className="label">الإجابة</label>
        <input
          className="input"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={configured ? "أدخل الإجابة الجديدة" : "اكتب الإجابة"}
        />
        <p className="mt-1 text-xs text-muted">
          احفظ الإجابة في مكان آمن — ستحتاجها لاسترجاع الدخول إذا نسيت كلمة المرور.
        </p>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary flex-1"
          >
            {cancelLabel ?? "إلغاء"}
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary flex-1"
        >
          {busy && <Spinner className="h-4 w-4" />}
          {configured ? "تحديث" : "حفظ"}
        </button>
      </div>
    </form>
  );
}

// بطاقة إعداد سؤال الأمان في صفحة الإعدادات (للمدير)
export function AdminRecoverySetupCard() {
  const [status, setStatus] = useState<AdminRecoveryStatus | null>(null);

  useEffect(() => {
    apiGet<AdminRecoveryStatus>("/api/admin-recovery")
      .then(setStatus)
      .catch(() => setStatus({ configured: false, question: null }));
  }, []);

  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text">
        <ShieldCheck className="h-5 w-5 text-accent" />
        سؤال الأمان (استرجاع الدخول)
      </h2>
      <p className="mb-4 text-sm text-muted">
        {status?.configured
          ? "سؤال الأمان مُعدّ. يمكنك تغييره بتحديد سؤال وإجابة جديدين."
          : "لم يُضبط سؤال أمان بعد. اضبطه لتتمكن من استرجاع الدخول عند نسيان كلمة المرور."}
      </p>
      {status === null ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          جارٍ التحميل…
        </div>
      ) : (
        <RecoveryForm
          configured={status.configured}
          currentQuestion={status.question}
          onSaved={setStatus}
        />
      )}
    </Card>
  );
}

// تنبيه تلقائي (مرة واحدة) لإعداد سؤال الأمان عند دخول المدير لأول مرة
export function AdminRecoverySetupPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (session?.role !== "ADMIN") return;
    if (localStorage.getItem(SNOOZE_KEY) === "1") return;

    let active = true;
    apiGet<AdminRecoveryStatus>("/api/admin-recovery")
      .then((s) => {
        if (active && !s.configured) setOpen(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function snooze() {
    localStorage.setItem(SNOOZE_KEY, "1");
    setOpen(false);
  }

  return (
    <Modal
      open={open}
      onClose={snooze}
      title="أمّن حسابك"
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-accent-soft p-3">
          <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p className="text-sm font-medium text-text">
            اضبط سؤال أمان لحسابك كمدير حتى تتمكن من استرجاع الدخول إذا نسيت كلمة
            المرور.
          </p>
        </div>
        <RecoveryForm
          configured={false}
          currentQuestion={null}
          onSaved={() => setOpen(false)}
          onCancel={snooze}
          cancelLabel="لاحقاً"
        />
      </div>
    </Modal>
  );
}
