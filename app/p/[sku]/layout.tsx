import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

// تخطيط صفحة المنتج العامة — رأس بعلامة Euro Brands + تذييل.
// يلفّ صفحة المنتج وصفحة 404 معاً فتظهر العلامة في الحالتين.
export default function PublicProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo size={32} className="rounded-md" />
            <span className="text-sm font-extrabold tracking-tight">
              Euro Brands
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">{children}</main>

      <footer className="mx-auto max-w-2xl px-4 pb-10 text-center text-xs text-muted">
        © {new Date().getFullYear()} Euro Brands — كل الحقوق محفوظة
      </footer>
    </div>
  );
}
