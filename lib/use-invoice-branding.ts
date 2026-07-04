"use client";

import { useSettings } from "@/components/settings-provider";
import type { InvoiceBranding } from "@/components/invoice-document";

// يشتق بيانات علامة الفاتورة/الـ PDF من الإعدادات (بيانات الشركة + لون المستند).
// مستقل تماماً عن ألوان الواجهة.
export function useInvoiceBranding(): InvoiceBranding {
  const { settings } = useSettings();
  return {
    storeName: settings.company.storeName,
    address: settings.company.address,
    phone: settings.company.phone,
    logo: settings.company.logo,
    accent: settings.pdfAccent,
  };
}
