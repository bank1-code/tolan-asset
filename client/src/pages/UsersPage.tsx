import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Edit, Eye, EyeOff, Loader2, Plus, ShieldCheck, Trash2, User, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Role = "owner" | "admin" | "accountant" | "employee";

const roleLabel: Record<Role, string> = {
  owner: "المالك",
  admin: "مدير النظام",
  accountant: "المحاسب",
  employee: "الموظف",
};

export default function UsersPage() {
  const utils = trpc.useUtils();
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = trpc.localAuth.listUsers.useQuery();
  const { data: employees = [] } = trpc.settings.employees.list.useQuery();

  const createMut = trpc.localAuth.createUser.useMutation({
    onSuccess: () => { utils.localAuth.listUsers.invalidate(); toast.success("تم إضافة المستخدم بنجاح"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.localAuth.updateUser.useMutation({
    onSuccess: () => { utils.localAuth.listUsers.invalidate(); toast.success("تم تعديل المستخدم بنجاح"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.localAuth.deleteUser.useMutation({
    onSuccess: () => { utils.localAuth.listUsers.invalidate(); toast.success("تم حذف المستخدم بنجاح"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("accountant");
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("accountant");
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const roleOptions: Role[] = currentUser?.role === "owner"
    ? ["owner", "admin", "accountant", "employee"]
    : ["admin", "accountant", "employee"];

  const handleAdd = () => {
    if (!newName.trim()) return toast.error("يرجى إدخال الاسم");
    if (!newUsername.trim()) return toast.error("يرجى إدخال اسم المستخدم");
    if (newPassword.length < 4) return toast.error("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
    if (newRole === "employee" && !newEmployeeId) return toast.error("يرجى اختيار الموظف المرتبط بالحساب");
    createMut.mutate({
      name: newName.trim(), username: newUsername.trim(), password: newPassword, role: newRole,
      employeeId: newRole === "employee" ? Number(newEmployeeId) : null,
    }, { onSuccess: () => {
      setShowAdd(false); setNewName(""); setNewUsername(""); setNewPassword(""); setNewRole("accountant"); setNewEmployeeId("");
    }});
  };

  const handleEdit = () => {
    if (!editUser) return;
    if (editRole === "employee" && !editEmployeeId) return toast.error("يرجى اختيار الموظف المرتبط بالحساب");
    const data: any = { id: editUser.id, employeeId: editRole === "employee" ? Number(editEmployeeId) : null };
    if (editName.trim() && editName !== editUser.name) data.name = editName.trim();
    if (editRole !== editUser.role) data.role = editRole;
    if (editPassword.trim()) data.password = editPassword;
    updateMut.mutate(data, { onSuccess: () => { setShowEdit(false); setEditUser(null); setEditPassword(""); } });
  };

  const openEdit = (u: any) => {
    setEditUser(u); setEditName(u.name || ""); setEditRole(u.role); setEditEmployeeId(u.employeeId ? String(u.employeeId) : ""); setEditPassword(""); setShowEdit(true);
  };

  const canModify = (u: any) => currentUser?.role === "owner" || u.role !== "owner";

  return (
    <DashboardLayout title="إدارة المستخدمين" subtitle="إدارة الحسابات والأدوار والربط بالموظفين" actions={
      <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5" />إضافة مستخدم</Button>
    }>
      {isLoading ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => (
            <div key={u.id} className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div><div><h3 className="text-sm font-bold">{u.name || "بدون اسم"}</h3><p className="text-[11px] text-muted-foreground font-mono">@{u.username}</p></div></div>
                {canModify(u) && <div className="flex items-center gap-1"><button onClick={() => openEdit(u)} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center"><Edit className="w-3.5 h-3.5" /></button>{u.id !== currentUser?.id && u.role !== "owner" && <button onClick={() => confirm(`هل أنت متأكد من حذف المستخدم "${u.name || u.username}"؟`) && deleteMut.mutate({ id: u.id })} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}</div>}
              </div>
              <div className="space-y-2 text-xs text-muted-foreground"><div className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /><span>الدور:</span><span className="font-bold text-foreground">{roleLabel[u.role as Role] || u.role}</span></div>{u.employeeName && <div>الموظف المرتبط: <span className="font-bold text-foreground">{u.employeeName}</span></div>}</div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-lg" dir="rtl"><DialogHeader><DialogTitle>إضافة مستخدم جديد</DialogTitle></DialogHeader><div className="space-y-4">
        <Field label="الاسم الكامل" value={newName} onChange={setNewName} />
        <Field label="اسم المستخدم" value={newUsername} onChange={setNewUsername} />
        <div className="space-y-1.5"><label className="text-xs font-bold">كلمة المرور</label><div className="relative"><input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full h-10 px-3 pl-10 rounded-lg bg-muted/40 border border-border text-sm" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
        <RoleSelect value={newRole} onChange={(r) => { setNewRole(r); if (r !== "employee") setNewEmployeeId(""); }} options={roleOptions} />
        {newRole === "employee" && <EmployeeSelect value={newEmployeeId} onChange={setNewEmployeeId} employees={employees} />}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button><Button onClick={handleAdd} disabled={createMut.isPending}>حفظ المستخدم</Button></div>
      </div></DialogContent></Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}><DialogContent className="max-w-lg" dir="rtl"><DialogHeader><DialogTitle>تعديل المستخدم</DialogTitle></DialogHeader><div className="space-y-4">
        <Field label="الاسم الكامل" value={editName} onChange={setEditName} />
        <RoleSelect value={editRole} onChange={(r) => { setEditRole(r); if (r !== "employee") setEditEmployeeId(""); }} options={roleOptions} disabled={editUser?.role === "owner" && currentUser?.role !== "owner"} />
        {editRole === "employee" && <EmployeeSelect value={editEmployeeId} onChange={setEditEmployeeId} employees={employees} />}
        <div className="space-y-1.5"><label className="text-xs font-bold flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" />تغيير كلمة المرور (اختياري)</label><input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm" /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowEdit(false)}>إلغاء</Button><Button onClick={handleEdit} disabled={updateMut.isPending}>حفظ التعديلات</Button></div>
      </div></DialogContent></Dialog>
    </DashboardLayout>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className="space-y-1.5"><label className="text-xs font-bold">{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm" /></div>;
}
function RoleSelect({ value, onChange, options, disabled }: { value: Role; onChange: (r: Role) => void; options: Role[]; disabled?: boolean }) {
  return <div className="space-y-1.5"><label className="text-xs font-bold">الدور</label><Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map((r) => <SelectItem key={r} value={r}>{roleLabel[r]}</SelectItem>)}</SelectContent></Select></div>;
}
function EmployeeSelect({ value, onChange, employees }: { value: string; onChange: (v: string) => void; employees: any[] }) {
  return <div className="space-y-1.5"><label className="text-xs font-bold">ربط الحساب بالموظف</label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger><SelectContent>{employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>)}</SelectContent></Select></div>;
}
