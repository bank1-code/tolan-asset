import FieldHelp from "@/components/FieldHelp";
import { depreciationHelp } from "@/lib/fieldHelpText";
import { useState, useEffect, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FinancialClassifications from "@/components/FinancialClassifications";
import { openFinancialPrint } from "@/lib/depreciationPrint";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { canApprove } from "@shared/roles";
import {
  annualRate,
  money,
  amount,
  financialExcelCell,
  previousDay,
  nextMonth,
  type PolicyPayload,
  type BatchPayload,
  type MovementPayload,
} from "@shared/depreciation";
import * as XLSX from "xlsx";

const decode = (p: any) => (typeof p === "string" ? JSON.parse(p) : p);
const labels: Record<string, string> = {
  DRAFT: "مسودة",
  SUBMITTED: "بانتظار الاعتماد",
  APPROVED: "معتمد",
  CLOSED: "مقفل",
  DISPOSAL: "استبعاد",
  WARRANTY: "استبدال ضمان",
  TRANSFER: "نقل تخصيص",
  ESTIMATE: "تغيير تقدير",
  DEPRECIATION: "إهلاك",
  REVERSAL: "عكس قيد",
  CORRECTION: "تصحيح بيانات مالي",
  NOT_CALCULATED: "لم يحتسب",
};
const dateNow = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = true,
  hint,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block text-xs font-medium space-y-1">
      <span>{label}</span>
      <FieldHelp text={depreciationHelp[label]}><input
        required={required}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-10 rounded-lg border px-3 bg-background"
      /></FieldHelp>
      {hint && (
        <span className="block text-muted-foreground font-normal">{hint}</span>
      )}
    </label>
  );
}
function Choice({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-medium space-y-1">
      <span>{label}</span>
      <FieldHelp text={depreciationHelp[label]}><select
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-10 rounded-lg border px-2 bg-background"
      >
        {children}
      </select></FieldHelp>
    </label>
  );
}

function RateField({
  months,
  onChange,
}: {
  months: number;
  onChange: (months: number) => void;
}) {
  const [value, setValue] = useState(months ? annualRate(months) : "");
  useEffect(() => setValue(months ? annualRate(months) : ""), [months]);
  return (
    <label className="text-xs space-y-1 block">
      النسبة السنوية %
      <FieldHelp text={depreciationHelp["النسبة السنوية %"]}><input
        className="w-full h-10 rounded-lg border px-3"
        value={value}
        onChange={e => {
          setValue(e.target.value);
          e.currentTarget.setCustomValidity("");
        }}
        onBlur={e => {
          const m = 1200 / Number(value);
          if (Number.isInteger(m) && m >= 1 && m <= 1200) {
            onChange(m);
            e.currentTarget.setCustomValidity("");
          } else {
            e.currentTarget.setCustomValidity(
              "هذه النسبة لا تعادل عدداً صحيحاً من الأشهر؛ حدد العمر بالأشهر مباشرة"
            );
            e.currentTarget.reportValidity();
          }
        }}
      /></FieldHelp>
      <span className="text-muted-foreground block">
        مثال: 15% = 80 شهراً؛ العمر المعتمد هو أساس الحساب
      </span>
    </label>
  );
}
function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5 space-y-4">
      <h2 className="font-bold text-base">{title}</h2>
      {children}
    </section>
  );
}
function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {children}
    </div>
  );
}
function Download(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)),
    url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
const blankAllocation = {
  costCenter: "",
  location: "",
  branch: "",
  department: "",
};
function AllocationForm({
  value,
  onChange,
}: {
  value: typeof blankAllocation;
  onChange: (v: typeof blankAllocation) => void;
}) {
  return (
    <Grid>
      {Object.entries({
        costCenter: "مركز التكلفة",
        location: "الموقع",
        branch: "الفرع",
        department: "القسم",
      }).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          required={["costCenter", "location"].includes(key)}
          value={value[key as keyof typeof value]}
          onChange={v => onChange({ ...value, [key]: v })}
        />
      ))}
    </Grid>
  );
}

