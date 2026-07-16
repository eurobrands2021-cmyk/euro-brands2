"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  Crown,
  AlertTriangle,
  RotateCcw,
  MoreHorizontal,
  ChevronDown,
  Wallet,
  Truck as TruckIcon,
  Coins,
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
import type { LowStockResponse, ReturnsListResponse } from "@/lib/types";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsBell } from "./notifications-bell";
import { OfflineIndicator } from "./offline-indicator";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  roles: Role[];
}

// الروابط الرئيسية — ظاهرة دائماً على سطح المكتب
const MAIN_ITEMS: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: Home, roles: ["ADMIN"] },
  {
    href: "/dashboard",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
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
];

// روابط أقل استخداماً — مجمّعة داخل قائمة «المزيد»
const MORE_ITEMS: NavItem[] = [
  {
    href: "/shifts",
    label: "إقفال الصندوق",
    icon: Coins,
    roles: ["ADMIN", "CASHIER"],
  },
  { href: "/returns", label: "المرتجعات", icon: RotateCcw, roles: ["ADMIN"] },
  {
    href: "/suppliers",
    label: "الموردون والاستلام",
    icon: TruckIcon,
    roles: ["ADMIN"],
  },
  { href: "/expenses", label: "المصروفات", icon: Wallet, roles: ["ADMIN"] },
  { href: "/defects", label: "الديفو (التالف)", icon: AlertTriangle, roles: ["ADMIN"] },
  { href: "/customers", label: "العملاء", icon: Users, roles: ["ADMIN"] },
  { href: "/customers/vip", label: "كبار العملاء", icon: Crown, roles: ["ADMIN"] },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [lowStock, setLowStock] = useState(0);
  const [returnsToday, setReturnsToday] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSession(getSession());
  }, [pathname]);

  useEffect(() => {
    apiGet<LowStockResponse>("/api/low-stock")
      .then((r) => setLowStock(r.count))
      .catch(() => {});
  }, [pathname]);

  // عدّاد مرتجعات اليوم على رابط «المرتجعات» — يُحدَّث كل 60 ثانية.
  // نُعيد حساب بداية اليوم عند كل طلب حتى يُصفَّر العدّاد تلقائياً بعد منتصف الليل.
  useEffect(() => {
    let alive = true;
    const load = () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      apiGet<ReturnsListResponse>(
        `/api/returns?from=${encodeURIComponent(start.toISOString())}`
      )
        .then((r) => {
          if (alive) setReturnsToday(r.summary?.count ?? r.total ?? 0);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pathname]);

  // أغلق قائمة «المزيد» عند التنقّل أو النقر خارجها
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node))
        setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [moreOpen]);

  const role = session?.role;
  const byRole = (item: NavItem) => !role || item.roles.includes(role);
  const mainItems = MAIN_ITEMS.filter(byRole);
  const moreItems = MORE_ITEMS.filter(byRole);
  const moreActive = moreItems.some((i) => isActive(pathname, i.href));

  function logout() {
    endSession();
    setMobileOpen(false);
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* الشعار + الروابط (يمين في RTL) */}
        <div className="flex items-center gap-3 lg:gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={36} className="rounded-full" />
            <span className="hidden text-lg font-extrabold tracking-tight text-text sm:block">
              Euro Brands
            </span>
          </Link>

          {/* روابط سطح المكتب */}
          <nav className="hidden items-center gap-1 md:flex">
            {mainItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-16 items-center gap-1.5 border-b-[3px] px-2 text-sm font-medium transition-colors lg:px-2.5",
                    active
                      ? "border-accent text-accent"
                      : "border-transparent text-muted hover:text-text"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}

            {/* قائمة «المزيد» — الصفحات الأقل استخداماً */}
            {moreItems.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  className={cn(
                    "flex h-16 items-center gap-1 border-b-[3px] px-2 text-sm font-medium transition-colors lg:px-2.5",
                    moreActive || moreOpen
                      ? "border-accent text-accent"
                      : "border-transparent text-muted hover:text-text"
                  )}
                >
                  <MoreHorizontal className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">المزيد</span>
                  {returnsToday > 0 && !moreOpen && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                      aria-hidden
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      moreOpen && "rotate-180"
                    )}
                  />
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-xl border bg-surface shadow-card animate-fade-in"
                  >
                    {moreItems.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 text-sm font-medium",
                            active
                              ? "bg-accent-soft text-accent"
                              : "text-text hover:bg-[var(--surface-2)]"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {item.label}
                          {item.href === "/returns" && returnsToday > 0 && (
                            <span className="mr-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white nums">
                              {returnsToday}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* المستخدم + مبدّل الوضع + تسجيل الخروج (يسار في RTL) */}
        <div className="flex items-center gap-1.5">
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
          <OfflineIndicator />
          {role === "ADMIN" && <NotificationsBell />}
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

      {/* قائمة الموبايل (قابلة للطي) */}
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
          {mainItems.map((item) => (
            <MobileLink
              key={item.href}
              item={item}
              pathname={pathname}
              lowStock={lowStock}
              returnsToday={returnsToday}
              onClick={() => setMobileOpen(false)}
            />
          ))}

          {/* قسم «المزيد» */}
          {moreItems.length > 0 && (
            <>
              <div className="border-t bg-[var(--surface-2)] px-5 py-2 text-xs font-bold text-muted">
                المزيد
              </div>
              {moreItems.map((item) => (
                <MobileLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  lowStock={lowStock}
                  returnsToday={returnsToday}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </>
          )}

          {session && (
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 border-t border-r-[3px] border-transparent px-5 py-4 text-base font-medium text-danger"
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

function MobileLink({
  item,
  pathname,
  lowStock,
  returnsToday,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  lowStock: number;
  returnsToday: number;
  onClick: () => void;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
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
      {item.href === "/returns" && returnsToday > 0 && (
        <span className="mr-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white nums">
          {returnsToday}
        </span>
      )}
    </Link>
  );
}
