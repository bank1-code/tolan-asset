/*
 * Design: Calm Luxury - الإعدادات
 * المواقع + الأقسام + الموظفين + أنواع الاستبعاد + النسخ الاحتياطي
 * مربوط بقاعدة البيانات عبر tRPC
 */
import DashboardLayout from "@/components/DashboardLayout";
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

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const isOwner = user?.role === "owner";
  return (
    <DashboardLayout title="الإعدادات" subtitle="إدارة المواقع والأقسام والموظفين وأنواع الاستبعاد">
      <Tabs defaultValue="locations" dir="rtl">
        <TabsList className="bg-muted/50 p-1 rounded-xl mb-6 h-auto flex-wrap">
          <TabsTrigger value="locations" className="rounded-lg text-xs px-4 py-2 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <MapPin className="w-3.5 h-3.5" /> المواقع
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
        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="employees"><EmployeesTab /></TabsContent>
        <TabsContent value="exclusion_types"><ExclusionTypesTab /></TabsContent>
        {isOwner && <TabsContent value="backup"><BackupTab /></TabsContent>}
        {isOwner && <TabsContent value="branding"><BrandingTab /></TabsContent>}
      </Tabs>
    </DashboardLayout>
  );
}

// ===== تبويب المواقع =====
function LocationsTab() {
  const utils = trpc.useUtils();
  const { data: locations = [], isLoading } = trpc.settings.locations.list.useQuery();
  const createMut = trpc.settings.locations.create.useMutation({
    onSuccess: () => { utils.settings.locations.list.invalidate(); toast.success("تم إضافة الموقع بنجاح"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.settings.locations.update.useMutation({
    onSuccess: () => { utils.settings.locations.list.invalidate(); toast.success("تم تعديل الموقع بنجاح"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.settings.locations.delete.useMutation({
    onSuccess: () => { utils.settings.locations.list.invalidate(); toast.success("تم حذف الموقع بنجاح"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) { toast.error("يرجى إدخال اسم الموقع"); return; }
    createMut.mutate({ name: newName.trim() }, { onSuccess: () => { setNewName(""); setShowAdd(false); } });
  };

  const handleEdit = (id: number) => {
    if (!editName.trim()) { toast.error("يرجى إدخال اسم الموقع"); return; }
    updateMut.mutate({ id, name: editName.trim() }, { onSuccess: () => setEditId(null) });
  };

  const handleDelete = (id: number) => { deleteMut.mutate({ id }); };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">المواقع</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{locations.length} موقع</p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> إضافة موقع
        </Button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-right text-[11px] font-bold text-muted-foreground px-4 py-3 w-12">#</th>
              <th className="text-right text-[11px] font-bold text-muted-foreground px-4 py-3">اسم الموقع</th>
              <th className="text-center text-[11px] font-bold text-muted-foreground px-4 py-3 w-28">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc, i) => (
              <tr key={loc.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3">
                  {editId === loc.id ? (
                    <div className="flex items-center gap-2">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 h-8 px-3 rounded-lg bg-muted/40 border border-primary/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        autoFocus onKeyDown={(e) => e.key === "Enter" && handleEdit(loc.id)} />
                      <button onClick={() => handleEdit(loc.id)} className="w-7 h-7 rounded-md bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors">
                        <Save className="w-3.5 h-3.5 text-primary" />
                      </button>
                      <button onClick={() => setEditId(null)} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors">
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                        <MapPin className="w-3.5 h-3.5 text-teal-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{loc.name}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editId !== loc.id && (
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => { setEditId(loc.id); setEditName(loc.name); }} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors">
                        <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(loc.id)} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle className="text-lg font-bold">إضافة موقع جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">اسم الموقع <span className="text-red-500">*</span></label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="أدخل اسم الموقع"
                className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                autoFocus onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewName(""); }}>إلغاء</Button>
              <Button onClick={handleAdd} disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ الموقع"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== تبويب الأقسام =====
function DepartmentsTab() {
  const utils = trpc.useUtils();
  const { data: depts = [], isLoading } = trpc.settings.departments.list.useQuery();
  const { data: locations = [] } = trpc.settings.locations.list.useQuery();
  const createMut = trpc.settings.departments.create.useMutation({ onSuccess: () => { utils.settings.departments.list.invalidate(); toast.success("تم إضافة القسم بنجاح"); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.settings.departments.update.useMutation({ onSuccess: () => { utils.settings.departments.list.invalidate(); toast.success("تم تعديل القسم بنجاح"); }, onError: (e) => toast.error(e.message) });
  const deleteMut = trpc.settings.departments.delete.useMutation({ onSuccess: () => { utils.settings.departments.list.invalidate(); toast.success("تم حذف القسم بنجاح"); }, onError: (e) => toast.error(e.message) });
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [newName, setNewName] = useState("");
  const [newLocationId, setNewLocationId] = useState("");

  const handleAdd = () => {
    if (!newName.trim() || !newLocationId) return toast.error("يرجى إدخال اسم القسم واختيار الموقع");
    createMut.mutate({ name: newName.trim(), locationId: Number(newLocationId) }, { onSuccess: () => { setNewName(""); setNewLocationId(""); setShowAdd(false); } });
  };
  const handleEdit = (id: number) => {
    if (!editName.trim() || !editLocationId) return toast.error("يرجى إدخال اسم القسم واختيار الموقع");
    updateMut.mutate({ id, name: editName.trim(), locationId: Number(editLocationId) }, { onSuccess: () => setEditId(null) });
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">الأقسام</h3><p className="text-xs text-muted-foreground">كل قسم مرتبط بموقع محدد</p></div><Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5 ml-1" />إضافة قسم</Button></div>
    <div className="border border-border rounded-xl overflow-hidden"><table className="w-full"><thead><tr className="bg-muted/30"><th className="text-right text-xs px-4 py-3">القسم</th><th className="text-right text-xs px-4 py-3">الموقع</th><th className="text-center text-xs px-4 py-3">الإجراءات</th></tr></thead><tbody>
      {depts.map((dept) => <tr key={dept.id} className="border-t border-border/50"><td className="px-4 py-3">{editId === dept.id ? <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full h-9 px-3 rounded-lg border bg-muted/30" /> : <span className="text-sm font-medium">{dept.name}</span>}</td><td className="px-4 py-3">{editId === dept.id ? <Select value={editLocationId} onValueChange={setEditLocationId}><SelectTrigger><SelectValue placeholder="اختر الموقع" /></SelectTrigger><SelectContent>{locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent></Select> : <span className="text-sm">{dept.locationName || "غير محدد"}</span>}</td><td className="px-4 py-3"><div className="flex justify-center gap-1">{editId === dept.id ? <><button onClick={() => handleEdit(dept.id)} className="w-7 h-7 flex items-center justify-center"><Save className="w-4 h-4 text-primary" /></button><button onClick={() => setEditId(null)} className="w-7 h-7 flex items-center justify-center"><X className="w-4 h-4" /></button></> : <><button onClick={() => { setEditId(dept.id); setEditName(dept.name); setEditLocationId(dept.locationId ? String(dept.locationId) : ""); }} className="w-7 h-7 flex items-center justify-center"><Edit className="w-4 h-4" /></button><button onClick={() => deleteMut.mutate({ id: dept.id })} className="w-7 h-7 flex items-center justify-center"><Trash2 className="w-4 h-4 text-red-400" /></button></>}</div></td></tr>)}
    </tbody></table></div>
    <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-sm" dir="rtl"><DialogHeader><DialogTitle>إضافة قسم جديد</DialogTitle></DialogHeader><div className="space-y-4"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم القسم" className="w-full h-10 px-3 rounded-lg border bg-muted/30" /><Select value={newLocationId} onValueChange={setNewLocationId}><SelectTrigger><SelectValue placeholder="اختر الموقع" /></SelectTrigger><SelectContent>{locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent></Select><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button><Button onClick={handleAdd}>حفظ القسم</Button></div></div></DialogContent></Dialog>
  </div>;
}

// ===== تبويب الموظفين =====
function EmployeesTab() {
  const utils = trpc.useUtils();
  const { data: employees = [], isLoading } = trpc.settings.employees.list.useQuery();
  const { data: departments = [] } = trpc.settings.departments.list.useQuery();
  const createMut = trpc.settings.employees.create.useMutation({ onSuccess: () => { utils.settings.employees.list.invalidate(); toast.success("تم إضافة الموظف بنجاح"); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.settings.employees.update.useMutation({ onSuccess: () => { utils.settings.employees.list.invalidate(); toast.success("تم تعديل بيانات الموظف بنجاح"); }, onError: (e) => toast.error(e.message) });
  const deleteMut = trpc.settings.employees.delete.useMutation({ onSuccess: () => { utils.settings.employees.list.invalidate(); toast.success("تم حذف الموظف بنجاح"); }, onError: (e) => toast.error(e.message) });
  const empty = { fullName: "", departmentId: "", fingerprintId: "", nationalId: "", phone: "" };
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [newData, setNewData] = useState(empty);
  const [editData, setEditData] = useState(empty);
  const [searchQuery, setSearchQuery] = useState("");
  const filtered = employees.filter((e) => !searchQuery.trim() || `${e.fullName} ${e.departmentName || ""} ${e.locationName || ""} ${e.fingerprintId || ""}`.toLowerCase().includes(searchQuery.toLowerCase()));
  const payload = (d: typeof empty) => ({ fullName: d.fullName.trim(), departmentId: Number(d.departmentId), fingerprintId: d.fingerprintId.trim() || null, nationalId: d.nationalId.trim() || null, phone: d.phone.trim() || null });
  const handleAdd = () => { if (!newData.fullName.trim() || !newData.departmentId) return toast.error("يرجى إدخال اسم الموظف واختيار القسم"); createMut.mutate(payload(newData), { onSuccess: () => { setNewData(empty); setShowAdd(false); } }); };
  const handleEdit = (id: number) => { if (!editData.fullName.trim() || !editData.departmentId) return toast.error("يرجى إدخال اسم الموظف واختيار القسم"); updateMut.mutate({ id, ...payload(editData) }, { onSuccess: () => setEditId(null) }); };
  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">الموظفين</h3><p className="text-xs text-muted-foreground">الموقع يُحدد تلقائياً من القسم</p></div><Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5 ml-1" />إضافة موظف</Button></div>
    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث..." className="w-full h-9 px-3 rounded-lg border bg-muted/30" />
    <div className="border border-border rounded-xl overflow-hidden"><table className="w-full"><thead><tr className="bg-muted/30"><th className="text-right text-xs px-3 py-3">الموظف</th><th className="text-right text-xs px-3 py-3">القسم</th><th className="text-right text-xs px-3 py-3">الموقع</th><th className="text-center text-xs px-3 py-3">البصمة</th><th className="text-center text-xs px-3 py-3">الإجراءات</th></tr></thead><tbody>{filtered.map((emp) => <tr key={emp.id} className="border-t border-border/50"><td className="px-3 py-3">{editId === emp.id ? <input value={editData.fullName} onChange={(e) => setEditData({ ...editData, fullName: e.target.value })} className="h-9 px-2 border rounded-lg" /> : emp.fullName}</td><td className="px-3 py-3">{editId === emp.id ? <Select value={editData.departmentId} onValueChange={(v) => setEditData({ ...editData, departmentId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name} - {d.locationName || "بدون موقع"}</SelectItem>)}</SelectContent></Select> : emp.departmentName || "غير محدد"}</td><td className="px-3 py-3">{emp.locationName || "غير محدد"}</td><td className="px-3 py-3 text-center">{emp.fingerprintId || "-"}</td><td className="px-3 py-3"><div className="flex justify-center gap-1">{editId === emp.id ? <><button onClick={() => handleEdit(emp.id)}><Save className="w-4 h-4 text-primary" /></button><button onClick={() => setEditId(null)}><X className="w-4 h-4" /></button></> : <><button onClick={() => { setEditId(emp.id); setEditData({ fullName: emp.fullName, departmentId: emp.departmentId ? String(emp.departmentId) : "", fingerprintId: emp.fingerprintId || "", nationalId: emp.nationalId || "", phone: emp.phone || "" }); }}><Edit className="w-4 h-4" /></button><button onClick={() => deleteMut.mutate({ id: emp.id })}><Trash2 className="w-4 h-4 text-red-400" /></button></>}</div></td></tr>)}</tbody></table></div>
    <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-md" dir="rtl"><DialogHeader><DialogTitle>إضافة موظف جديد</DialogTitle></DialogHeader><div className="space-y-3"><input value={newData.fullName} onChange={(e) => setNewData({ ...newData, fullName: e.target.value })} placeholder="اسم الموظف" className="w-full h-10 px-3 border rounded-lg" /><Select value={newData.departmentId} onValueChange={(v) => setNewData({ ...newData, departmentId: v })}><SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger><SelectContent>{departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name} - {d.locationName || "بدون موقع"}</SelectItem>)}</SelectContent></Select><input value={newData.fingerprintId} onChange={(e) => setNewData({ ...newData, fingerprintId: e.target.value })} placeholder="رقم البصمة" className="w-full h-10 px-3 border rounded-lg" /><input value={newData.nationalId} onChange={(e) => setNewData({ ...newData, nationalId: e.target.value })} placeholder="رقم الهوية" className="w-full h-10 px-3 border rounded-lg" /><input value={newData.phone} onChange={(e) => setNewData({ ...newData, phone: e.target.value })} placeholder="رقم الهاتف" className="w-full h-10 px-3 border rounded-lg" /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button><Button onClick={handleAdd}>حفظ الموظف</Button></div></div></DialogContent></Dialog>
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
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="أدخل نوع الاستبعاد"
                className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                autoFocus onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
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
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90">
              {uploadMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              رفع صورة الشعار
              <input type="file" accept="image/*" className="hidden" disabled={uploadMut.isPending} onChange={(e) => handleLogo(e.target.files?.[0])} />
            </label>
            {logoUrl && <button type="button" onClick={() => setLogoUrl(null)} className="block text-xs text-destructive hover:underline">إزالة الصورة والعودة للأيقونة الافتراضية</button>}
            <p className="text-[11px] text-muted-foreground">تُحوّل الصورة تلقائياً إلى WebP وتحفظ في التخزين السحابي.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">اسم النظام</label>
          <input value={systemName} maxLength={150} onChange={(e) => setSystemName(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-muted/30 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="إدارة العهد والأصول" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">الوصف المختصر</label>
          <input value={systemSubtitle} maxLength={200} onChange={(e) => setSystemSubtitle(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-muted/30 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="نظام سحابي متكامل" />
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
