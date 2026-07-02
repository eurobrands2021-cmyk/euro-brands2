// مساعدات استرجاع حساب المدير — دوال خالصة (بدون اعتماد على بيئة الخادم)
// تُستخدم على الخادم (مسارات الـ API) وفي وضع المعاينة داخل المتصفح.

export const ADMIN_RECOVERY_QUESTION_KEY = "admin.recovery.question";
export const ADMIN_RECOVERY_ANSWER_KEY = "admin.recovery.answerHash";

// أسئلة أمان مقترحة للمدير (يُمكن اختيار واحد أو كتابة سؤال مخصص)
export const ADMIN_SECURITY_QUESTIONS = [
  "ما هو اسم أول منتج أضفته للنظام؟",
  "ما هو اسم أول براند بعته؟",
  "ما هو اسم والدتك قبل الزواج؟",
  "في أي مدينة وُلدت؟",
  "ما هو اسم أول مدرسة التحقت بها؟",
];

// توحيد الإجابة قبل المقارنة/التخزين: إزالة الفراغات الزائدة وتوحيد حالة الأحرف
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}
