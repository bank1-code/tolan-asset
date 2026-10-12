import { Router } from "express";
import path from "node:path";
import { sdk } from "./_core/sdk";

const files: Record<string, string> = {
  operating: "tolan-operating-guide.pdf",
  quick: "tolan-quick-guide.pdf",
};

const directory = path.resolve(
  import.meta.dirname,
  process.env.NODE_ENV === "production" ? "private/guides" : "resources/guides",
);

export const operatingGuidesRouter = Router();

operatingGuidesRouter.get("/api/operating-guides/:guideId", async (req, res) => {
  let role: string;
  try {
    role = (await sdk.authenticateRequest(req)).role;
  } catch {
    res.status(401).json({ error: "سجّل الدخول لتنزيل الدليل" });
    return;
  }
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "تنزيل الأدلة متاح للمالك ومدير النظام فقط" });
    return;
  }
  const filename = Object.hasOwn(files, req.params.guideId)
    ? files[req.params.guideId]
    : undefined;
  if (!filename) {
    res.status(404).json({ error: "الدليل غير موجود" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.vary("Cookie");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.download(path.join(directory, filename), filename, error => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: "تعذر تنزيل الدليل؛ راجع مسؤول النظام" });
    } else if (error) {
      res.destroy();
    }
  });
});
