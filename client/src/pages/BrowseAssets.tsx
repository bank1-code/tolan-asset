/**
 * BrowseAssets - استعراض العهد والأصول عبر NFC أو الإدخال اليدوي
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ScanLine,
  X,
  Search,
  Building2,
  MapPin,
  User,
  Package,
  DollarSign,
  Calendar,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Wifi,
} from "lucide-react";

// ---- Detail Row ----
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
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

// ---- Image Card ----
function ImageCard({ title, src }: { title: string; src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="border rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
        onClick={() => setOpen(true)}
      >
        <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          {title}
        </div>
        <img
          src={src}
          alt={title}
          className="w-full h-44 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
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

// ---- Status helpers ----
function statusInfo(status: string | null) {
  switch (status) {
    case "ACTIVE":
      return { label: "نشط", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "EXCLUDED":
      return { label: "مستبعد", cls: "bg-red-100 text-red-700 border-red-200" };
    case "TRANSFERRED":
      return { label: "منقول", cls: "bg-blue-100 text-blue-700 border-blue-200" };
    default:
      return { label: status ?? "—", cls: "bg-muted text-muted-foreground" };
  }
}

// ---- Main Page ----
export default function BrowseAssets() {
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
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
      toast.warning("Web NFC غير مدعوم — استخدم الإدخال اليدوي");
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

  const clearResult = () => setLookupCode(null);

  return (
    <DashboardLayout
      title="استعراض العهد والأصول"
      subtitle="امسح رقاقة NFC أو أدخل الرمز لعرض تفاصيل الأصل أو العهدة كاملةً"
    >
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Scan Card */}
        <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent shadow-sm">
          <CardContent className="pt-5 pb-4 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ScanLine className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold">مسح عبر NFC</p>
                <p className="text-xs text-muted-foreground">يعمل على Android Chrome فقط</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {!isScanning ? (
                <Button onClick={startNFCScan} className="gap-2 flex-1 h-11">
                  <Wifi className="w-4 h-4" />
                  بدء المسح عبر NFC
                </Button>
              ) : (
                <Button onClick={stopScan} variant="destructive" className="gap-2 flex-1 h-11">
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
                  className="flex-1 h-11"
                />
                <Button variant="outline" onClick={handleManualSearch} className="h-11 px-3">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {isScanning && (
              <div className="flex items-center gap-2 text-sm text-primary animate-pulse">
                <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                جاري الانتظار... قرّب الرقاقة من الجهاز
              </div>
            )}
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">جاري البحث...</p>
          </div>
        )}

        {/* Not Found */}
        {result && !result.found && (
          <Card className="border-red-200 bg-red-50/60">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-red-700">لم يتم العثور على العنصر</p>
                <p className="text-xs text-red-500 mt-0.5">
                  الرمز "<span className="font-mono">{lookupCode}</span>" غير موجود في قاعدة البيانات
                </p>
              </div>
              <Button size="icon" variant="ghost" className="text-red-400 hover:text-red-600" onClick={clearResult}>
                <X className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {result && result.found && (
          <div className="space-y-4">
            {/* Header */}
            <Card className="border-primary/30 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className={
                          result.entityType === "asset"
                            ? "border-blue-300 text-blue-700 bg-blue-50"
                            : "border-amber-300 text-amber-700 bg-amber-50"
                        }
                      >
                        {result.entityType === "asset" ? "أصل" : "عهدة"}
                      </Badge>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${statusInfo(result.status).cls}`}
                      >
                        {statusInfo(result.status).label}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-foreground leading-tight">{result.name}</h2>
                    <p className="text-sm text-muted-foreground font-mono mt-1">{result.code}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={clearResult} className="shrink-0 mt-1">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DetailRow icon={<Building2 className="w-4 h-4 text-primary" />} label="القسم" value={result.departmentName} />
              <DetailRow icon={<MapPin className="w-4 h-4 text-primary" />} label="الموقع" value={result.locationName} />
              <DetailRow icon={<User className="w-4 h-4 text-primary" />} label="المسؤول" value={result.assignedToName} />
              <DetailRow icon={<Package className="w-4 h-4 text-primary" />} label="الكمية" value={String(result.quantity ?? 1)} />
              <DetailRow
                icon={<DollarSign className="w-4 h-4 text-primary" />}
                label="القيمة"
                value={
                  result.assetValue
                    ? `${Number(result.assetValue).toLocaleString("ar-SA")} ر.س`
                    : "—"
                }
              />
              <DetailRow
                icon={<CheckCircle2 className="w-4 h-4 text-primary" />}
                label="الحالة الفعلية"
                value={result.condition}
              />
              <DetailRow
                icon={<Calendar className="w-4 h-4 text-primary" />}
                label="تاريخ الإضافة"
                value={
                  result.createdAt
                    ? new Date(result.createdAt).toLocaleDateString("ar-SA")
                    : "—"
                }
              />
              {result.notes && (
                <div className="sm:col-span-2">
                  <DetailRow
                    icon={<FileText className="w-4 h-4 text-primary" />}
                    label="ملاحظات"
                    value={result.notes}
                  />
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
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
              <ScanLine className="w-10 h-10 text-primary/60" />
            </div>
            <p className="text-base font-semibold text-foreground/70">ابدأ بمسح رقاقة NFC</p>
            <p className="text-sm mt-1.5 max-w-xs mx-auto leading-relaxed">
              أو أدخل رمز الأصل أو العهدة يدوياً لعرض جميع تفاصيله مع الصور
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
