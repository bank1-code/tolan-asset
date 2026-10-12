import FieldHelp from "@/components/FieldHelp";
import { warrantyHelp } from "@/lib/fieldHelpText";
import RecordScopeFilters from "@/components/RecordScopeFilters";
import {
  emptyRecordFilters,
  matchesRecordFilters,
} from "@shared/recordFilters";
import { canApprove } from "@shared/roles";
import { useState, useRef } from "react";
import WorkflowConfirmationDialog from '@/components/WorkflowConfirmationDialog';
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { remainingQuantity } from "@shared/inventoryQuantity";
import { isStoredImageUrl } from "@shared/imageUrls";
import { openArchiveReport } from "@/lib/archiveReport";

type Document = { name: string; url: string };
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date()
  );
const blank = () => ({
  provider: "",
  claimReference: "",
  reason: "",
  quantity: 1,
  incidentDate: today(),
  effectiveDate: today(),
  originalWarrantyStart: "",
  originalWarrantyEnd: "",
  replacementWarrantyStart: "",
  replacementWarrantyEnd: "",
  warrantyPolicy: "continued" as "continued" | "renewed",
  replacementName: "",
  originalSerialNumbers: "",
  replacementSerialNumbers: "",
  notes: "",
});
const statuses: Record<string, string> = {
  DRAFT: "مسودة",
  SUBMITTED: "بانتظار الاعتماد",
  EXECUTED: "منفذ ومقفل",
  CANCELLED: "ملغى",
};
const parse = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
const serials = (value: string) =>
  value
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);

