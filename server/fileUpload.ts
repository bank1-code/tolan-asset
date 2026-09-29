/**
 * File Upload Route - رفع الملفات (PDF, DOCX, XLSX) إلى S3
 * يُستخدم من صفحة الأرشيف لحفظ المستندات
 */
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";

const router = Router();

// استخدام الذاكرة بدلاً من القرص
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB حد أقصى
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.ms-excel",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`نوع الملف غير مسموح: ${file.mimetype}`));
    }
  },
});

// MIME type → امتداد
function getExtension(mimetype: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mimetype] || "bin";
}

router.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    // التحقق من المصادقة باستخدام sdk
    try {
      const user = await sdk.authenticateRequest(req as any);
      if (!(["owner", "admin", "accountant"] as string[]).includes(user.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لرفع مستندات الأرشيف" });
      }
    } catch {
      return res.status(401).json({ error: "غير مصرح - يرجى تسجيل الدخول" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "لم يتم إرسال ملف" });
    }

    const ext = getExtension(req.file.mimetype);
    const randomSuffix = crypto.randomBytes(8).toString("hex");
    const timestamp = Date.now();
    const s3Key = `documents/archive/${timestamp}-${randomSuffix}.${ext}`;

    const { url } = await storagePut(s3Key, req.file.buffer, req.file.mimetype);

    return res.json({
      url,
      key: s3Key,
      fileName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (err: any) {
    console.error("خطأ في رفع الملف:", err);
    return res.status(500).json({ error: err.message || "فشل رفع الملف" });
  }
});

export { router as fileUploadRouter };
