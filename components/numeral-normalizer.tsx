"use client";

import { useEffect } from "react";
import { toWesternDigits } from "@/lib/normalize";

// يحوّل الأرقام العربية-الهندية (٠-٩) والفارسية (۰-۹) إلى غربية (0-9) لحظياً
// في كل حقول الإدخال عبر التطبيق (هاتف/كمية/سعر/بحث...). يعمل على مستوى
// المستند فيغطّي مكوّنات الإدخال الجاهزة والحقول الخام على حد سواء.
//
// نعترض حدث beforeinput فنمنع إدراج الأرقام العربية ونُدرج مقابلها الغربي
// عبر الـ setter الأصلي مع إطلاق حدث input كي تلتقطه مكوّنات React المتحكَّمة.
export function NumeralNormalizer() {
  useEffect(() => {
    function onBeforeInput(event: Event) {
      const e = event as InputEvent;
      const el = e.target as HTMLElement | null;
      if (
        !el ||
        (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")
      )
        return;

      const field = el as HTMLInputElement | HTMLTextAreaElement;
      if (field instanceof HTMLInputElement && field.type === "password") return;

      const data = e.data;
      if (typeof data !== "string" || !/[٠-٩۰-۹]/.test(data)) return;

      const converted = toWesternDigits(data);
      if (converted === data) return;

      e.preventDefault();

      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? field.value.length;
      const nextValue =
        field.value.slice(0, start) + converted + field.value.slice(end);

      // استخدم الـ setter الأصلي حتى تلاحظ React تغيّر القيمة
      const proto =
        field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(field, nextValue);
      else field.value = nextValue;

      const caret = start + converted.length;
      try {
        field.setSelectionRange(caret, caret);
      } catch {
        /* بعض أنواع الحقول (كـ number) لا تدعم تحديد المدى */
      }

      field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    document.addEventListener("beforeinput", onBeforeInput, true);
    return () =>
      document.removeEventListener("beforeinput", onBeforeInput, true);
  }, []);

  return null;
}
