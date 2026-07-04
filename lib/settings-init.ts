// سكربت يُحقن في <head> ويعمل قبل رسم الصفحة (منع وميض الألوان/الوضع).
// يقرأ الإعدادات المخبّأة محلياً فيطبّق: الوضع الليلي/النهاري، لون التمييز،
// والخط — قبل تحميل React. القيم الافتراضية مضمّنة نصياً لتفادي أي استيراد.
//
// تحديد الوضع:
//   - إن اختار المستخدم وضعاً صراحةً (eb-theme) نحترمه.
//   - وإلا نستخدم الوضع الافتراضي من الإعدادات (dark/light/system)،
//     و«system» يتبع تفضيل نظام التشغيل.

export const settingsInitScript = `
(function () {
  try {
    var raw = localStorage.getItem('eb-settings');
    var s = raw ? JSON.parse(raw) : {};

    // لون التمييز والخط
    var root = document.documentElement;
    var accent = /^#[0-9a-fA-F]{6}$/.test(s.uiAccent) ? s.uiAccent : '#6c63ff';
    root.style.setProperty('--accent', accent);
    var r = parseInt(accent.slice(1, 3), 16);
    var g = parseInt(accent.slice(3, 5), 16);
    var b = parseInt(accent.slice(5, 7), 16);
    root.style.setProperty('--accent-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.12)');
    var fonts = {
      tajawal: 'var(--font-tajawal), "Tajawal", sans-serif',
      cairo: 'var(--font-cairo), "Cairo", sans-serif',
      'ibm-plex-arabic': 'var(--font-ibm-plex-arabic), "IBM Plex Sans Arabic", sans-serif'
    };
    root.style.setProperty('--app-font', fonts[s.font] || fonts.tajawal);

    // الوضع الليلي/النهاري
    var explicit = localStorage.getItem('eb-theme');
    var mode;
    if (explicit === 'dark' || explicit === 'light') {
      mode = explicit;
    } else {
      var def = s.themeMode || 'dark';
      if (def === 'system') {
        mode = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      } else {
        mode = def;
      }
    }
    if (mode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  } catch (e) {}
})();
`;
