import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * إعدادات الكوكي الآمنة والمستقرة
 * 
 * Host-only cookies (بدون domain):
 * - الكوكي يُحفظ فقط للـ hostname الدقيق
 * - يعمل مع localhost والـ proxied domains بدون مشاكل
 * 
 * معايير الأمان:
 * - httpOnly: منع الوصول عبر JavaScript
 * - secure: إرسال الكوكي فقط عبر HTTPS
 * - sameSite: 'lax' توازن بين الأمان والاستخدامية
 */
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,        // منع الوصول عبر JavaScript
    path: "/",             // متاح لجميع المسارات
    sameSite: "lax",       // توازن بين الأمان والاستخدامية
    secure: isSecureRequest(req), // HTTPS فقط
    // ❌ بدون domain = Host-only cookies
    // هذا يحل مشاكل التوافق مع الـ proxied domains
  };
}
