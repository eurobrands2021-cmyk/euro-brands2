"use client";

import { useMemo, useState } from "react";
import { marked } from "marked";
import { Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";

// حقل وصف يدعم Markdown مع تبويبين:
//   «تحرير»  → إدخال نص Markdown خام.
//   «معاينة» → عرض النتيجة المنسّقة داخل صندوق مُنمّق.
// يدعم: **عريض**، *مائل*، العناوين، والقوائم النقطية والرقمية.
// يُحفَظ النص كـ Markdown خام في نفس حقل الوصف (بدون تغيير للمخطط).

// إعداد marked مرة واحدة: أسطر مفردة تُحوّل إلى فواصل، بلا معرّفات.
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(md: string): string {
  const trimmed = md.trim();
  if (!trimmed) return "";
  try {
    // parse متزامن افتراضياً (async=false) فيُرجع نصاً.
    return marked.parse(trimmed, { async: false }) as string;
  } catch {
    return "";
  }
}

export function MarkdownField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const html = useMemo(
    () => (tab === "preview" ? renderMarkdown(value) : ""),
    [tab, value]
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              tab === "edit"
                ? "bg-accent text-white"
                : "text-muted hover:text-text"
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            تحرير
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              tab === "preview"
                ? "bg-accent text-white"
                : "text-muted hover:text-text"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            معاينة
          </button>
        </div>
        <span className="text-[11px] text-muted">
          يدعم Markdown: **عريض** *مائل* # عنوان - قائمة
        </span>
      </div>

      {tab === "edit" ? (
        <textarea
          className="input min-h-[120px] resize-y font-mono text-sm leading-relaxed"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "وصف اختياري للمنتج… يدعم تنسيق Markdown"}
        />
      ) : html ? (
        <div
          className="markdown-preview min-h-[120px] rounded-lg border bg-[var(--surface-2)] p-3 text-sm text-text"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed bg-[var(--surface-2)] p-3 text-sm text-muted">
          لا يوجد وصف لعرضه.
        </div>
      )}
    </div>
  );
}
