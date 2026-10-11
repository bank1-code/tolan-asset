import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import {
  filterCountRows,
  CountListFilters,
  CountPagination,
} from "./InventoryListControls";
type Action =
  "START" | "TRANSFER" | "EXCLUSION" | "ADDITION" | "REVIEW" | "REOPEN";
const labels: Record<Action, string> = {
  START: "بدء المعالجة / متابعة",
  TRANSFER: "ربط نقل منفذ",
  EXCLUSION: "ربط استبعاد منفذ",
  ADDITION: "ربط إضافة معتمدة",
  REVIEW: "إغلاق بمراجعة موثقة",
  REOPEN: "إعادة فتح المعالجة",
};
const date = (value: any) =>
  value ? new Date(value).toLocaleString("ar-SA") : "—";
export default function InventoryDifferencePanel() {
  const utils = trpc.useUtils();
  const result = trpc.inventoryCount.getDifferences.useQuery();
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null),
    [type, setType] = useState<Action>("START"),
    [quantity, setQuantity] = useState(0),
    [operationId, setOperationId] = useState("");
  const [note, setNote] = useState(""),
    [documents, setDocuments] = useState<Array<{ name: string; url: string }>>(
      []
    ),
    [uploading, setUploading] = useState(false);
  const actions = trpc.inventoryCount.getDifferenceActions.useQuery(
    { differenceId: selected?.id || 0 },
    { enabled: !!selected }
  );
  const candidates = trpc.inventoryCount.getDifferenceCandidates.useQuery(
    { differenceId: selected?.id || 0 },
    { enabled: !!selected }
  );
  const pdf = trpc.upload.document.useMutation(),
    image = trpc.upload.image.useMutation();
  const saved = trpc.inventoryCount.recordDifferenceAction.useMutation({
    onSuccess: () => {
      void utils.inventoryCount.invalidate();
      setSelected(null);
      toast.success("حُفظت المتابعة مع بقاء نتيجة الجرد الأصلية");
    },
    onError: error => toast.error(error.message),
  });
  const rows = filterCountRows(result.data || [], filters);
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    currentPage = Math.min(page, pages);
  const open = (row: any) => {
    setSelected(row);
    setType(row.remainingQuantity === 0 ? "REOPEN" : "START");
    setQuantity(row.remainingQuantity === 0 ? row.processedQuantity : 0);
    setOperationId("");
    setNote("");
    setDocuments([]);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !(file.type === "application/pdf" || file.type.startsWith("image/"))
    ) {
      toast.error("اختر صورة أو PDF حتى 10 ميجابايت");
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
          ? await pdf.mutateAsync({ base64, category: "inventory" })
          : await image.mutateAsync({ base64, category: "inventory" });
      setDocuments(old => [...old, { name: file.name, url: result.url }]);
    } catch (error: any) {
      toast.error(error.message || "تعذر رفع المستند");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        فروق الجرود المعتمدة فقط، بما فيها اختلاف الأرقام التسلسلية. نفذ الحركة
        من الشاشة المناسبة ثم اربطها هنا؛ متابعة الفرق لا تنفذ الحركة مرة أخرى.
      </p>
      <div className="flex gap-2 flex-wrap">
        {[
          ["النقل", "/transfers"],
          ["الاستبعاد", "/exclusions"],
          ["الأصول", "/assets"],
          ["العهد", "/custody"],
        ].map(([label, url]) => (
          <Button
            key={url}
            variant="outline"
            onClick={() => window.location.assign(url)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["بانتظار المعالجة", "PENDING"],
          ["قيد المعالجة", "IN_PROGRESS"],
          ["تمت المعالجة", "RESOLVED"],
        ].map(([label, value]) => (
          <button
            key={value}
            className="border rounded p-3"
            onClick={() => {
              setFilters(old => ({ ...old, status: value }));
              setPage(1);
            }}
          >
            {label}
            <strong className="block text-xl">
              {result.data?.filter(row => row.processingStatus === value)
                .length || 0}
            </strong>
          </button>
        ))}
      </div>
      <CountListFilters
        rows={result.data || []}
        value={filters}
        onChange={value => {
          setFilters(value);
          setPage(1);
        }}
        differences
      />
      {result.isLoading && <p>جاري تحميل الفروق…</p>}
      {result.error && (
        <p className="text-destructive">{result.error.message}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-muted">
              <th>الجلسة / النطاق</th>
              <th>النوع والسجل</th>
              <th>المتوقع</th>
              <th>الفعلي</th>
              <th>الفرق</th>
              <th>السبب</th>
              <th>المعالجة</th>
              <th>الاعتماد</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice((currentPage - 1) * 20, currentPage * 20)
              .map((row: any) => (
                <tr key={row.id} className="border-b">
                  <td className="p-2">
                    #{row.sessionId}
                    <div>
                      {[
                        row.locationName,
                        row.branchName,
                        row.departmentName,
                        row.employeeName,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                    <div>{date(row.countedAt)}</div>
                  </td>
                  <td>
                    {row.entityType === "asset" ? "أصل" : "عهدة"}
                    <div>{row.code}</div>
                    {row.name}
                  </td>
                  <td>{row.expectedQuantity}</td>
                  <td>{row.actualQuantity}</td>
                  <td className="text-destructive">
                    {row.difference > 0 ? "+" : ""}
                    {row.difference}
                    {row.identityMismatch && <div>اختلاف هوية</div>}
                  </td>
                  <td>{row.reason}</td>
                  <td>
                    {row.processingStatus === "RESOLVED"
                      ? "تمت المعالجة"
                      : row.processingStatus === "IN_PROGRESS"
                        ? "قيد المعالجة"
                        : "بانتظار المعالجة"}
                    <div>متبقٍ: {row.remainingQuantity}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open(row)}
                    >
                      متابعة
                    </Button>
                  </td>
                  <td>
                    {row.approvedByName}
                    <div>{date(row.approvedAt)}</div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <CountPagination
        page={currentPage}
        total={rows.length}
        onChange={setPage}
      />
      {!result.isLoading && !rows.length && <p>لا توجد فروق تطابق الفلاتر.</p>}
      <Dialog
        open={!!selected}
        onOpenChange={open => {
          if (!open && !saved.isPending && !uploading) setSelected(null);
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-w-xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>متابعة فرق {selected?.code}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p>
                المعالج: {selected.processedQuantity} · المتبقي:{" "}
                {selected.remainingQuantity}
              </p>
              <p className="text-xs text-muted-foreground">
                إغلاق المراجعة يتطلب محضرًا يثبت عدم الحاجة لحركة. ليس بديلًا عن
                تصحيح سجل خاطئ. إعادة الفتح تحفظ السبب وتاريخ المعالجات السابقة.
              </p>
              {selected.identityMismatch && (
                <p className="text-sm">
                  التسلسليات المتوقعة:{" "}
                  {selected.itemSnapshot?.expectedSerialNumbers?.join("، ")}
                  <br />
                  المفحوصة:{" "}
                  {selected.itemSnapshot?.observedSerialNumbers?.join("، ")}
                </p>
              )}
              {actions.data?.map(action => (
                <div key={action.id} className="border rounded p-2 text-xs">
                  <strong>
                    {labels[action.actionType as Action] || action.actionType} ·
                    كمية {Math.abs(action.quantity)} · {action.performedByName}{" "}
                    · {date(action.createdAt)}
                  </strong>
                  <p>{action.note}</p>
                  <div>{action.operationKey}</div>
                  {(action.evidence as any)?.documents?.map((file: any) => (
                    <a
                      className="block underline"
                      key={file.url}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.name}
                    </a>
                  ))}
                </div>
              ))}
              {actions.error && (
                <p className="text-destructive">{actions.error.message}</p>
              )}
              <select
                aria-label="إجراء معالجة الفرق"
                className="border rounded p-2 w-full"
                value={type}
                disabled={saved.isPending || uploading}
                onChange={event => {
                  const next = event.target.value as Action;
                  setType(next);
                  setOperationId("");
                  setQuantity(
                    next === "START"
                      ? 0
                      : next === "REOPEN"
                        ? selected.processedQuantity
                        : selected.remainingQuantity
                  );
                }}
              >
                {Object.entries(labels)
                  .filter(([key]) =>
                    key === "REOPEN"
                      ? selected.processedQuantity > 0
                      : selected.remainingQuantity > 0 &&
                        (key !== "EXCLUSION" || selected.difference < 0) &&
                        (key !== "ADDITION" || selected.difference > 0) &&
                        (!(selected.difference === 0) ||
                          !["TRANSFER", "EXCLUSION", "ADDITION"].includes(key))
                  )
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
              {["TRANSFER", "EXCLUSION", "ADDITION"].includes(type) && (
                <select
                  aria-label="العملية المنفذة"
                  className="border rounded p-2 w-full"
                  value={operationId}
                  onChange={event => setOperationId(event.target.value)}
                >
                  <option value="">اختر العملية المنفذة</option>
                  {candidates.data
                    ?.filter(row => row.type === type)
                    .map(row => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                </select>
              )}
              {type !== "START" && (
                <label className="block">
                  كمية المتابعة
                  <Input
                    type="number"
                    min="1"
                    max={
                      type === "REOPEN"
                        ? selected.processedQuantity
                        : selected.remainingQuantity
                    }
                    step="1"
                    value={quantity}
                    onChange={event => setQuantity(Number(event.target.value))}
                  />
                </label>
              )}
              <textarea
                aria-label="شرح المعالجة"
                className="border rounded p-2 w-full"
                rows={3}
                value={note}
                maxLength={4000}
                onChange={event => setNote(event.target.value)}
                placeholder="شرح موثق (20 حرفًا على الأقل)"
              />
              <label className="block text-sm">
                مرفقات المراجعة
                <input
                  className="block mt-1"
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploading || saved.isPending}
                  onChange={event => {
                    void upload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {documents.map((file, index) => (
                <div key={file.url} className="flex gap-2">
                  <a href={file.url} target="_blank" rel="noreferrer">
                    {file.name}
                  </a>
                  <button
                    onClick={() =>
                      setDocuments(old => old.filter((_, i) => i !== index))
                    }
                  >
                    إزالة قبل الحفظ
                  </button>
                </div>
              ))}
              {uploading && <p>جاري رفع المستند…</p>}
              <Button
                disabled={
                  saved.isPending ||
                  uploading ||
                  note.trim().length < 20 ||
                  (type === "REVIEW" && !documents.length) ||
                  (["TRANSFER", "EXCLUSION", "ADDITION"].includes(type) &&
                    !operationId)
                }
                onClick={() =>
                  saved.mutate({
                    differenceId: selected.id,
                    actionType: type,
                    quantity: type === "START" ? 0 : quantity,
                    operationId: operationId ? Number(operationId) : undefined,
                    note,
                    documents,
                  })
                }
              >
                حفظ المتابعة
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
