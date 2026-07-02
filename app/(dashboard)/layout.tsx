import { TopNav } from "@/components/top-nav";
import { PreviewBanner } from "@/components/preview-banner";
import { AuthGuard } from "@/components/auth-guard";
import { AdminRecoverySetupPrompt } from "@/components/admin-recovery-setup";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen">
        <TopNav />
        <PreviewBanner />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        <AdminRecoverySetupPrompt />
      </div>
    </AuthGuard>
  );
}
