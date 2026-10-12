import FieldHelp from "@/components/FieldHelp";
/*
 * Design: Calm Luxury - الإعدادات
 * المواقع + الأقسام + الموظفين + أنواع الاستبعاد + النسخ الاحتياطي
 * مربوط بقاعدة البيانات عبر tRPC
 */
import DashboardLayout from "@/components/DashboardLayout";
import FinancialClassifications from "@/components/FinancialClassifications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  MapPin, Building2, Plus, Trash2, Edit, Save, X, Users,
  AlertTriangle, Database, Download, Upload, Eye, Fingerprint, User, Loader2, ImageIcon
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { EmployeesExcelButtons, HierarchyExcelButtons } from "@/components/ExcelButtons";

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const isOwner = user?.role === "owner";
  return (
    <DashboardLayout title="الإعدادات" subtitle="إدارة المواقع والأقسام والموظفين وأنواع الاستبعاد">
      <Tabs defaultValue="locations" dir="rtl">
        <TabsList className="bg-muted/50 p-1 rounded-xl mb-6 h-auto flex-wrap">
          <TabsTrigger value="financial_classifications">التصنيفات المالية</TabsTrigger>
          <TabsTrigger value="locations" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <MapPin className="w-3.5 h-3.5" /> المواقع
          </TabsTrigger>
          <TabsTrigger value="branches" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Building2 className="w-3.5 h-3.5" /> الفروع
          </TabsTrigger>
          <TabsTrigger value="departments" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Building2 className="w-3.5 h-3.5" /> الأقسام
          </TabsTrigger>
          <TabsTrigger value="employees" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Users className="w-3.5 h-3.5" /> الموظفين
          </TabsTrigger>
          <TabsTrigger value="exclusion_types" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5" /> أنواع الاستبعاد
          </TabsTrigger>
          {isOwner && <TabsTrigger value="backup" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Database className="w-3.5 h-3.5" /> النسخ الاحتياطي
          </TabsTrigger>}
          {isOwner && (
            <TabsTrigger value="branding" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <ImageIcon className="w-3.5 h-3.5" /> هوية النظام
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="locations"><LocationsTab /></TabsContent>
        <TabsContent value="financial_classifications"><FinancialClassifications /></TabsContent>
        <TabsContent value="branches"><BranchesTab /></TabsContent>
        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="employees"><EmployeesTab /></TabsContent>
        <TabsContent value="exclusion_types"><ExclusionTypesTab /></TabsContent>
        {isOwner && <TabsContent value="backup"><BackupTab /></TabsContent>}
        {isOwner && <TabsContent value="branding"><BrandingTab /></TabsContent>}
      </Tabs>
    </DashboardLayout>
  );
}

const SETTINGS_PAGE_SIZE = 10;

function getCurrentNumberingPeriod(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(new Date());
  const month = parts.find(part => part.type === "month")?.value || "MM";
  const year = parts.find(part => part.type === "year")?.value || "YY";
  return `${month}${year}`;
}


function PaginationControls({ page, totalItems, onPageChange }: { page: number; totalItems: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / SETTINGS_PAGE_SIZE));
  const start = totalItems === 0 ? 0 : (page - 1) * SETTINGS_PAGE_SIZE + 1;
  const end = Math.min(page * SETTINGS_PAGE_SIZE, totalItems);

  const visiblePages = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, -1, totalPages];
    if (page >= totalPages - 3) return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, -1, page - 1, page, page + 1, -2, totalPages];
  })();

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
      <p className="text-xs text-muted-foreground">عرض {start}–{end} من أصل {totalItems}</p>
      <div className="flex items-center gap-1" dir="ltr">
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled={page <= 1 || totalItems === 0} onClick={() => onPageChange(page - 1)}>السابق</Button>
        {visiblePages.map((item, index) => item < 0 ? (
          <span key={`${item}-${index}`} className="px-1 text-xs text-muted-foreground">…</span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "default" : "outline"}
            size="sm"
            className="h-8 min-w-8 px-2 text-xs"
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled={page >= totalPages || totalItems === 0} onClick={() => onPageChange(page + 1)}>التالي</Button>
      </div>
    </div>
  );
}

