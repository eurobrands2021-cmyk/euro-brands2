"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  LayoutDashboard,
  Package,
  ShoppingCart,
  ReceiptText,
  Sparkles,
  Truck,
  Settings,
  Menu,
  X,
  LogOut,
  Users,
  FileBarChart,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet } from "@/lib/client";
import {
  getSession,
  endSession,
  ROLE_LABELS,
  type Role,
  type Session,
} from "@/lib/auth";
import type { LowStockResponse } from "@/lib/types";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { AccessRequestsBell } from "./access-requests-bell";

// كل عنصر يحدد الأدوار المسموح لها برؤيته
const NAV_ITEMS: {
  href: string;
  label: string;
  icon: typeof Home;
  roles: Role[];
}[] = [
  { href: "/", label: "الرئيسية", icon: Home, roles: ["ADMIN"] },
  {
    href: "/dashboard",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    roles: ["ADMIN"],
  },
  {
    href: "/reports",
    label: "التقارير",
    icon: FileBarChart,
    roles: ["ADMIN"],
  },
  { href: "/inventory", label: "المخزون", icon: Package, roles: ["ADMIN"] },
  {
    href: "/pos",
    label: "الفاتورة",
    icon: ShoppingCart,
    roles: ["ADMIN", "CASHIER"],
  },
  { href: "/insights", label: "الذكاء", icon: Sparkles, roles: ["ADMIN"] },
  { href: "/delivery", label: "الطلبات", icon: Truck, roles: ["ADMIN"] },
  {
    href: "/sales",
    label: "سجل الفواتير",
    icon: ReceiptText,
    roles: ["ADMIN"],
  },
  { href: "/customers", label: "العملاء", icon: Users, roles: ["ADMIN"] },
  {
    href: "/settings",
    label: "الإعدادات",
    icon: Settings,
    roles: ["ADMIN", "CASHIER"],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lowStock, setLowStock] = useState(0);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, [pathname]);

  useEffect(() => {
    apiGet<LowStockResponse>("/api/low-stock")
      .then((r) => setLowStock(r.count))
      .catch(() => {});
  }, [pathname]);

  const role = session?.role;
  const items = NAV_ITEMS.filter((item) => !role || item.roles.includes(role));

  function logout() {
    endSession();
    setMobileOpen(false);
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* الشعار + الروابط (يمين في RTL) */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={36} className="rounded-full" />
            <span className="hidden text-lg font-extrabold tracking-tight text-text sm:block">
              Euro Brands
            </span>
          </Link>

          {/* روابط سطح المكتب */}
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-16 items-center gap-2 border-b-[3px] px-2.5 text-sm font-medium transition-colors lg:px-3",
                    active
                      ? "border-accent text-accent"
                      : "border-transparent text-muted hover:text-text"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                  {item.href === "/" && lowStock > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white nums">
                      {lowStock}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* المستخدم + مبدّل الوضع + تسجيل الخروج (يسار في RTL) */}
        <div className="flex items-center gap-2">
          {session && (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-sm font-medium text-text">
                {session.name}
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                {ROLE_LABELS[session.role]}
              </span>
            </div>
          )}
          {role === "ADMIN" && <AccessRequestsBell />}
          <ThemeToggle />
          {session && (
            <button
              onClick={logout}
              className="hidden btn btn-ghost h-11 w-11 !px-0 text-danger md:inline-flex"
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
            >
              <LogOut className="h-5 w-5" />
            </button>
          )}
          <button
            className="btn btn-ghost h-11 w-11 !px-0 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="القائمة"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* قائمة الموبايل */}
      {mobileOpen && (
        <nav className="border-t md:hidden">
          {session && (
            <div className="flex items-center justify-between gap-2 border-b bg-[var(--surface-2)] px-5 py-3">
              <span className="font-medium text-text">{session.name}</span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                {ROLE_LABELS[session.role]}
              </span>
            </div>
          )}
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 border-r-[3px] px-5 py-4 text-base font-medium",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-transparent text-muted"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                {item.href === "/dashboard" && lowStock > 0 && (
                  <span className="mr-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white nums">
                    {lowStock}
                  </span>
                )}
              </Link>
            );
          })}
          {session && (
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 border-r-[3px] border-transparent px-5 py-4 text-base font-medium text-danger"
            >
              <LogOut className="h-5 w-5" />
              تسجيل الخروج
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
