import { Router } from "express";
import { sdk } from "./_core/sdk";
import { storageGet } from "./storage";
import { canonicalFileKey } from "./fileAccess";
import { mayDownloadRecordFile } from "./fileRecordAccess";

const router = Router();

router.get("/api/files/*", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req as any);
    const key = canonicalFileKey(req.path);
    if(!await mayDownloadRecordFile(user,key))return res.status(404).json({error:"الملف غير موجود أو غير مصرح بالوصول إليه"});
    const { url } = await storageGet(key);
    res.redirect(302, url);
  } catch (error) {
    console.error("File download failed:", error);
    res.status(404).json({ error: "الملف غير موجود أو غير مصرح بالوصول إليه" });
  }
});

export { router as fileDownloadRouter };
