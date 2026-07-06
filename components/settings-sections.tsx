"use client";

import { useEffect, useState } from "react";
import {
  Palette,
  Type,
  MoonStar,
  Lock,
  Building2,
  Camera,
  X,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { useSettings } from "@/components/settings-provider";
import { uploadImage } from "@/lib/client";
import {
  FONTS,
  FONT_LABELS,
  FONT_SIZES,
  FONT_SIZE_LABELS,
  THEME_MODES,
  THEME_MODE_LABELS,
  THEME_PRESETS,
  LOCK_DAYS_OPTIONS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type FontValue,
  type FontSizeValue,
  type ThemeMode,
  type LockDaysValue,
} from "@/lib/settings";
import { cn } from "@/lib/cn";

// ----------------------------------------------------
//  منتقي لون واحد (نظام مستقل)
// ----------------------------------------------------
function ColorField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  function commit(v: string) {
    const hex = v.startsWith("#") ? v : `#${v}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toLowerCase());
    else setText(value); // أعِد للقيمة الصالحة
  }

  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-bold text-text">{label}</p>
      <p className="mt-0.5 mb-3 text-xs text-muted">{description}</p>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="h-10 w-14 cursor-pointer rounded-md border bg-transparent p-0.5"
          aria-label={label}
        />
        <input
          className="input nums w-32 ltr:text-left"
          dir="ltr"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={(e) => e.key === "Enter" && commit(text)}
          maxLength={7}
        />
        <span
          className="h-8 flex-1 rounded-md border"
          style={{ backgroundColor: value }}
          aria-hidden
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------
//  المظهر: الألوان (3 أنظمة مستقلة) + الخط + الوضع
// ----------------------------------------------------
export function AppearanceSettingsCard() {
  const { settings, saveSettings } = useSettings();

  const set = (patch: Partial<AppSettings>) => {
    void saveSettings(patch);
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text">
        <Palette className="h-5 w-5 text-accent" />
        الألوان والمظهر
      </h2>
      <p className="mb-4 text-sm text-muted">
        اختر طقم ألوان جاهز أو خصّص كل نظام لون على حدة.
      </p>

      {/* أطقم ألوان جاهزة — كل طقم يضبط لون الواجهة والـ PDF معاً */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
          <Palette className="h-4 w-4 text-muted" />
          أطقم جاهزة
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEME_PRESETS.map((preset) => {
            const active =
              settings.uiAccent.toLowerCase() === preset.color &&
              settings.pdfAccent.toLowerCase() === preset.color;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  set({ uiAccent: preset.color, pdfAccent: preset.color })
                }
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2.5 text-right text-sm transition-colors",
                  active
                    ? "border-accent bg-accent-soft"
                    : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                )}
              >
                <span
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: preset.color }}
                >
                  {active && <Check className="h-4 w-4 text-white" />}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-medium",
                    active ? "text-accent" : "text-text"
                  )}
                >
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          يغيّر لون الواجهة ولون الفواتير/الـ PDF في آنٍ واحد. يمكنك التخصيص
          يدوياً بالأسفل.
        </p>
      </div>

      {/* 3 أنظمة ألوان مستقلة */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ColorField
          label="ألوان الواجهة"
          description="تؤثر على الأزرار والشريط العلوي"
          value={settings.uiAccent}
          onChange={(hex) => set({ uiAccent: hex })}
        />
        <ColorField
          label="ألوان الفواتير والـ PDF"
          description="لون المستندات المطبوعة فقط"
          value={settings.pdfAccent}
          onChange={(hex) => set({ pdfAccent: hex })}
        />
        <ColorField
          label="ألوان الموقع"
          description="لصفحة الهبوط المنفصلة (إن وُجدت)"
          value={settings.websiteAccent}
          onChange={(hex) => set({ websiteAccent: hex })}
        />
      </div>

      <button
        onClick={() =>
          set({
            uiAccent: DEFAULT_SETTINGS.uiAccent,
            pdfAccent: DEFAULT_SETTINGS.pdfAccent,
            websiteAccent: DEFAULT_SETTINGS.websiteAccent,
          })
        }
        className="btn btn-ghost mt-2 h-8 px-2 text-xs"
      >
        إعادة الألوان الافتراضية
      </button>

      {/* الخط */}
      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
          <Type className="h-4 w-4 text-muted" />
          الخط
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FONTS.map((f) => (
            <OptionButton
              key={f}
              active={settings.font === f}
              onClick={() => set({ font: f as FontValue })}
              label={FONT_LABELS[f]}
            />
          ))}
        </div>
      </div>

      {/* حجم الخط */}
      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
          <Type className="h-4 w-4 text-muted" />
          حجم الخط
        </p>
        <div className="grid grid-cols-3 gap-2">
          {FONT_SIZES.map((s) => (
            <OptionButton
              key={s}
              active={settings.fontSize === s}
              onClick={() => set({ fontSize: s as FontSizeValue })}
              label={FONT_SIZE_LABELS[s]}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          يؤثّر على حجم النصوص في كامل الواجهة ويُطبَّق فوراً.
        </p>
      </div>

      {/* الوضع الافتراضي */}
      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
          <MoonStar className="h-4 w-4 text-muted" />
          الوضع الافتراضي
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {THEME_MODES.map((m) => (
            <OptionButton
              key={m}
              active={settings.themeMode === m}
              onClick={() => set({ themeMode: m as ThemeMode })}
              label={THEME_MODE_LABELS[m]}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          «حسب النظام» يتبع إعداد جهازك. يمكنك دائماً التبديل يدوياً من زر الوضع
          في الأعلى.
        </p>
      </div>
    </Card>
  );
}

function OptionButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border p-3 text-right text-sm transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-[var(--border)] text-text hover:bg-[var(--surface-2)]"
      )}
    >
      <span className="font-medium">{label}</span>
      {active && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}

// ----------------------------------------------------
//  قفل الفواتير
// ----------------------------------------------------
export function InvoiceLockSettingsCard() {
  const { settings, saveSettings } = useSettings();

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text">
        <Lock className="h-5 w-5 text-accent" />
        قفل الفواتير
      </h2>
      <p className="mb-4 text-sm text-muted">
        الفواتير الأقدم من هذه المدة تصبح مقفلة (غير قابلة للتعديل) وتظهر بشارة
        «مقفلة». يمكن للمدير فتح قفل فاتورة بعينها بسبب يُسجَّل في سجل التدقيق.
      </p>
      <label className="label">مدة القفل (بالأيام)</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LOCK_DAYS_OPTIONS.map((d) => (
          <OptionButton
            key={d}
            active={settings.lockDays === d}
            onClick={() => void saveSettings({ lockDays: d as LockDaysValue })}
            label={`${d} يوم`}
          />
        ))}
      </div>
    </Card>
  );
}

// ----------------------------------------------------
//  بيانات الشركة (تظهر على الفواتير والـ PDF فقط)
// ----------------------------------------------------
export function CompanyInfoSettingsCard() {
  const { settings, saveSettings } = useSettings();
  const c = settings.company;

  const [storeName, setStoreName] = useState(c.storeName);
  const [address, setAddress] = useState(c.address);
  const [phone, setPhone] = useState(c.phone);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // زامن الحقول المحلية عند وصول الإعدادات من الخادم
  useEffect(() => {
    setStoreName(c.storeName);
    setAddress(c.address);
    setPhone(c.phone);
  }, [c.storeName, c.address, c.phone]);

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      await saveSettings({ company: { ...c, logo: url } });
      toast.success("تم تحديث الشعار");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر رفع الشعار");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await saveSettings({
        company: {
          ...c,
          storeName: storeName.trim() || DEFAULT_SETTINGS.company.storeName,
          address: address.trim(),
          phone: phone.trim(),
        },
      });
      toast.success("تم حفظ بيانات الشركة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text">
        <Building2 className="h-5 w-5 text-accent" />
        بيانات الشركة
      </h2>
      <p className="mb-4 text-sm text-muted">
        تظهر على الفواتير والمستندات المطبوعة (PDF) فقط.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">اسم المتجر</label>
          <input
            className="input"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Euro Brands"
          />
        </div>
        <div>
          <label className="label">العنوان</label>
          <input
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="المعادي، القاهرة"
          />
        </div>
        <div>
          <label className="label">رقم الهاتف</label>
          <input
            className="input nums"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01000000000"
          />
        </div>

        {/* الشعار */}
        <div>
          <label className="label">الشعار</label>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[var(--surface-2)]">
              {c.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.logo}
                  alt="الشعار"
                  className="h-full w-full object-contain"
                />
              ) : (
                <Building2 className="h-6 w-6 text-muted" />
              )}
            </div>
            <label className="btn btn-secondary cursor-pointer">
              <Camera className="h-4 w-4" />
              {uploading ? "جارٍ الرفع…" : "رفع شعار"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={handleLogo}
              />
            </label>
            {c.logo && (
              <button
                onClick={() => void saveSettings({ company: { ...c, logo: null } })}
                className="btn btn-ghost h-9 w-9 !px-0 text-danger"
                aria-label="حذف الشعار"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <button onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? "جارٍ الحفظ…" : "حفظ بيانات الشركة"}
        </button>
      </div>
    </Card>
  );
}
