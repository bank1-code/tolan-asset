import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function FinancialClassifications() {
  const [code, setCode] = useState(""),
    [name, setName] = useState("");
  const classes = trpc.depreciation.classifications.useQuery(),
    utils = trpc.useUtils();
  const create = trpc.depreciation.createClassification.useMutation({
    onSuccess: () => {
      setCode("");
      setName("");
      utils.depreciation.invalidate();
      toast.success("تم إنشاء التصنيف المالي");
    },
    onError: e => toast.error(e.message),
  });
  return (
    <section className="space-y-4" dir="rtl">
      <div className="rounded-xl border p-5 bg-white space-y-2">
        <h2 className="font-bold">التصنيفات المالية</h2>
        <p className="text-sm text-muted-foreground">
          تصنيف مالي مستقل عن القسم التنظيمي. تحدد سياسة الإهلاك المعالجة والعمر
          والقيمة المتبقية لكل تصنيف، دون فرض نسب افتراضية.
        </p>
        <form
          className="grid md:grid-cols-[1fr_2fr_auto] gap-3 pt-3"
          onSubmit={e => {
            e.preventDefault();
            create.mutate({ code, name });
          }}
        >
          <label className="text-xs">
            رمز التصنيف
            <input
              required
              maxLength={40}
              value={code}
              onChange={e => setCode(e.target.value)}
              className="mt-1 w-full h-10 rounded-lg border px-3"
              placeholder="FURNITURE"
              dir="ltr"
            />
          </label>
          <label className="text-xs">
            اسم التصنيف
            <input
              required
              maxLength={255}
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full h-10 rounded-lg border px-3"
              placeholder="أثاث وتركيبات"
            />
          </label>
          <Button className="self-end" disabled={create.isPending}>
            إضافة تصنيف
          </Button>
        </form>
      </div>
      {classes.error && (
        <p className="text-destructive">{classes.error.message}</p>
      )}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">الرمز</th>
              <th>التصنيف</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {classes.data?.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-3" dir="ltr">
                  {c.code}
                </td>
                <td>{c.name}</td>
                <td>{c.active ? "نشط" : "غير نشط"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!classes.data?.length && (
          <p className="text-center p-6 text-muted-foreground">
            أضف التصنيفات الفعلية لمؤسستك لبدء التهيئة.
          </p>
        )}
      </div>
    </section>
  );
}
