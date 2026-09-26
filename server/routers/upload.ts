/**
 * Upload Router - رفع الصور مع تحويل تلقائي إلى WebP
 */
import { z } from "zod";
import { operatorProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import sharp from "sharp";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

// الحد الأقصى لحجم الصورة: 10MB (base64)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * تحويل صورة من base64 إلى WebP باستخدام sharp
 */
async function convertToWebP(base64Data: string): Promise<Buffer> {
  // إزالة data URI prefix إن وجد
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(cleanBase64, "base64");

  // تحويل إلى WebP بجودة 85%
  const webpBuffer = await sharp(imageBuffer)
    .webp({ quality: 85 })
    .toBuffer();

  return webpBuffer;
}

/**
 * توليد اسم ملف فريد
 */
function generateFileName(prefix: string): string {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  return `${prefix}-${timestamp}-${randomSuffix}.webp`;
}

export const uploadRouter = router({
  /**
   * رفع صورة واحدة - تحويل إلى WebP وحفظ في S3
   * يُرجع رابط الصورة المحفوظة
   */
  image: operatorProcedure
    .input(
      z.object({
        base64: z.string().min(1),
        category: z.enum(["asset", "custody", "invoice", "exclusion", "document", "branding"]),
        entityId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.category === "branding" && ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه الصلاحية متاحة لمسؤول النظام فقط" });
      }
      // التحقق من حجم الصورة
      const sizeInBytes = (input.base64.length * 3) / 4;
      if (sizeInBytes > MAX_IMAGE_SIZE) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)",
        });
      }

      try {
        // تحويل إلى WebP
        const webpBuffer = await convertToWebP(input.base64);

        // توليد مسار فريد في S3
        const fileName = generateFileName(input.category);
        const s3Key = `images/${input.category}/${fileName}`;

        // رفع إلى S3
        const { url } = await storagePut(s3Key, webpBuffer, "image/webp");

        return { url, key: s3Key };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        console.error("خطأ في رفع الصورة:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل في معالجة ورفع الصورة",
        });
      }
    }),

  /**
   * رفع عدة صور دفعة واحدة
   */
  multipleImages: operatorProcedure
    .input(
      z.object({
        images: z.array(
          z.object({
            base64: z.string().min(1),
            category: z.enum(["asset", "custody", "invoice", "exclusion", "document"]),
          })
        ).min(1).max(10),
      })
    )
    .mutation(async ({ input }) => {
      const results: { url: string; key: string }[] = [];

      for (const img of input.images) {
        const sizeInBytes = (img.base64.length * 3) / 4;
        if (sizeInBytes > MAX_IMAGE_SIZE) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "حجم إحدى الصور يتجاوز الحد المسموح (10 ميجابايت)",
          });
        }

        try {
          const webpBuffer = await convertToWebP(img.base64);
          const fileName = generateFileName(img.category);
          const s3Key = `images/${img.category}/${fileName}`;
          const { url } = await storagePut(s3Key, webpBuffer, "image/webp");
          results.push({ url, key: s3Key });
        } catch (error: any) {
          if (error instanceof TRPCError) throw error;
          console.error("خطأ في رفع صورة:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "فشل في معالجة ورفع إحدى الصور",
          });
        }
      }

      return { images: results };
    }),
});
