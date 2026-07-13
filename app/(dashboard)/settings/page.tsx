"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  UserCircle,
  ScrollText,
  Filter,
  X,
  Database,
  Printer,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { useFetch } from "@/lib/use-fetch";
import { AdminRecoverySetupCard } from "@/components/admin-recovery-setup";
import { InvoiceTemplateSettingsCard } from "@/components/invoice-template-settings";
import { PrintSettingsCard } from "@/components/print-settings-sections";
import { DataManagementCard } from "@/components/data-management";
import { cn } from "@/lib/cn";
import {
  AppearanceSettingsCard,
  InvoiceLockSettingsCard,
  CompanyInfoSettingsCard,
} from "@/components/settings-sections";
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
  const [tab, setTab] = useState<"general" | "print" | "data">("general");

  useEffect(() => {
    setSession(getSession());
    setReady(true);
    // فتح تبويب محدد عبر ?tab= (يُستخدم من رابط «تخصيص» في نافذة الطباعة)
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "print" || t === "data" || t === "general") setTab(t);
    } catch {
      /* تجاهل */
    }
  }, []);

  function logout() {
    endSession();
    toast.success("تم تسجيل الخروج");
    router.replace("/login");
  }

  if (!ready) return <PageLoader />;

  const isAdmin = session?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="الإعدادات" description="حسابك وسجل النشاط" />

      {/* التبويبات — «عام» و«إعدادات الطباعة» للجميع، و«إدارة البيانات» للمدير */}
      <div className="mb-6 flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
        <button
          onClick={() => setTab("general")}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            tab === "general"
              ? "bg-surface text-text shadow-sm"
              : "text-muted hover:text-text"
          )}
        >
          عام
        </button>
        <button
          onClick={() => setTab("print")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            tab === "print"
              ? "bg-surface text-text shadow-sm"
              : "text-muted hover:text-text"
          )}
        >
          <Printer className="h-4 w-4" />
          إعدادات الطباعة
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("data")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === "data"
                ? "bg-surface text-text shadow-sm"
                : "text-muted hover:text-text"
            )}
          >
            <Database className="h-4 w-4" />
            إدارة البيانات
          </button>
        )}
      </div>

      {tab === "print" ? (
        <PrintSettingsCard />
      ) : isAdmin && tab === "data" ? (
        <DataManagementCard />
      ) : (
      <>

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

      {/* المظهر: الألوان + الخط + الوضع — للمدير فقط */}
      {session?.role === "ADMIN" && (
        <div className="mb-6">
          <AppearanceSettingsCard />
        </div>
      )}

      {/* بيانات الشركة — للمدير فقط */}
      {session?.role === "ADMIN" && (
        <div className="mb-6">
          <CompanyInfoSettingsCard />
        </div>
      )}

      {/* قالب الفاتورة الافتراضي */}
      <div className="mb-6">
        <InvoiceTemplateSettingsCard />
      </div>

      {/* قفل الفواتير — للمدير فقط */}
      {session?.role === "ADMIN" && (
        <div className="mb-6">
          <InvoiceLockSettingsCard />
        </div>
      )}

      {/* سؤال الأمان — للمدير فقط */}
      {session?.role === "ADMIN" && <AdminRecoverySetupCard />}

      {/* عارض سجل النشاط — للمدير فقط */}
      {session?.role === "ADMIN" && (
        <div className="mt-6">
          <ActivityViewer />
        </div>
      )}
      </>
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
        // صفوف قابلة للطي — ملخّص فقط افتراضياً، والنقر يوسّع التفاصيل الكاملة
        <div className="space-y-2">
          {logs.map((a) => (
            <ActivityRow key={a.id} log={a} />
          ))}
        </div>
      )}
    </Card>
  );
}

// صف سجل نشاط قابل للطي: يعرض الملخّص (الإجراء + المستخدم + الوقت) افتراضياً،
// وبالنقر يتوسّع لإظهار كامل التفاصيل، وبالنقر مجدداً ينطوي.
function ActivityRow({ log }: { log: ActivityLogDTO }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-right transition-colors hover:bg-[var(--surface-2)]"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            expanded && "rotate-180"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{log.action}</p>
          <p className="mt-0.5 truncate text-xs text-muted nums">
            {log.userName} · {formatDateTime(log.createdAt)}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-xs text-muted">
              المستخدم:{" "}
              <span className="font-medium text-text">{log.userName}</span>
            </span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
              {log.userRole === "ADMIN" ? "مدير" : "كاشير"}
            </span>
            <span className="text-xs text-muted nums">
              {formatDateTime(log.createdAt)}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted">الإجراء</p>
            <p className="text-text">{log.action}</p>
          </div>
          <div>
            <p className="text-xs text-muted">التفاصيل</p>
            <p className="whitespace-pre-wrap break-words text-text">
              {log.details || "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