export default function Depreciation() {
  const workspace = trpc.depreciation.workspace.useQuery(),
    utils = trpc.useUtils(),
    { user } = useAuth();
  const [tab, setTab] = useState("setup"),
    [selected, setSelected] = useState<any>(null);
  const refresh = () => utils.depreciation.invalidate();
  const ok = () => {
      refresh();
      toast.success("تم حفظ الإجراء");
    },
    error = (e: any) => toast.error(e.message);
  const submit = trpc.depreciation.submitDocument.useMutation({
      onSuccess: ok,
      onError: error,
    }),
    approve = trpc.depreciation.approveDocument.useMutation({
      onSuccess: ok,
      onError: error,
    }),
    returned = trpc.depreciation.returnDocument.useMutation({
      onSuccess: ok,
      onError: error,
    }),
    preview = trpc.depreciation.previewDocument.useMutation({
      onSuccess: () => toast.success("فحص الاكتمال والتعارض ناجح"),
      onError: error,
    });
  const [review, setReview] = useState<{
      kind: "policy" | "batch" | "movement";
      row: any;
    } | null>(null),
    [note, setNote] = useState("");
  const w = workspace.data;
  const action = (kind: "policy" | "batch" | "movement", row: any) => (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setSelected({ ...row, kind })}
      >
        التفاصيل
      </Button>
      {row.status === "DRAFT" && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={preview.isPending}
            onClick={() =>
              preview.mutate({ kind, id: row.id, expectedVersion: row.version })
            }
          >
            فحص
          </Button>
          <Button
            size="sm"
            disabled={submit.isPending}
            onClick={() =>
              submit.mutate({ kind, id: row.id, expectedVersion: row.version })
            }
          >
            إرسال للمراجعة
          </Button>
        </>
      )}
      {row.status === "SUBMITTED" && canApprove(user?.role) && (
        <>
          <Button
            size="sm"
            disabled={
              approve.isPending ||
              row.createdBy === user?.id ||
              row.updatedBy === user?.id
            }
            onClick={() =>
              approve.mutate({ kind, id: row.id, expectedVersion: row.version })
            }
          >
            اعتماد
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setReview({ kind, row });
              setNote("");
            }}
          >
            إعادة للمحاسب
          </Button>
        </>
      )}
    </div>
  );
  return (
    <DashboardLayout
      title="وحدة الإهلاك"
      subtitle="القسط الثابت · ملفات مالية · اعتماد وقيود وتقارير"
    >
      <div dir="rtl" className="space-y-5">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          المحاسب يعد المسودة، ومستخدم آخر مخول يعتمدها. القيود المعتمدة تحفظ
          تاريخياً؛ تصديرها لا يثبت ترحيلها في برنامجك المحاسبي.
        </div>
        {workspace.error && (
          <p className="text-destructive">{workspace.error.message}</p>
        )}
        {workspace.isLoading ? (
          <p>جارٍ تحميل الوحدة…</p>
        ) : (
          w && (
            <Tabs value={tab} onValueChange={setTab} dir="rtl">
              <TabsList className="h-auto flex flex-wrap justify-start gap-1 mb-5">
                {[
                  ["setup", "تهيئة النظام"],
                  ["batches", "الملفات المالية"],
                  ["movements", "مراجعة الحركات"],
                  ["periods", "احتساب الإهلاك"],
                  ["journals", "قيود الإهلاك"],
                  ["reports", "تقارير الإهلاك"],
                ].map(([v, label]) => (
                  <TabsTrigger key={v} value={v}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="setup" className="space-y-5">
                <FinancialClassifications />
                <PolicyForm w={w} onSaved={ok} />
                <DocumentList rows={w.policies} kind="policy" action={action} />
              </TabsContent>
              <TabsContent value="batches" className="space-y-5">
                <BatchForm w={w} onSaved={ok} />
                <DocumentList rows={w.batches} kind="batch" action={action} />
              </TabsContent>
              <TabsContent value="movements" className="space-y-5">
                <MovementForm w={w} onSaved={ok} />
                <DocumentList
                  rows={w.movements}
                  kind="movement"
                  action={action}
                />
              </TabsContent>
              <TabsContent value="periods">
                <Periods w={w} onSaved={ok} />
              </TabsContent>
              <TabsContent value="journals">
                <Journals w={w} onSaved={ok} />
              </TabsContent>
              <TabsContent value="reports">
                <FinancialReports />
              </TabsContent>
            </Tabs>
          )
        )}
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent
            dir="rtl"
            className="max-w-4xl max-h-[85vh] overflow-auto"
          >
            <DialogHeader>
              <DialogTitle>
                تفاصيل السجل المالي #{selected?.id} — {labels[selected?.status]}
              </DialogTitle>
            </DialogHeader>
            {selected && <DocumentDetails row={selected} classes={w?.classes ?? []} />}
          </DialogContent>
        </Dialog>
        <Dialog open={!!review} onOpenChange={() => setReview(null)}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إعادة المسودة للمحاسب</DialogTitle>
            </DialogHeader>
            <Field label="سبب الإعادة" value={note} onChange={setNote} />
            <Button
              disabled={!note.trim() || returned.isPending}
              onClick={async () => {
                if (review) {
                  await returned.mutateAsync({
                    kind: review.kind,
                    id: review.row.id,
                    expectedVersion: review.row.version,
                    note,
                  });
                  setReview(null);
                }
              }}
            >
              إعادة مع الملاحظة
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function PolicyForm({ w, onSaved }: { w: any; onSaved: () => void }) {
  const [id, setId] = useState<number | undefined>(),
    [version, setVersion] = useState<number | undefined>(),
    [effectiveDate, setEffectiveDate] = useState(""),
    [p, setP] = useState<PolicyPayload>({
      organizationName: "",
      currency: "SAR",
      fiscalStartMonth: 1,
      openingDate: "",
      capitalizationThreshold: "0",
      partialMonth: "ACTUAL_DAYS",
      rules: [],
    });
  const save = trpc.depreciation.savePolicy.useMutation({
    onSuccess: result => {
      setId(result.id);
      setVersion(id ? (version ?? 0) + 1 : 0);
      onSaved();
    },
    onError: e => toast.error(e.message),
  });
  const set = (key: keyof PolicyPayload, value: any) =>
    setP(prev => ({ ...prev, [key]: value }));
  const select = (value: string) => {
    const row = w.policies.find((r: any) => r.id === Number(value));
    if (row) {
      setP(decode(row.payload));
      setEffectiveDate(row.effectiveDate);
      setId(row.status === "DRAFT" ? row.id : undefined);
      setVersion(row.status === "DRAFT" ? row.version : undefined);
    } else {
      setId(undefined);
      setVersion(undefined);
    }
  };
  return (
    <Box title="تهيئة سياسة القسط الثابت">
      <Choice
        label="فتح مسودة أو نسخ تهيئة معتمدة إلى مسودة جديدة"
        value={id ?? ""}
        onChange={select}
      >
        <option value="">تهيئة جديدة</option>
        {w.policies.map((r: any) => (
          <option key={r.id} value={r.id}>
            #{r.id} — {r.effectiveDate} — {labels[r.status]}
          </option>
        ))}
      </Choice>
      <form
        className="space-y-5"
        onSubmit={e => {
          e.preventDefault();
          save.mutate({
            id,
            expectedVersion: version,
            effectiveDate,
            payload: p,
          });
        }}
      >
        <Grid>
          <Field
            label="اسم المؤسسة"
            value={p.organizationName}
            onChange={v => set("organizationName", v)}
          />
          <Field
            label="العملة (رمز من ثلاثة أحرف، منزلتان عشريتان)"
            value={p.currency}
            onChange={v => set("currency", v.toUpperCase())}
          />
          <Field
            label="شهر بداية السنة المالية"
            type="number"
            value={p.fiscalStartMonth}
            onChange={v => set("fiscalStartMonth", Number(v))}
          />
          <Field
            label="بداية الوحدة / تاريخ الأرصدة الافتتاحية"
            type="date"
            value={p.openingDate}
            onChange={v => set("openingDate", v)}
          />
          <Field
            label="تاريخ سريان التهيئة"
            type="date"
            value={effectiveDate}
            onChange={setEffectiveDate}
          />
          <Field
            label="حد الرسملة لكل وحدة"
            value={p.capitalizationThreshold}
            onChange={v => set("capitalizationThreshold", v)}
          />
          <Choice
            label="أجزاء الشهر"
            value={p.partialMonth}
            onChange={v => set("partialMonth", v)}
          >
            <option value="ACTUAL_DAYS">
              أيام الاستخدام الفعلية / أيام الشهر
            </option>
            <option value="NEXT_MONTH">
              بدء الإهلاك من أول الشهر التالي للجاهزية أثناء الشهر
            </option>
          </Choice>
        </Grid>
        <p className="text-xs text-muted-foreground">
          يوقف الإهلاك من تاريخ إنهاء الاعتراف المالي. تاريخ الجاهزية مستقل عن
          تاريخ إدخال السجل. العملات المدعومة حالياً بمنزلتين عشريتين.
        </p>
        <div className="space-y-4">
          {p.rules.map((r, index) => (
            <section
              key={index}
              className="rounded-xl border p-4 bg-muted/20 space-y-3"
            >
              <Grid>
                <Choice
                  label="التصنيف"
                  value={r.classificationId || ""}
                  onChange={v => {
                    const c = w.classes.find((c: any) => c.id === Number(v));
                    set(
                      "rules",
                      p.rules.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              classificationId: Number(v),
                              expenseName: `مصروف إهلاك ${c.name}`,
                              accumulatedName: `مجمع إهلاك ${c.name}`,
                              costName: c.name,
                            }
                          : item
                      )
                    );
                  }}
                >
                  <option value="">اختر التصنيف</option>
                  {w.classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Choice>
                <Choice
                  label="المعالجة"
                  value={r.treatment}
                  onChange={v =>
                    set(
                      "rules",
                      p.rules.map((item, i) =>
                        i === index ? { ...item, treatment: v } : item
                      )
                    )
                  }
                >
                  <option value="DEPRECIABLE">أصل قابل للإهلاك</option>
                  <option value="NON_DEPRECIABLE">أصل غير قابل للإهلاك</option>
                  <option value="EXPENSE">مصروف خارج سجل الأصول المالية</option>
                </Choice>
                {r.treatment === "DEPRECIABLE" && <><Field
                  label="العمر بالأشهر"
                  type="number"
                  value={r.lifeMonths}
                  onChange={v =>
                    set(
                      "rules",
                      p.rules.map((item, i) =>
                        i === index ? { ...item, lifeMonths: Number(v) } : item
                      )
                    )
                  }
                  hint={`النسبة السنوية المكافئة: ${r.lifeMonths ? annualRate(r.lifeMonths) : "—"}%`}
                />
                <RateField
                  months={r.lifeMonths}
                  onChange={months =>
                    set(
                      "rules",
                      p.rules.map((item, i) =>
                        i === index ? { ...item, lifeMonths: months } : item
                      )
                    )
                  }
                /></>}
                <Field
                  label="القيمة المتبقية الافتراضية %"
                  value={r.residualPercent}
                  onChange={v =>
                    set(
                      "rules",
                      p.rules.map((item, i) =>
                        i === index ? { ...item, residualPercent: v } : item
                      )
                    )
                  }
                />
                {(["expenseName", "accumulatedName", "costName"] as const).map(
                  key => (
                    <Field
                      key={key}
                      label={
                        {
                          expenseName: "اسم حساب مصروف الإهلاك",
                          accumulatedName: "اسم حساب مجمع الإهلاك",
                          costName: "اسم حساب تكلفة الأصل",
                        }[key]
                      }
                      value={r[key]}
                      onChange={v =>
                        set(
                          "rules",
                          p.rules.map((item, i) =>
                            i === index ? { ...item, [key]: v } : item
                          )
                        )
                      }
                    />
                  )
                )}
              </Grid>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set(
                    "rules",
                    p.rules.filter((_, i) => i !== index)
                  )
                }
              >
                إزالة من المسودة
              </Button>
            </section>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              set("rules", [
                ...p.rules,
                {
                  classificationId: 0,
                  treatment: "DEPRECIABLE",
                  lifeMonths: 60,
                  residualPercent: "0",
                  expenseName: "",
                  accumulatedName: "",
                  costName: "",
                },
              ])
            }
          >
            إضافة سياسة تصنيف
          </Button>
          <Button disabled={save.isPending}>
            {id ? "حفظ تعديل المسودة" : "حفظ تهيئة كمسودة"}
          </Button>
        </div>
      </form>
    </Box>
  );
}

function BatchForm({ w, onSaved }: { w: any; onSaved: () => void }) {
  const { user } = useAuth();
  const classify = trpc.depreciation.assignClassification.useMutation({
    onSuccess: onSaved,
    onError: e => toast.error(e.message),
  });
  const [id, setId] = useState<number | undefined>(),
    [version, setVersion] = useState<number | undefined>(),
    [record, setRecord] = useState(""),
    [classificationId, setClassificationId] = useState(0),
    [policyId, setPolicyId] = useState(0),
    [unitText, setUnitText] = useState("");
  const [p, setP] = useState<BatchPayload>({
    label: "",
    quantity: 1,
    unitCost: "",
    unitResidual: "0",
    openingAccumulated: "0",
    openingImpairment: "0",
    recognitionDate: "",
    availableForUseDate: "",
    balanceDate: "",
    lifeMonths: 60,
    documentReference: "",
    units: [],
    allocation: blankAllocation,
    notes: "",
  });
  const save = trpc.depreciation.saveBatch.useMutation({
      onSuccess: result => {
        setId(result.id);
        setVersion(id ? (version ?? 0) + 1 : 0);
        onSaved();
      },
      onError: e => toast.error(e.message),
    }),
    set = (key: keyof BatchPayload, value: any) =>
      setP(prev => ({ ...prev, [key]: value }));
  return (
    <Box title="تجهيز ملف مالي / دفعة وحدات متجانسة">
      <p className="text-sm text-muted-foreground">
        التكلفة والعمر وتاريخ الجاهزية متجانسة داخل الدفعة. افصل الدفعات عند
        اختلافها. العمر هنا هو العمر المتبقي من بداية الرصيد؛ راجع الأرصدة
        القديمة قبل اعتمادها.
      </p>
      <Choice
        label="فتح مسودة مالية"
        value={id ?? ""}
        onChange={v => {
          const r = w.batches.find((r: any) => r.id === Number(v));
          if (r) {
            const p = decode(r.payload);
            setId(r.id);
            setVersion(r.version);
            setRecord(`${r.entityType}:${r.entityId}`);
            setClassificationId(r.classificationId);
            setPolicyId(r.policyId);
            setP(p);
            setUnitText(p.units.join("\n"));
          } else {
            setId(undefined);
            setVersion(undefined);
          }
        }}
      >
        <option value="">دفعة جديدة</option>
        {w.batches
          .filter((r: any) => r.status === "DRAFT")
          .map((r: any) => (
            <option key={r.id} value={r.id}>
              #{r.id} — {decode(r.payload).label}
            </option>
          ))}
      </Choice>
      {canApprove(user?.role) && (
        <Button
          variant="outline"
          disabled={!record || !classificationId || classify.isPending}
          onClick={() => {
            const [k, id] = record.split(":"),
              source = w.records.find(
                (r: any) => r.entityType === k && r.id === Number(id)
              );
            if (source)
              classify.mutate({
                entityType: k as "asset" | "custody",
                entityId: Number(id),
                classificationId,
                expectedClassificationId: source.classificationId ?? null,
              });
          }}
        >
          تثبيت تصنيف السجل المختار فقط — يشمل المصروف وغير القابل للإهلاك
        </Button>
      )}
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          const [entityType, entityId] = record.split(":");
          save.mutate({
            id,
            expectedVersion: version,
            entityType: entityType as "asset" | "custody",
            entityId: Number(entityId),
            classificationId,
            policyId,
            payload: {
              ...p,
              units: unitText
                .split(/\n|,/)
                .map(s => s.trim())
                .filter(Boolean),
            },
          });
        }}
      >
        <Grid>
          <Choice
            label="الأصل / العهدة"
            value={record}
            onChange={v => {
              setRecord(v);
              const [k, id] = v.split(":"),
                s = w.records.find(
                  (s: any) => s.entityType === k && s.id === Number(id)
                );
              if (s) setClassificationId(s.classificationId ?? 0);
            }}
          >
            <option value="">اختر السجل</option>
            {w.records.map((r: any) => (
              <option
                key={`${r.entityType}:${r.id}`}
                value={`${r.entityType}:${r.id}`}
              >
                {r.entityType === "asset" ? "أصل" : "عهدة"} — {r.code} —{" "}
                {r.name}
              </option>
            ))}
          </Choice>
          <Choice
            label="التصنيف المالي"
            value={classificationId || ""}
            onChange={v => setClassificationId(Number(v))}
          >
            <option value="">اختر التصنيف</option>
            {w.classes.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Choice>
          <Choice
            label="التهيئة المعتمدة السارية"
            value={policyId || ""}
            onChange={v => {
              setPolicyId(Number(v));
              const policy = decode(
                  w.policies.find((r: any) => r.id === Number(v)).payload
                ),
                rule = policy.rules.find(
                  (r: any) => r.classificationId === classificationId
                );
              if (rule) set("lifeMonths", rule.lifeMonths);
            }}
          >
            <option value="">اختر التهيئة</option>
            {w.policies
              .filter((r: any) => r.status === "APPROVED")
              .map((r: any) => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {r.effectiveDate}
                </option>
              ))}
          </Choice>
          <Field
            label="اسم الدفعة"
            value={p.label}
            onChange={v => set("label", v)}
          />
          <Field
            label="عدد الوحدات"
            type="number"
            value={p.quantity}
            onChange={v => set("quantity", Number(v))}
          />
          <Field
            label="تكلفة الوحدة المعترف بها"
            value={p.unitCost}
            onChange={v => set("unitCost", v)}
          />
          <Field
            label="القيمة المتبقية لكل وحدة"
            value={p.unitResidual}
            onChange={v => set("unitResidual", v)}
          />
          <Field
            label="مجمع الإهلاك الافتتاحي للدفعة كاملة"
            value={p.openingAccumulated}
            onChange={v => set("openingAccumulated", v)}
          />
          <Field
            label="مجمع انخفاض قيمة مثبت سابقاً للدفعة"
            value={p.openingImpairment}
            onChange={v => set("openingImpairment", v)}
          />
          <Field
            label="تاريخ الاعتراف بالتكلفة"
            type="date"
            value={p.recognitionDate}
            onChange={v => set("recognitionDate", v)}
          />
          <Field
            label="تاريخ الجاهزية للاستخدام"
            type="date"
            value={p.availableForUseDate}
            onChange={v => set("availableForUseDate", v)}
          />
          <Field
            label="تاريخ بداية الرصيد المالي"
            type="date"
            value={p.balanceDate}
            onChange={v => set("balanceDate", v)}
          />
          <Field
            label="العمر المتبقي بالأشهر"
            type="number"
            value={p.lifeMonths}
            onChange={v => set("lifeMonths", Number(v))}
          />
          <Field
            label="مرجع الفاتورة / مستند الأرصدة"
            value={p.documentReference}
            onChange={v => set("documentReference", v)}
          />
        </Grid>
        <AllocationForm
          value={p.allocation}
          onChange={v => set("allocation", v)}
        />
        <label className="block text-xs space-y-1">
          معرفات الوحدات — كل وحدة في سطر
          <FieldHelp text={depreciationHelp["معرفات الوحدات"]}><textarea
            required
            rows={4}
            className="w-full border rounded-lg p-3"
            value={unitText}
            onChange={e => setUnitText(e.target.value)}
            placeholder="SERIAL-001&#10;SERIAL-002"
          /></FieldHelp>
        </label>
        <Field
          label="ملاحظات"
          required={false}
          value={p.notes}
          onChange={v => set("notes", v)}
        />
        <Button disabled={save.isPending}>حفظ الملف كمسودة</Button>
      </form>
    </Box>
  );
}

function MovementForm({ w, onSaved }: { w: any; onSaved: () => void }) {
  const [id, setId] = useState<number | undefined>(),
    [version, setVersion] = useState<number | undefined>(),
    [batchId, setBatchId] = useState(0),
    [kind, setKind] = useState<
      "DISPOSAL" | "WARRANTY" | "TRANSFER" | "ESTIMATE" | "CORRECTION"
    >("DISPOSAL"),
    [sourceKey, setSourceKey] = useState(""),
    [effectiveDate, setDate] = useState(""),
    [units, setUnits] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [proceeds, setProceeds] = useState("0"),
    [allocation, setAllocation] = useState(blankAllocation),
    [remainingLife, setLife] = useState(""),
    [residual, setResidual] = useState("0"),
    [correctCost, setCorrectCost] = useState(""),
    [correctAccum, setCorrectAccum] = useState(""),
    [correctImpairment, setCorrectImpairment] = useState("0"),
    [correctAccount, setCorrectAccount] = useState(""),
    [replacementUnits, setReplacementUnits] = useState(""),
    [replacementDate, setReplacementDate] = useState("");
  const batch = w.batches.find((r: any) => r.id === batchId),
    payload = batch ? decode(batch.payload) : null;
  const source = w.sources.find((s: any) => s.sourceKey === sourceKey);
  const save = trpc.depreciation.saveMovement.useMutation({
    onSuccess: result => {
      setId(result.id);
      setVersion(id ? (version ?? 0) + 1 : 0);
      onSaved();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <Box title="المراجعة المالية للحركات التشغيلية وتغيير التقدير">
      <p className="text-sm text-muted-foreground">
        اختر الوحدات الفعلية من دفعتها. استبدال الضمان يحافظ على التكلفة والمجمع
        وينقلها للبديل؛ تجدد الضمان وحده لا يجدد العمر المالي. لا توجد تسوية
        مالية تلقائية لفروقات الجرد.
      </p>
      <Choice
        label="فتح مسودة حركة"
        value={id ?? ""}
        onChange={v => {
          const r = w.movements.find((r: any) => r.id === Number(v));
          if (r) {
            const p = decode(r.payload);
            setId(r.id);
            setVersion(r.version);
            setBatchId(r.batchId);
            setKind(r.kind);
            setSourceKey(r.sourceKey ?? "");
            setDate(r.effectiveDate);
            setUnits(p.units);
            setReason(p.reason);
            setReference(p.documentReference);
            setProceeds(p.proceeds);
            setAllocation(
              p.allocation ?? p.replacement?.allocation ?? blankAllocation
            );
            setLife(String(p.remainingLifeMonths ?? p.replacement?.remainingLifeMonths ?? ""));
            setResidual(p.unitResidual ?? "0");
            setCorrectCost(p.unitCost ?? "");
            setCorrectAccum(p.unitAccumulated ?? "");
            setCorrectImpairment(p.unitImpairment ?? "0");
            setCorrectAccount(p.correctionAccount ?? "");
            setReplacementUnits(p.replacement?.units.join("\n") ?? "");
            setReplacementDate(p.replacement?.availableForUseDate ?? "");
          } else {
            setId(undefined);
            setVersion(undefined);
            setBatchId(0);
            setKind("DISPOSAL");
            setSourceKey("");
            setDate("");
            setUnits([]);
            setReason("");
            setReference("");
            setProceeds("0");
            setAllocation(blankAllocation);
            setLife("");
            setResidual("0");
            setCorrectCost("");
            setCorrectAccum("");
            setCorrectImpairment("0");
            setCorrectAccount("");
            setReplacementUnits("");
            setReplacementDate("");
          }
        }}
      >
        <option value="">حركة جديدة</option>
        {w.movements
          .filter((r: any) => r.status === "DRAFT")
          .map((r: any) => (
            <option key={r.id} value={r.id}>
              #{r.id} — {labels[r.kind]}
            </option>
          ))}
      </Choice>
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          const p: MovementPayload = {
            units,
            reason,
            documentReference: reference,
            proceeds: kind === "DISPOSAL" ? proceeds : "0",
            ...(kind === "TRANSFER" ? { allocation } : {}),
            ...(["ESTIMATE", "CORRECTION"].includes(kind)
              ? { remainingLifeMonths: Number(remainingLife), unitResidual: residual }
              : {}),
            ...(kind === "CORRECTION"
              ? {
                  unitCost: correctCost,
                  unitAccumulated: correctAccum,
                  unitImpairment: correctImpairment,
                  correctionAccount: correctAccount,
                }
              : {}),
            ...(kind === "WARRANTY"
              ? {
                  replacement: {
                    entityId: source?.replacementEntityId,
                    units: replacementUnits
                      .split(/\n|,/)
                      .map(s => s.trim())
                      .filter(Boolean),
                    availableForUseDate: replacementDate,
                    remainingLifeMonths: Number(remainingLife),
                    allocation,
                  },
                }
              : {}),
          };
          save.mutate({
            id,
            expectedVersion: version,
            batchId,
            kind,
            effectiveDate,
            sourceKey: ["ESTIMATE", "CORRECTION"].includes(kind)
              ? null
              : sourceKey,
            payload: p,
          });
        }}
      >
        <Grid>
          <Choice
            label="الدفعة المالية"
            value={batchId || ""}
            onChange={v => {
              setBatchId(Number(v));
              setUnits([]);
              setSourceKey("");
              setLife("");
              setReplacementUnits("");
              setReplacementDate("");
            }}
          >
            <option value="">اختر الدفعة</option>
            {w.batches
              .filter((r: any) => r.status === "APPROVED")
              .map((r: any) => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {decode(r.payload).label}
                </option>
              ))}
          </Choice>
          <Choice
            label="نوع الحركة"
            value={kind}
            onChange={v => {
              setKind(v as typeof kind);
              setSourceKey("");
              setLife("");
            }}
          >
            {["DISPOSAL", "WARRANTY", "TRANSFER", "ESTIMATE", "CORRECTION"].map(
              k => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              )
            )}
          </Choice>
          {!["ESTIMATE", "CORRECTION"].includes(kind) && (
            <Choice
              label="الحركة التشغيلية المرتبطة"
              value={sourceKey}
              onChange={v => {
                setSourceKey(v);
                const s = w.sources.find((s: any) => s.sourceKey === v);
                setDate(s.effectiveDate);
                setReason(s.description ?? "");
              }}
            >
              <option value="">اختر الحركة</option>
              {w.sources
                .filter(
                  (s: any) =>
                    s.kind === kind &&
                    s.entityType === batch?.entityType &&
                    s.entityId === batch?.entityId
                )
                .map((s: any) => (
                  <option key={s.sourceKey} value={s.sourceKey}>
                    {s.sourceKey} — {s.effectiveDate} — {s.quantity} وحدات
                  </option>
                ))}
            </Choice>
          )}
          <Field
            label="تاريخ السريان"
            type="date"
            value={effectiveDate}
            onChange={setDate}
          />
          <Field
            label="سبب المعالجة المالية"
            value={reason}
            onChange={setReason}
          />
          <Field
            label="مرجع المستند"
            value={reference}
            onChange={setReference}
          />
          {kind === "DISPOSAL" && (
            <Field
              label="حصيلة البيع لهذه الوحدات"
              value={proceeds}
              onChange={setProceeds}
            />
          )}{" "}
          {["ESTIMATE", "CORRECTION"].includes(kind) && (
            <Field
              label="القيمة المتبقية الجديدة للوحدة"
              value={residual}
              onChange={setResidual}
            />
          )}{" "}
          {["ESTIMATE", "WARRANTY", "CORRECTION"].includes(kind) && (
            <Field
              label="العمر المتبقي بعد المراجعة بالأشهر"
              type="number"
              value={remainingLife}
              onChange={setLife}
              hint="حدد العمر المتبقي بعد مراجعة الملف المالي؛ تجديد الضمان لا يبدأ عمرًا محاسبيًا جديدًا."
            />
          )}
          {kind === "CORRECTION" && (
            <>
              <Field
                label="التكلفة المصححة لكل وحدة"
                value={correctCost}
                onChange={setCorrectCost}
              />
              <Field
                label="المجمع المصحح لكل وحدة في تاريخ السريان"
                value={correctAccum}
                onChange={setCorrectAccum}
              />
              <Field
                label="انخفاض القيمة المصحح لكل وحدة"
                value={correctImpairment}
                onChange={setCorrectImpairment}
              />
              <Field
                label="اسم الحساب المقابل الذي يحدده المختص"
                value={correctAccount}
                onChange={setCorrectAccount}
              />
            </>
          )}
        </Grid>
        <fieldset className="rounded-lg border p-4">
          <legend className="text-sm px-2">
            الوحدات المتأثرة ({units.length})
          </legend>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {payload?.units.map((u: string) => (
              <label key={u} className="flex gap-2 text-sm">
                <FieldHelp text={depreciationHelp["الوحدات المتأثرة"]}><input
                  type="checkbox"
                  checked={units.includes(u)}
                  onChange={e =>
                    setUnits(
                      e.target.checked
                        ? [...units, u]
                        : units.filter(x => x !== u)
                    )
                  }
                /></FieldHelp>
                {u}
              </label>
            ))}
          </div>
        </fieldset>
        {["TRANSFER", "WARRANTY"].includes(kind) && (
          <AllocationForm value={allocation} onChange={setAllocation} />
        )}{" "}
        {kind === "WARRANTY" && (
          <Grid>
            <Field
              label="جاهزية البديل"
              type="date"
              value={replacementDate}
              onChange={setReplacementDate}
            />
            <label className="text-xs">
              معرفات وحدات البديل بنفس ترتيب الوحدات المختارة
              <FieldHelp text={depreciationHelp["معرفات البديل"]}><textarea
                required
                className="w-full border rounded-lg p-3 mt-1"
                rows={3}
                value={replacementUnits}
                onChange={e => setReplacementUnits(e.target.value)}
              /></FieldHelp>
            </label>
          </Grid>
        )}
        <Button disabled={save.isPending}>حفظ المعالجة كمسودة</Button>
      </form>
    </Box>
  );
}

