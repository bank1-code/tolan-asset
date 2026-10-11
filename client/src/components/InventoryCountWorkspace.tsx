import { recoverCountEdits } from "@/lib/inventoryRecovery";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canApprove } from "@shared/roles";
import {
  itemsForSubmission,
  countItemKey,
  serialDifference,
  validateCountForSubmission,
  type CountItem,
  type CountScope,
} from "@shared/inventoryCount";
import { InventoryAutosave } from "@/lib/inventoryAutosave";
import { inventoryCountReport } from "@/lib/inventoryCountReport";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  CountListFilters,
  CountPagination,
  filterCountRows,
} from "./InventoryListControls";
import InventoryDifferencePanel from "./InventoryDifferencePanel";
import InventoryCountItems from "./InventoryCountItems";
import RecordScopeFilters from "./RecordScopeFilters";
import { toast } from "sonner";
import * as XLSX from "xlsx";
const date = (value: any) =>
  value ? new Date(value).toLocaleString("ar-SA") : "—";
const statuses: Record<string, string> = {
  DRAFT: "مسودة",
  SUBMITTED: "بانتظار الاعتماد",
  APPROVED: "معتمد",
  CANCELLED: "ملغى",
};
type Session = {
  id: number;
  version: number;
  status: string;
  performedBy: number | null;
  performedByName: string | null;
  sessionType: string;
  departmentName: string | null;
  items: CountItem[];
  scope?: any;
  reviewNote?: string | null;
  createdAt?: any;
  approvedAt?: any;
  approvedByName?: string | null;
};
type Payload = Array<{
  id: number;
  entityType: "asset" | "custody";
  actualQuantity: number | null;
  reason: string;
  observedSerialNumbers: string[] | null;
}>;
export default function InventoryCountWorkspace({
  browse,
}: {
  browse: ReactNode;
}) {
  const { user } = useAuth(),
    approver = canApprove(user?.role),
    utils = trpc.useUtils();
  const [tab, setTab] = useState("count"),
    [kind, setKind] = useState("both"),
    [location, setLocation] = useState(""),
    [branch, setBranch] = useState(""),
    [department, setDepartment] = useState(""),
    [employee, setEmployee] = useState(""),
    [scopeSearch, setScopeSearch] = useState("");
  const [requested, setRequested] = useState<CountScope | null>(null),
    [overlapReason, setOverlapReason] = useState("");
  const [session, setSession] = useState<Session | null>(null),
    sessionRef = useRef(session);
  sessionRef.current = session;
  const [recovery, setRecovery] = useState<any>(null);
  const [confirmation, setConfirmation] = useState<
      "submit" | "approve" | "return" | "cancel" | null
    >(null),
    [confirmationNote, setConfirmationNote] = useState("");
  const recoveryKey = (id: number) =>
    "inventory-count-edits:" + user?.id + ":" + id;
  const remember = (current: Session) => {
    try {
      localStorage.setItem(
        recoveryKey(current.id),
        JSON.stringify({ version: current.version, items: current.items })
      );
    } catch {
      /* The cloud save still works when browser storage is unavailable. */
    }
  };
  const [saveState, setSaveState] = useState("محفوظ"),
    [saveError, setSaveError] = useState(""),
    [dirty, setDirty] = useState(false);
  const engine = useRef<InventoryAutosave<Payload> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastReply = useRef<any>(null);
  const [focused, setFocused] = useState<string | null>(null),
    [code, setCode] = useState(""),
    [search, setSearch] = useState(""),
    [itemFilter, setItemFilter] = useState("all"),
    [itemPage, setItemPage] = useState(1);
  const [listFilters, setListFilters] = useState<Record<string, string>>({}),
    [listPage, setListPage] = useState(1),
    [scanning, setScanning] = useState(false),
    scan = useRef<AbortController | null>(null);
  const { data: locations = [] } = trpc.settings.locations.list.useQuery(),
    { data: branches = [] } = trpc.settings.branches.list.useQuery(),
    { data: departments = [] } = trpc.settings.departments.list.useQuery(),
    { data: employees = [] } = trpc.settings.employees.list.useQuery();
  const list = trpc.inventoryCount.getSessions.useQuery();
  const preview = trpc.inventoryCount.previewScope.useQuery(
    requested || { sessionType: "assets" },
    { enabled: !!requested }
  );
  const changes = trpc.inventoryCount.getSessionChanges.useQuery(
    { id: session?.id || 0 },
    { enabled: !!session, refetchOnWindowFocus: true }
  );
  const create = trpc.inventoryCount.createDraft.useMutation(),
    save = trpc.inventoryCount.saveDraft.useMutation(),
    submit = trpc.inventoryCount.submitSession.useMutation(),
    approve = trpc.inventoryCount.approveSession.useMutation(),
    returned = trpc.inventoryCount.returnSession.useMutation(),
    cancelled = trpc.inventoryCount.cancelSession.useMutation();
  const busy =
    create.isPending ||
    submit.isPending ||
    approve.isPending ||
    returned.isPending ||
    cancelled.isPending;
  const editable =
    !!session && session.status === "DRAFT" && session.performedBy === user?.id;
  const refresh = () => {
    void utils.inventoryCount.invalidate();
  };
  const stopScan = () => {
    scan.current?.abort();
    scan.current = null;
    setScanning(false);
  };
  const cleanup = () => {
    engine.current?.dispose();
    engine.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stopScan();
  };
  useEffect(
    () => () => {
      engine.current?.dispose();
      if (timer.current) clearTimeout(timer.current);
      scan.current?.abort();
    },
    []
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const install = (next: Session) => {
    cleanup();
    sessionRef.current = next;
    setSession(next);
    setDirty(false);
    setSaveState("محفوظ");
    setSaveError("");
    setSearch("");
    setItemFilter("all");
    setItemPage(1);
    setFocused(null);
    setRecovery(null);
    if (next.status === "DRAFT" && next.performedBy === user?.id)
      engine.current = new InventoryAutosave<Payload>(
        next.version,
        async (items, expectedVersion, saveKey) => {
          setSaveState("جارٍ الحفظ");
          const result = await save.mutateAsync({
            id: next.id,
            expectedVersion,
            saveKey,
            items,
          });
          lastReply.current = result;
          return result;
        },
        (version, clean) => {
          const current = sessionRef.current;
          if (!current || current.id !== next.id) return;
          const updated = {
            ...current,
            version,
            items: clean ? lastReply.current.items : current.items,
          };
          sessionRef.current = updated;
          setSession(updated);
          setDirty(!clean);
          setSaveState(clean ? "محفوظ" : "تغييرات تنتظر الحفظ");
          setSaveError("");
          if (clean) {
            try {
              localStorage.removeItem(recoveryKey(next.id));
            } catch {}
            void utils.inventoryCount.getSessions.invalidate();
          } else remember(updated);
        },
        (error: any) => {
          setSaveState("تعذر الحفظ");
          setSaveError(
            error.message || "تعذر الاتصال؛ مدخلاتك باقية هنا، أعد المحاولة"
          );
        }
      );

    if (next.status === "DRAFT" && next.performedBy === user?.id)
      try {
        const raw = localStorage.getItem(recoveryKey(next.id));
        if (raw) {
          const cached = JSON.parse(raw),
            recovered = recoverCountEdits(next.items, cached.items || []);
          if (recovered && cached.version === next.version) {
            const restored = { ...next, items: recovered };
            sessionRef.current = restored;
            setSession(restored);
            setDirty(true);
            setSaveState("استُعيدت مدخلات محلية؛ جارٍ حفظها");
            engine.current?.update(
              recovered.map(item => ({
                id: item.id,
                entityType: item.entityType,
                actualQuantity: item.actualQuantity,
                reason: item.reason,
                observedSerialNumbers: item.observedSerialNumbers ?? null,
              }))
            );
            timer.current = setTimeout(() => {
              void engine.current?.flush();
            }, 900);
          } else if (recovered) setRecovery({ ...next, items: recovered });
        }
      } catch {
        setSaveError(
          "تعذر استعادة المدخلات المحلية؛ النسخة المحفوظة في الخادم لم تتغير"
        );
      }
  };
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    await engine.current?.flush(true);
    return !engine.current?.dirty && !engine.current?.blocked;
  };
  const leave = async () => {
    stopScan();
    if (dirty && !(await flush())) {
      toast.error(
        "تعذر الحفظ؛ أصلح الاتصال أو التعارض قبل الانتقال. يمكنك تصدير مدخلاتك للاحتفاظ بها."
      );
      return false;
    }
    cleanup();
    return true;
  };
  const open = async (id: number) => {
    if (!(await leave())) return;
    try {
      const next = await utils.inventoryCount.getSession.fetch({ id });
      install(next as Session);
      setTab("count");
    } catch (error: any) {
      toast.error(error.message);
    }
  };
  const edit = (key: string, change: Partial<CountItem>) => {
    const current = sessionRef.current;
    if (
      !current ||
      current.status !== "DRAFT" ||
      current.performedBy !== user?.id ||
      busy
    )
      return;
    const updated = {
      ...current,
      items: current.items.map(item =>
        countItemKey(item) === key ? { ...item, ...change } : item
      ),
    };
    sessionRef.current = updated;
    setSession(updated);
    setDirty(true);
    setSaveState("تغييرات تنتظر الحفظ");
    remember(updated);
    engine.current?.update(
      updated.items.map(item => ({
        id: item.id,
        entityType: item.entityType,
        actualQuantity: item.actualQuantity,
        reason: item.reason,
        observedSerialNumbers: item.observedSerialNumbers ?? null,
      }))
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!engine.current?.blocked) void engine.current?.flush();
    }, 900);
  };
  const chooseCode = (value: string) => {
    const matches =
      sessionRef.current?.items.filter(item => item.code === value.trim()) ||
      [];
    if (matches.length !== 1) {
      toast.error(
        matches.length
          ? "الكود مكرر؛ اختر السجل الصحيح من القائمة"
          : "الكود غير موجود في الجلسة"
      );
      return;
    }
    const item = matches[0];
    setFocused(countItemKey(item));
    setCode("");
    if (item.expectedQuantity === 1 && item.actualQuantity === null)
      edit(countItemKey(item), { actualQuantity: 1 });
  };
  const startScan = async () => {
    if (!("NDEFReader" in window)) {
      toast.info("NFC غير متاح؛ استخدم الكود أو الإدخال اليدوي");
      return;
    }
    stopScan();
    const controller = new AbortController();
    scan.current = controller;
    try {
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal: controller.signal });
      setScanning(true);
      reader.onreading = (event: any) => {
        if (!controller.signal.aborted)
          for (const record of event.message.records)
            if (record.recordType === "text")
              chooseCode(
                new TextDecoder(record.encoding || "utf-8").decode(record.data)
              );
      };
      reader.onreadingerror = () => toast.error("تعذرت قراءة الرقاقة");
    } catch {
      if (!controller.signal.aborted) toast.error("تعذر تشغيل NFC");
      stopScan();
    }
  };
  const filters = (): CountScope => ({
    sessionType: kind as CountScope["sessionType"],
    locationId: location && location !== "all" ? Number(location) : undefined,
    search: scopeSearch.trim() || undefined,
    branchId: branch ? Number(branch) : undefined,
    departmentId: department ? Number(department) : undefined,
    employeeId: employee ? Number(employee) : undefined,
  });
  const resetPreview = () => {
    setRequested(null);
    setOverlapReason("");
  };
  const begin = async () => {
    if (!requested) return;
    try {
      const result = await create.mutateAsync({
        ...requested,
        overlapReason: overlapReason || undefined,
      });
      install({ ...result, items: result.items } as Session);
      refresh();
      toast.success(
        "حُفظ نطاق الجرد كمسودة؛ الكميات المتوقعة ثابتة من هذه اللحظة"
      );
    } catch (error: any) {
      toast.error(error.message);
      void preview.refetch();
    }
  };
  const transition = async (
    action: "submit" | "approve" | "return" | "cancel",
    confirmed = false
  ) => {
    stopScan();
    if (!session || busy) return;
    if (action === "submit" && !(await flush())) return;
    if (!confirmed) {
      setConfirmation(action);
      setConfirmationNote("");
      return;
    }
    const current = sessionRef.current!,
      note = confirmationNote.trim();
    if ((action === "return" || action === "cancel") && note.length < 5) return;
    setConfirmation(null);
    try {
      const input = { id: current.id, expectedVersion: current.version };
      if (action === "submit") await submit.mutateAsync(input);
      else if (action === "approve") await approve.mutateAsync(input);
      else if (action === "return")
        await returned.mutateAsync({ ...input, note });
      else await cancelled.mutateAsync({ ...input, note });
      refresh();
      const next = await utils.inventoryCount.getSession.fetch({
        id: current.id,
      });
      install(next as Session);
      toast.success(
        action === "submit"
          ? "أُرسل الجرد للمراجعة وقُفلت مدخلاته"
          : action === "approve"
            ? "اعتمد الجرد وأُضيفت الفروق للمتابعة"
            : action === "return"
              ? "أُعيدت المسودة للمحاسب"
              : "أُلغيت المسودة مع حفظ تاريخها"
      );
    } catch (error: any) {
      toast.error(error.message);
    }
  };
  const exportSession = (value: any, onlyDifferences = false) => {
    const rows = value.items
      .filter(
        (item: CountItem) =>
          !onlyDifferences ||
          (item.actualQuantity != null &&
            item.actualQuantity !== item.expectedQuantity) ||
          serialDifference(item)
      )
      .map((item: CountItem) => ({
        النوع: item.entityType === "asset" ? "أصل" : "عهدة",
        الرمز: item.code,
        الاسم: item.name,
        الموقع: item.locationName,
        الفرع: item.branchName,
        القسم: item.departmentName,
        الموظف: item.employeeName,
        المتوقع: item.expectedQuantity ?? "غير محفوظ",
        الفعلي: item.actualQuantity ?? "لم يُفحص",
        الفرق:
          item.actualQuantity != null
            ? item.actualQuantity - item.expectedQuantity
            : "—",
        السبب: item.reason,
        التسلسليات_المتوقعة: item.expectedSerialNumbers?.join("، "),
        التسلسليات_المفحوصة: item.observedSerialNumbers?.join("، "),
        وقت_الفحص: date(item.countedAt),
        الحالة: statuses[value.status],
        المعتمد: value.approvedByName || "—",
        تاريخ_الاعتماد: date(value.approvedAt),
      }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "الجرد");
    XLSX.writeFile(book, "جرد_" + value.id + ".xlsx");
  };
  const print = (onlyDifferences: boolean) => {
    if (!session) return;
    const popup = window.open("", "_blank");
    if (!popup) {
      toast.error("اسمح بفتح نافذة التقرير");
      return;
    }
    popup.document.write(inventoryCountReport(session, onlyDifferences));
    popup.document.close();
  };
  const filtered = (session?.items || []).filter(item => {
    const diff =
      item.actualQuantity != null
        ? item.actualQuantity - item.expectedQuantity
        : 0;
    return (
      [item.code, item.name, item.employeeName, item.departmentName]
        .join(" ")
        .toLocaleLowerCase("ar")
        .includes(search.toLocaleLowerCase("ar")) &&
      (itemFilter === "all" ||
        (itemFilter === "pending" && item.actualQuantity === null) ||
        (itemFilter === "counted" && item.actualQuantity !== null) ||
        (itemFilter === "negative" &&
          item.actualQuantity !== null &&
          diff < 0) ||
        (itemFilter === "positive" &&
          item.actualQuantity !== null &&
          diff > 0) ||
        (itemFilter === "difference" &&
          (diff !== 0 || !!serialDifference(item))))
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    currentPage = Math.min(itemPage, pages),
    visibleSessions = filterCountRows(list.data || [], listFilters),
    currentListPage = Math.min(
      listPage,
      Math.max(1, Math.ceil(visibleSessions.length / 20))
    );
  const itemFields = (item: CountItem) => {
    const key = countItemKey(item),
      mismatch = serialDifference(item);
    return (
      <div className="space-y-2">
        <label className="block text-sm">
          الكمية الفعلية
          <Input
            aria-label={"الكمية الفعلية " + item.name}
            type="number"
            min="0"
            step="1"
            max="2147483647"
            className="w-32"
            disabled={!editable || busy}
            value={item.actualQuantity ?? ""}
            onChange={event => {
              const value = event.target.value,
                number = Number(value);
              if (
                !value ||
                (Number.isInteger(number) &&
                  number >= 0 &&
                  number <= 2147483647)
              )
                edit(key, { actualQuantity: value ? number : null });
            }}
          />
        </label>
        <Input
          aria-label={"سبب الفرق " + item.name}
          placeholder="سبب الفرق / ملاحظة"
          maxLength={4000}
          disabled={!editable || busy}
          value={item.reason}
          onChange={event => edit(key, { reason: event.target.value })}
        />
        {!!item.expectedSerialNumbers?.length && (
          <details>
            <summary className="cursor-pointer text-xs">
              فحص التسلسليات{" "}
              {item.serialTrackingComplete
                ? "(مطلوب قبل الإرسال)"
                : "(الهوية المتبقية غير مكتملة؛ فحص اختياري)"}
            </summary>
            <p className="text-xs mt-2">
              المتوقعة: {item.expectedSerialNumbers.join("، ")}
            </p>
            <textarea
              aria-label={"التسلسليات المفحوصة " + item.name}
              className="border rounded p-2 w-full text-xs mt-1"
              disabled={!editable || busy}
              value={item.observedSerialNumbers?.join("\n") ?? ""}
              placeholder="رقم واحد في كل سطر. اذكر الأرقام الموجودة فعليًا، بما فيها المختلفة."
              onChange={event =>
                edit(key, {
                  observedSerialNumbers: event.target.value
                    .split(/\r?\n|،|,/)
                    .map(value => value.trim())
                    .filter(Boolean),
                })
              }
            />
            <label className="block text-xs">
              <input
                type="checkbox"
                disabled={!editable || busy}
                checked={
                  item.observedSerialNumbers !== null &&
                  item.observedSerialNumbers !== undefined
                }
                onChange={event =>
                  edit(key, {
                    observedSerialNumbers: event.target.checked
                      ? item.observedSerialNumbers || []
                      : null,
                  })
                }
              />{" "}
              فُحصت الهوية، حتى إذا لم توجد وحدات
            </label>
            {!!mismatch && (
              <p className="text-destructive text-xs">
                اختلاف هوية؛ يلزم السبب حتى لو تطابقت الكمية
              </p>
            )}
          </details>
        )}
      </div>
    );
  };
  const focusedItem = session?.items.find(
    item => countItemKey(item) === focused
  );
  return (
    <Tabs
      dir="rtl"
      className="space-y-5"
      value={tab}
      onValueChange={value => {
        if (!busy)
          void (async () => {
            if (await leave()) {
              setSession(null);
              sessionRef.current = null;
              setTab(value);
            }
          })();
      }}
    >
      <TabsList className="h-auto flex flex-wrap justify-start gap-1 rounded-xl p-1.5">
        <TabsTrigger value="count">الجرد والمسودات</TabsTrigger>
        <TabsTrigger value="history">الجلسات والمراجعة</TabsTrigger>
        {approver && (
          <TabsTrigger value="differences">فروقات الجرد</TabsTrigger>
        )}
        <TabsTrigger value="browse">استعراض الأصول والعهد</TabsTrigger>
      </TabsList>
      <TabsContent value="count" className="space-y-4">
        {!session ? (
          <>
            <RecordScopeFilters
              value={{
                type:
                  kind === "assets"
                    ? "asset"
                    : kind === "custody"
                      ? "custody"
                      : "all",
                location,
                branch,
                department,
                employee,
                search: scopeSearch,
              }}
              locations={locations}
              branches={branches}
              departments={departments}
              employees={employees}
              disabled={busy}
              onChange={value => {
                setKind(
                  value.type === "asset"
                    ? "assets"
                    : value.type === "custody"
                      ? "custody"
                      : "both"
                );
                setLocation(value.location);
                setBranch(value.branch);
                setDepartment(value.department);
                setEmployee(value.employee);
                setScopeSearch(value.search);
                resetPreview();
              }}
            />
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => setRequested(filters())}>
                عرض البيانات
              </Button>
              <Button variant="outline" onClick={() => setTab("history")}>
                استكمال مسودة محفوظة
              </Button>
            </div>
            {requested && (
              <>
                {preview.isFetching && <p>جاري تجهيز المعاينة…</p>}
                {preview.error && (
                  <p className="text-destructive">{preview.error.message}</p>
                )}
                {preview.data && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {["asset", "custody"].map(type => (
                        <div key={type} className="border rounded p-3">
                          {type === "asset" ? "الأصول" : "العهد"}:{" "}
                          {
                            preview.data.items.filter(
                              item => item.entityType === type
                            ).length
                          }{" "}
                          سجل /{" "}
                          {preview.data.items
                            .filter(item => item.entityType === type)
                            .reduce(
                              (sum, item) => sum + item.expectedQuantity,
                              0
                            )}{" "}
                          وحدة
                        </div>
                      ))}
                    </div>
                    {!!preview.data.overlaps.length && (
                      <div className="border border-amber-500 rounded p-3 space-y-2">
                        <p>يوجد جرد مفتوح يتداخل مع هذا النطاق:</p>
                        {preview.data.overlaps.map(row => (
                          <div key={row.id}>
                            #{row.id} — {row.performedByName} —{" "}
                            {statuses[row.status]}{" "}
                            {row.canOpen && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void open(row.id)}
                              >
                                استكمال / مراجعة
                              </Button>
                            )}
                          </div>
                        ))}
                        <Input
                          value={overlapReason}
                          onChange={event =>
                            setOverlapReason(event.target.value)
                          }
                          placeholder="إن احتجت جردًا آخر، اكتب السبب (10 أحرف على الأقل)"
                        />
                      </div>
                    )}
                    <div className="overflow-x-auto max-h-96 border rounded">
                      <table className="w-full text-sm min-w-[750px]">
                        <thead>
                          <tr className="bg-muted">
                            <th>النوع</th>
                            <th>الكود</th>
                            <th>الاسم</th>
                            <th>الموقع / الفرع / القسم</th>
                            <th>الموظف</th>
                            <th>المتبقي المتوقع</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.data.items.map(item => (
                            <tr key={countItemKey(item)} className="border-t">
                              <td className="p-2">
                                {item.entityType === "asset" ? "أصل" : "عهدة"}
                              </td>
                              <td>{item.code}</td>
                              <td>{item.name}</td>
                              <td>
                                {[
                                  item.locationName,
                                  item.branchName,
                                  item.departmentName,
                                ]
                                  .filter(Boolean)
                                  .join(" / ")}
                              </td>
                              <td>{item.employeeName || "—"}</td>
                              <td>{item.expectedQuantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      disabled={
                        busy ||
                        preview.isFetching ||
                        !preview.data.items.length ||
                        (!!preview.data.overlaps.length &&
                          overlapReason.trim().length < 10)
                      }
                      onClick={() => void begin()}
                    >
                      بدء الجرد وحفظ النطاق كمسودة
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      المعاينة لا تحفظ جلسة؛ يعاد التحقق عند البدء ثم يثبت
                      النطاق والكميات.
                    </p>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <section className="rounded-2xl border bg-background p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">
                    جلسة الجرد #{session.id}
                  </h2>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {statuses[session.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {editable && (
                    <span
                      className={
                        "flex items-center gap-2 text-xs " +
                        (saveError
                          ? "text-destructive"
                          : "text-muted-foreground")
                      }
                    >
                      <span
                        className={
                          "h-2 w-2 rounded-full " +
                          (saveError
                            ? "bg-destructive"
                            : dirty
                              ? "bg-amber-500"
                              : "bg-emerald-500")
                        }
                      />
                      {saveState}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || save.isPending}
                    onClick={() => {
                      void (async () => {
                        if (await leave()) {
                          setSession(null);
                          sessionRef.current = null;
                        }
                      })();
                    }}
                  >
                    إغلاق الجلسة
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs text-muted-foreground">
                    نطاق الجرد
                  </p>
                  <p className="font-medium leading-6">
                    {[
                      session.scope?.locationName,
                      session.scope?.branchName,
                      session.scope?.departmentName || session.departmentName,
                      session.scope?.employeeName,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    أعد الجرد
                  </p>
                  <p className="font-medium">
                    {session.performedByName || "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    تاريخ البدء
                  </p>
                  <p className="font-medium">{date(session.createdAt)}</p>
                </div>
              </div>
            </section>
            {recovery && (
              <div className="border border-amber-500 rounded p-3">
                <p>
                  توجد مدخلات محلية من نسخة أقدم؛ لم تُستبدل النسخة الأحدث في
                  الخادم. صدّرها للمقارنة أو اتركها.
                </p>
                <Button
                  variant="outline"
                  onClick={() => exportSession(recovery)}
                >
                  تصدير المدخلات المحلية
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      localStorage.removeItem(recoveryKey(session.id));
                    } catch {}
                    setRecovery(null);
                  }}
                >
                  ترك النسخة المحلية
                </Button>
              </div>
            )}
            {session.status !== "DRAFT" && session.scope?.submissionSummary && (
              <p className="rounded-xl border bg-muted/30 p-3 text-sm">
                أُرسل {session.scope.submissionSummary.submittedCount} سجل
                للمراجعة من {session.scope.submissionSummary.scopeCount}.
                استُبعد {session.scope.submissionSummary.unexaminedCount} سجل لم
                يُفحص من هذه النتيجة.
              </p>
            )}
            {session.reviewNote && (
              <p className="border rounded p-3">
                ملاحظات المراجع / الإلغاء: {session.reviewNote}
              </p>
            )}
            {editable && saveError && (
              <div className="text-sm rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                {saveError && (
                  <>
                    <p className="text-destructive">
                      {saveError} — مدخلاتك لم تُستبدل.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void flush()}>
                        إعادة محاولة الحفظ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              "إعادة تحميل النسخة المحفوظة ستترك مدخلاتك المحلية؛ صدرها أولًا إذا احتجتها."
                            )
                          ) {
                            cleanup();
                            void utils.inventoryCount.getSession
                              .fetch({ id: session.id })
                              .then(next => install(next as Session))
                              .catch((error: any) =>
                                toast.error(error.message)
                              );
                          }
                        }}
                      >
                        إعادة تحميل النسخة المحفوظة
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {!!changes.data?.length && (
              <details className="border border-amber-500 rounded p-3">
                <summary>
                  تنبيه: تغيرت بيانات {changes.data.length} سجل منذ بدء الجرد
                </summary>
                {changes.data.map(row => (
                  <p key={row.key} className="text-sm">
                    {row.code} — المتوقع وقت البدء {row.expectedQuantity}،
                    المتبقي الحالي {row.currentQuantity ?? "—"}، الحالة{" "}
                    {row.currentStatus}. راجع النقل والاستبعاد والضمان وتوقيت
                    الفحص.
                  </p>
                ))}
              </details>
            )}
            {changes.error && (
              <p className="text-destructive">
                تعذر فحص الحركات: {changes.error.message}
              </p>
            )}
            <section className="rounded-2xl border bg-background p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">تقدم الفحص</h3>
                <span className="text-xs text-muted-foreground">
                  {
                    session.items.filter(item => item.actualQuantity != null)
                      .length
                  }{" "}
                  من {session.items.length} سجل
                </span>
              </div>
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width:
                      (session.items.filter(item => item.actualQuantity != null)
                        .length /
                        Math.max(1, session.items.length)) *
                        100 +
                      "%",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["all", "إجمالي السجلات"],
                  ["counted", "تم فحصه"],
                  ["pending", "لم يُفحص"],
                  ["negative", "به نقص"],
                  ["positive", "به زيادة"],
                ].map(([key, label]) => {
                  const total = session.items.filter(
                    item =>
                      key === "all" ||
                      (key === "counted" && item.actualQuantity !== null) ||
                      (key === "pending" && item.actualQuantity === null) ||
                      (key === "negative" &&
                        item.actualQuantity !== null &&
                        item.actualQuantity < item.expectedQuantity) ||
                      (key === "positive" &&
                        item.actualQuantity !== null &&
                        item.actualQuantity > item.expectedQuantity)
                  ).length;
                  return (
                    <button
                      key={key}
                      className={
                        "rounded-xl border px-3 py-3 text-right transition-colors " +
                        (itemFilter === key
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-transparent bg-muted/40 hover:bg-muted")
                      }
                      onClick={() => {
                        setItemFilter(key);
                        setItemPage(1);
                      }}
                    >
                      {label}
                      <strong className="mt-1 block text-2xl font-bold tabular-nums">
                        {total}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="rounded-2xl border bg-background p-4 shadow-sm">
              <div className="grid gap-5 lg:grid-cols-2">
                {editable && (
                  <div className="space-y-2 lg:border-l lg:pl-5">
                    <h3 className="text-sm font-semibold">فحص عنصر بالكود</h3>
                    <div className="flex gap-2 flex-wrap">
                      <Input
                        className="min-w-40 flex-1"
                        aria-label="قراءة كود الجرد"
                        placeholder="أدخل الكود لفتح بطاقة العنصر"
                        value={code}
                        onChange={event => setCode(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter") chooseCode(code);
                        }}
                      />
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => chooseCode(code)}
                      >
                        قراءة الكود
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={scanning ? stopScan : () => void startScan()}
                      >
                        {scanning ? "إيقاف NFC" : "قراءة NFC"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      الصفر يعني عدم وجود وحدات، والفراغ يعني لم يُفحص. مسح سجل
                      متعدد الوحدات يفتح بطاقته؛ أدخل العدد الموجود بعد الفحص.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    البحث وتصفية القائمة
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="min-w-40 flex-1"
                      aria-label="بحث عناصر الجرد"
                      placeholder="بحث بالكود أو الاسم أو الموظف…"
                      value={search}
                      onChange={event => {
                        setSearch(event.target.value);
                        setItemPage(1);
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setItemFilter("difference");
                        setItemPage(1);
                      }}
                    >
                      الفروق فقط
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setItemFilter("all");
                        setSearch("");
                      }}
                    >
                      الكل
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    اضغط اسم العنصر أو «عرض» لمراجعة التخصيص والتسلسليات
                    والملاحظات.
                  </p>
                </div>
              </div>
            </section>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">عناصر الجرد</h3>
                <span className="text-xs text-muted-foreground">
                  {filtered.length} سجل في العرض الحالي
                </span>
              </div>
              <InventoryCountItems
                items={filtered.slice((currentPage - 1) * 20, currentPage * 20)}
                offset={(currentPage - 1) * 20}
                editable={editable}
                busy={busy}
                edit={edit}
                open={setFocused}
              />
              <CountPagination
                page={currentPage}
                total={filtered.length}
                onChange={setItemPage}
              />
            </section>
            <section className="rounded-2xl border bg-background p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold">إجراءات الجلسة</h3>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  {editable && (
                    <>
                      <Button disabled={busy} onClick={() => void flush()}>
                        حفظ الآن
                      </Button>
                      <Button
                        disabled={
                          busy ||
                          !!saveError ||
                          !!validateCountForSubmission(session.items)
                        }
                        onClick={() => void transition("submit")}
                      >
                        إرسال للمراجعة
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void transition("cancel")}
                      >
                        إلغاء المسودة
                      </Button>
                    </>
                  )}
                  {approver && session.status === "DRAFT" && !editable && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void transition("cancel")}
                    >
                      إلغاء بسبب موثق
                    </Button>
                  )}
                  {approver && session.status === "SUBMITTED" && (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => void transition("approve")}
                      >
                        اعتماد نهائي
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void transition("return")}
                      >
                        إعادة للمحاسب بملاحظات
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-3 sm:border-t-0 sm:pt-0">
                  <Button
                    variant="outline"
                    onClick={() => exportSession(session)}
                  >
                    تصدير Excel
                  </Button>
                  <Button variant="outline" onClick={() => print(false)}>
                    محضر للطباعة
                  </Button>
                  <Button variant="outline" onClick={() => print(true)}>
                    تقرير الفروق
                  </Button>
                </div>
              </div>
            </section>
            {editable && validateCountForSubmission(session.items) && (
              <p className="text-sm text-muted-foreground">
                قبل الإرسال: {validateCountForSubmission(session.items)}
              </p>
            )}
          </>
        )}
      </TabsContent>
      <TabsContent value="history" className="space-y-3">
        <p className="text-sm">
          استكمل مسودتك أو راجع الجلسات المرسلة. النتائج المعتمدة ثابتة،
          والمسودات الملغاة تبقى في التاريخ.
        </p>
        <CountListFilters
          rows={list.data || []}
          value={listFilters}
          onChange={value => {
            setListFilters(value);
            setListPage(1);
          }}
        />
        {list.isLoading && <p>جاري التحميل…</p>}
        {list.error && <p className="text-destructive">{list.error.message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-muted">
                <th>الجلسة / النوع</th>
                <th>النطاق</th>
                <th>المُعدّ</th>
                <th>الحالة</th>
                <th>المعتمد</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visibleSessions
                .slice((currentListPage - 1) * 20, currentListPage * 20)
                .map(row => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2">
                      #{row.id} —{" "}
                      {row.sessionType === "both"
                        ? "أصول وعهد"
                        : row.sessionType === "assets"
                          ? "أصول"
                          : "عهد"}
                      <div>{date(row.createdAt)}</div>
                    </td>
                    <td>
                      {[
                        row.scope?.locationName,
                        row.scope?.branchName,
                        row.scope?.departmentName || row.departmentName,
                        row.scope?.employeeName,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </td>
                    <td>{row.performedByName}</td>
                    <td>{statuses[row.status]}</td>
                    <td>{row.approvedByName || "—"}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void open(row.id)}
                      >
                        {row.status === "DRAFT" && row.performedBy === user?.id
                          ? "استكمال"
                          : row.status === "SUBMITTED" && approver
                            ? "مراجعة واعتماد"
                            : "عرض"}
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <CountPagination
          page={currentListPage}
          total={visibleSessions.length}
          onChange={setListPage}
        />
      </TabsContent>
      {approver && (
        <TabsContent value="differences">
          <InventoryDifferencePanel />
        </TabsContent>
      )}
      <TabsContent value="browse">{browse}</TabsContent>
      <Dialog
        open={!!confirmation}
        onOpenChange={open => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirmation === "submit"
                ? "مراجعة إرسال الجرد"
                : confirmation === "approve"
                  ? "تأكيد اعتماد الجرد"
                  : confirmation === "return"
                    ? "إعادة الجرد للمحاسب"
                    : "إلغاء المسودة"}
            </DialogTitle>
          </DialogHeader>
          <p>
            {confirmation === "submit"
              ? `سيُرسل ${itemsForSubmission(session?.items || []).length} سجل مفحوص فقط، ولن يُرسل ${(session?.items.length || 0) - itemsForSubmission(session?.items || []).length} سجل لم يُفحص. بعد الإرسال تُقفل المدخلات حتى يعيدها المراجع.`
              : confirmation === "approve"
                ? "راجع الفروق والتنبيهات أولًا. بعد الاعتماد تصبح نتيجة الجرد تاريخية ولا يمكن تعديلها مباشرة."
                : "اكتب السبب أو ملاحظات المراجعة (5 أحرف على الأقل). ستبقى محفوظة مع الجلسة."}
          </p>
          {(confirmation === "return" || confirmation === "cancel") && (
            <textarea
              aria-label="سبب الإلغاء أو ملاحظات المراجعة"
              className="border rounded p-2 w-full"
              maxLength={4000}
              value={confirmationNote}
              onChange={event => setConfirmationNote(event.target.value)}
            />
          )}
          <div className="flex gap-2">
            <Button
              disabled={
                busy ||
                ((confirmation === "return" || confirmation === "cancel") &&
                  confirmationNote.trim().length < 5)
              }
              onClick={() => {
                if (confirmation) void transition(confirmation, true);
              }}
            >
              {confirmation === "submit"
                ? "تأكيد إرسال العناصر المفحوصة"
                : confirmation === "approve"
                  ? "تأكيد الاعتماد النهائي"
                  : "تأكيد"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              رجوع
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!focusedItem}
        onOpenChange={open => {
          if (!open) setFocused(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {focusedItem?.name} — {focusedItem?.code}
            </DialogTitle>
          </DialogHeader>
          {focusedItem && (
            <>
              <p>
                المتوقع: {focusedItem.expectedQuantity} وحدة ·{" "}
                {focusedItem.entityType === "asset" ? "أصل" : "عهدة"}
              </p>
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4 text-sm">
                {[
                  ["الموقع", focusedItem.locationName],
                  ["الفرع", focusedItem.branchName],
                  ["القسم", focusedItem.departmentName],
                  ["الموظف", focusedItem.employeeName],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="mb-1 text-xs text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="font-medium">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              {itemFields(focusedItem)}
              <Button
                onClick={() => {
                  const index = session!.items.findIndex(
                    item => countItemKey(item) === focused
                  );
                  const next = session!.items
                    .slice(index + 1)
                    .find(item => item.actualQuantity === null);
                  setFocused(next ? countItemKey(next) : null);
                }}
              >
                العنصر التالي غير المفحوص
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
