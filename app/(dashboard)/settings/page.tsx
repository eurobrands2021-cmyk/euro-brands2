"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserCircle, ScrollText, Filter, X } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { useFetch } from "@/lib/use-fetch";
import { AdminRecoverySetupCard } from "@/components/admin-recovery-setup";
import { formatDateTime } from "@/lib/format";
import {
  getSession,
  endSession,
  ROLE_LABELS,
  type Session,
} from "@/lib/auth";
import type { ActivityLogDTO } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
  }, []);

  function logout() {
    endSession();
    toast.success("تم تسجيل الخروج");
    router.replace("/login");
  }

  if (!ready) return <PageLoader />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="الإعدادات" description="حسابك وسجل النشاط" />

      {/* بطاقة المستخدم الحالي */}
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <UserCircle className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text">
                {session?.name ?? "—"}
              </h2>
              {session && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                  {ROLE_LABELS[session.role]}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              المستخدم الحالي لهذا الجهاز
            </p>
          </div>
        </div>
        <button onClick={logout} className="btn btn-danger">
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
      </Card>

      {/* سؤال الأمان — للمدير فقط */}
      {session?.role === "ADMIN" && <AdminRecoverySetupCard />}

      {/* عارض سجل النشاط — للمدير فقط */}
      {session?.role === "ADMIN" && (
        <div className="mt-6">
          <ActivityViewer />
        </div>
      )}
    </div>
  );
}

function ActivityViewer() {
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // بناء رابط الاستعلام من الفلاتر
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (user.trim()) params.set("user", user.trim());
    if (from) params.set("from", new Date(from).toISOString());
    if (to) {
      // نهاية اليوم المحدد
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      params.set("to", end.toISOString());
    }
    const qs = params.toString();
    return `/api/activity${qs ? `?${qs}` : ""}`;
  }, [user, from, to]);

  const { data, loading } = useFetch<ActivityLogDTO[]>(url);
  const logs = data ?? [];

  const hasFilters = !!(user.trim() || from || to);
  function clearFilters() {
    setUser("");
    setFrom("");
    setTo("");
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text">
        <ScrollText className="h-5 w-5 text-accent" />
        سجل النشاط
      </h2>

      {/* الفلاتر */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted" />
            المستخدم
          </label>
          <input
            className="input"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="اسم المستخدم"
          />
        </div>
        <div>
          <label className="label">من تاريخ</label>
          <input
            type="date"
            className="input nums"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label">إلى تاريخ</label>
          <input
            type="date"
            className="input nums"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="btn btn-ghost mb-3 h-8 gap-1 px-2 text-xs text-muted"
        >
          <X className="h-3.5 w-3.5" />
          مسح الفلاتر
        </button>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">جارٍ التحميل…</p>
      ) : logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          لا توجد سجلات مطابقة
        </p>
      ) : (
        <>
          {/* جدول لسطح المكتب */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead>
                <tr className="border-b text-muted">
                  <th className="px-3 py-2 font-medium">التاريخ</th>
                  <th className="px-3 py-2 font-medium">المستخدم</th>
                  <th className="px-3 py-2 font-medium">الدور</th>
                  <th className="px-3 py-2 font-medium">الإجراء</th>
                  <th className="px-3 py-2 font-medium">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2 text-muted nums whitespace-nowrap">
                      {formatDateTime(a.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-medium text-text">
                      {a.userName}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                        {a.userRole === "ADMIN" ? "مدير" : "كاشير"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text">{a.action}</td>
                    <td className="px-3 py-2 text-muted">{a.details || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* بطاقات للموبايل */}
          <div className="space-y-2 sm:hidden">
            {logs.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-text">{a.action}</p>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                    {a.userRole === "ADMIN" ? "مدير" : "كاشير"}
                  </span>
                </div>
                {a.details && (
                  <p className="mt-1 text-sm text-muted">{a.details}</p>
                )}
                <p className="mt-1 text-xs text-muted nums">
                  {a.userName} · {formatDateTime(a.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