function DocumentList({
  rows,
  kind,
  action,
}: {
  rows: any[];
  kind: string;
  action: (kind: any, row: any) => ReactNode;
}) {
  return (
    <Box title="المسودات والسجلات المعتمدة">
      <div className="overflow-auto">
        <table className="w-full min-w-[650px] text-sm text-right">
          <thead className="bg-muted">
            <tr>
              {[
                "السجل",
                "الوصف / السريان",
                "الحالة",
                "المراجعة",
                "الإجراءات",
              ].map(t => (
                <th key={t} className="p-3">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3">#{r.id}</td>
                <td className="p-3">
                  {kind === "batch"
                    ? decode(r.payload).label
                    : kind === "movement"
                      ? `${labels[r.kind]} — ${r.effectiveDate}`
                      : r.effectiveDate}
                </td>
                <td className="p-3">{labels[r.status]}</td>
                <td className="p-3 max-w-48">{r.reviewNote ?? "—"}</td>
                <td className="p-3">{action(kind, r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-6 text-center text-muted-foreground">
            لا توجد سجلات بعد.
          </p>
        )}
      </div>
    </Box>
  );
}
function DocumentDetails({ row, classes }: { row: any; classes: any[] }) {
  const p = decode(row.payload);
  return (
    <div className="space-y-4">
      <dl className="grid md:grid-cols-2 gap-3 text-sm">
        {Object.entries({
          "تاريخ السريان": row.effectiveDate,
          الدفعة: p.label,
          المؤسسة: p.organizationName,
          العملة: p.currency,
          "بداية الوحدة": p.openingDate,
          "شهر بداية السنة المالية": p.fiscalStartMonth,
          "حد الرسملة لكل وحدة": p.capitalizationThreshold,
          "أجزاء الشهر": p.partialMonth === "ACTUAL_DAYS" ? "أيام الاستخدام الفعلية / أيام الشهر" : p.partialMonth === "NEXT_MONTH" ? "بدء الإهلاك من الشهر التالي للجاهزية أثناء الشهر" : undefined,
          "عدد الوحدات": p.quantity,
          "تكلفة الوحدة": p.unitCost,
          "القيمة المتبقية للوحدة": p.unitResidual,
          "المجمع الافتتاحي": p.openingAccumulated,
          "انخفاض القيمة الافتتاحي": p.openingImpairment,
          الجاهزية: p.availableForUseDate,
          "تاريخ الاعتراف بالتكلفة": p.recognitionDate,
          "بداية الرصيد": p.balanceDate,
          "العمر بالأشهر": p.lifeMonths ?? p.remainingLifeMonths,
          "مرجع المستند": p.documentReference,
          السبب: p.reason,
          أعده: row.createdByName ?? row.createdBy,
          "آخر معدل": row.updatedByName ?? row.updatedBy,
          اعتمده: row.approvedByName ?? row.approvedBy,
          "ملاحظة المراجعة": row.reviewNote,
        })
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => (
            <div key={k} className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs mb-1">{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
      </dl>
      {p.units && <p>الوحدات: {p.units.join("، ")}</p>}
      {p.rules?.map((r: any) => (
        <div key={r.classificationId} className="border rounded-lg p-3 text-sm">
          <p className="font-medium">{classes.find(c => c.id === r.classificationId)?.name ?? `تصنيف #${r.classificationId}`}</p>
          <p>{r.treatment === "DEPRECIABLE" ? "قابل للإهلاك" : r.treatment === "NON_DEPRECIABLE" ? "غير قابل للإهلاك" : "مصروف خارج سجل الأصول المالية"}</p>
          {r.treatment === "DEPRECIABLE" && <>
            <p>العمر: {r.lifeMonths} شهر — النسبة السنوية: {annualRate(r.lifeMonths)}%</p>
            <p>القيمة المتبقية الافتراضية: {r.residualPercent}%</p>
            <p>{r.expenseName} / {r.accumulatedName}</p>
          </>}
          <p>حساب التكلفة: {r.costName}</p>
        </div>
      ))}
      {p.allocation && (
        <p>التخصيص: {Object.values(p.allocation).join(" / ")}</p>
      )}
      {p.replacement && (
        <p>
          البديل #{p.replacement.entityId}: {p.replacement.units.join("، ")} —
          الجاهزية {p.replacement.availableForUseDate} — العمر المتبقي{" "}
          {p.replacement.remainingLifeMonths} شهر
        </p>
      )}
    </div>
  );
}

function Periods({ w, onSaved }: { w: any; onSaved: () => void }) {
  const utils = trpc.useUtils();
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [month, setMonth] = useState(dateNow().slice(0, 7)),
    [shown, setShown] = useState<any>(null),
    [note, setNote] = useState(""),
    [review, setReview] = useState<{
      row: any;
      kind: "return" | "reverse";
    } | null>(null);
  const { user } = useAuth();
  const success = () => {
      onSaved();
      setReview(null);
    },
    error = (e: any) => toast.error(e.message);
  const preview = trpc.depreciation.previewPeriod.useMutation({
      onSuccess: r => setShown(r.snapshot),
      onError: error,
    }),
    save = trpc.depreciation.savePeriod.useMutation({
      onSuccess: success,
      onError: error,
    }),
    submit = trpc.depreciation.submitPeriod.useMutation({
      onSuccess: success,
      onError: error,
    }),
    approve = trpc.depreciation.approvePeriod.useMutation({
      onSuccess: success,
      onError: error,
    }),
    returned = trpc.depreciation.returnPeriod.useMutation({
      onSuccess: success,
      onError: error,
    }),
    reverse = trpc.depreciation.reversePeriod.useMutation({
      onSuccess: success,
      onError: error,
    }),
    close = trpc.depreciation.closePeriod.useMutation({
      onSuccess: success,
      onError: error,
    });
  const existing = w.periods.find((p: any) => p.month === month),
    busy =
      preview.isPending ||
      save.isPending ||
      submit.isPending ||
      approve.isPending ||
      close.isPending;
  return (
    <div className="space-y-5">
      <Box title="احتساب شهري ومعاينة قبل الاعتماد">
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="شهر الإهلاك"
            type="month"
            value={month}
            onChange={v => {
              setMonth(v);
              setShown(null);
            }}
          />
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => preview.mutate({ month })}
          >
            معاينة الحساب والجاهزية
          </Button>
          <Button
            disabled={busy || (existing && existing.status !== "DRAFT")}
            onClick={() =>
              save.mutate({ month, expectedVersion: existing?.version })
            }
          >
            احتساب وحفظ كمسودة
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          يمكن إعادة احتساب المسودة وحفظها. تغير أي مصدر مالي أو تشغيلي يستلزم
          إعادة الاحتساب قبل الاعتماد. اعتماد الأشهر يتم بالترتيب من بداية
          الوحدة.
        </p>
        {shown && <CalculationDetails snapshot={shown} />}
      </Box>
      <Box title="دورات الإهلاك">
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[750px]">
            <thead className="bg-muted">
              <tr>
                {[
                  "الشهر",
                  "الحالة",
                  "المصروف",
                  "النواقص",
                  "المراجعة",
                  "الإجراءات",
                ].map(t => (
                  <th key={t} className="p-3 text-right">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...w.periods]
                .sort((a, b) => b.month.localeCompare(a.month))
                .map(row => {
                  const p = decode(row.snapshot);
                  return (
                    <tr key={row.id} className="border-t">
                      <td className="p-3">{row.month}</td>
                      <td>{labels[row.status]}</td>
                      <td className="font-semibold">
                        {p.total} {p.currency}
                      </td>
                      <td>{p.exceptionCount ?? 0}</td>
                      <td>{row.reviewNote ?? "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={loadingDetails}
                            onClick={async () => {
                              setLoadingDetails(true);
                              try {
                                const detail = await utils.depreciation.periodDetails.fetch({ id: row.id });
                                setMonth(row.month);
                                setShown(decode(detail.snapshot));
                              } catch (e: any) { toast.error(e.message); }
                              finally { setLoadingDetails(false); }
                            }}
                          >
                            عرض التفاصيل
                          </Button>
                          {row.status === "DRAFT" && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                submit.mutate({
                                  id: row.id,
                                  expectedVersion: row.version,
                                })
                              }
                            >
                              إرسال للمراجعة
                            </Button>
                          )}
                          {row.status === "SUBMITTED" &&
                            canApprove(user?.role) && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={
                                    busy ||
                                    row.createdBy === user?.id ||
                                    row.updatedBy === user?.id
                                  }
                                  onClick={() =>
                                    approve.mutate({
                                      id: row.id,
                                      expectedVersion: row.version,
                                    })
                                  }
                                >
                                  اعتماد وإنشاء القيد
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReview({ row, kind: "return" });
                                    setNote("");
                                  }}
                                >
                                  إعادة
                                </Button>
                              </>
                            )}
                          {row.status === "APPROVED" &&
                            canApprove(user?.role) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    close.mutate({
                                      id: row.id,
                                      expectedVersion: row.version,
                                    })
                                  }
                                >
                                  إقفال الفترة
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReview({ row, kind: "reverse" });
                                    setNote("");
                                  }}
                                >
                                  عكس لإعادة الاحتساب
                                </Button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!w.periods.length && (
            <p className="p-5 text-center text-muted-foreground">
              لا توجد دورات محتسبة.
            </p>
          )}
        </div>
      </Box>
      <Dialog open={!!review} onOpenChange={() => setReview(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {review?.kind === "reverse"
                ? "عكس القيد وإعادة الفترة كمسودة"
                : "إعادة الدورة للمحاسب"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {review?.kind === "reverse"
              ? "سيبقى القيد الأصلي محفوظاً ويضاف قيد عكس مستقل. الفترات المقفلة لا يمكن عكسها هنا."
              : "أدخل الملاحظة المطلوبة قبل إعادة المسودة."}
          </p>
          <Field label="السبب" value={note} onChange={setNote} />
          <Button
            disabled={!note.trim() || returned.isPending || reverse.isPending}
            onClick={() => {
              if (review) {
                const input = {
                  id: review.row.id,
                  expectedVersion: review.row.version,
                };
                if (review.kind === "reverse")
                  reverse.mutate({ ...input, reason: note });
                else returned.mutate({ ...input, note });
              }
            }}
          >
            تنفيذ الإجراء
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function CalculationDetails({ snapshot }: { snapshot: any }) {
  return (
    <div className="space-y-3 border-t pt-4">
      <p className="font-bold">
        الفترة من {snapshot.from} إلى {snapshot.to} — إجمالي المصروف{" "}
        {snapshot.total} {snapshot.currency}
      </p>
      {snapshot.exceptions?.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 rounded-lg">
          <p className="font-bold mb-2">
            نواقص تمنع الاعتماد ({snapshot.exceptions.length})
          </p>
          <ul className="space-y-1 text-sm">
            {snapshot.exceptions.map((e: any, i: number) => (
              <li key={i}>
                {e.code} — {e.name}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted sticky top-0">
            <tr>
              {[
                "الرمز / الاسم",
                "التصنيف",
                "الوحدة",
                "مركز التكلفة",
                "الموقع / القسم",
                "من",
                "إلى",
                "مصروف الإهلاك",
              ].map(t => (
                <th key={t} className="p-3 text-right">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.lines.map((l: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="p-3">
                  {l.code}
                  <br />
                  {l.name}
                </td>
                <td>{l.classification}</td>
                <td>{l.unit}</td>
                <td>{l.allocation.costCenter}</td>
                <td>
                  {l.allocation.location} / {l.allocation.department}
                </td>
                <td>{l.from}</td>
                <td>{l.to}</td>
                <td className="font-semibold">{l.debit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Journals({ w, onSaved }: { w: any; onSaved: () => void }) {
  const [from, setFrom] = useState(`${dateNow().slice(0, 7)}-01`),
    [to, setTo] = useState(previousDay(nextMonth(dateNow()))),
    [detail, setDetail] = useState<any>(null);
  const exported = trpc.depreciation.exportJournals.useMutation({
    onSuccess: r => {
      Download(r.base64, r.filename);
      onSaved();
    },
    onError: e => toast.error(e.message),
  });
  const rows = w.journals.filter(
    (j: any) => j.effectiveDate >= from && j.effectiveDate <= to
  );
  return (
    <div className="space-y-5">
      <Box title="قيود الإهلاك — قيود معتمدة قابلة للتصدير">
        <div className="flex gap-3 flex-wrap items-end">
          <Field label="من" type="date" value={from} onChange={setFrom} />
          <Field label="إلى" type="date" value={to} onChange={setTo} />
          <Button
            disabled={exported.isPending || from > to}
            onClick={() => exported.mutate({ from, to })}
          >
            تصدير Excel للبرنامج المحاسبي
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          يحتوي التصدير على القيود وتفاصيل السجلات والوحدات. لا يسمح بالتصدير
          قبل اعتماد دورة الشهر المرتبطة، لضمان اكتمال أثر الحركات.
        </p>
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted">
              <tr>
                {[
                  "رقم القيد",
                  "التاريخ",
                  "الحركة",
                  "مدين",
                  "دائن",
                  "الإجراء",
                ].map(t => (
                  <th key={t} className="p-3 text-right">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((j: any) => {
                const p = decode(j.snapshot),
                  sum = (key: string) =>
                    amount(
                      p.lines.reduce(
                        (n: bigint, l: any) => n + money(l[key]),
                        0n
                      )
                    );
                return (
                  <tr key={j.id} className="border-t">
                    <td className="p-3" dir="ltr">
                      {j.code}
                    </td>
                    <td>{j.effectiveDate}</td>
                    <td>{labels[j.kind]}</td>
                    <td>{sum("debit")}</td>
                    <td>{sum("credit")}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetail(j)}
                      >
                        عرض القيد
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <p className="text-center p-5">لا توجد قيود ضمن الفترة المختارة.</p>
          )}
        </div>
      </Box>
      <Box title="سجل التصدير">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["دفعة التصدير", "الفترة", "المستخدم", "التاريخ"].map(t => (
                <th key={t} className="text-right p-3">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...w.exports].reverse().map((e: any) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">#{e.id}</td>
                <td>
                  {e.fromDate} — {e.toDate}
                </td>
                <td>{e.exportedByName ?? `#${e.exportedBy}`}</td>
                <td>{new Date(e.exportedAt).toLocaleString("ar-SA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent
          className="max-w-5xl max-h-[85vh] overflow-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>
              القيد {detail?.code} — {detail?.effectiveDate}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {[
                    "الحساب",
                    "التصنيف",
                    "مركز التكلفة",
                    "مدين",
                    "دائن",
                    "البيان",
                  ].map(t => (
                    <th key={t} className="p-3 text-right">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decode(detail.snapshot).lines.map((l: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="p-3">{l.account}</td>
                    <td>{l.classification}</td>
                    <td>{l.costCenter}</td>
                    <td>{l.debit}</td>
                    <td>{l.credit}</td>
                    <td>{l.narration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const reportColumns = [
  ["classification", "التصنيف"],
  ["openingCost", "التكلفة أول الفترة"],
  ["additions", "إضافات / نقل قيمة للبديل"],
  ["costAdjustments", "تصحيحات التكلفة"],
  ["removedCost", "تكلفة المستبعد / السابق"],
  ["closingCost", "التكلفة آخر الفترة"],
  ["openingAccum", "المجمع أول الفترة"],
  ["carriedAccum", "مجمع منقول للبديل"],
  ["charge", "إهلاك الفترة"],
  ["accumAdjustments", "تصحيحات المجمع"],
  ["removedAccum", "مجمع المستبعد / السابق"],
  ["closingAccum", "المجمع آخر الفترة"],
  ["closingImpairment", "انخفاض القيمة"],
  ["net", "صافي القيمة الدفترية"],
];
function FinancialReports() {
  const [from, setFrom] = useState(`${dateNow().slice(0, 4)}-01-01`),
    [to, setTo] = useState(dateNow()),
    [classificationId, setClass] = useState(""),
    [costCenter, setCenter] = useState(""),
    [location, setLocation] = useState(""),
    [branch, setBranch] = useState(""),
    [department, setDepartment] = useState(""),
    [entityType, setType] = useState(""),
    [search, setSearch] = useState(""),
    [view, setView] = useState("summary"),
    [compareFrom, setCompareFrom] = useState(""),
    [compareTo, setCompareTo] = useState("");
  const classes = trpc.depreciation.classifications.useQuery(),
    report = trpc.depreciation.report.useQuery(
      {
        from,
        to,
        classificationId: classificationId
          ? Number(classificationId)
          : undefined,
        costCenter: costCenter || undefined,
        location: location || undefined,
        branch: branch || undefined,
        department: department || undefined,
        entityType: (entityType as "asset" | "custody") || undefined,
        search: search || undefined,
      },
      { enabled: !!from && !!to && from <= to }
    ),
    p = report.data;
  const comparison = trpc.depreciation.report.useQuery(
    {
      from: compareFrom,
      to: compareTo,
      classificationId: classificationId ? Number(classificationId) : undefined,
      costCenter: costCenter || undefined,
      location: location || undefined,
      branch: branch || undefined,
      department: department || undefined,
      entityType: (entityType as "asset" | "custody") || undefined,
      search: search || undefined,
    },
    { enabled: !!compareFrom && !!compareTo && compareFrom <= compareTo }
  );
  const comparisonColumns = [
    ["classification", "التصنيف"],
    ["previousCharge", "مصروف الفترة المقارنة"],
    ["currentCharge", "مصروف الفترة الحالية"],
    ["chargeChange", "تغير المصروف"],
    ["previousNet", "صافي الفترة المقارنة"],
    ["currentNet", "صافي الفترة الحالية"],
    ["netChange", "تغير الصافي"],
  ];
  const comparisonRows =
    p && comparison.data
      ? Array.from(
          new Set(
            [...p.groups, ...comparison.data.groups].map(
              (r: any) => r.classification
            )
          )
        ).map(classification => {
          const current: any = p.groups.find(
              (r: any) => r.classification === classification
            ),
            prior: any = comparison.data!.groups.find(
              (r: any) => r.classification === classification
            );
          const currentCharge = current?.charge ?? "0.00",
            previousCharge = prior?.charge ?? "0.00",
            currentNet = current?.net ?? "0.00",
            previousNet = prior?.net ?? "0.00";
          return {
            classification,
            currentCharge,
            previousCharge,
            chargeChange: amount(
              (currentCharge.startsWith("-")
                ? -money(currentCharge.slice(1))
                : money(currentCharge)) -
                (previousCharge.startsWith("-")
                  ? -money(previousCharge.slice(1))
                  : money(previousCharge))
            ),
            currentNet,
            previousNet,
            netChange: amount(money(currentNet) - money(previousNet)),
          };
        })
      : [];
  const comparisonTitle = comparison.data
    ? `${p?.title} — مقارنة مع ${comparison.data.title}`
    : "";
  const exportReport = () => {
    if (!p) return;
    const wb = XLSX.utils.book_new();
    const textColumns=new Set(['classification','code','name','unit','costCenter','location','branch','department']);
    const cell=(key:string,value:any)=>!textColumns.has(key)&&typeof value==='string'?financialExcelCell(value):value;
    const formatMoney=(ws:XLSX.WorkSheet)=>{for(const key of Object.keys(ws))if(!key.startsWith('!')&&ws[key].t==='n')ws[key].z='#,##0.00';};
    const tables = [
      ["الإجمالي حسب التصنيف", p.groups, reportColumns],
      [
        "السجل المالي",
        p.rows,
        [
          ["code", "الرمز"],
          ["name", "الاسم"],
          ["unit", "الوحدة"],
          ...reportColumns,
        ],
      ],
      [
        "مصروف حسب التخصيص",
        p.expenses,
        [
          ["classification", "التصنيف"],
          ["costCenter", "مركز التكلفة"],
          ["location", "الموقع"],
          ["branch", "الفرع"],
          ["department", "القسم"],
          ["value", "مصروف الإهلاك"],
        ],
      ],
    ] as const;
    for (const [name, rows, columns] of tables) {
      const ws = XLSX.utils.aoa_to_sheet([
        [p.title],
        [p.basis],
        columns.map(c => c[1]),
        ...rows.map((r: any) => columns.map(c => cell(c[0],r[c[0]]))),
      ]);
      ws["!cols"] = columns.map(() => ({ wch: 24 }));
      formatMoney(ws);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    wb.Workbook = { Views: [{ RTL: true }] };
    if (comparison.data) {
      const ws = XLSX.utils.aoa_to_sheet([
        [comparisonTitle],
        [p.basis],
        comparisonColumns.map(c => c[1]),
        ...comparisonRows.map((r: any) => comparisonColumns.map(c => cell(c[0],r[c[0]]))),
      ]);
      ws["!cols"] = comparisonColumns.map(() => ({ wch: 26 }));
      formatMoney(ws);
      XLSX.utils.book_append_sheet(wb, ws, "مقارنة الفترات");
    }
    XLSX.writeFile(wb, `depreciation-report-${from}-${to}.xlsx`);
  };
  return (
    <div className="space-y-5 financial-report">
      <Box title="نطاق التقرير">
        <Grid>
          <Field label="من" type="date" value={from} onChange={setFrom} />
          <Field label="إلى" type="date" value={to} onChange={setTo} />
          <Field
            label="من — فترة المقارنة (اختياري)"
            required={false}
            type="date"
            value={compareFrom}
            onChange={setCompareFrom}
          />
          <Field
            label="إلى — فترة المقارنة (اختياري)"
            required={false}
            type="date"
            value={compareTo}
            onChange={setCompareTo}
          />
          <Choice label="نوع السجل" value={entityType} onChange={setType}>
            <option value="">الأصول والعهد</option>
            <option value="asset">الأصول</option>
            <option value="custody">العهد</option>
          </Choice>
          <Choice label="التصنيف" value={classificationId} onChange={setClass}>
            <option value="">الكل</option>
            {classes.data?.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Choice>
          <Field
            label="مركز التكلفة"
            required={false}
            value={costCenter}
            onChange={setCenter}
          />
          <Field
            label="الموقع"
            required={false}
            value={location}
            onChange={setLocation}
          />
          <Field
            label="الفرع"
            required={false}
            value={branch}
            onChange={setBranch}
          />
          <Field
            label="القسم"
            required={false}
            value={department}
            onChange={setDepartment}
          />
          <Field
            label="بحث بالرمز / الاسم / الوحدة"
            required={false}
            value={search}
            onChange={setSearch}
          />
          <Choice label="نوع التقرير" value={view} onChange={setView}>
            {[
              ["summary", "إجمالي حسب التصنيف"],
              ["register", "السجل المالي"],
              ["expense", "المصروف حسب التخصيص"],
              ["fully", "المستهلك بالكامل ويظل بالخدمة"],
              ["exceptions", "النواقص وحالة الفترات"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Choice>
        </Grid>
      </Box>
      {from && to && from > to && (
        <p role="alert" className="text-destructive">تاريخ بداية التقرير يجب ألا يتجاوز تاريخ نهايته.</p>
      )}
      {compareFrom && compareTo && compareFrom > compareTo && (
        <p role="alert" className="text-destructive">تاريخ بداية فترة المقارنة يجب ألا يتجاوز تاريخ نهايتها.</p>
      )}
      {report.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">جارٍ إعداد التقرير للفترة المحددة…</p>
      )}
      {report.error && (
        <p className="text-destructive">{report.error.message}</p>
      )}
      {p && (
        <Box title={p.title}>
          {comparison.error && (
            <p className="text-destructive">{comparison.error.message}</p>
          )}
          {comparison.data && (
            <Box title={comparisonTitle}>
              <p className="text-xs">
                الحركات المعتمدة فقط؛ طول الفترتين حسب اختيار المستخدم.
              </p>
              {comparison.data.pendingMonths.length > 0 && (
                <p className="text-amber-700">
                  أشهر المقارنة غير المعتمدة:{" "}
                  {comparison.data.pendingMonths.join("، ")}
                </p>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    !openFinancialPrint(
                      { ...p, title: comparisonTitle, groups: comparisonRows },
                      "comparison",
                      comparisonColumns
                    )
                  )
                    toast.error("اسمح بفتح نافذة الطباعة");
                }}
              >
                طباعة المقارنة
              </Button>
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead>
                    <tr>
                      {comparisonColumns.map(([k, l]) => (
                        <th key={k} className="p-3 text-right bg-muted">
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((r: any) => (
                      <tr key={r.classification} className="border-t">
                        {comparisonColumns.map(([k]) => (
                          <td key={k} className="p-3">
                            {r[k]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
          )}
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={exportReport}>
              تصدير التقرير Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!openFinancialPrint(p, view, reportColumns))
                  toast.error("اسمح بفتح نافذة الطباعة في المتصفح");
              }}
            >
              طباعة
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{p.basis}</p>
          {p.pendingMonths.length > 0 && (
            <p className="text-sm text-amber-700">
              فترات لم تعتمد بعد: {p.pendingMonths.join("، ")}. الأرقام تعرض
              الحركات المعتمدة فقط.
            </p>
          )}
          <div className="grid md:grid-cols-4 gap-3">
            {[
              ["closingCost", "تكلفة الأصول"],
              ["closingAccum", "مجمع الإهلاك"],
              ["charge", "مصروف الفترة"],
              ["net", "صافي القيمة"],
            ].map(([k, l]) => (
              <div key={k} className="border rounded-lg p-4 bg-muted/20">
                <p className="text-xs">{l}</p>
                <p className="font-bold mt-2">{p.total[k]}</p>
              </div>
            ))}
          </div>
          {p.unfiltered && (
            <p
              className={
                p.reconciled
                  ? "text-green-700 text-sm"
                  : "text-destructive text-sm"
              }
            >
              {p.reconciled
                ? "مصروف السجل مطابق لتفاصيل قيود الإهلاك."
                : "يوجد فرق بين السجل والقيود؛ راجع مصادر البيانات."}
            </p>
          )}
          <div className="overflow-auto">
            <table className="text-sm w-full min-w-[1000px]">
              <thead className="bg-muted">
                <tr>
                  {(view === "expense"
                    ? [
                        "التصنيف",
                        "مركز التكلفة",
                        "الموقع",
                        "الفرع",
                        "القسم",
                        "مصروف الإهلاك",
                      ]
                    : view === "exceptions"
                      ? ["الشهر", "الحالة", "إهلاك الدورة"]
                      : view === "summary"
                        ? reportColumns.map(c => c[1])
                        : [
                            "الرمز",
                            "الاسم",
                            "الوحدة",
                            ...reportColumns.map(c => c[1]),
                          ]
                  ).map(t => (
                    <th className="p-3 text-right whitespace-nowrap" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view === "expense"
                  ? p.expenses.map((r: any, i: number) => (
                      <tr key={i} className="border-t">
                        {[
                          "classification",
                          "costCenter",
                          "location",
                          "branch",
                          "department",
                          "value",
                        ].map(k => (
                          <td className="p-3" key={k}>
                            {r[k]}
                          </td>
                        ))}
                      </tr>
                    ))
                  : view === "exceptions"
                    ? p.periodStatus.map((r: any) => (
                        <tr key={r.month} className="border-t">
                          <td className="p-3">{r.month}</td>
                          <td>{labels[r.status]}</td>
                          <td>{r.total}</td>
                        </tr>
                      ))
                    : (view === "summary"
                        ? p.groups
                        : p.rows.filter(
                            (r: any) => view !== "fully" || r.fullyDepreciated
                          )
                      ).map((r: any, i: number) => (
                        <tr key={i} className="border-t">
                          {(view === "summary"
                            ? reportColumns
                            : [
                                ["code", ""],
                                ["name", ""],
                                ["unit", ""],
                                ...reportColumns,
                              ]
                          ).map(([k]) => (
                            <td key={k} className="p-3 whitespace-nowrap">
                              {r[k]}
                            </td>
                          ))}
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
          {view === "exceptions" &&
            p.exceptions.map((e: any, i: number) => (
              <p key={i} className="text-sm text-amber-700">
                {e.code}: {e.reason}
              </p>
            ))}
        </Box>
      )}
    </div>
  );
}