// ===== تبويب المواقع =====
function LocationsTab() {
  const utils = trpc.useUtils();
  const { data: locations = [], isLoading } = trpc.settings.locations.list.useQuery();
  const { data: readinessBranches = [], isLoading: branchesLoading } = trpc.settings.branches.list.useQuery();
  const { data: readinessDepartments = [], isLoading: departmentsLoading } = trpc.settings.departments.list.useQuery();
  const createMut = trpc.settings.locations.create.useMutation({
    onSuccess: async () => { await utils.settings.locations.list.invalidate(); toast.success("تم إضافة الموقع وتوليد كوده الهرمي"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.settings.locations.update.useMutation({
    onSuccess: async () => { await utils.settings.locations.list.invalidate(); toast.success("تم تحديث الموقع"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.settings.locations.delete.useMutation({
    onSuccess: async () => { await utils.settings.locations.list.invalidate(); toast.success("تم حذف الموقع"); },
    onError: (e) => toast.error(e.message),
  });

  const empty = { name: "", assetPrefix: "", custodyPrefix: "" };
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(empty);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(locations.length / SETTINGS_PAGE_SIZE));
  const pagedLocations = locations.slice((page - 1) * SETTINGS_PAGE_SIZE, page * SETTINGS_PAGE_SIZE);
  useEffect(() => setPage(current => Math.min(current, totalPages)), [totalPages]);

  const openAdd = () => { setEditing(null); setForm(empty); setShowDialog(true); };
  const openEdit = (loc: any) => {
    setEditing(loc);
    setForm({ name: loc.name, assetPrefix: loc.assetPrefix || "", custodyPrefix: loc.custodyPrefix || "" });
    setShowDialog(true);
  };
  const save = () => {
    if (!form.name.trim()) return toast.error("اسم الموقع مطلوب");
    const payload = { name: form.name.trim(), assetPrefix: form.assetPrefix.trim() || null, custodyPrefix: form.custodyPrefix.trim() || null };
    if (editing) {
      updateMut.mutate({ id: editing.id, ...payload }, { onSuccess: () => setShowDialog(false) });
    } else {
      createMut.mutate(payload, { onSuccess: () => setShowDialog(false) });
    }
  };

  if (isLoading || branchesLoading || departmentsLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return <div className="space-y-4">
    {locations.filter(loc => !loc.assetPrefix?.trim() || !loc.custodyPrefix?.trim() ||
      !readinessDepartments.some(dept => readinessBranches.some(branch => branch.id === dept.branchId && branch.locationId === loc.id)))
      .map(loc => <div key={loc.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" role="status">
        <strong>تهيئة الموقع «{loc.name}» غير مكتملة:</strong>
        <ul className="mt-1 list-disc pr-5">
          {!loc.assetPrefix?.trim() && <li>حدد بادئة أرقام الأصول.</li>}
          {!loc.custodyPrefix?.trim() && <li>حدد بادئة أرقام العهد.</li>}
          {!readinessDepartments.some(dept => readinessBranches.some(branch => branch.id === dept.branchId && branch.locationId === loc.id)) &&
            <li>اربط قسمًا بفرع يتبع هذا الموقع من تبويبي الفروع والأقسام.</li>}
        </ul>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => openEdit(loc)}>تعديل الموقع والترقيم</Button>
      </div>)}
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h3 className="text-sm font-bold">المواقع والترقيم</h3><p className="text-xs text-muted-foreground mt-1">كود الموقع يولد آلياً. بادئة الأصل والعهدة قابلة للتعديل حتى أول رقم مولد لكل نوع.</p></div>
      <div className="flex items-center gap-2 flex-wrap"><HierarchyExcelButtons type="locations" /><Button size="sm" onClick={openAdd}><Plus className="w-3.5 h-3.5 ml-1" />إضافة موقع</Button></div>
    </div>
    <div className="border rounded-xl overflow-x-auto">
      <table className="w-full min-w-[850px]">
        <thead><tr className="bg-muted/30">
          <th className="text-right px-4 py-3 text-xs">الكود</th><th className="text-right px-4 py-3 text-xs">الموقع</th>
          <th className="text-right px-4 py-3 text-xs">بادئة الأصول</th><th className="text-right px-4 py-3 text-xs">بادئة العهد</th>
          <th className="text-right px-4 py-3 text-xs">تسلسل الشهر</th><th className="px-4 py-3 text-xs">الإجراءات</th>
        </tr></thead>
        <tbody>{pagedLocations.map((loc: any) => <tr key={loc.id} className="border-t">
          <td className="px-4 py-3"><code className="font-bold text-primary">{loc.code || "—"}</code></td>
          <td className="px-4 py-3 text-sm font-medium">{loc.name}</td>
          <td className="px-4 py-3 text-sm"><div className="flex items-center gap-2"><code>{loc.assetPrefix || "غير محددة"}</code>{loc.assetPrefixLocked && <span className="text-[10px] rounded bg-muted px-2 py-0.5">مقفلة</span>}</div></td>
          <td className="px-4 py-3 text-sm"><div className="flex items-center gap-2"><code>{loc.custodyPrefix || "غير محددة"}</code>{loc.custodyPrefixLocked && <span className="text-[10px] rounded bg-muted px-2 py-0.5">مقفلة</span>}</div></td>
          <td className="px-4 py-3 text-xs text-muted-foreground">
            أصل: {loc.assetSequencePeriod === getCurrentNumberingPeriod() ? (loc.assetSequence || 0) : 0}
            {' · '}عهدة: {loc.custodySequencePeriod === getCurrentNumberingPeriod() ? (loc.custodySequence || 0) : 0}
          </td>
          <td className="px-4 py-3"><div className="flex justify-center gap-2"><button onClick={() => openEdit(loc)}><Edit className="w-4 h-4" /></button><button onClick={() => deleteMut.mutate({ id: loc.id })}><Trash2 className="w-4 h-4 text-red-400" /></button></div></td>
        </tr>)}</tbody>
      </table>
    </div>
    <PaginationControls page={page} totalItems={locations.length} onPageChange={setPage} />

    <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent className="max-w-md" dir="rtl">
      <DialogHeader><DialogTitle>{editing ? `تعديل الموقع ${editing.code || ""}` : "إضافة موقع جديد"}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><label className="text-xs font-bold">اسم الموقع *</label><FieldHelp text={"اسم الموقع الرئيسي مثل الرياض؛ ترتبط به الفروع والأقسام والسجلات التشغيلية."}><input value={form.name} onChange={e => setForm(f => ({...f,name:e.target.value}))} className="w-full h-10 px-3 border rounded-lg" placeholder="مثال: الرياض" /></FieldHelp></div>
        <div className="space-y-1.5"><label className="text-xs font-bold">بادئة الأصول</label><FieldHelp text={"حروف بداية الرقم الرسمي للأصول في هذا الموقع؛ تقفل بعد بدء توليد الأرقام."}><input disabled={!!editing?.assetPrefixLocked} value={form.assetPrefix} onChange={e => setForm(f => ({...f,assetPrefix:e.target.value.toUpperCase()}))} className="w-full h-10 px-3 border rounded-lg disabled:bg-muted disabled:text-muted-foreground" placeholder="مثال: TA" /></FieldHelp><p className="text-[11px] text-muted-foreground">الناتج: {(form.assetPrefix || "TA").toUpperCase()}-{getCurrentNumberingPeriod()}01 {editing?.assetPrefixLocked ? "— تم قفلها بعد بدء التوليد" : ""}</p></div>
        <div className="space-y-1.5"><label className="text-xs font-bold">بادئة العهد</label><FieldHelp text={"حروف بداية الرقم الرسمي للعهد في هذا الموقع؛ تقفل بعد بدء توليد الأرقام."}><input disabled={!!editing?.custodyPrefixLocked} value={form.custodyPrefix} onChange={e => setForm(f => ({...f,custodyPrefix:e.target.value.toUpperCase()}))} className="w-full h-10 px-3 border rounded-lg disabled:bg-muted disabled:text-muted-foreground" placeholder="مثال: TC" /></FieldHelp><p className="text-[11px] text-muted-foreground">الناتج: {(form.custodyPrefix || "TC").toUpperCase()}-{getCurrentNumberingPeriod()}01 {editing?.custodyPrefixLocked ? "— تم قفلها بعد بدء التوليد" : ""}</p></div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">بعد توليد أول أصل أو عهدة في هذا الموقع، تُقفل بادئة النوع المقابل. التسلسل يبدأ من 01 من جديد مع كل شهر، ويتمدد تلقائياً بعد 99 إلى 100 وما بعدها. نقل الأصل أو العهدة لاحقاً لا يغيّر الرقم.</div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button><Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>{(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}</Button></div>
      </div>
    </DialogContent></Dialog>
  </div>;
}

// ===== تبويب الفروع =====
function BranchesTab() {
  const utils = trpc.useUtils();
  const { data: branches = [], isLoading } = trpc.settings.branches.list.useQuery();
  const { data: locations = [] } = trpc.settings.locations.list.useQuery();
  const createMut = trpc.settings.branches.create.useMutation({ onSuccess:async()=>{await utils.settings.branches.list.invalidate();toast.success("تم إضافة الفرع وتوليد كوده")}, onError:e=>toast.error(e.message) });
  const updateMut = trpc.settings.branches.update.useMutation({ onSuccess:async()=>{await Promise.all([utils.settings.branches.list.invalidate(),utils.settings.departments.list.invalidate(),utils.settings.employees.list.invalidate()]);toast.success("تم تعديل الفرع وتحديث المسار الهرمي")}, onError:e=>toast.error(e.message) });
  const deleteMut = trpc.settings.branches.delete.useMutation({ onSuccess:async()=>{await utils.settings.branches.list.invalidate();toast.success("تم حذف الفرع")}, onError:e=>toast.error(e.message) });
  const [showAdd,setShowAdd]=useState(false); const [editId,setEditId]=useState<number|null>(null); const [name,setName]=useState(""); const [locationId,setLocationId]=useState("");
  const [page,setPage]=useState(1); const totalPages=Math.max(1,Math.ceil(branches.length/SETTINGS_PAGE_SIZE)); const pagedBranches=branches.slice((page-1)*SETTINGS_PAGE_SIZE,page*SETTINGS_PAGE_SIZE);
  useEffect(()=>setPage(current=>Math.min(current,totalPages)),[totalPages]);
  const save=()=>{if(!name.trim()||!locationId)return toast.error("أدخل اسم الفرع واختر الموقع");const data={name:name.trim(),locationId:Number(locationId)};if(editId)updateMut.mutate({id:editId,...data},{onSuccess:()=>setShowAdd(false)});else createMut.mutate(data,{onSuccess:()=>setShowAdd(false)});};
  if(isLoading)return <Loader2 className="w-6 h-6 animate-spin"/>;
  return <div className="space-y-4"><div className="flex justify-between"><div><h3 className="text-sm font-bold">الفروع</h3><p className="text-xs text-muted-foreground">مثال: 01-01</p></div><div className="flex items-center gap-2 flex-wrap"><HierarchyExcelButtons type="branches" /><Button size="sm" onClick={()=>{setEditId(null);setName("");setLocationId("");setShowAdd(true)}}><Plus className="w-3.5 h-3.5 ml-1"/>إضافة فرع</Button></div></div>
    <div className="border rounded-xl overflow-hidden"><table className="w-full"><thead><tr className="bg-muted/30"><th className="text-right px-4 py-3 text-xs">الكود</th><th className="text-right px-4 py-3 text-xs">الفرع</th><th className="text-right px-4 py-3 text-xs">الموقع</th><th className="px-4 py-3 text-xs">الإجراءات</th></tr></thead><tbody>{pagedBranches.map((b:any)=><tr key={b.id} className="border-t"><td className="px-4 py-3"><code className="font-bold text-primary">{b.code||"—"}</code></td><td className="px-4 py-3 text-sm">{b.name}</td><td className="px-4 py-3 text-sm"><code className="text-xs ml-2">{b.locationCode}</code>{b.locationName}</td><td className="px-4 py-3"><div className="flex justify-center gap-2"><button onClick={()=>{setEditId(b.id);setName(b.name);setLocationId(String(b.locationId));setShowAdd(true)}}><Edit className="w-4 h-4"/></button><button onClick={()=>deleteMut.mutate({id:b.id})}><Trash2 className="w-4 h-4 text-red-400"/></button></div></td></tr>)}</tbody></table></div>
    <PaginationControls page={page} totalItems={branches.length} onPageChange={setPage} />
    <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-sm" dir="rtl"><DialogHeader><DialogTitle>{editId?"تعديل الفرع":"إضافة فرع"}</DialogTitle></DialogHeader><div className="space-y-4"><FieldHelp text={"اسم الفرع التابع للموقع؛ يولد كوده الهرمي من الموقع الذي تختاره."}><input value={name} onChange={e=>setName(e.target.value)} placeholder="اسم الفرع" className="w-full h-10 px-3 rounded-lg border"/></FieldHelp><Select value={locationId} onValueChange={setLocationId}><FieldHelp text={"الموقع الذي يتبع له الفرع؛ تغييره يعيد بناء المسار الهرمي للأقسام والموظفين تحته."}><SelectTrigger><SelectValue placeholder="اختر الموقع"/></SelectTrigger></FieldHelp><SelectContent>{locations.map((l:any)=><SelectItem key={l.id} value={String(l.id)}>{l.code} — {l.name}</SelectItem>)}</SelectContent></Select><p className="text-[11px] text-muted-foreground">الكود يولد تلقائياً من كود الموقع. عند نقل الفرع إلى موقع آخر سيُعطى مسار هرمي جديد وتُحدّث أكواد الأقسام والموظفين تحته.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowAdd(false)}>إلغاء</Button><Button onClick={save}>حفظ</Button></div></div></DialogContent></Dialog>
  </div>;
}

// ===== تبويب الأقسام =====
function DepartmentsTab() {
  const utils=trpc.useUtils(); const {data:depts=[],isLoading}=trpc.settings.departments.list.useQuery(); const {data:branches=[]}=trpc.settings.branches.list.useQuery();
  const createMut=trpc.settings.departments.create.useMutation({onSuccess:async()=>{await utils.settings.departments.list.invalidate();toast.success("تم إضافة القسم وتوليد كوده")},onError:e=>toast.error(e.message)});
  const updateMut=trpc.settings.departments.update.useMutation({onSuccess:async()=>{await Promise.all([utils.settings.departments.list.invalidate(),utils.settings.employees.list.invalidate()]);toast.success("تم تعديل القسم وتحديث المسار الهرمي")},onError:e=>toast.error(e.message)});
  const deleteMut=trpc.settings.departments.delete.useMutation({onSuccess:()=>utils.settings.departments.list.invalidate(),onError:e=>toast.error(e.message)});
  const [showAdd,setShowAdd]=useState(false),[editId,setEditId]=useState<number|null>(null),[name,setName]=useState(""),[branchId,setBranchId]=useState("");
  const [page,setPage]=useState(1); const totalPages=Math.max(1,Math.ceil(depts.length/SETTINGS_PAGE_SIZE)); const pagedDepts=depts.slice((page-1)*SETTINGS_PAGE_SIZE,page*SETTINGS_PAGE_SIZE);
  useEffect(()=>setPage(current=>Math.min(current,totalPages)),[totalPages]);
  const save=()=>{if(!name.trim()||!branchId)return toast.error("أدخل اسم القسم واختر الفرع");const data={name:name.trim(),branchId:Number(branchId)}; if(editId)updateMut.mutate({id:editId,...data},{onSuccess:()=>setShowAdd(false)});else createMut.mutate(data,{onSuccess:()=>setShowAdd(false)});};
  if(isLoading)return <Loader2 className="w-6 h-6 animate-spin"/>;
  return <div className="space-y-4"><div className="flex justify-between"><div><h3 className="text-sm font-bold">الأقسام</h3><p className="text-xs text-muted-foreground">مثال: 01-01-001</p></div><div className="flex items-center gap-2 flex-wrap"><HierarchyExcelButtons type="departments" /><Button size="sm" onClick={()=>{setEditId(null);setName("");setBranchId("");setShowAdd(true)}}><Plus className="w-3.5 h-3.5 ml-1"/>إضافة قسم</Button></div></div>
    <div className="border rounded-xl overflow-hidden"><table className="w-full"><thead><tr className="bg-muted/30"><th className="text-right px-4 py-3 text-xs">الكود</th><th className="text-right px-4 py-3 text-xs">القسم</th><th className="text-right px-4 py-3 text-xs">الفرع</th><th className="text-right px-4 py-3 text-xs">الموقع</th><th className="px-4 py-3 text-xs">الإجراءات</th></tr></thead><tbody>{pagedDepts.map((d:any)=><tr key={d.id} className="border-t"><td className="px-4 py-3"><code className="font-bold text-primary">{d.code||"—"}</code></td><td className="px-4 py-3 text-sm">{d.name}</td><td className="px-4 py-3 text-sm">{d.branchName||"-"}</td><td className="px-4 py-3 text-sm">{d.locationName||"-"}</td><td><div className="flex justify-center gap-2"><button onClick={()=>{setEditId(d.id);setName(d.name);setBranchId(String(d.branchId||""));setShowAdd(true)}}><Edit className="w-4 h-4"/></button><button onClick={()=>deleteMut.mutate({id:d.id})}><Trash2 className="w-4 h-4 text-red-400"/></button></div></td></tr>)}</tbody></table></div>
    <PaginationControls page={page} totalItems={depts.length} onPageChange={setPage} />
    <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-sm" dir="rtl"><DialogHeader><DialogTitle>{editId?"تعديل القسم":"إضافة قسم"}</DialogTitle></DialogHeader><div className="space-y-4"><FieldHelp text={"اسم القسم التنظيمي؛ يستخدم لتخصيص الأصول والعهد وربط الموظفين به."}><input value={name} onChange={e=>setName(e.target.value)} placeholder="اسم القسم" className="w-full h-10 px-3 rounded-lg border"/></FieldHelp><Select value={branchId} onValueChange={setBranchId}><FieldHelp text={"الفرع الذي يتبع له القسم؛ تغييره يحدث أكواد القسم والموظفين التابعين له."}><SelectTrigger><SelectValue placeholder="اختر الفرع"/></SelectTrigger></FieldHelp><SelectContent>{branches.map((b:any)=><SelectItem key={b.id} value={String(b.id)}>{b.code} — {b.locationName} / {b.name}</SelectItem>)}</SelectContent></Select><p className="text-[11px] text-muted-foreground">الكود يولد آلياً. نقل القسم إلى فرع آخر يحدّث كوده وأكواد الموظفين التابعين له.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowAdd(false)}>إلغاء</Button><Button onClick={save}>حفظ</Button></div></div></DialogContent></Dialog>
  </div>;
}

// ===== تبويب الموظفين =====
function EmployeesTab() {
  const utils = trpc.useUtils();
  const { data: employees = [], isLoading } = trpc.settings.employees.list.useQuery();
  const { data: departments = [] } = trpc.settings.departments.list.useQuery();
  const createMut = trpc.settings.employees.create.useMutation({ onSuccess: async () => { await utils.settings.employees.list.invalidate(); toast.success("تم إضافة الموظف وتوليد كوده الهرمي"); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.settings.employees.update.useMutation({ onSuccess: async () => { await utils.settings.employees.list.invalidate(); toast.success("تم تعديل بيانات الموظف"); }, onError: (e) => toast.error(e.message) });
  const deleteMut = trpc.settings.employees.delete.useMutation({ onSuccess: async () => { await utils.settings.employees.list.invalidate(); toast.success("تم حذف الموظف"); }, onError: (e) => toast.error(e.message) });
  const empty = { fullName: "", departmentId: "", fingerprintId: "", nationalId: "", phone: "" };
  const [showAdd, setShowAdd] = useState(false); const [editId, setEditId] = useState<number | null>(null); const [newData, setNewData] = useState(empty); const [editData, setEditData] = useState(empty); const [searchQuery, setSearchQuery] = useState(""); const [page,setPage]=useState(1);
  const filtered = employees.filter((e:any) => !searchQuery.trim() || `${e.code || ""} ${e.fullName} ${e.departmentName || ""} ${e.branchName || ""} ${e.locationName || ""} ${e.fingerprintId || ""}`.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalPages=Math.max(1,Math.ceil(filtered.length/SETTINGS_PAGE_SIZE)); const pagedEmployees=filtered.slice((page-1)*SETTINGS_PAGE_SIZE,page*SETTINGS_PAGE_SIZE);
  useEffect(()=>setPage(current=>Math.min(current,totalPages)),[totalPages]);
  const payload = (d: typeof empty) => ({ fullName: d.fullName.trim(), departmentId: Number(d.departmentId), fingerprintId: d.fingerprintId.trim() || null, nationalId: d.nationalId.trim() || null, phone: d.phone.trim() || null });
  const handleAdd = () => { if (!newData.fullName.trim() || !newData.departmentId) return toast.error("يرجى إدخال اسم الموظف واختيار القسم"); createMut.mutate(payload(newData), { onSuccess: () => { setNewData(empty); setShowAdd(false); } }); };
  const handleEdit = (id: number) => { if (!editData.fullName.trim() || !editData.departmentId) return toast.error("يرجى إدخال اسم الموظف واختيار القسم"); updateMut.mutate({ id, ...payload(editData) }, { onSuccess: () => setEditId(null) }); };
  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3 flex-wrap"><div><h3 className="text-sm font-bold">الموظفين</h3><p className="text-xs text-muted-foreground">كود الموظف يعكس مساره الحالي، مثال 01-01-001-0001. الـ ID الداخلي يبقى ثابتاً.</p></div><div className="flex items-center gap-2"><EmployeesExcelButtons /><Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5 ml-1" />إضافة موظف</Button></div></div>
    <FieldHelp text={"ابحث عن الموظف بالاسم أو الكود أو القسم أو رقم البصمة لتضييق القائمة."}><input value={searchQuery} onChange={e=>{setSearchQuery(e.target.value);setPage(1)}} placeholder="بحث بالاسم أو الكود أو القسم أو رقم البصمة..." className="w-full h-10 px-3 border rounded-lg" /></FieldHelp>
    <div className="border rounded-xl overflow-x-auto"><table className="w-full min-w-[1100px]"><thead><tr className="bg-muted/30"><th className="text-right px-3 py-3 text-xs">الكود</th><th className="text-right px-3 py-3 text-xs">الموظف</th><th className="text-right px-3 py-3 text-xs">القسم</th><th className="text-right px-3 py-3 text-xs">المسار</th><th className="px-3 py-3 text-xs">البصمة</th><th className="px-3 py-3 text-xs">الهوية</th><th className="px-3 py-3 text-xs">الهاتف</th><th className="px-3 py-3 text-xs">الإجراءات</th></tr></thead><tbody>{pagedEmployees.map((emp:any)=><tr key={emp.id} className="border-t"><td className="px-3 py-3"><code className="text-xs font-bold text-primary">{emp.code || "بانتظار ربط القسم"}</code></td><td className="px-3 py-3">{editId===emp.id?<FieldHelp text={"الاسم الكامل للموظف الذي سيرتبط بتسليم العهد والأصول وحركاتها."}><input value={editData.fullName} onChange={e=>setEditData({...editData,fullName:e.target.value})} className="h-9 px-2 border rounded-lg"/></FieldHelp>:<span className="font-medium">{emp.fullName}</span>}</td><td className="px-3 py-3">{editId===emp.id?<Select value={editData.departmentId} onValueChange={v=>setEditData({...editData,departmentId:v})}><FieldHelp text={"القسم الذي يتبع له الموظف؛ يولد منه كود الموظف ومساره التنظيمي."}><SelectTrigger className="min-w-[220px]"><SelectValue/></SelectTrigger></FieldHelp><SelectContent>{departments.map((d:any)=><SelectItem key={d.id} value={String(d.id)}>{d.code} — {d.name}</SelectItem>)}</SelectContent></Select>:emp.departmentName||"غير محدد"}</td><td className="px-3 py-3 text-xs text-muted-foreground">{emp.locationName && emp.branchName ? `${emp.locationName} / ${emp.branchName}` : "—"}</td><td className="px-3 py-3 text-center">{editId===emp.id?<FieldHelp text={"رقم الموظف في جهاز أو نظام البصمة، للربط والمراجعة عند الحاجة."}><input value={editData.fingerprintId} onChange={e=>setEditData({...editData,fingerprintId:e.target.value})} className="h-9 px-2 border rounded-lg"/></FieldHelp>:emp.fingerprintId||"-"}</td><td className="px-3 py-3 text-center">{editId===emp.id?<FieldHelp text={"رقم هوية الموظف لتمييز بياناته ومنع الالتباس بين الأسماء المتشابهة."}><input value={editData.nationalId} onChange={e=>setEditData({...editData,nationalId:e.target.value})} className="h-9 px-2 border rounded-lg"/></FieldHelp>:emp.nationalId||"-"}</td><td className="px-3 py-3 text-center">{editId===emp.id?<FieldHelp text={"رقم التواصل مع الموظف عند متابعة العهد والأصول المسندة إليه."}><input value={editData.phone} onChange={e=>setEditData({...editData,phone:e.target.value})} className="h-9 px-2 border rounded-lg"/></FieldHelp>:emp.phone||"-"}</td><td className="px-3 py-3"><div className="flex justify-center gap-2">{editId===emp.id?<><button onClick={()=>handleEdit(emp.id)}><Save className="w-4 h-4 text-primary"/></button><button onClick={()=>setEditId(null)}><X className="w-4 h-4"/></button></>:<><button onClick={()=>{setEditId(emp.id);setEditData({fullName:emp.fullName,departmentId:emp.departmentId?String(emp.departmentId):"",fingerprintId:emp.fingerprintId||"",nationalId:emp.nationalId||"",phone:emp.phone||""})}}><Edit className="w-4 h-4"/></button><button onClick={()=>deleteMut.mutate({id:emp.id})}><Trash2 className="w-4 h-4 text-red-400"/></button></>}</div></td></tr>)}</tbody></table></div>
    <PaginationControls page={page} totalItems={filtered.length} onPageChange={setPage} />
    <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-md" dir="rtl"><DialogHeader><DialogTitle>إضافة موظف جديد</DialogTitle></DialogHeader><div className="space-y-3"><FieldHelp text={"الاسم الكامل للموظف الذي سيرتبط بتسليم العهد والأصول وحركاتها."}><input value={newData.fullName} onChange={e=>setNewData({...newData,fullName:e.target.value})} placeholder="اسم الموظف" className="w-full h-10 px-3 border rounded-lg"/></FieldHelp><Select value={newData.departmentId} onValueChange={v=>setNewData({...newData,departmentId:v})}><FieldHelp text={"القسم الذي يتبع له الموظف؛ يولد منه كود الموظف ومساره التنظيمي."}><SelectTrigger><SelectValue placeholder="اختر القسم"/></SelectTrigger></FieldHelp><SelectContent>{departments.map((d:any)=><SelectItem key={d.id} value={String(d.id)}>{d.code} — {d.name}</SelectItem>)}</SelectContent></Select><div className="text-[11px] text-muted-foreground">سيولد كود الموظف تلقائياً من كود القسم المختار.</div><FieldHelp text={"رقم الموظف في جهاز أو نظام البصمة، للربط والمراجعة عند الحاجة."}><input value={newData.fingerprintId} onChange={e=>setNewData({...newData,fingerprintId:e.target.value})} placeholder="رقم البصمة" className="w-full h-10 px-3 border rounded-lg"/></FieldHelp><FieldHelp text={"رقم هوية الموظف لتمييز بياناته ومنع الالتباس بين الأسماء المتشابهة."}><input value={newData.nationalId} onChange={e=>setNewData({...newData,nationalId:e.target.value})} placeholder="رقم الهوية" className="w-full h-10 px-3 border rounded-lg"/></FieldHelp><FieldHelp text={"رقم التواصل مع الموظف عند متابعة العهد والأصول المسندة إليه."}><input value={newData.phone} onChange={e=>setNewData({...newData,phone:e.target.value})} placeholder="رقم الهاتف" className="w-full h-10 px-3 border rounded-lg"/></FieldHelp><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowAdd(false)}>إلغاء</Button><Button onClick={handleAdd}>حفظ الموظف</Button></div></div></DialogContent></Dialog>
  </div>;
}

// ===== تبويب أنواع الاستبعاد =====
function ExclusionTypesTab() {
  const utils = trpc.useUtils();
  const { data: types = [], isLoading } = trpc.settings.exclusionTypes.list.useQuery();
  const createMut = trpc.settings.exclusionTypes.create.useMutation({
    onSuccess: () => { utils.settings.exclusionTypes.list.invalidate(); toast.success("تم إضافة نوع الاستبعاد بنجاح"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.settings.exclusionTypes.delete.useMutation({
    onSuccess: () => { utils.settings.exclusionTypes.list.invalidate(); toast.success("تم حذف نوع الاستبعاد بنجاح"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) { toast.error("يرجى إدخال نوع الاستبعاد"); return; }
    createMut.mutate({ name: newName.trim() }, { onSuccess: () => { setNewName(""); setShowAdd(false); } });
  };

  const handleDelete = (id: number) => { deleteMut.mutate({ id }); };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">أنواع الاستبعاد</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{types.length} نوع</p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> إضافة نوع
        </Button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-right text-[11px] font-bold text-muted-foreground px-4 py-3 w-12">#</th>
              <th className="text-right text-[11px] font-bold text-muted-foreground px-4 py-3">نوع الاستبعاد</th>
              <th className="text-center text-[11px] font-bold text-muted-foreground px-4 py-3 w-28">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t, i) => (
              <tr key={t.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => handleDelete(t.id)} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle className="text-lg font-bold">إضافة نوع استبعاد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">نوع الاستبعاد <span className="text-red-500">*</span></label>
              <FieldHelp text={"اسم سبب أو نوع الاستبعاد الذي سيظهر ضمن خيارات عمليات الاستبعاد."}><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="أدخل نوع الاستبعاد"
                className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                autoFocus onKeyDown={(e) => e.key === "Enter" && handleAdd()} /></FieldHelp>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewName(""); }}>إلغاء</Button>
              <Button onClick={handleAdd} disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== تبويب هوية النظام - لمسؤول النظام فقط =====
function BrandingTab() {
  const utils = trpc.useUtils();
  const { data: branding, isLoading } = trpc.settings.branding.get.useQuery();
  const updateMut = trpc.settings.branding.update.useMutation({
    onSuccess: async () => {
      await utils.settings.branding.get.invalidate();
      toast.success("تم تحديث هوية النظام بنجاح");
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadMut = trpc.upload.image.useMutation();
  const [systemName, setSystemName] = useState("");
  const [systemSubtitle, setSystemSubtitle] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!branding) return;
    setSystemName(branding.systemName);
    setSystemSubtitle(branding.systemSubtitle);
    setLogoUrl(branding.logoUrl ?? null);
  }, [branding]);

  const handleLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("يرجى اختيار ملف صورة"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("حجم الصورة يتجاوز 10 ميجابايت"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await uploadMut.mutateAsync({ base64: String(reader.result), category: "branding" });
        setLogoUrl(result.url);
        toast.success("تم رفع الشعار، اضغط حفظ لتطبيقه");
      } catch (e: any) { toast.error(e?.message || "فشل رفع الشعار"); }
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!systemName.trim()) { toast.error("اسم النظام مطلوب"); return; }
    updateMut.mutate({ systemName: systemName.trim(), systemSubtitle: systemSubtitle.trim(), logoUrl });
  };

  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">جاري تحميل إعدادات الهوية...</div>;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h3 className="text-base font-bold">هوية النظام</h3>
        <p className="text-xs text-muted-foreground mt-1">تغيير الشعار والاسم الظاهر أعلى القائمة الجانبية. هذه الإعدادات متاحة لمسؤول النظام فقط.</p>
      </div>
      <div className="border border-border rounded-xl p-5 space-y-5 bg-card">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-primary/10 border border-border flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? <img src={logoUrl} alt="معاينة الشعار" className="w-full h-full object-cover" /> : <Building2 className="w-9 h-9 text-primary" />}
          </div>
          <div className="space-y-2">
            <FieldHelp text="اختر صورة شعار المؤسسة لتظهر ضمن هوية النظام."><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90">
              {uploadMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              رفع صورة الشعار
              <input type="file" accept="image/*" className="hidden" disabled={uploadMut.isPending} onChange={(e) => handleLogo(e.target.files?.[0])} />
            </label></FieldHelp>
            {logoUrl && <button type="button" onClick={() => setLogoUrl(null)} className="block text-xs text-destructive hover:underline">إزالة الصورة والعودة للأيقونة الافتراضية</button>}
            <p className="text-[11px] text-muted-foreground">تُحوّل الصورة تلقائياً إلى WebP وتحفظ في التخزين السحابي.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">اسم النظام</label>
          <FieldHelp text={"الاسم الذي سيظهر للمستخدمين بوصفه اسم النظام أو المؤسسة."}><input value={systemName} maxLength={150} onChange={(e) => setSystemName(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-muted/30 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="إدارة العهد والأصول" /></FieldHelp>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">الوصف المختصر</label>
          <FieldHelp text={"وصف مختصر يظهر مع اسم النظام لتوضيح غرضه أو هوية المؤسسة."}><input value={systemSubtitle} maxLength={200} onChange={(e) => setSystemSubtitle(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-muted/30 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="نظام سحابي متكامل" /></FieldHelp>
        </div>
        <Button onClick={save} disabled={updateMut.isPending || uploadMut.isPending} className="gap-2">
          {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ الهوية
        </Button>
      </div>
    </div>
  );
}

// ===== تبويب النسخ الاحتياطي =====
function BackupTab() {
  const utils = trpc.useUtils();
  const { data: backups = [], isLoading: loadingList } = trpc.backup.list.useQuery();

  const createMut = trpc.backup.create.useMutation({
    onSuccess: (data) => {
      utils.backup.list.invalidate();
      toast.success(`تم إنشاء النسخة الاحتياطية بنجاح (${data.totalRecords} سجل)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const restoreMut = trpc.backup.restore.useMutation({
    onSuccess: (data) => {
      toast.success(`تم استعادة النسخة الاحتياطية بنجاح (${data.restored} سجل)`);
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} أخطاء أثناء الاستعادة`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRestore = () => {
    const input = document.createElement("input");
    input.type = "file";
    // قبول ملفات .tln فقط (الامتداد الجديد)
    input.accept = ".tln";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!confirm("تحذير: سيتم حذف جميع البيانات الحالية واستبدالها بالنسخة الاحتياطية. هل أنت متأكد؟")) return;
      const reader = new FileReader();
      reader.onload = () => {
        // قراءة الملف كـ ArrayBuffer ثم تحويله إلى Base64
        const arrayBuffer = reader.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        uint8Array.forEach(byte => binary += String.fromCharCode(byte));
        const base64 = btoa(binary);
        restoreMut.mutate({ base64Data: base64 });
      };
      // قراءة كـ ArrayBuffer لدعم المحتوى الثنائي
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  // تحويل اسم الملف إلى عرض ودي (backup-2025-01-15T10-30-00.tln → نسخة 15 يناير 2025 الساعة 10:30)
  const formatFriendlyName = (fileName: string, createdAt: any) => {
    if (createdAt) {
      const date = new Date(createdAt);
      return `نسخة ${date.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })} الساعة ${date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return "نسخة احتياطية";
  };

  const handleDownloadBackup = (url: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = url;
    // تأكد أن الامتداد .tln
    const downloadName = fileName.endsWith(".tln") ? fileName : fileName.replace(".json", ".tln");
    a.download = downloadName;
    a.target = "_blank";
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-foreground">النسخ الاحتياطي</h3>
        <p className="text-xs text-muted-foreground mt-0.5">إنشاء واستعادة نسخ احتياطية لقاعدة البيانات</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-border rounded-xl p-6 text-center space-y-4 hover:border-primary/30 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto">
            <Download className="w-7 h-7 text-teal-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">إنشاء نسخة احتياطية</h4>
            <p className="text-xs text-muted-foreground mt-1">حفظ نسخة من قاعدة البيانات الحالية</p>
          </div>
          <Button className="w-full gap-2" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {createMut.isPending ? "جاري الإنشاء..." : "إنشاء نسخة الآن"}
          </Button>
        </div>

        <div className="border border-border rounded-xl p-6 text-center space-y-4 hover:border-primary/30 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
            <Upload className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">استعادة نسخة احتياطية</h4>
            <p className="text-xs text-muted-foreground mt-1">استعادة قاعدة البيانات من نسخة سابقة</p>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={handleRestore} disabled={restoreMut.isPending}>
            {restoreMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {restoreMut.isPending ? "جاري الاستعادة..." : "استعادة نسخة"}
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl p-4">
        <h4 className="text-xs font-bold text-foreground mb-3">النسخ الاحتياطية السابقة</h4>
        {loadingList ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-xs">لا توجد نسخ احتياطية سابقة</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                    <Database className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {formatFriendlyName(b.fileName, b.createdAt)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {b.totalRecords} سجل • {b.createdBy} • {b.createdAt ? new Date(b.createdAt).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                    <p className="text-[9px] text-muted-foreground/50 font-mono mt-0.5">{b.fileName}</p>
                  </div>
                </div>
                {b.url && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleDownloadBackup(b.url, b.fileName)}>
                    <Download className="w-3.5 h-3.5" /> تحميل
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
