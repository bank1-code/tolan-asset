import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isStoredImageUrl } from "@shared/imageUrls";

export default function ExclusionHistory({ id }: { id: number }) {
  const { data, isLoading, error } = trpc.operations.exclusions.getById.useQuery({ id });
  const uploadImage = trpc.upload.image.useMutation(), uploadDocument = trpc.upload.document.useMutation();
  const add = trpc.operations.exclusions.addAttachment.useMutation();
  const utils = trpc.useUtils(), fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const append = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("الحد الأقصى 10 ميجابايت"); return; }
    const pdf = file.type === "application/pdf";
    if (!pdf && !file.type.startsWith("image/")) { toast.error("اختر صورة أو مستند PDF"); return; }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = pdf ? await uploadDocument.mutateAsync({ base64 }) : await uploadImage.mutateAsync({ base64, category: "exclusion" });
      await add.mutateAsync({ exclusionId: id, fileName: file.name, url: result.url, contentType: pdf ? "application/pdf" : "image/webp" });
      await utils.operations.exclusions.getById.invalidate({ id });
      await utils.records.audit.getTimeline.invalidate(); await utils.records.archive.list.invalidate();
      toast.success("أضيف المرفق بسجل مستقل؛ المرفقات الأصلية محفوظة");
    } catch (error: any) { toast.error(error.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  if (isLoading) return <p className="text-xs">جاري تحميل سجل العملية…</p>;
  if (error) return <p className="text-xs text-destructive">{error.message}</p>;
  return <section className="border rounded-lg p-3 space-y-3">
    <h4 className="text-sm font-bold">المرفقات اللاحقة وسجل التدقيق</h4>
    <p className="text-xs text-muted-foreground">المرفقات الأصلية ثابتة. الإضافة اللاحقة تحفظ اسم المستخدم ووقت الإضافة، ولا تغيّر العملية المنفذة.</p>
    <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={event => append(event.target.files?.[0])} />
    <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "جاري حفظ المرفق…" : "إضافة صورة أو مستند لاحق"}</Button>
    {data?.attachments.map(file => <div key={file.id} className="bg-muted/30 p-2 rounded text-xs space-y-1">
      {isStoredImageUrl(file.url) && <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{file.fileName}</a>}
      <p>أضافه {file.createdByName || `المستخدم #${file.createdBy}`} بتاريخ {new Date(file.createdAt).toLocaleString("ar-SA")}</p>
    </div>)}
    <div className="text-xs space-y-2">{data?.audit.map(entry => <div key={entry.id}><p>{entry.actionDescription}</p><p className="text-muted-foreground">{entry.performedByName || `المستخدم #${entry.performedBy}`} · {new Date(entry.createdAt).toLocaleString("ar-SA")}</p></div>)}</div>
    {!!data?.record.entitySnapshot && <p className="text-xs text-muted-foreground">القيمة وهوية السجل محفوظتان وقت التنفيذ، مع تفاصيلها في سجل دورة الحياة والأرشيف.</p>}
  </section>;
}
