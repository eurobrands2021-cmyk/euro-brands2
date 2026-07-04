// قراءة/كتابة الإعدادات على الخادم — تُخزَّن كـ JSON تحت مفتاح واحد في AppSetting.
// تُستخدم من مسار /api/settings ومن منطق قفل الفواتير (لقراءة مدة القفل).

import { prisma } from "./prisma";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type AppSettings,
} from "./settings";
import { MOCK_MODE, mockGetSettings, mockSaveSettings } from "./mock-store";

export const SETTINGS_KEY = "app.settings";

export async function readServerSettings(): Promise<AppSettings> {
  if (MOCK_MODE) return mergeSettings(mockGetSettings());
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return DEFAULT_SETTINGS;
    return mergeSettings(JSON.parse(row.value));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeServerSettings(
  patch: unknown
): Promise<AppSettings> {
  const current = await readServerSettings();
  const next = mergeSettings({ ...current, ...(patch as object) });
  if (MOCK_MODE) {
    mockSaveSettings(next as unknown as Record<string, unknown>);
    return next;
  }
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
  });
  return next;
}
