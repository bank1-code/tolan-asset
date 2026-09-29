import { Router } from "express";
import { sdk } from "./_core/sdk";
import { storageGet } from "./storage";

const router = Router();

function getKeyFromRequestPath(path: string): string {
  const encodedKey = path.replace(/^\/api\/files\/?/, "");
  if (!encodedKey) throw new Error("Missing file key");
  return encodedKey
    .split("/")
    .map(segment => decodeURIComponent(segment))
    .join("/");
}

router.get("/api/files/*", async (req, res) => {
  try {
    await sdk.authenticateRequest(req as any);
    const key = getKeyFromRequestPath(req.path);
    const { url } = await storageGet(key);
    res.redirect(302, url);
  } catch (error) {
    console.error("File download failed:", error);
    res.status(404).json({ error: "الملف غير موجود أو غير مصرح بالوصول إليه" });
  }
});

export { router as fileDownloadRouter };
