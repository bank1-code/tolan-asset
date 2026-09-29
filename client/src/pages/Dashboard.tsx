/*
 * Design: Calm Luxury - لوحة التحكم
 * بطاقات إحصائيات + رسوم بيانية + بطاقات NFC
 * مربوطة بالـ API الحقيقي عبر tRPC
 */
import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { IMAGE_URLS } from "@/lib/data";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  HandCoins,
  Loader2,
  MapPin,
  Users,
  ScanLine,
  Wifi,
  X,
  Search,
  Building2,
  User,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Package,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { toast } from "sonner";
import { useLocation } from "wouter";



// ---- Quick NFC Card for Owner ----
function QuickNFCCardForOwner() {
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const nfcRef = useRef<any>(null);

  const { data: result, isLoading } = trpc.inventoryCount.lookupByCode.useQuery(
    { code: lookupCode! },
    { enabled: !!lookupCode }
  );

  const startNFCScan = async () => {
    setIsScanning(true);
    setLookupCode(null);
    if ("NDEFReader" in window) {
      try {
        const ndef = new (window as any).NDEFReader();
        nfcRef.current = ndef;
        await ndef.scan();
        toast.success("NFC جاهز — قرّب الرقاقة من الجهاز");
        ndef.onreading = (event: any) => {
          const decoder = new TextDecoder();
          for (const record of event.message.records) {
            const code = decoder.decode(record.data).trim();
            setLookupCode(code);
            setIsScanning(false);
            nfcRef.current = null;
            break;
          }
        };
      } catch {
        toast.error("تعذّر تفعيل NFC");
        setIsScanning(false);
      }
    } else {
      toast.warning("Web NFC غير مدعوم على هذا الجهاز");
      setIsScanning(false);
    }
  };

  const stopScan = () => { setIsScanning(false); nfcRef.current = null; };
  const clearResult = () => setLookupCode(null);

  const statusInfo = (status: string | null) => {
    switch (status) {
      case "ACTIVE": return { label: "نشط", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
      case "EXCLUDED": return { label: "مستبعد", cls: "bg-red-100 text-red-700 border-red-200" };
      case "TRANSFERRED": return { label: "منقول", cls: "bg-blue-100 text-blue-700 border-blue-200" };
      default: return { label: status ?? "—", cls: "bg-muted text-muted-foreground" };
    }
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 p-6 shadow-[0_4px_20px_rgba(217,119,6,0.12)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <ScanLine className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-base font-bold text-amber-900">استعراض سريع</h3>
          <p className="text-xs text-amber-700">امسح رقاقة NFC مباشرةً</p>
        </div>
      </div>

      {/* Scan Button */}
      {!lookupCode && !isScanning && (
        <Button
          onClick={startNFCScan}
          size="lg"
          className="w-full gap-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-bold h-12 text-base shadow-lg"
        >
          <Wifi className="w-5 h-5" />
          مسح NFC الآن
        </Button>
      )}

      {/* Scanning State */}
      {isScanning && (
        <div className="space-y-3">
          <Button
            onClick={stopScan}
            size="lg"
            variant="destructive"
            className="w-full gap-2 h-12 text-base font-bold"
          >
            <X className="w-5 h-5" />
            إيقاف المسح
          </Button>
          <div className="flex items-center justify-center gap-2 py-4 text-amber-700 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            <span className="text-sm font-semibold">قرّب الرقاقة من الجهاز...</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          <p className="text-sm text-amber-700 font-medium">جاري البحث...</p>
        </div>
      )}

      {/* Not Found */}
      {result && !result.found && (
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-700 text-sm">لم يتم العثور على العنصر</p>
              <p className="text-xs text-red-600 mt-1">الرمز "<span className="font-mono">{lookupCode}</span>" غير موجود</p>
            </div>
          </div>
          <Button onClick={clearResult} variant="outline" className="w-full">
            محاولة مرة أخرى
          </Button>
        </div>
      )}

      {/* Result */}
      {result && result.found && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-amber-100 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge
                    variant="outline"
                    className={result.entityType === "asset" ? "text-xs border-blue-300 text-blue-700 bg-blue-50" : "text-xs border-amber-300 text-amber-700 bg-amber-50"}
                  >
                    {result.entityType === "asset" ? "أصل" : "عهدة"}
                  </Badge>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${statusInfo(result.status).cls}`}>
                    {statusInfo(result.status).label}
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">{result.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{result.code}</p>
              </div>
              <button onClick={clearResult} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Details */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {result.departmentName && (
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px] mb-0.5">القسم</p>
                  <p className="font-semibold text-foreground truncate">{result.departmentName}</p>
                </div>
              )}
              {result.assignedToName && (
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px] mb-0.5">المسؤول</p>
                  <p className="font-semibold text-foreground truncate">{result.assignedToName}</p>
                </div>
              )}
              {result.condition && (
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px] mb-0.5">الحالة</p>
                  <p className="font-semibold text-foreground truncate">{result.condition}</p>
                </div>
              )}
              {result.assetValue && (
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground text-[10px] mb-0.5">القيمة</p>
                  <p className="font-semibold text-foreground truncate">{Number(result.assetValue).toLocaleString("ar-SA")} ر.س</p>
                </div>
              )}
            </div>

            {/* Images */}
            {(result.assetImagePath || result.invoiceImagePath) && (
              <div className="flex gap-2">
                {result.assetImagePath && (
                  <img src={result.assetImagePath} alt="صورة المعدة" className="w-12 h-12 rounded-lg object-cover border" />
                )}
                {result.invoiceImagePath && (
                  <img src={result.invoiceImagePath} alt="صورة الفاتورة" className="w-12 h-12 rounded-lg object-cover border" />
                )}
              </div>
            )}
          </div>

          <Button onClick={clearResult} variant="outline" className="w-full">
            مسح آخر
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Main Dashboard ----
export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.records.reports.dashboard.useQuery();


  const totalAssets = stats?.assets?.count || 0;
  const totalCustody = stats?.custody?.count || 0;
  const totalAssetsValue = parseFloat(String(stats?.assets?.totalValue || "0"));
  const totalCustodyValue = parseFloat(String(stats?.custody?.totalValue || "0"));
  const activeAssets = Number(stats?.assets?.activeCount || 0);
  const excludedAssets = Number(stats?.assets?.excludedCount || 0);
  const partialExcluded = Math.max(0, totalAssets - activeAssets - excludedAssets);
  const totalEmployees = stats?.employeeCount || 0;
  const totalDepartments = stats?.departmentCount || 0;
  const totalLocations = stats?.locationCount || 0;

  const pieData = [
    { name: "نشط", value: activeAssets || 1, color: "#0D9488" },
    { name: "مستبعد جزئياً", value: partialExcluded, color: "#D4A574" },
    { name: "مستبعد كلياً", value: excludedAssets, color: "#EF4444" },
  ].filter(d => d.value > 0);



  if (isLoading) {
    return (
      <DashboardLayout title="لوحة التحكم" subtitle="نظرة عامة على النظام">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="لوحة التحكم" subtitle="نظرة عامة على النظام">
      {/* Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden mb-6 h-44">
        <img
          src={IMAGE_URLS.heroDashboard}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[#0D9488]/80 to-[#0D9488]/40" />
        <div className="relative z-10 flex items-center h-full px-8">
          <div>
            <h2 className="text-2xl font-extrabold text-white mb-1">
              مرحباً بك في نظام إدارة العهد والأصول
            </h2>
            <p className="text-sm text-white/80">
              لديك <span className="font-bold text-white">{totalAssets}</span> أصل و{" "}
              <span className="font-bold text-white">{totalCustody}</span> عهدة تحت الإدارة
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="إجمالي الأصول"
          value={totalAssets}
          subtitle={`القيمة: ${totalAssetsValue.toLocaleString("ar-SA")} ر.س`}
          icon={Package}
          iconBg="bg-teal-50"
          iconColor="text-teal-600"
        />
        <StatCard
          title="إجمالي العهد"
          value={totalCustody}
          subtitle={`القيمة: ${totalCustodyValue.toLocaleString("ar-SA")} ر.س`}
          icon={HandCoins}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          title="الموظفين"
          value={totalEmployees}
          subtitle={`${totalDepartments} قسم`}
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          title="المواقع"
          value={totalLocations}
          subtitle={`${totalDepartments} قسم`}
          icon={MapPin}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>

      {/* Quick NFC Card for Owner (Only for Admin) */}
      {(user?.role === "owner" || user?.role === "admin") && (
        <div className="mb-6">
          <QuickNFCCardForOwner />
        </div>
      )}

      {/* Charts Row + NFC Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Pie Chart */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
          <h3 className="text-sm font-bold text-foreground mb-1">حالة الأصول</h3>
          <p className="text-[11px] text-muted-foreground mb-4">توزيع الحالات</p>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      fontSize: "12px",
                      fontFamily: "Tajawal",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
              لا توجد بيانات
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
          <h3 className="text-sm font-bold text-foreground mb-4">ملخص القيم</h3>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-teal-50 rounded-xl p-4 text-center">
              <p className="text-xs text-teal-600 mb-1">إجمالي قيمة الأصول</p>
              <p className="text-xl font-extrabold text-teal-700">{totalAssetsValue.toLocaleString("ar-SA")}</p>
              <p className="text-[10px] text-teal-500">ريال سعودي</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-xs text-amber-600 mb-1">إجمالي قيمة العهد</p>
              <p className="text-xl font-extrabold text-amber-700">{totalCustodyValue.toLocaleString("ar-SA")}</p>
              <p className="text-[10px] text-amber-500">ريال سعودي</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-600 mb-1">الإجمالي الكلي</p>
              <p className="text-xl font-extrabold text-blue-700">{(totalAssetsValue + totalCustodyValue).toLocaleString("ar-SA")}</p>
              <p className="text-[10px] text-blue-500">ريال سعودي</p>
            </div>
          </div>
        </div>


      </div>


    </DashboardLayout>
  );
}
