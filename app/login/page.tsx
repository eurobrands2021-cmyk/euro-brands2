"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { ForgotPasswordModal } from "@/components/forgot-password-modal";
import {
  isSessionValid,
  tryLogin,
  startSession,
  consumeRecovery,
  type Role,
} from "@/lib/auth";
import { logActivity, ACTIVITY_ACTIONS } from "@/lib/activity";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get("next") || "/";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // إذا كانت الجلسة صالحة، تخطّى صفحة الدخول
  useEffect(() => {
    if (isSessionValid()) router.replace(next);
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const result = await tryLogin(name, password);
      if (!result.ok) {
        setError(result.error || "كلمة المرور غير صحيحة");
        return;
      }
      // سجّل دخول المستخدم (لا يُعيق التوجيه)
      void logActivity(ACTIVITY_ACTIONS.LOGIN, null);
      router.replace(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card w-full max-w-sm p-8 card-accent">
        <div className="flex flex-col items-center">
          <Logo size={120} className="rounded-full" />
          <h1 className="mt-4 text-xl font-extrabold text-text">Euro Brands</h1>
          <p className="mt-1 text-sm text-muted">نظام إدارة المخزون والمبيعات</p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label flex items-center gap-1.5">
              <User className="h-4 w-4 text-muted" />
              الاسم
            </label>
            <input
              autoFocus
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اكتب اسمك"
              aria-invalid={!!error}
            />
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-muted" />
              كلمة المرور
            </label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                className="input pr-3 pl-10 nums"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                aria-invalid={!!error}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                aria-label={show ? "إخفاء" : "إظهار"}
              >
                {show ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-sm font-medium text-danger">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || !name.trim() || !password}
            className="btn btn-primary h-11 w-full text-base"
          >
            {busy && <Spinner className="h-4 w-4" />}
            دخول
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-sm font-medium text-accent hover:underline"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
        </form>
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        onRecovered={(role: Role, recoveredName?: string) => {
          // إذن استرجاع قصير الأجل بدل كشف كلمة المرور — يبدأ الجلسة مباشرةً.
          if (!consumeRecovery(role)) {
            setError("انتهت صلاحية التحقّق، حاول مرة أخرى");
            return;
          }
          const sessionName =
            recoveredName?.trim() || (role === "ADMIN" ? "المدير" : "كاشير");
          startSession(sessionName, role);
          void logActivity(ACTIVITY_ACTIONS.LOGIN, null);
          setError(null);
          router.replace(next);
        }}
      />
    </div>
  );
}
