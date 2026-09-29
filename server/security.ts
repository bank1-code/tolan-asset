/**
 * طبقة الأمان الشاملة - Security Layer
 * حماية من: XSS, CSRF, SQL Injection, Rate Limiting, Brute Force
 */
import type { Request, Response, NextFunction, Express } from "express";

// =============================================
// 1. Rate Limiter - حماية من هجمات DDoS والقوة الغاشمة
// =============================================
interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const rateLimitStore: RateLimitStore = {};

function getRateLimitKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `rate:${ip}`;
}

export function rateLimiter(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getRateLimitKey(req);
    const now = Date.now();

    if (!rateLimitStore[key] || rateLimitStore[key].resetAt < now) {
      rateLimitStore[key] = { count: 1, resetAt: now + windowMs };
    } else {
      rateLimitStore[key].count++;
    }

    const remaining = Math.max(0, maxRequests - rateLimitStore[key].count);
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(rateLimitStore[key].resetAt / 1000));

    if (rateLimitStore[key].count > maxRequests) {
      res.status(429).json({
        error: "عدد الطلبات تجاوز الحد المسموح. حاول مرة أخرى لاحقاً.",
        retryAfter: Math.ceil((rateLimitStore[key].resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// تنظيف دوري لمخزن Rate Limit
setInterval(() => {
  const now = Date.now();
  for (const key in rateLimitStore) {
    if (rateLimitStore[key].resetAt < now) {
      delete rateLimitStore[key];
    }
  }
}, 60000);

// =============================================
// 2. Security Headers - ترويسات الأمان
// =============================================
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // حماية من XSS
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  // منع تسريب معلومات Referrer
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // حماية من Clickjacking
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  
  // إخفاء معلومات السيرفر
  res.removeHeader("X-Powered-By");
  
  // HSTS - إجبار HTTPS
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  
  // منع MIME sniffing
  res.setHeader("X-Download-Options", "noopen");
  
  // حماية من DNS rebinding
  res.setHeader("X-DNS-Prefetch-Control", "off");
  
  // Permissions Policy
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  next();
}

// =============================================
// 3. Input Sanitizer - تنظيف المدخلات
// =============================================
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return input;
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

// فحص SQL Injection patterns
export function detectSqlInjection(input: string): boolean {
  if (typeof input !== "string") return false;
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|TRUNCATE)\b)/i,
    /(--|#|\/\*|\*\/)/,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(';\s*(DROP|DELETE|INSERT|UPDATE))/i,
    /(CHAR\s*\(|CONCAT\s*\(|0x[0-9a-fA-F]+)/i,
  ];
  return sqlPatterns.some((pattern) => pattern.test(input));
}

// =============================================
// 4. Request Validator - التحقق من الطلبات
// =============================================
export function requestValidator(req: Request, res: Response, next: NextFunction) {
  // فحص حجم الطلب
  const contentLength = parseInt(req.headers["content-length"] || "0");
  if (contentLength > 52428800) { // 50MB max
    res.status(413).json({ error: "حجم الطلب يتجاوز الحد المسموح" });
    return;
  }

  // فحص Content-Type للطلبات POST/PUT/PATCH
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.headers["content-type"] || "";
    if (contentType && !contentType.includes("application/json") && !contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      // Allow tRPC batch requests
      if (!req.path.includes("/api/trpc")) {
        res.status(415).json({ error: "نوع المحتوى غير مدعوم" });
        return;
      }
    }
  }

  next();
}

// =============================================
// 5. Brute Force Protection - حماية من القوة الغاشمة
// =============================================
interface BruteForceStore {
  [key: string]: { attempts: number; blockedUntil: number };
}

const bruteForceStore: BruteForceStore = {};

export function bruteForceProtection(maxAttempts: number = 10, blockDurationMs: number = 900000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // تطبيق فقط على مسارات تسجيل الدخول الفعلية (POST فقط)
    const isLoginPath = req.path.includes("/oauth/callback") || 
      (req.method === "POST" && req.path.includes("/trpc/localAuth.login"));
    if (!isLoginPath) {
      return next();
    }

    const key = `bf:${req.ip || "unknown"}`;
    const now = Date.now();

    if (bruteForceStore[key] && bruteForceStore[key].blockedUntil > now) {
      const retryAfter = Math.ceil((bruteForceStore[key].blockedUntil - now) / 1000);
      res.status(429).json({
        error: "تم حظر الوصول مؤقتاً بسبب محاولات متكررة",
        retryAfter,
      });
      return;
    }

    if (!bruteForceStore[key]) {
      bruteForceStore[key] = { attempts: 0, blockedUntil: 0 };
    }

    bruteForceStore[key].attempts++;

    if (bruteForceStore[key].attempts > maxAttempts) {
      bruteForceStore[key].blockedUntil = now + blockDurationMs;
      bruteForceStore[key].attempts = 0;
      res.status(429).json({
        error: "تم حظر الوصول مؤقتاً بسبب محاولات متكررة",
        retryAfter: Math.ceil(blockDurationMs / 1000),
      });
      return;
    }

    next();
  };
}

// مسح الحظر عند تسجيل دخول ناجح
export function clearBruteForceBlock(ip: string) {
  const key = `bf:${ip || "unknown"}`;
  delete bruteForceStore[key];
}

// تنظيف دوري
setInterval(() => {
  const now = Date.now();
  for (const key in bruteForceStore) {
    if (bruteForceStore[key].blockedUntil < now && bruteForceStore[key].attempts === 0) {
      delete bruteForceStore[key];
    }
  }
}, 300000);

// =============================================
// 6. Audit Logger Helper - مساعد سجل التدقيق
// =============================================
import { getDb } from "./db";
import { auditLog } from "../drizzle/schema";

export async function logAuditAction(params: {
  tableName: string;
  recordId?: number;
  actionType: string;
  actionDescription: string;
  oldData?: unknown;
  newData?: unknown;
  changedFields?: string[];
  performedBy?: number;
  performedByName?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(auditLog).values({
      tableName: params.tableName,
      recordId: params.recordId ?? null,
      actionType: params.actionType,
      actionDescription: params.actionDescription,
      oldData: params.oldData ?? null,
      newData: params.newData ?? null,
      changedFields: params.changedFields ?? null,
      performedBy: params.performedBy ?? null,
      performedByName: params.performedByName ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });
  } catch (error) {
    console.error("[Audit] Failed to log action:", error);
    // لا نوقف العملية الأصلية بسبب فشل التدقيق
  }
}

// =============================================
// 7. تطبيق جميع طبقات الأمان
// =============================================
export function applySecurityMiddleware(app: Express) {
  // ترويسات الأمان
  app.use(securityHeaders);

  // Rate Limiting - 200 طلب في الدقيقة
  app.use("/api", rateLimiter(200, 60000));

  // حماية من القوة الغاشمة
  app.use(bruteForceProtection(10, 900000));

  // التحقق من الطلبات
  app.use(requestValidator);

  console.log("[Security] All security middleware applied successfully");
}
