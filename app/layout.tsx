import type { Metadata, Viewport } from "next";
import { Tajawal, Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsProvider } from "@/components/settings-provider";
import { NumeralNormalizer } from "@/components/numeral-normalizer";
import { settingsInitScript } from "@/lib/settings-init";
import "./globals.css";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-tajawal",
  display: "swap",
});

// خطوط بديلة يمكن اختيارها من الإعدادات (تُحمَّل ذاتياً وقت البناء)
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-cairo",
  display: "swap",
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Euro Brands — نظام إدارة المخزون والمبيعات",
  description:
    "نظام داخلي لإدارة المخزون والمبيعات لمتجر Euro Brands بفرعيه في المعادي.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Euro Brands",
    statusBarStyle: "black-translucent",
  },
};

// عرض ملائم للهواتف مع إبقاء إمكانية التكبير اليدوي متاحة
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1e26" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} ${cairo.variable} ${ibmPlexArabic.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: settingsInitScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <NumeralNormalizer />
          <SettingsProvider>{children}</SettingsProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-tajawal), sans-serif",
                direction: "rtl",
              },
              success: { iconTheme: { primary: "#3b9a6e", secondary: "#fff" } },
              error: { iconTheme: { primary: "#d9534f", secondary: "#fff" } },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