export default function Warranty() {
  const [kind, setKind] = useState<"asset" | "custody">("asset"),
    [entityId, setEntityId] = useState<number>(),
    [sourceFilters, setSourceFilters] = useState(emptyRecordFilters),
    [historyFilters, setHistoryFilters] = useState(emptyRecordFilters);
  const [step, setStep] = useState(0),
    [form, setForm] = useState(blank),
    [documents, setDocuments] = useState<Document[]>([]);
  const [confirmation,setConfirmation]=useState<{kind:'execute'|'cancel'|'review';id:number;version:number;name:string}>();
  const confirming=useRef(false);
  const [editing, setEditing] = useState<{ id: number; version: number }>(),
    [selected, setSelected] = useState<number>(),
    [uploading, setUploading] = useState(false);
  const { data: user } = trpc.auth.me.useQuery();
  const admin = canApprove(user?.role);
  const { data: assets = [] } = trpc.inventory.assets.list.useQuery(),
    { data: custody = [] } = trpc.inventory.custody.list.useQuery();
  const { data: requests = [], error: listError } =
    trpc.warranty.list.useQuery();
  const { data: details, error: detailError } = trpc.warranty.getById.useQuery(
    { id: selected! },
    { enabled: !!selected }
  );
  const save = trpc.warranty.saveDraft.useMutation(),
    submit = trpc.warranty.submit.useMutation(),
    execute = trpc.warranty.execute.useMutation();
  const cancel = trpc.warranty.cancel.useMutation(),
    review = trpc.warranty.returnForCorrection.useMutation();
  const image = trpc.upload.image.useMutation(),
    document = trpc.upload.document.useMutation(),
    utils = trpc.useUtils();
  const busy =
    uploading ||
    save.isPending ||
    submit.isPending ||
    execute.isPending ||
    cancel.isPending ||
    review.isPending;
  const { data: locations = [] } = trpc.settings.locations.list.useQuery(),
    { data: branches = [] } = trpc.settings.branches.list.useQuery(),
    { data: departments = [] } = trpc.settings.departments.list.useQuery(),
    { data: employees = [] } = trpc.settings.employees.list.useQuery();
  const records: any[] = [
    ...assets.map(row => ({ ...row, entityType: "asset" })),
    ...custody.map(row => ({ ...row, entityType: "custody" })),
  ];
  const availableRecords = records.filter(
    row =>
      row.status === "ACTIVE" &&
      remainingQuantity(row) > 0 &&
      matchesRecordFilters(row, sourceFilters, departments, branches)
  );
  const visibleRequests = requests.filter(request =>
    matchesRecordFilters(
      { ...parse(request.sourceSnapshot), entityType: request.entityType },
      historyFilters,
      departments,
      branches
    )
  );
  const scopeOptions = { locations, branches, departments, employees };
  const source = records.find(
    record => record.id === entityId && record.entityType === kind
  );
  const set = (key: keyof ReturnType<typeof blank>, value: string | number) =>
    setForm(old => ({ ...old, [key]: value }));
  const reset = () => {
    setEditing(undefined);
    setEntityId(undefined);
    setForm(blank());
    setDocuments([]);
    setStep(0);
  };
  const invalidate = async () => {
    await Promise.all([
      utils.warranty.invalidate(),
      utils.inventory.invalidate(),
      utils.records.invalidate(),
      utils.inventoryCount.invalidate(),
    ]);
  };
  const payload = () => ({
    ...form,
    entityType: kind,
    entityId: entityId!,
    quantity: Number(form.quantity),
    originalSerialNumbers: serials(form.originalSerialNumbers),
    replacementSerialNumbers: serials(form.replacementSerialNumbers),
    documents,
    replacementWarrantyStart:
      form.warrantyPolicy === "continued"
        ? form.originalWarrantyStart
        : form.replacementWarrantyStart,
    replacementWarrantyEnd:
      form.warrantyPolicy === "continued"
        ? form.originalWarrantyEnd
        : form.replacementWarrantyEnd,
  });
  const errorText = (error: any) => {
    try {
      const issues = JSON.parse(error.message);
      return Array.isArray(issues)
        ? issues.map(issue => issue.message).join(" · ")
        : error.message;
    } catch {
      return error.message;
    }
  };
  const saveRequest = async (send: boolean) => {
    if (!source) {
      toast.error("اختر السجل أولًا");
      return;
    }
    try {
      const saved = await save.mutateAsync({
        request: payload(),
        id: editing?.id,
        expectedVersion: editing?.version,
      });
      setEditing(saved);
      setSelected(saved.id);
      if (send) {
        await submit.mutateAsync({
          id: saved.id,
          expectedVersion: saved.version,
        });
        reset();
      }
      await invalidate();
      toast.success(
        send
          ? "قُدم الطلب للاعتماد؛ لم يتغير الأصل بعد"
          : "حُفظ الطلب كمسودة في النظام"
      );
    } catch (error) {
      await invalidate();
      toast.error(errorText(error));
    }
  };
  const action = async (callback: () => Promise<unknown>, message: string) => {
    try {
      await callback();
      await invalidate();
      toast.success(message);
    } catch (error) {
      await invalidate();
      toast.error(errorText(error));
    }
  };
  const edit = (request: any) => {
    const saved = parse(request.payload);
    setKind(saved.entityType);
    setEntityId(saved.entityId);
    setDocuments(saved.documents);
    setForm({
      ...saved,
      originalSerialNumbers: saved.originalSerialNumbers.join("\n"),
      replacementSerialNumbers: saved.replacementSerialNumbers.join("\n"),
    });
    setEditing({ id: request.id, version: request.version });
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !(file.type === "application/pdf" || file.type.startsWith("image/"))
    ) {
      toast.error("اختر صورة أو PDF بحجم لا يتجاوز 10 ميجابايت");
      return;
    }
    if (documents.length >= 20) {
      toast.error("الحد الأقصى 20 مستندًا");
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result =
        file.type === "application/pdf"
          ? await document.mutateAsync({ base64, category: "warranty" })
          : await image.mutateAsync({ base64, category: "warranty" });
      setDocuments(old => [...old, { name: file.name, url: result.url }]);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setUploading(false);
    }
  };
  const field = (
    key: keyof ReturnType<typeof blank>,
    label: string,
    type = "text"
  ) => (
    <label className="space-y-1 block text-sm" key={key}>
      <span>{label}</span>
      <FieldHelp text={warrantyHelp[key]}><Input
        type={type}
        value={form[key]}
        min={type === "number" ? 1 : undefined}
        step={type === "number" ? 1 : undefined}
        max={
          key === "quantity" && source ? remainingQuantity(source) : undefined
        }
        onChange={event =>
          set(
            key,
            type === "number" ? Number(event.target.value) : event.target.value
          )
        }
      /></FieldHelp>
    </label>
  );
  const text = (
    key:
      "reason" | "originalSerialNumbers" | "replacementSerialNumbers" | "notes",
    label: string
  ) => (
    <label className="block text-sm space-y-1">
      <span>{label}</span>
      <FieldHelp text={warrantyHelp[key]}><textarea
        className="border rounded-lg p-2 w-full min-h-24 bg-background"
        value={form[key]}
        onChange={event => set(key, event.target.value)}
      /></FieldHelp>
    </label>
  );
  const summary = (data: any, record: any) => (
    <dl className="grid sm:grid-cols-2 gap-3 text-sm">
      {Object.entries({
        "السجل السابق": `${record?.entityCode || source?.assetCode || source?.code || "—"} · ${record?.entityName || source?.assetName || source?.name || "—"}`,
        "الكمية المطلوب استبدالها": data.quantity,
        "جهة الضمان": data.provider,
        "مرجع المطالبة": data.claimReference,
        العطل: data.reason,
        "تاريخ العطل": data.incidentDate,
        "تاريخ استلام البديل": data.effectiveDate,
        "الضمان الأصلي": `${data.originalWarrantyStart} إلى ${data.originalWarrantyEnd}`,
        "اسم البديل": data.replacementName,
        "معرفات العناصر السابقة": data.originalSerialNumbers?.join("، "),
        "معرفات البدائل": data.replacementSerialNumbers?.join("، "),
        "ضمان البديل": `${data.warrantyPolicy === "continued" ? "استمرار" : "تجديد"}: ${data.replacementWarrantyStart} إلى ${data.replacementWarrantyEnd}`,
        ملاحظات: data.notes || "—",
      }).map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium whitespace-pre-wrap break-words">
            {String(value ?? "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
  const detailPayload = details ? parse(details.payload) : null,
    execution = details?.executionSnapshot
      ? parse(details.executionSnapshot)
      : null;
  return (
    <DashboardLayout
      title="استبدال الضمان"
      subtitle="مطالبة موثقة واعتماد الاستبدال مع الاحتفاظ بتاريخ السجل السابق"
    >
      <div dir="rtl" className="space-y-6">
        <section className="border rounded-xl p-4 space-y-4">
          <div className="flex justify-between gap-3">
            <h2 className="font-bold">
              {editing ? `استكمال مسودة #${editing.id}` : "طلب استبدال جديد"}
            </h2>
            <Button variant="outline" disabled={busy} onClick={reset}>
              طلب جديد
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "اختيار السجل",
              "المطالبة والضمان",
              "بيانات البديل",
              "المستندات",
              "المراجعة",
            ].map((label, index) => (
              <Button
                key={label}
                size="sm"
                variant={step === index ? "default" : "outline"}
                disabled={busy || (index > 0 && !source)}
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}
              </Button>
            ))}
          </div>
          {source && (
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
              <p className="font-bold">
                {source.assetCode || source.code} ·{" "}
                {source.assetName || source.name}
              </p>
              <p>
                {source.locationName} · {source.departmentName} ·{" "}
                {source.employeeName}
              </p>
              <p>
                الأصلية {source.quantity} · المستبعد{" "}
                {source.excludedQuantity || 0} · المستبدل بالضمان{" "}
                {source.warrantyReplacedQuantity || 0} · المتبقي{" "}
                {remainingQuantity(source)}
              </p>
              <p>
                القيمة المحفوظة للوحدة: {source.assetValue} — تُنقل للبديل كبيان
                مرجعي دون قيد محاسبي.
              </p>
            </div>
          )}
          {step === 0 && (
            <div className="space-y-3">
              <RecordScopeFilters
                value={sourceFilters}
                onChange={setSourceFilters}
                {...scopeOptions}
                disabled={busy || !!editing}
              />
              <p className="text-xs text-muted-foreground">
                {availableRecords.length} سجل يطابق الفلاتر
              </p>
              <div className="max-h-64 overflow-auto space-y-2">
                {availableRecords.map(row => (
                  <Button
                    key={row.entityType + ":" + row.id}
                    variant={
                      entityId === row.id && kind === row.entityType
                        ? "default"
                        : "outline"
                    }
                    className="w-full justify-start h-auto py-2 whitespace-normal"
                    disabled={busy || !!editing}
                    onClick={() => {
                      setKind(row.entityType);
                      setEntityId(row.id);
                      setForm(old => ({
                        ...blank(),
                        replacementName: row.assetName || row.name,
                        originalWarrantyStart: row.warrantyStartDate || "",
                        originalWarrantyEnd: row.warrantyEndDate || "",
                      }));
                      setDocuments([]);
                    }}
                  >
                    {row.entityType === "asset" ? "أصل" : "عهدة"} ·{" "}
                    {row.assetCode || row.code} · {row.assetName || row.name} ·
                    #{row.id} · {row.locationName} · المتبقي{" "}
                    {remainingQuantity(row)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {field("quantity", "كمية الاستبدال", "number")}
                {field("provider", "جهة الضمان")}
                {field("claimReference", "رقم المطالبة / مستند الاستبدال")}
                {field("incidentDate", "تاريخ العطل داخل الضمان", "date")}
                {field("originalWarrantyStart", "بداية الضمان الأصلي", "date")}
                {field("originalWarrantyEnd", "نهاية الضمان الأصلي", "date")}
              </div>
              {text("reason", "وصف العطل وسبب الاستبدال")}
              {text(
                "originalSerialNumbers",
                "معرفات الوحدات السابقة: رقم تسلسلي أو معرف مستندي لكل وحدة، كل معرف في سطر"
              )}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {field("replacementName", "اسم / طراز البديل")}
                {field(
                  "effectiveDate",
                  "تاريخ استلام البديل (سريان العملية)",
                  "date"
                )}
              </div>
              {text(
                "replacementSerialNumbers",
                "معرفات البدائل، كل وحدة في سطر"
              )}
              <label className="text-sm block">
                سياسة الضمان المثبتة بالمستند
                <FieldHelp text={warrantyHelp.warrantyPolicy}><select
                  className="border rounded p-2 mx-2 bg-background"
                  value={form.warrantyPolicy}
                  onChange={event => set("warrantyPolicy", event.target.value)}
                >
                  <option value="continued">استمرار الفترة الأصلية</option>
                  <option value="renewed">ضمان جديد حسب المستند</option>
                </select></FieldHelp>
              </label>
              {form.warrantyPolicy === "renewed" ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {field(
                    "replacementWarrantyStart",
                    "بداية ضمان البديل",
                    "date"
                  )}
                  {field("replacementWarrantyEnd", "نهاية ضمان البديل", "date")}
                </div>
              ) : (
                <p className="text-sm">
                  يبقى الضمان من {form.originalWarrantyStart || "—"} إلى{" "}
                  {form.originalWarrantyEnd || "—"}.
                </p>
              )}
              {text("notes", "ملاحظات")}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm">
                أرفق إثبات الضمان وموافقة الاستبدال أو محضر الاستلام. يلزم مستند
                واحد على الأقل.
              </p>
              <FieldHelp text={warrantyHelp.documents}><Input
                type="file"
                accept="image/*,application/pdf"
                disabled={busy}
                onChange={event => {
                  upload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              /></FieldHelp>
              {documents.map((doc, index) => (
                <div className="flex items-center gap-3 text-sm" key={index}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary"
                  >
                    {doc.name}
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setDocuments(old => old.filter((_, i) => i !== index))
                    }
                  >
                    إزالة من المسودة
                  </Button>
                </div>
              ))}
              {uploading && <p>جاري رفع المستند…</p>}
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              {summary(payload(), null)}
              <p className="text-sm">
                المتبقي في السجل السابق بعد التنفيذ:{" "}
                {source
                  ? remainingQuantity(source) - Number(form.quantity)
                  : "—"}
                . البديل يحمل التخصيص الحالي وقت مراجعة الطلب.
              </p>
              <p className="text-sm">
                المرفقات:{" "}
                {documents.map(doc => doc.name).join("، ") ||
                  "لم تُرفق مستندات"}
              </p>
              <p className="border border-amber-300 bg-amber-50 text-amber-900 rounded-lg p-3 text-sm">
                حفظ الطلب أو تقديمه لا يغيّر الأصل. بعد اعتماد وتنفيذ الاستبدال
                تصبح العملية تاريخية مقفلة، وينشأ البديل برقم جديد. لا يمكن حذف
                العملية أو تعديلها مباشرة.
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => saveRequest(false)}
                >
                  حفظ كمسودة
                </Button>
                <Button disabled={busy} onClick={() => saveRequest(true)}>
                  حفظ وتقديم للاعتماد
                </Button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={step === 0 || busy}
              onClick={() => setStep(step - 1)}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              disabled={step === 4 || !source || busy}
              onClick={() => setStep(step + 1)}
            >
              التالي
            </Button>
          </div>
        </section>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-bold">إدارة طلبات واستبدالات الضمان</h2>
          <RecordScopeFilters
            value={historyFilters}
            onChange={setHistoryFilters}
            {...scopeOptions}
          />
          <p className="text-xs text-muted-foreground">
            {visibleRequests.length} طلب يطابق الفلاتر
          </p>
          {listError && <p className="text-destructive">{listError.message}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm text-right">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right">الطلب / العملية</th>
                  <th className="p-2 text-right">السجل السابق</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">المستخدم</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map(request => (
                  <tr className="border-b" key={request.id}>
                    <td className="p-2">
                      {request.operationCode || `طلب #${request.id}`}
                    </td>
                    <td className="p-2">
                      {parse(request.sourceSnapshot)?.entityCode} ·{" "}
                      {parse(request.sourceSnapshot)?.entityName}
                    </td>
                    <td className="p-2">
                      {statuses[request.status] || request.status}
                    </td>
                    <td className="p-2">{request.createdByName}</td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(request.id)}
                      >
                        التفاصيل والمراجعة
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleRequests.length && !listError && (
            <p className="text-sm text-muted-foreground">
              لا توجد طلبات تطابق الفلاتر المختارة.
            </p>
          )}
        </section>
        {selected && (
          <section className="border rounded-xl p-4 space-y-4">
            <div className="flex justify-between">
              <h2 className="font-bold">تفاصيل الطلب #{selected}</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(undefined)}
              >
                إغلاق
              </Button>
            </div>
            {detailError && (
              <p className="text-destructive">{detailError.message}</p>
            )}
            {details && (
              <>
                {summary(detailPayload, parse(details.sourceSnapshot))}
                <p>الحالة: {statuses[details.status]}</p>
                <div className="bg-muted/40 p-3 rounded-lg text-sm">
                  <p>
                    التخصيص وقت التقديم:{" "}
                    {parse(details.sourceSnapshot).employeeName} ·{" "}
                    {parse(details.sourceSnapshot).departmentName} ·{" "}
                    {parse(details.sourceSnapshot).locationName}
                  </p>
                  <p>
                    الكمية الأصلية: {parse(details.sourceSnapshot).quantity} ·
                    المستبعد:{" "}
                    {parse(details.sourceSnapshot).excludedQuantity || 0} ·
                    المستبدل سابقًا:{" "}
                    {parse(details.sourceSnapshot).warrantyReplacedQuantity ||
                      0}{" "}
                    · المتبقي وقت التقديم:{" "}
                    {remainingQuantity(parse(details.sourceSnapshot))}
                  </p>
                  <p>
                    القيمة المرجعية للوحدة:{" "}
                    {parse(details.sourceSnapshot).assetValue}
                  </p>
                </div>
                {execution && (
                  <div className="bg-violet-50 text-violet-900 p-3 rounded-lg text-sm space-y-1">
                    <p>
                      العملية {details.operationCode} · السجل البديل #
                      {execution.replacementEntityId} · الرقم{" "}
                      {execution.replacementCode}
                    </p>
                    <p>
                      المتبقي السابق: {execution.quantityRemaining} · نفذها{" "}
                      {execution.executedByName} ·{" "}
                      {new Date(details.executedAt!).toLocaleString("ar-SA")}
                    </p>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  {detailPayload.documents.map(
                    (doc: Document, index: number) =>
                      isStoredImageUrl(doc.url) && (
                        <p key={index}>
                          <a
                            className="underline text-primary"
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {doc.name}
                          </a>
                        </p>
                      )
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      openArchiveReport({
                        id: details.id,
                        documentTitle: `استبدال ضمان ${details.operationCode || `طلب #${details.id}`}`,
                        operationType: statuses[details.status],
                        createdAt: details.createdAt,
                        snapshot: {
                          newData: {
                            ...detailPayload,
                            ...execution,
                            entityName: parse(details.sourceSnapshot)
                              ?.entityName,
                            entityCode: parse(details.sourceSnapshot)
                              ?.entityCode,
                          },
                          performedByName:
                            execution?.executedByName || details.createdByName,
                          recordedAt: details.executedAt || details.createdAt,
                        },
                      })
                    }
                  >
                    عرض وطباعة
                  </Button>
                  <a
                    className="text-sm text-primary underline p-2"
                    href={`/tracking?${new URLSearchParams({ type: details.entityType, id: String(details.entityId), name: parse(details.sourceSnapshot).entityName, code: parse(details.sourceSnapshot).entityCode })}`}
                  >
                    تاريخ السجل السابق
                  </a>
                  {execution && (
                    <a
                      className="text-sm text-primary underline p-2"
                      href={`/tracking?${new URLSearchParams({ type: details.entityType, id: String(execution.replacementEntityId), name: execution.replacementName, code: execution.replacementCode })}`}
                    >
                      تاريخ السجل البديل
                    </a>
                  )}
                  {details.status === "DRAFT" &&
                    (admin || details.createdBy === user?.id) && (
                      <Button disabled={busy} onClick={() => edit(details)}>
                        استكمال المسودة
                      </Button>
                    )}
                  {["DRAFT", "SUBMITTED"].includes(details.status) &&
                    (admin || details.createdBy === user?.id) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirmation({kind:'cancel',id:details.id,version:details.version,name:parse(details.sourceSnapshot).entityName})}
                      >
                        إلغاء الطلب
                      </Button>
                    )}
                  {admin && details.status === "SUBMITTED" && (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => setConfirmation({kind:'execute',id:details.id,version:details.version,name:parse(details.sourceSnapshot).entityName})}
                      >
                        اعتماد وتنفيذ الاستبدال
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirmation({kind:'review',id:details.id,version:details.version,name:parse(details.sourceSnapshot).entityName})}
                      >
                        إعادة للتصحيح
                      </Button>
                    </>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <h3 className="font-bold">سجل التدقيق</h3>
                  {details.audit.map(event => (
                    <div key={event.id} className="border-t pt-2">
                      <p>
                        {event.actionDescription} · {event.performedByName} ·{" "}
                        {new Date(event.createdAt).toLocaleString("ar-SA")}
                      </p>
                      {parse(event.newData)?.reviewNote && (
                        <p>
                          ملاحظات المراجعة: {parse(event.newData).reviewNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
        <WorkflowConfirmationDialog open={!!confirmation}
          title={confirmation?.kind==='execute'?'تأكيد استبدال الضمان':confirmation?.kind==='review'?'إعادة طلب الضمان للتصحيح':'إلغاء طلب الضمان'}
          description={confirmation?.kind==='execute'?'سيتم إنشاء البديل برقم رسمي جديد وقفل العملية تاريخيًا.':confirmation?.kind==='review'?'أدخل الملاحظات المطلوبة ليصحح المحاسب المسودة ويرسلها مجددًا.':'سيبقى الطلب محفوظًا في التاريخ بحالة ملغى.'}
          recordName={confirmation?`طلب #${confirmation.id} · ${confirmation.name}`:''}
          confirmLabel={confirmation?.kind==='execute'?'تأكيد التنفيذ':confirmation?.kind==='review'?'إعادة الطلب':'تأكيد إلغاء الطلب'}
          pending={busy} requireNote={confirmation?.kind==='review'}
          onCancel={()=>{if(!busy)setConfirmation(undefined);}}
          onConfirm={async note=>{
            if(!confirmation||busy||confirming.current)return;
            confirming.current=true;
            const {kind,id,version}=confirmation;
            try{await action(()=>kind==='execute'?execute.mutateAsync({id,expectedVersion:version}):kind==='cancel'?cancel.mutateAsync({id,expectedVersion:version}):review.mutateAsync({id,expectedVersion:version,note}),kind==='execute'?'نُفذ استبدال الضمان وأنشئ البديل':kind==='cancel'?'أُلغي الطلب':'أعيد الطلب للتصحيح');setConfirmation(undefined);}
            finally{confirming.current=false;}
          }}/>
      </div>
    </DashboardLayout>
  );
}
