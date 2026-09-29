/*
 * Design: Calm Luxury - إدارة الموظفين
 * الحقول: الاسم، رقم البصمة، رقم الهوية، رقم الهاتف
 */
import DashboardLayout from "@/components/DashboardLayout";
import DataTable from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Employee, sampleEmployees } from "@/lib/data";
import { Edit, Eye, Fingerprint, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Employees() {
  const [employees] = useState<Employee[]>(sampleEmployees);
  const [showAdd, setShowAdd] = useState(false);
  const [showView, setShowView] = useState<Employee | null>(null);

  const columns = [
    {
      key: "full_name",
      label: "اسم الموظف",
      render: (e: Employee) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-medium">{e.full_name}</span>
        </div>
      ),
    },
    { key: "fingerprint_id", label: "رقم البصمة", className: "font-mono text-xs font-bold text-primary" as string },
    { key: "national_id", label: "رقم الهوية", className: "font-mono text-xs" as string },
    { key: "phone", label: "رقم الهاتف", className: "font-mono text-xs" as string },
  ];

  return (
    <DashboardLayout
      title="إدارة الموظفين"
      subtitle={`${employees.length} موظف`}
      actions={
        <div className="flex items-center gap-2 w-full justify-end">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />
            إضافة موظف
          </Button>
        </div>
      }
    >
      <DataTable
        data={employees}
        columns={columns}
        searchKey="full_name"
        searchPlaceholder="بحث بالاسم أو رقم البصمة أو الهوية..."
        onRowClick={(e) => setShowView(e)}
        actions={(e) => (
          <div className="flex items-center justify-center gap-1">
            <button onClick={(ev) => { ev.stopPropagation(); setShowView(e); }} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors">
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={(ev) => { ev.stopPropagation(); toast.info("ميزة قيد التطوير"); }} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors">
              <Edit className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={(ev) => { ev.stopPropagation(); toast.info("ميزة قيد التطوير"); }} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center transition-colors">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        )}
      />

      {/* عرض تفاصيل الموظف */}
      <Dialog open={!!showView} onOpenChange={() => setShowView(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle className="text-lg font-bold">تفاصيل الموظف</DialogTitle></DialogHeader>
          {showView && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-lg">{showView.full_name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Fingerprint className="w-3 h-3" />
                    بصمة: {showView.fingerprint_id}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="اسم الموظف" value={showView.full_name} />
                <InfoField label="رقم البصمة" value={showView.fingerprint_id} />
                <InfoField label="رقم الهوية" value={showView.national_id} />
                <InfoField label="رقم الهاتف" value={showView.phone} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* إضافة موظف جديد */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-lg font-bold">إضافة موظف جديد</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.success("تم إضافة الموظف بنجاح"); setShowAdd(false); }}>
            <FormField label="اسم الموظف" placeholder="أدخل اسم الموظف الكامل" required />
            <FormField label="رقم البصمة" placeholder="أدخل رقم البصمة" required />
            <FormField label="رقم الهوية" placeholder="أدخل رقم الهوية" required />
            <FormField label="رقم الهاتف" placeholder="05XXXXXXXX" type="tel" required />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
              <Button type="submit">حفظ الموظف</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-muted/20 rounded-lg">
      <span className="text-[11px] font-bold text-muted-foreground block mb-1">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function FormField({ label, placeholder, type = "text", required = false }: { label: string; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-foreground">{label} {required && <span className="text-red-500">*</span>}</label>
      <input
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
      />
    </div>
  );
}
