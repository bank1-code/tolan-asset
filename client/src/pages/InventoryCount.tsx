/**
 * InventoryCount - صفحة الجرد باستخدام NFC/RFID
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Play,
  Square,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Trash2,
  Eye,
  FileSpreadsheet,
  ScanLine,
  X,
  Building2,
  MapPin,
  User,
  Package,
  DollarSign,
  Calendar,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import * as XLSX from "xlsx";

interface InventoryItem {
  id: number;
  code: string | null;
  name: string;
  status: "scanned" | "missing" | "pending";
}

interface SessionItem {
  id: number;
  code: string;
  name: string;
  status: "scanned" | "missing";
}

// =============================================
// تبويب الاستعراض عبر NFC
// =============================================
function BrowseTab() {
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const nfcRef = useRef<any>(null);

  const { data: result, isLoading, refetch } = trpc.inventoryCount.lookupByCode.useQuery(
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
        toast.success("NFC جاهز - قرّب الرقاقة من الجهاز");
        ndef.onreading = (event: any) => {
          const decoder = new TextDecoder();
          for (const record of event.message.records) {
            const code = decoder.decode(record.data).trim();
            setLookupCode(code);
            setIsScanning(false);
            if (nfcRef.current) nfcRef.current = null;
            break;
          }
        };
      } catch (err) {
        toast.error("تعذّر تفعيل NFC");
        setIsScanning(false);
      }
    } else {
      toast.warning("Web NFC غير مدعوم - استخدم الإدخال اليدوي");
      setIsScanning(false);
    }
  };

  const stopScan = () => {
    setIsScanning(false);
    nfcRef.current = null;
  };

  const handleManualSearch = () => {
    const code = manualInput.trim();
    if (!code) return;
    setLookupCode(code);
    setManualInput("");
  };

  const clearResult = () => {
    setLookupCode(null);
  };

  const statusLabel = (status: string | null) => {
    switch (status) {
      case "ACTIVE": return { label: "نشط", color: "bg-emerald-100 text-emerald-700" };
      case "EXCLUDED": return { label: "مستبعد", color: "bg-red-100 text-red-700" };
      case "TRANSFERRED": return { label: "منقول", color: "bg-blue-100 text-blue-700" };
      default: return { label: status ?? "—", color: "bg-muted text-muted-foreground" };
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Scan Controls */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-sm text-primary mb-3">
            <ScanLine className="w-4 h-4 shrink-0" />
            <span className="font-semibold">استعراض تفاصيل الأصل أو العهدة عبر NFC</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {!isScanning ? (
              <Button onClick={startNFCScan} className="gap-2 flex-1">
                <Wifi className="w-4 h-4" />
                مسح عبر NFC
              </Button>
            ) : (
              <Button onClick={stopScan} variant="destructive" className="gap-2 flex-1">
                <X className="w-4 h-4" />
                إيقاف المسح
              </Button>
            )}
            <div className="flex gap-2 flex-1">
              <Input
                placeholder="أو أدخل الرمز يدوياً..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleManualSearch} className="gap-1">
                <Search className="w-4 h-4" />
                بحث
              </Button>
            </div>
          </div>
          {isScanning && (
            <div className="mt-3 flex items-center gap-2 text-sm text-primary animate-pulse">
              <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
              جاري الانتظار... قرّب الرقاقة من الجهاز
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          جاري البحث...
        </div>
      )}

      {/* Not Found */}
      {result && !result.found && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-red-700">لم يتم العثور على العنصر</p>
              <p className="text-xs text-red-500 mt-0.5">الرمز "{lookupCode}" غير موجود في قاعدة البيانات</p>
            </div>
            <Button size="sm" variant="ghost" className="mr-auto text-red-500" onClick={clearResult}>
              <X className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Found Result */}
      {result && result.found && (
        <div className="space-y-4">
          {/* Header Card */}
          <Card className="border-primary/30">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={result.entityType === "asset" ? "border-blue-300 text-blue-700 bg-blue-50" : "border-amber-300 text-amber-700 bg-amber-50"}>
                      {result.entityType === "asset" ? "أصل" : "عهدة"}
                    </Badge>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusLabel(result.status).color}`}>
                      {statusLabel(result.status).label}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{result.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono mt-0.5">{result.code}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={clearResult} className="shrink-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailRow icon={<Building2 className="w-4 h-4 text-primary" />} label="القسم" value={result.departmentName} />
            <DetailRow icon={<MapPin className="w-4 h-4 text-primary" />} label="الموقع" value={result.locationName} />
            <DetailRow icon={<User className="w-4 h-4 text-primary" />} label="المسؤول" value={result.assignedToName} />
            <DetailRow icon={<Package className="w-4 h-4 text-primary" />} label="الكمية" value={String(result.quantity ?? 1)} />
            <DetailRow
              icon={<DollarSign className="w-4 h-4 text-primary" />}
              label="القيمة"
              value={result.assetValue ? `${Number(result.assetValue).toLocaleString("ar-SA")} ر.س` : "—"}
            />
            <DetailRow icon={<CheckCircle2 className="w-4 h-4 text-primary" />} label="الحالة" value={result.condition} />
            <DetailRow
              icon={<Calendar className="w-4 h-4 text-primary" />}
              label="تاريخ الإضافة"
              value={result.createdAt ? new Date(result.createdAt).toLocaleDateString("ar-SA") : "—"}
            />
            {result.notes && (
              <div className="sm:col-span-2">
                <DetailRow icon={<FileText className="w-4 h-4 text-primary" />} label="ملاحظات" value={result.notes} />
              </div>
            )}
          </div>

          {/* Images */}
          {(result.assetImagePath || result.invoiceImagePath) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {result.assetImagePath && (
                <ImageCard title="صورة المعدة" src={result.assetImagePath} />
              )}
              {result.invoiceImagePath && (
                <ImageCard title="صورة الفاتورة" src={result.invoiceImagePath} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!lookupCode && !isScanning && (
        <div className="text-center py-14 text-muted-foreground">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <ScanLine className="w-8 h-8" />
          </div>
          <p className="text-sm font-medium">اضغط "مسح عبر NFC" أو أدخل الرمز يدوياً</p>
          <p className="text-xs mt-1">ستظهر تفاصيل الأصل أو العهدة كاملةً مع الصور</p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border/50">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function ImageCard({ title, src }: { title: string; src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="border rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setOpen(true)}
      >
        <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          {title}
        </div>
        <img
          src={src}
          alt={title}
          className="w-full h-40 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/placeholder-image.png";
          }}
        />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <img src={src} alt={title} className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============================================
// المكوّن الرئيسي
// =============================================
export default function InventoryCount() {
  const { user } = useAuth();
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const [activeTab, setActiveTab] = useState("assets");
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "scanned" | "missing">("all");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);
  const nfcReaderRef = useRef<any>(null);

  // Departments
  const { data: departments } = trpc.settings.departments.list.useQuery();

  // Assets by department
  const { data: assetsData } =
    trpc.inventoryCount.getAssetsByDepartment.useQuery(
      { departmentId: Number(selectedDept) },
      { enabled: !!selectedDept && activeTab === "assets" }
    );

  // Custody by department
  const { data: custodyData } =
    trpc.inventoryCount.getCustodyByDepartment.useQuery(
      { departmentId: Number(selectedDept) },
      { enabled: !!selectedDept && activeTab === "custody" }
    );

  // Sessions history
  const { data: sessions, refetch: refetchSessions } =
    trpc.inventoryCount.getSessions.useQuery();

  // Save session mutation
  const saveSession = trpc.inventoryCount.saveSession.useMutation({
    onSuccess: () => { refetchSessions(); },
  });

  // Delete session mutation
  const deleteSession = trpc.inventoryCount.deleteSession.useMutation({
    onSuccess: () => {
      refetchSessions();
      toast.success("تم حذف الجلسة بنجاح");
    },
  });

  // Load items when department or tab changes
  useEffect(() => {
    if (!selectedDept) { setItems([]); return; }
    const source = activeTab === "assets" ? assetsData : custodyData;
    if (source) {
      setItems(source.map((item) => ({
        id: item.id,
        code: item.code ?? "",
        name: item.name,
        status: "pending",
      })));
    }
  }, [assetsData, custodyData, selectedDept, activeTab]);

  const scannedCount = items.filter((i) => i.status === "scanned").length;
  const progress = items.length > 0 ? Math.round((scannedCount / items.length) * 100) : 0;
  const deptName = departments?.find((d) => d.id === Number(selectedDept))?.name ?? "";

  const startInventory = async () => {
    if (!selectedDept) { toast.error("يرجى اختيار قسم أولاً"); return; }
    if (items.length === 0) { toast.error("لا توجد عناصر في هذا القسم"); return; }
    setIsRunning(true);
    setItems((prev) => prev.map((i) => ({ ...i, status: "missing" })));

    if ("NDEFReader" in window) {
      try {
        const ndef = new (window as any).NDEFReader();
        nfcReaderRef.current = ndef;
        await ndef.scan();
        ndef.onreading = (event: any) => {
          const decoder = new TextDecoder();
          for (const record of event.message.records) {
            const scannedCode = decoder.decode(record.data).trim();
            setItems((prev) =>
              prev.map((item) =>
                item.code === scannedCode ? { ...item, status: "scanned" } : item
              )
            );
          }
        };
        toast.success("تم تفعيل NFC - قرّب الرقاقة من الجهاز");
      } catch (err) {
        toast.warning("NFC غير متاح - يمكنك المسح اليدوي");
      }
    } else {
      toast.warning("Web NFC غير مدعوم في هذا المتصفح. يعمل فقط على Android Chrome");
    }
  };

  const manualScan = (code: string) => {
    const found = items.find((i) => i.code === code);
    if (found) {
      setItems((prev) =>
        prev.map((item) => item.code === code ? { ...item, status: "scanned" } : item)
      );
      toast.success(`تم جرد: ${found.name}`);
    } else {
      toast.error("الرمز غير موجود في القسم");
    }
  };

  const stopInventory = async () => {
    setIsRunning(false);
    nfcReaderRef.current = null;

    const finalItems = items.map((i) => ({
      id: i.id,
      code: i.code ?? "",
      name: i.name,
      status: i.status === "scanned" ? "scanned" : "missing",
    })) as SessionItem[];

    await saveSession.mutateAsync({
      departmentId: Number(selectedDept),
      departmentName: deptName,
      sessionType: activeTab as "assets" | "custody",
      totalCount: items.length,
      scannedCount,
      missingCount: items.length - scannedCount,
      items: finalItems,
    });
    toast.success("تم حفظ جلسة الجرد بنجاح");
  };

  const exportCurrentToExcel = () => {
    const data = items.map((item) => ({
      الرمز: item.code ?? "",
      الاسم: item.name,
      الحالة: item.status === "scanned" ? "تم جرده" : item.status === "missing" ? "غائب" : "لم يُجرد",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الجرد");
    XLSX.writeFile(wb, `جرد_${deptName}_${new Date().toLocaleDateString("ar-SA")}.xlsx`);
    toast.success("تم تصدير الجرد إلى Excel");
  };

  const exportSessionToExcel = (session: any) => {
    const sessionItems: SessionItem[] = Array.isArray(session.items) ? session.items : [];
    const data = sessionItems.map((item) => ({
      الرمز: item.code ?? "",
      الاسم: item.name,
      الحالة: item.status === "scanned" ? "تم جرده" : "غائب",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الجرد");
    const date = new Date(session.createdAt).toLocaleDateString("ar-SA");
    XLSX.writeFile(wb, `جرد_${session.departmentName ?? "غير محدد"}_${date}.xlsx`);
    toast.success("تم تصدير السجل إلى Excel");
  };

  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase();
    return item.name.toLowerCase().includes(q) || (item.code ?? "").toLowerCase().includes(q);
  });

  const filteredSessions = sessions?.filter((s) => {
    const q = historySearch.toLowerCase();
    return (s.departmentName ?? "").toLowerCase().includes(q) || s.sessionType.toLowerCase().includes(q);
  });

  const getSessionDetailItems = (): SessionItem[] => {
    if (!selectedSession) return [];
    const raw = Array.isArray(selectedSession.items) ? selectedSession.items : [];
    return raw.filter((item: SessionItem) => historyFilter === "all" || item.status === historyFilter);
  };

  return (
    <DashboardLayout title="الجرد" subtitle="جرد الأصول والعهد واستعراضها عبر NFC/RFID">
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setIsRunning(false); setItems([]); }}>
          <TabsList className="w-full">
            <TabsTrigger value="assets" className="flex-1">جرد الأصول</TabsTrigger>
            <TabsTrigger value="custody" className="flex-1">جرد العهد</TabsTrigger>
            <TabsTrigger value="browse" className="flex-1">استعراض العهد والأصول</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">سجل الجرد السابق</TabsTrigger>
          </TabsList>

          {/* Assets & Custody Tabs */}
          {(activeTab === "assets" || activeTab === "custody") && (
            <TabsContent value={activeTab} className="space-y-4 mt-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start gap-2 text-sm text-primary">
                    <Wifi className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">كيفية الاستخدام:</span> اختر القسم، ثم اضغط "بدء الجرد"، وقرّب الجهاز من رقاقة NFC.
                      <span className="block text-xs text-muted-foreground mt-0.5">⚠️ يتطلب Android + Chrome</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">اختر القسم</label>
                <Select value={selectedDept} onValueChange={setSelectedDept} disabled={isRunning}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="— اختر قسماً —" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold">{items.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">إجمالي العناصر</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{scannedCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">تم جرده</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{items.filter(i => i.status === "missing").length}</p>
                  <p className="text-xs text-muted-foreground mt-1">غائب</p>
                </CardContent></Card>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>تقدم الجرد</span><span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>

              {!("NDEFReader" in window) && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Web NFC غير مدعوم في هذا المتصفح. يعمل فقط على Android Chrome</span>
                </div>
              )}

              <div className="flex gap-2">
                {!isRunning ? (
                  <Button onClick={startInventory} className="flex-1 gap-2" disabled={!selectedDept}>
                    <Play className="w-4 h-4" /> بدء الجرد (NFC)
                  </Button>
                ) : (
                  <Button onClick={stopInventory} variant="destructive" className="flex-1 gap-2">
                    <Square className="w-4 h-4" /> إيقاف وحفظ الجلسة
                  </Button>
                )}
                {items.length > 0 && (
                  <Button variant="outline" onClick={exportCurrentToExcel} className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
                  </Button>
                )}
              </div>

              {isRunning && <ManualScanInput onScan={manualScan} />}

              {items.length > 0 && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="بحث في العناصر..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9" />
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-right px-3 py-2 font-medium">الرمز</th>
                          <th className="text-right px-3 py-2 font-medium">الاسم</th>
                          <th className="text-right px-3 py-2 font-medium">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((item) => (
                          <tr key={item.id} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{item.code}</td>
                            <td className="px-3 py-2">{item.name}</td>
                            <td className="px-3 py-2">
                              {item.status === "scanned" && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" /> تم جرده</Badge>}
                              {item.status === "missing" && <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200"><AlertTriangle className="w-3 h-3 mr-1" /> غائب</Badge>}
                              {item.status === "pending" && <Badge variant="outline" className="text-muted-foreground"><Clock className="w-3 h-3 mr-1" /> لم يُجرد</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {items.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                    <Wifi className="w-6 h-6" />
                  </div>
                  <p className="text-sm">اختر قسماً لعرض العناصر</p>
                </div>
              )}
            </TabsContent>
          )}

          {/* Browse Tab */}
          <TabsContent value="browse">
            <BrowseTab />
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث في السجلات..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="pr-9" />
            </div>

            {filteredSessions && filteredSessions.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                      <th className="text-right px-3 py-2 font-medium">القسم</th>
                      <th className="text-right px-3 py-2 font-medium">النوع</th>
                      <th className="text-right px-3 py-2 font-medium">الإجمالي</th>
                      <th className="text-right px-3 py-2 font-medium">تم جرده</th>
                      <th className="text-right px-3 py-2 font-medium">غائب</th>
                      <th className="text-right px-3 py-2 font-medium">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((session) => (
                      <tr key={session.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(session.createdAt).toLocaleString("ar-SA")}</td>
                        <td className="px-3 py-2">{session.departmentName ?? "—"}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{session.sessionType === "assets" ? "أصول" : "عهد"}</Badge></td>
                        <td className="px-3 py-2 text-center font-medium">{session.totalCount}</td>
                        <td className="px-3 py-2 text-center"><span className="text-emerald-600 font-medium">{session.scannedCount}</span></td>
                        <td className="px-3 py-2 text-center"><span className="text-red-500 font-medium">{session.missingCount}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:bg-blue-50" title="عرض التفاصيل"
                              onClick={() => { setSelectedSession(session); setHistoryFilter("all"); setSessionDetailOpen(true); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50" title="تصدير إلى Excel"
                              onClick={() => exportSessionToExcel(session)}>
                              <FileSpreadsheet className="w-4 h-4" />
                            </Button>
                            {canDelete && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="حذف الجلسة"
                                onClick={() => deleteSession.mutate({ id: session.id })}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6" />
                </div>
                <p className="text-sm">لا توجد جلسات جرد محفوظة</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Session Detail Dialog */}
      <Dialog open={sessionDetailOpen} onOpenChange={setSessionDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل جلسة الجرد - {selectedSession?.departmentName ?? ""}</DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-3">
              <div className="flex gap-2 text-sm text-muted-foreground">
                <span>{new Date(selectedSession.createdAt).toLocaleString("ar-SA")}</span>
                <span>•</span>
                <span>{selectedSession.sessionType === "assets" ? "أصول" : "عهد"}</span>
                <span>•</span>
                <span>الإجمالي: {selectedSession.totalCount}</span>
              </div>
              <div className="flex gap-2">
                {(["all", "scanned", "missing"] as const).map((f) => (
                  <Button key={f} size="sm" variant={historyFilter === f ? "default" : "outline"} onClick={() => setHistoryFilter(f)} className="text-xs">
                    {f === "all" ? "الكل" : f === "scanned" ? "تم جرده" : "غائب"}
                  </Button>
                ))}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium">الرمز</th>
                      <th className="text-right px-3 py-2 font-medium">الاسم</th>
                      <th className="text-right px-3 py-2 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSessionDetailItems().map((item, idx) => (
                      <tr key={idx} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.code}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">
                          {item.status === "scanned"
                            ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">تم جرده</Badge>
                            : <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">غائب</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function ManualScanInput({ onScan }: { onScan: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        placeholder="أدخل رمز العنصر يدوياً..."
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) { onScan(code.trim()); setCode(""); } }}
        className="flex-1"
      />
      <Button onClick={() => { if (code.trim()) { onScan(code.trim()); setCode(""); } }}>مسح</Button>
    </div>
  );
}
