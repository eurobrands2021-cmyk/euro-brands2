"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldQuestion,
  UserCog,
  Store,
  Clock,
  CheckCircle2,
  XCircle,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { apiGet, apiPost, apiPut } from "@/lib/client";
import { ADMIN_PASSWORD, CASHIER_PASSWORD } from "@/lib/auth";
import type { AccessRequestDTO, AdminRecoveryStatus } from "@/lib/types";

type Step =
  | "choose"
  | "cashier-form"
  | "cashier-waiting"
  | "cashier-approved"
  | "cashier-rejected"
  | "admin-loading"
  | "admin-question"
  | "admin-not-configured"
  | "admin-revealed";

export function ForgotPasswordModal({
  open,
  onClose,
  onRecovered,
}: {
  open: boolean;
  onClose: () => void;
  // يملأ حقل كلمة المرور في صفحة الدخول عند نجاح الاسترجاع
  onRecovered?: (password: string, name?: string) => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // كاشير
  const [cashierName, setCashierName] = useState("");
  const requestIdRef = useRef<string | null>(null);

  // مدير
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const reset = useCallback(() => {
    setStep("choose");
    setBusy(false);
    setError(null);
    setCashierName("");
    setAnswer("");
    setQuestion(null);
    requestIdRef.current = null;
  }, []);

  function close() {
    onClose();
    // إعادة الضبط بعد إغلاق مؤثّر الحركة
    setTimeout(reset, 200);
  }

  // ------------------------- كاشير -------------------------
  async function submitCashier(e: React.FormEvent) {
    e.preventDefault();
    if (!cashierName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const req = await apiPost<AccessRequestDTO>("/api/access-requests", {
        name: cashierName.trim(),
      });
      requestIdRef.current = req.id;
      setStep("cashier-waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  // استطلاع حالة طلب الكاشير أثناء الانتظار
  useEffect(() => {
    if (step !== "cashier-waiting") return;
    const id = requestIdRef.current;
    if (!id) return;
    let active = true;

    const check = async () => {
      try {
        const req = await apiGet<AccessRequestDTO>(
          `/api/access-requests/${id}`
        );
        if (!active) return;
        if (req.status === "APPROVED") setStep("cashier-approved");
        else if (req.status === "REJECTED") setStep("cashier-rejected");
      } catch {
        /* تجاهل أخطاء الاستطلاع المؤقتة */
      }
    };

    const timer = setInterval(check, 4000);
    void check();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [step]);

  // ------------------------- مدير -------------------------
  async function startAdmin() {
    setStep("admin-loading");
    setError(null);
    try {
      const status = await apiGet<AdminRecoveryStatus>("/api/admin-recovery");
      if (status.configured && status.question) {
        setQuestion(status.question);
        setStep("admin-question");
      } else {
        setStep("admin-not-configured");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل سؤال الأمان");
      setStep("choose");
    }
  }

  async function submitAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ ok: boolean }>("/api/admin-recovery", {
        action: "verify",
        answer: answer.trim(),
      });
      if (res.ok) setStep("admin-revealed");
      else setError("الإجابة غير صحيحة، حاول مرة أخرى");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التحقق من الإجابة");
    } finally {
      setBusy(false);
    }
  }

  function applyRecoveredPassword(password: string, name?: string) {
    onRecovered?.(password, name);
    close();
  }

  return (
    <Modal open={open} onClose={close} title="استرجاع الدخول" size="sm">
      {/* اختيار الدور */}
      {step === "choose" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">هل أنت أدمن أم كاشير؟</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={startAdmin}
              className="flex flex-col items-center gap-2 rounded-xl border bg-surface p-5 text-center font-medium text-text transition-colors hover:border-accent hover:text-accent"
            >
              <UserCog className="h-7 w-7 text-accent" />
              أدمن
            </button>
            <button
              onClick={() => setStep("cashier-form")}
              className="flex flex-col items-center gap-2 rounded-xl border bg-surface p-5 text-center font-medium text-text transition-colors hover:border-accent hover:text-accent"
            >
              <Store className="h-7 w-7 text-accent" />
              كاشير
            </button>
          </div>
          {error && (
            <p className="text-sm font-medium text-danger">{error}</p>
          )}
        </div>
      )}

      {/* كاشير — إدخال الاسم */}
      {step === "cashier-form" && (
        <form onSubmit={submitCashier} className="space-y-4">
          <p className="text-sm text-muted">
            اكتب اسمك وسيصل طلب دخولك للأدمن للموافقة عليه.
          </p>
          <div>
            <label className="label">الاسم</label>
            <input
              autoFocus
              className="input"
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
              placeholder="اكتب اسمك"
            />
          </div>
          {error && (
            <p className="text-sm font-medium text-danger">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="btn btn-secondary flex-1"
            >
              رجوع
            </button>
            <button
              type="submit"
              disabled={busy || !cashierName.trim()}
              className="btn btn-primary flex-1"
            >
              {busy && <Spinner className="h-4 w-4" />}
              إرسال الطلب
            </button>
          </div>
        </form>
      )}

      {/* كاشير — انتظار الموافقة */}
      {step === "cashier-waiting" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Clock className="h-10 w-10 text-warning" />
          <p className="text-base font-bold text-text">
            في انتظار موافقة الأدمن
          </p>
          <p className="text-sm text-muted">
            تم إرسال طلبك. سيظهر لك تأكيد الدخول فور موافقة الأدمن.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Spinner className="h-3.5 w-3.5" />
            يتم التحقق تلقائياً…
          </div>
        </div>
      )}

      {/* كاشير — تمت الموافقة */}
      {step === "cashier-approved" && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="text-base font-bold text-text">تمت الموافقة على دخولك</p>
          <p className="text-sm text-muted">كلمة مرور الكاشير هي:</p>
          <div className="rounded-lg bg-accent-soft px-6 py-3 text-2xl font-extrabold tracking-widest text-accent nums">
            {CASHIER_PASSWORD}
          </div>
          <button
            onClick={() => useRevealedPassword(CASHIER_PASSWORD, cashierName.trim())}
            className="btn btn-primary mt-2 w-full"
          >
            <ArrowRight className="h-4 w-4" />
            متابعة الدخول
          </button>
        </div>
      )}

      {/* كاشير — تم الرفض */}
      {step === "cashier-rejected" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <XCircle className="h-10 w-10 text-danger" />
          <p className="text-base font-bold text-text">تم رفض الطلب</p>
          <p className="text-sm text-muted">
            لم تتم الموافقة على طلب دخولك. تواصل مع الأدمن أو أعد المحاولة.
          </p>
          <button onClick={reset} className="btn btn-secondary mt-2 w-full">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* مدير — تحميل */}
      {step === "admin-loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          جارٍ التحميل…
        </div>
      )}

      {/* مدير — سؤال الأمان */}
      {step === "admin-question" && (
        <form onSubmit={submitAdmin} className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-accent-soft p-3">
            <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm font-medium text-text">{question}</p>
          </div>
          <div>
            <label className="label">إجابتك</label>
            <input
              autoFocus
              className="input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="اكتب الإجابة"
            />
          </div>
          {error && (
            <p className="text-sm font-medium text-danger">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="btn btn-secondary flex-1"
            >
              رجوع
            </button>
            <button
              type="submit"
              disabled={busy || !answer.trim()}
              className="btn btn-primary flex-1"
            >
              {busy && <Spinner className="h-4 w-4" />}
              تأكيد
            </button>
          </div>
        </form>
      )}

      {/* مدير — لم يُعدّ سؤال الأمان بعد */}
      {step === "admin-not-configured" && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <ShieldQuestion className="h-10 w-10 text-warning" />
          <p className="text-base font-bold text-text">
            لم يتم إعداد سؤال الأمان بعد
          </p>
          <p className="text-sm text-muted">
            لم يُضبط سؤال أمان للمدير على هذا النظام. ادخل بكلمة المرور الحالية،
            ثم أعِدّ سؤال الأمان من صفحة «الإعدادات» لتفعيل الاسترجاع لاحقاً.
          </p>
          <button onClick={close} className="btn btn-primary mt-2 w-full">
            حسناً
          </button>
        </div>
      )}

      {/* مدير — كشف كلمة المرور */}
      {step === "admin-revealed" && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <KeyRound className="h-10 w-10 text-success" />
          <p className="text-base font-bold text-text">تم التحقق بنجاح</p>
          <p className="text-sm text-muted">كلمة مرور المدير هي:</p>
          <div className="rounded-lg bg-accent-soft px-6 py-3 text-2xl font-extrabold tracking-widest text-accent nums">
            {ADMIN_PASSWORD}
          </div>
          <button
            onClick={() => useRevealedPassword(ADMIN_PASSWORD)}
            className="btn btn-primary mt-2 w-full"
          >
            <ArrowRight className="h-4 w-4" />
            متابعة الدخول
          </button>
        </div>
      )}
    </Modal>
  );
}
