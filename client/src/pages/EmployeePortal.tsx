import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Box, HandCoins, Loader2, MapPin, Building2 } from "lucide-react";

export default function EmployeePortal() {
  const { data: assets = [], isLoading: loadingAssets } = trpc.inventory.assets.list.useQuery();
  const { data: custody = [], isLoading: loadingCustody } = trpc.inventory.custody.list.useQuery();
  const loading = loadingAssets || loadingCustody;

  return (
    <DashboardLayout title="أصولي وعهدي" subtitle="العناصر المسجلة على حسابك فقط">
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          <Section title="الأصول المسجلة باسمي" icon={<Box className="w-5 h-5 text-primary" />} items={assets.map((a) => ({ id: a.id, name: a.assetName, code: a.assetCode, quantity: a.quantity, departmentName: a.departmentName, locationName: a.locationName, condition: a.condition, status: a.status }))} />
          <Section title="العهد المسجلة باسمي" icon={<HandCoins className="w-5 h-5 text-primary" />} items={custody.map((c) => ({ id: c.id, name: c.name, code: c.code, quantity: c.quantity, departmentName: c.departmentName, locationName: c.locationName, condition: c.condition, status: c.status }))} />
        </div>
      )}
    </DashboardLayout>
  );
}

function Section({ title, icon, items }: { title: string; icon: React.ReactNode; items: any[] }) {
  return <section className="space-y-3"><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div><div><h3 className="font-bold text-sm">{title}</h3><p className="text-xs text-muted-foreground">{items.length} عنصر</p></div></div>
    {items.length === 0 ? <div className="border border-dashed rounded-xl py-10 text-center text-sm text-muted-foreground">لا توجد عناصر مسجلة باسمك حالياً</div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{items.map((item) => <div key={item.id} className="rounded-xl border bg-card p-4 space-y-2"><div className="flex items-start justify-between gap-2"><div><h4 className="font-bold text-sm">{item.name}</h4><p className="text-[11px] font-mono text-muted-foreground">{item.code || `#${item.id}`}</p></div><span className="text-[11px] px-2 py-1 rounded-full bg-muted">{item.status}</span></div><div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">الكمية: </span>{item.quantity}</div><div><span className="text-muted-foreground">الحالة: </span>{item.condition || "-"}</div></div><div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.departmentName || "-"}</span><span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.locationName || "-"}</span></div></div>)}</div>}
  </section>;
}
