import InventoryCountWorkspace from "@/components/InventoryCountWorkspace";
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
  return <DashboardLayout title="الجرد" subtitle="الكميات الفعلية والمسودات والاعتماد النهائي"><InventoryCountWorkspace browse={<BrowseTab />} /></DashboardLayout>;
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
