"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/auth";

// تحية حسب وقت اليوم
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء الخير";
  return "مساء الخير";
}

export default function HomePage() {
  const [name, setName] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [hello, setHello] = useState("");

  useEffect(() => {
    setName(getSession()?.name ?? null);
    setHello(greeting());
    setToday(
      new Date().toLocaleDateString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    );
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center px-4 text-center">
      <Logo size={104} className="rounded-full" />

      <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
        {hello}
        {name ? `، ${name}` : ""}
      </h1>

      <p className="mt-2 text-base font-medium text-muted sm:text-lg">
        Euro Brands — نظام إدارة المخزون والمبيعات
      </p>

      {today && (
        <p className="mt-4 rounded-full border bg-surface px-4 py-1.5 text-sm text-muted nums">
          {today}
        </p>
      )}
    </div>
  );
}
