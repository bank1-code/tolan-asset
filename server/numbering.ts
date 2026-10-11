import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assets, custodyItems, locations } from "../drizzle/schema";

export type NumberingKind = "asset" | "custody";

export function normalizeNumberPrefix(value: string | null | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || null;
}

export function isValidNumberPrefix(value: string | null | undefined): boolean {
  const normalized = normalizeNumberPrefix(value);
  if (!normalized) return false;
  // أحرف/أرقام (عربية أو لاتينية) مع شرطات فاصلة فقط.
  return /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(normalized);
}

const NUMBERING_TIME_ZONE = "Asia/Riyadh";

export function getNumberingPeriod(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NUMBERING_TIME_ZONE,
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  if (!month || !year) throw new Error("تعذر تحديد شهر وسنة الترقيم");
  return `${month}${year}`;
}

export function formatSequence(prefix: string, period: string, sequence: number): string {
  // أول 99 رقماً تظهر بخانتين (01..99)، وبعدها يتمدد الرقم تلقائياً: 100، 101...
  return `${prefix}-${period}${String(sequence).padStart(2, "0")}`;
}

/**
 * يحجز رقماً جديداً داخل transaction مرتبطة بالموقع.
 * قفل صف الموقع يمنع تكرار الرقم عند الإضافة المتزامنة.
 */
export async function allocateEntityCode(tx: any, locationId: number, kind: NumberingKind) {
  const [location] = await tx.select().from(locations).where(eq(locations.id, locationId)).limit(1).for("update");
  if (!location) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "الموقع المحدد غير موجود" });
  }

  const prefix = normalizeNumberPrefix(kind === "asset" ? location.assetPrefix : location.custodyPrefix);
  if (!prefix) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: kind === "asset"
        ? `لم يتم تحديد بادئة ترقيم الأصول للموقع «${location.name}». حدّدها من الإعدادات أولاً.`
        : `لم يتم تحديد بادئة ترقيم العهد للموقع «${location.name}». حدّدها من الإعدادات أولاً.`,
    });
  }

  const period = getNumberingPeriod();
  const storedPeriod = kind === "asset" ? location.assetSequencePeriod : location.custodySequencePeriod;
  let sequence = storedPeriod === period
    ? Number(kind === "asset" ? location.assetSequence : location.custodySequence) + 1
    : 1;
  let code = formatSequence(prefix, period, sequence);

  // حماية إضافية من تعارض رقم قديم أُدخل يدوياً قبل تفعيل الترقيم الآلي.
  while (true) {
    const duplicate = kind === "asset"
      ? await tx.select({ id: assets.id }).from(assets).where(eq(assets.assetCode, code)).limit(1)
      : await tx.select({ id: custodyItems.id }).from(custodyItems).where(eq(custodyItems.code, code)).limit(1);
    if (!duplicate[0]) break;
    sequence += 1;
    code = formatSequence(prefix, period, sequence);
  }

  if (kind === "asset") {
    await tx.update(locations).set({
      assetSequence: sequence,
      assetSequencePeriod: period,
      assetPrefixLocked: true,
    }).where(eq(locations.id, locationId));
  } else {
    await tx.update(locations).set({
      custodySequence: sequence,
      custodySequencePeriod: period,
      custodyPrefixLocked: true,
    }).where(eq(locations.id, locationId));
  }

  return { code, sequence, period, prefix, location };
}
