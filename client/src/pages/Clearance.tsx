/**
 * Clearance.tsx - براءة الذمة
 * ============================
 * مربوط بالـ API الحقيقي عبر tRPC
 */

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { printClearanceReport, generateClearanceCode } from "@/lib/clearanceReport";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Search, ChevronLeft, ChevronRight, Printer, RotateCcw,
  FileText, FolderOpen, Eye, Trash2, UserSearch, CheckCircle2,
  AlertTriangle, Package, Box, Users, Calendar, ClipboardList,
  ClipboardCheck, Loader2
} from "lucide-react";

const DEFAULT_STATEMENTS = [
  "المذكور ليس عليه أي متعلقات حتى آخر يوم عمل له يوم {day} الموافق {date} حيث أنه:",
  "غير مدين بحسابات ذمم العاملين وحسابات عهد المصروفات.",
  "وليس عليه أي التزامات تجاه الموردين أو الأطراف ذات العلاقة بالشركة.",
  "وليس عليه أي عهد شخصية أو عهد عامة. (تم التحقق آليًا بواسطة مسؤول العهد)",
  "وليس عليه أي التزامات إدارية تجاه الشركة (هاتف – سيارة – سكن – أخرى).",
  "وليس عليه أي إلتزامات أخرى."
];

const DEFAULT_SIGNATURES = [
  "مسؤول العهد",
  "المسؤول المباشر",
  "م. قسم IT",
  "م. الشؤون الإدارية",
  "الحسابات"
];

const REASONS = ["خروج وعودة", "إجازة داخلية", "خروج نهائي", "انتهاء عمل"];

export default function Clearance() {
  return (
    <DashboardLayout
      title="براءة الذمة"
      subtitle="إنشاء وإدارة براءات ذمة الموظفين"
    >
      <Tabs defaultValue="wizard" dir="rtl">
        <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto">
          <TabsTrigger value="wizard" className="gap-2 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <FileText className="h-4 w-4" />
            براءة الذمة
          </TabsTrigger>
          <TabsTrigger value="manage" className="gap-2 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <FolderOpen className="h-4 w-4" />
            إدارة براءة الذمة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="mt-4">
          <ClearanceWizard />
        </TabsContent>

        <TabsContent value="manage" className="mt-4">
          <ClearanceManagement />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

// ===== Wizard براءة الذمة (5 مراحل) =====

function ClearanceWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [reason, setReason] = useState("خروج وعودة");
  const [lastWorkDay, setLastWorkDay] = useState(() => new Date().toISOString().split("T")[0]);
  const [statements, setStatements] = useState<string[]>([...DEFAULT_STATEMENTS]);
  const [signatures, setSignatures] = useState<string[]>([...DEFAULT_SIGNATURES]);
  const [departmentAlternates, setDepartmentAlternates] = useState<Record<string, string>>({});

  // API data
  const { data: employeesData } = trpc.settings.employees.list.useQuery();
  const { data: employeeItemsData } = trpc.operations.clearance.getEmployeeItems.useQuery(
    { employeeId: selectedEmployeeId! },
    { enabled: !!selectedEmployeeId }
  );
  const createClearance = trpc.operations.clearance.create.useMutation();
  const utils = trpc.useUtils();

  const employees = employeesData || [];
  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || null;

  const steps = [
    { title: "البحث عن الموظف", icon: UserSearch },
    { title: "الأصول والعهد والبدلاء", icon: Package },
    { title: "سبب المغادرة", icon: Calendar },
    { title: "نص براءة الذمة", icon: ClipboardList },
    { title: "التوقيعات والطباعة", icon: Printer },
  ];

  // تجميع الأصول والعهد حسب القسم
  const groupedByDept = useMemo(() => {
    if (!employeeItemsData) return { departments: [] as string[], assetsByDept: {} as Record<string, any[]>, custodyByDept: {} as Record<string, any[]> };
    
    const depts = new Set<string>();
    const assetsByDept: Record<string, any[]> = {};
    const custodyByDept: Record<string, any[]> = {};

    (employeeItemsData.assets || []).forEach((a: any) => {
      const dept = a.departmentName || "عام";
      depts.add(dept);
      if (!assetsByDept[dept]) assetsByDept[dept] = [];
      assetsByDept[dept].push(a);
    });

    (employeeItemsData.custody || []).forEach((c: any) => {
      const dept = c.departmentName || "عام";
      depts.add(dept);
      if (!custodyByDept[dept]) custodyByDept[dept] = [];
      custodyByDept[dept].push(c);
    });

    return { departments: Array.from(depts).sort(), assetsByDept, custodyByDept };
  }, [employeeItemsData]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return employees.filter(e =>
      (e.fullName || "").toLowerCase().includes(q) ||
      (e.fingerprintId || "").toString() === q
    );
  }, [searchQuery, employees]);

  const validateStep = (): boolean => {
    if (currentStep === 0 && !selectedEmployee) {
      toast.error("يرجى اختيار الموظف أولاً وفحصه");
      return false;
    }
    if (currentStep === 1 && groupedByDept.departments.length > 0) {
      for (const dept of groupedByDept.departments) {
        if (!departmentAlternates[dept]) {
          toast.error(`يرجى اختيار موظف بديل للقسم: ${dept}`);
          return false;
        }
      }
    }
    if (currentStep === 2) {
      if (!reason.trim()) { toast.error("يرجى اختيار سبب المغادرة"); return false; }
      if (!lastWorkDay) { toast.error("يرجى إدخال تاريخ آخر يوم دوام"); return false; }
    }
    return true;
  };

  const handlePrintClearance = async () => {
    if (!selectedEmployee) return;
    const code = generateClearanceCode();

    // تجهيز البيانات للتقرير
    const assetsForReport = groupedByDept.departments.map(dept => ({
      department: dept,
      items: (groupedByDept.assetsByDept[dept] || []).map((a: any) => ({
        id: a.id, name: a.name, code: a.code, quantity: a.quantity || 1
      }))
    })).filter(d => d.items.length > 0);

    const custodyForReport = groupedByDept.departments.map(dept => ({
      department: dept,
      items: (groupedByDept.custodyByDept[dept] || []).map((c: any) => ({
        id: c.id, name: c.name, code: c.code, quantity: c.quantity || 1
      }))
    })).filter(d => d.items.length > 0);

    printClearanceReport({
      employeeName: selectedEmployee.fullName || "",
      fingerprintId: Number(selectedEmployee.fingerprintId) || 0,
      idNumber: selectedEmployee.nationalId || "",
      reason,
      lastWorkDay,
      dayName: getDayName(lastWorkDay),
      statements,
      signatures,
      assets: assetsForReport,
      custody: custodyForReport,
      departmentAlternates,
      clearanceCode: code,
    });

    // حفظ في قاعدة البيانات
    try {
      await createClearance.mutateAsync({
        clearanceCode: code,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.fullName || "",
        fingerprintId: selectedEmployee.fingerprintId || null,
        reason,
        lastWorkDay,
        replacementData: departmentAlternates,
      });
      utils.operations.clearance.list.invalidate();
      toast.success(`تم إنشاء براءة الذمة بنجاح (${code}) وجاري فتح نافذة الطباعة...`);
    } catch {
      toast.error("تم الطباعة لكن حدث خطأ في حفظ البراءة في قاعدة البيانات");
    }
  };

  const nextStep = () => {
    if (!validateStep()) return;
    if (currentStep === steps.length - 1) {
      handlePrintClearance();
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => { if (currentStep > 0) setCurrentStep(prev => prev - 1); };

  const selectEmployee = (emp: any) => {
    setSelectedEmployeeId(emp.id);
    setSearchQuery(emp.fullName || "");
    setShowResults(false);
    setDepartmentAlternates({});
    toast.success(`تم اختيار الموظف: ${emp.fullName}`);
  };

  const getDayName = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      return days[d.getDay()];
    } catch { return "غير محدد"; }
  };

  const totalAssets = employeeItemsData?.assets?.length || 0;
  const totalCustody = employeeItemsData?.custody?.length || 0;

  return (
    <div className="space-y-5">
      {/* شريط المراحل */}
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div className="flex items-center gap-1.5">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <div key={index} className="flex items-center gap-1.5 flex-1">
                <button
                  onClick={() => { if (isCompleted) setCurrentStep(index); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all flex-1 ${
                    isActive ? "bg-primary/10 border border-primary/30 text-primary"
                    : isCompleted ? "bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-pointer hover:bg-emerald-100"
                    : "bg-muted/30 text-muted-foreground border border-transparent"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    isActive ? "bg-primary text-primary-foreground"
                    : isCompleted ? "bg-emerald-600 text-white"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                  </div>
                  <Icon className="h-3.5 w-3.5 hidden lg:block" />
                  <span className="text-[11px] font-medium hidden md:block truncate">{step.title}</span>
                </button>
                {index < steps.length - 1 && (
                  <div className={`h-px w-3 shrink-0 ${isCompleted ? "bg-emerald-300" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* محتوى المرحلة */}
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] min-h-[420px]">
        
        {/* ===== المرحلة 1: البحث عن الموظف ===== */}
        {currentStep === 0 && (
          <div className="p-6 space-y-5">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
              <h2 className="text-base font-bold text-foreground mb-0.5">المرحلة 1: البحث عن الموظف</h2>
              <p className="text-xs text-muted-foreground">ابحث عن الموظف بالاسم أو رقم البصمة ثم اضغط "فحص الموظف"</p>
            </div>

            <div className="bg-muted/20 rounded-xl p-5 border border-border/40">
              <Label className="text-xs font-bold mb-3 block">ابحث بالاسم أو رقم البصمة:</Label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="أدخل اسم الموظف أو رقم البصمة..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); if (!e.target.value.trim()) setSelectedEmployeeId(null); }}
                    onFocus={() => searchQuery.trim() && setShowResults(true)}
                    className="pr-10 h-10"
                  />
                  {showResults && searchResults.length > 0 && (
                    <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-lg border border-border shadow-lg z-50 max-h-60 overflow-y-auto">
                      {searchResults.map(emp => (
                        <button key={emp.id} onClick={() => selectEmployee(emp)}
                          className="w-full text-right px-4 py-3 hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0">
                          <div className="font-medium text-foreground text-sm">{emp.fullName}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">البصمة: {emp.fingerprintId}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {showResults && searchQuery.trim() && searchResults.length === 0 && (
                    <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-lg border border-border shadow-lg z-50 p-4 text-center text-muted-foreground text-sm">
                      لم يتم العثور على موظف
                    </div>
                  )}
                </div>
                <Button onClick={() => {
                  if (!searchQuery.trim()) { toast.error("يرجى إدخال اسم الموظف أو رقم البصمة"); return; }
                  if (searchResults.length === 1) selectEmployee(searchResults[0]);
                  else if (searchResults.length > 1) setShowResults(true);
                  else toast.error("لم يتم العثور على موظف بهذه البيانات");
                }} className="gap-2 h-10">
                  <UserSearch className="h-4 w-4" />
                  فحص الموظف
                </Button>
              </div>
            </div>

            {selectedEmployee && (
              <div className="bg-emerald-50/60 rounded-xl p-5 border border-emerald-200 animate-in fade-in duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-emerald-800 text-sm">تم اختيار الموظف بنجاح</h3>
                    <p className="text-[11px] text-emerald-600">يمكنك المتابعة للمرحلة التالية</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                  {[
                    { label: "الاسم الكامل", value: selectedEmployee.fullName },
                    { label: "رقم البصمة", value: selectedEmployee.fingerprintId },
                    { label: "رقم الهوية", value: selectedEmployee.nationalId },
                    { label: "الهاتف", value: selectedEmployee.phone },
                  ].map(f => (
                    <div key={f.label}>
                      <span className="text-[10px] text-muted-foreground">{f.label}</span>
                      <p className="font-semibold text-sm">{f.value || "-"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== المرحلة 2: الأصول والعهد والبدلاء ===== */}
        {currentStep === 1 && selectedEmployee && (
          <div className="p-6 space-y-5">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
              <h2 className="text-base font-bold text-foreground mb-0.5">المرحلة 2: الأصول والعهد والبدلاء</h2>
              <p className="text-xs text-muted-foreground">مراجعة الأصول والعهد المسجلة واختيار موظف بديل لكل قسم (للتوثيق في التقرير فقط - لا يتم نقل فعلي في قاعدة البيانات)</p>
            </div>

            <div className="bg-muted/20 rounded-lg p-4 border border-border/40">
              <p className="font-bold text-sm">الموظف: {selectedEmployee.fullName} (البصمة: {selectedEmployee.fingerprintId})</p>
              <p className="text-xs text-muted-foreground mt-1">
                إجمالي الأصول: {totalAssets} | إجمالي العهد: {totalCustody}
              </p>
            </div>

            {groupedByDept.departments.length === 0 ? (
              <div className="bg-emerald-50 rounded-xl p-8 text-center border border-emerald-200">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
                <p className="text-emerald-800 font-bold">الموظف ليس عليه أي أصول أو عهد مسجلة في النظام</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedByDept.departments.map(dept => {
                  const deptAssets = groupedByDept.assetsByDept[dept] || [];
                  const deptCustody = groupedByDept.custodyByDept[dept] || [];
                  return (
                    <div key={dept} className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                      <div className="bg-slate-50 px-5 py-3 border-b border-border/40">
                        <h3 className="font-bold text-sm flex items-center gap-2">
                          <Box className="h-4 w-4 text-primary" />
                          القسم: {dept}
                        </h3>
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* الأصول */}
                          <div className="border border-border/40 rounded-lg overflow-hidden">
                            <div className="bg-primary/5 px-4 py-2 border-b border-primary/10">
                              <h4 className="font-semibold text-xs flex items-center gap-2">
                                <Package className="h-3.5 w-3.5 text-primary" />
                                الأصول ({deptAssets.length})
                              </h4>
                            </div>
                            {deptAssets.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead><tr className="bg-muted/30">
                                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">اسم الأصل</th>
                                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">الرمز</th>
                                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">الكمية</th>
                                </tr></thead>
                                <tbody>
                                  {deptAssets.map((item: any) => (
                                    <tr key={item.id} className="border-t border-border/20">
                                      <td className="px-3 py-2 text-right">{item.name}</td>
                                      <td className="px-3 py-2 text-center font-mono">{item.code}</td>
                                      <td className="px-3 py-2 text-center">{item.quantity || 1}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="p-4 text-center text-muted-foreground text-xs">لا توجد أصول</div>
                            )}
                          </div>
                          {/* العهد */}
                          <div className="border border-border/40 rounded-lg overflow-hidden">
                            <div className="bg-amber-50 px-4 py-2 border-b border-amber-100">
                              <h4 className="font-semibold text-xs flex items-center gap-2 text-amber-800">
                                <Box className="h-3.5 w-3.5" />
                                العهد ({deptCustody.length})
                              </h4>
                            </div>
                            {deptCustody.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead><tr className="bg-muted/30">
                                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">اسم العهدة</th>
                                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">الرمز</th>
                                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">الكمية</th>
                                </tr></thead>
                                <tbody>
                                  {deptCustody.map((item: any) => (
                                    <tr key={item.id} className="border-t border-border/20">
                                      <td className="px-3 py-2 text-right">{item.name}</td>
                                      <td className="px-3 py-2 text-center font-mono">{item.code}</td>
                                      <td className="px-3 py-2 text-center">{item.quantity || 1}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="p-4 text-center text-muted-foreground text-xs">لا توجد عهد</div>
                            )}
                          </div>
                        </div>
                        {/* اختيار البديل */}
                        <div className="bg-blue-50/50 rounded-lg p-3.5 border border-blue-100 flex items-center gap-3 flex-wrap">
                          <Users className="h-4 w-4 text-blue-600 shrink-0" />
                          <Label className="font-semibold text-xs text-blue-800 shrink-0">اختر موظفاً بديلاً لهذا القسم (للتوثيق فقط):</Label>
                          <select
                            value={departmentAlternates[dept] || ""}
                            onChange={(e) => setDepartmentAlternates(prev => ({ ...prev, [dept]: e.target.value }))}
                            className="flex-1 min-w-[200px] h-9 rounded-md border border-input bg-white px-3 py-1.5 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">-- اختر الموظف البديل --</option>
                            {employees.filter(e => e.id !== selectedEmployee.id).map(emp => (
                              <option key={emp.id} value={emp.fullName || ""}>{emp.fullName}</option>
                            ))}
                          </select>
                          {!departmentAlternates[dept] && (
                            <span className="text-[10px] text-red-500 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> مطلوب
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== المرحلة 3: سبب المغادرة وآخر يوم دوام ===== */}
        {currentStep === 2 && (
          <div className="p-6 space-y-5">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
              <h2 className="text-base font-bold text-foreground mb-0.5">المرحلة 3: سبب المغادرة وآخر يوم دوام</h2>
              <p className="text-xs text-muted-foreground">حدد سبب مغادرة الموظف وتاريخ آخر يوم دوام</p>
            </div>

            <div className="bg-muted/20 rounded-xl p-5 border border-border/40">
              <Label className="text-xs font-bold mb-4 block">سبب المغادرة:</Label>
              <div className="flex flex-wrap gap-3">
                {REASONS.map(r => (
                  <button key={r} onClick={() => setReason(r)}
                    className={`px-5 py-3 rounded-lg border-2 font-medium transition-all text-sm ${
                      reason === r
                        ? "border-primary bg-primary/5 text-primary shadow-sm"
                        : "border-border/40 bg-white text-muted-foreground hover:border-primary/30 hover:bg-primary/5"
                    }`}>
                    <div className={`w-3 h-3 rounded-full border-2 inline-block ml-2 ${
                      reason === r ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`} />
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-muted/20 rounded-xl p-5 border border-border/40">
              <Label className="text-xs font-bold mb-3 block">تاريخ آخر يوم دوام:</Label>
              <div className="flex items-center gap-3">
                <Input type="date" value={lastWorkDay} onChange={(e) => setLastWorkDay(e.target.value)} className="max-w-[220px] h-10" />
                <span className="text-[11px] text-muted-foreground">(صيغة: YYYY-MM-DD)</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== المرحلة 4: نص براءة الذمة ===== */}
        {currentStep === 3 && (
          <div className="p-6 space-y-5">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
              <h2 className="text-base font-bold text-foreground mb-0.5">المرحلة 4: نص براءة الذمة (قابل للتعديل)</h2>
              <p className="text-xs text-muted-foreground">يمكنك تعديل نصوص براءة الذمة حسب الحاجة. السطر الأول يتحدث تلقائياً باليوم والتاريخ.</p>
            </div>

            <div className="bg-muted/20 rounded-xl p-5 border border-border/40 space-y-3">
              {statements.map((stmt, index) => {
                let displayValue = stmt;
                if (index === 0 && lastWorkDay) {
                  displayValue = stmt.replace("{day}", getDayName(lastWorkDay)).replace("{date}", lastWorkDay.replace(/-/g, "/"));
                }
                return (
                  <div key={index} className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0 mt-1.5">
                      {index + 1}
                    </span>
                    <Input
                      value={displayValue}
                      onChange={(e) => {
                        const newStatements = [...statements];
                        newStatements[index] = e.target.value;
                        setStatements(newStatements);
                      }}
                      className="flex-1 h-10 text-sm"
                      dir="rtl"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setStatements([...DEFAULT_STATEMENTS])} className="gap-2 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                إعادة النصوص الافتراضية
              </Button>
            </div>
          </div>
        )}

        {/* ===== المرحلة 5: التوقيعات والطباعة ===== */}
        {currentStep === 4 && (
          <div className="p-6 space-y-5">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
              <h2 className="text-base font-bold text-foreground mb-0.5">المرحلة 5: التوقيعات والطباعة</h2>
              <p className="text-xs text-muted-foreground">تعديل أسماء الموقعين ومعاينة البيانات قبل الطباعة</p>
            </div>

            {/* حقول التوقيعات */}
            <div className="bg-muted/20 rounded-xl p-5 border border-border/40 space-y-3">
              <Label className="text-xs font-bold mb-2 block">تعديل أسماء الموقعين (5 توقيعات):</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {signatures.map((sig, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                      {index + 1}
                    </span>
                    <Input
                      value={sig}
                      onChange={(e) => { const n = [...signatures]; n[index] = e.target.value; setSignatures(n); }}
                      className="flex-1 h-9 text-sm"
                      dir="rtl"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={() => setSignatures([...DEFAULT_SIGNATURES])} className="gap-2 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" />
                  إعادة التوقيعات الافتراضية
                </Button>
              </div>
            </div>

            {/* معاينة سريعة */}
            {selectedEmployee && (
              <div className="bg-blue-50/40 rounded-xl p-5 border border-blue-100">
                <h3 className="font-bold text-blue-800 text-sm mb-4 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  معاينة سريعة للبيانات
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <p><strong>الموظف:</strong> {selectedEmployee.fullName}</p>
                    <p><strong>رقم البصمة:</strong> {selectedEmployee.fingerprintId}</p>
                    <p><strong>رقم الهوية:</strong> {selectedEmployee.nationalId}</p>
                  </div>
                  <div className="space-y-2">
                    <p><strong>سبب المغادرة:</strong> {reason}</p>
                    <p><strong>آخر يوم دوام:</strong> {getDayName(lastWorkDay)} الموافق {lastWorkDay.replace(/-/g, "/")}</p>
                    <p><strong>عدد الأصول:</strong> {totalAssets}</p>
                    <p><strong>عدد العهد:</strong> {totalCustody}</p>
                  </div>
                </div>
                {groupedByDept.departments.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-blue-100">
                    <p className="font-semibold text-blue-800 text-xs mb-2">البدلاء حسب القسم:</p>
                    <div className="space-y-1">
                      {groupedByDept.departments.map(dept => (
                        <p key={dept} className="text-xs">
                          <strong>{dept}:</strong> {departmentAlternates[dept] || "غير محدد"}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-blue-100">
                  <p className="font-semibold text-blue-800 text-xs mb-2">الموقعون:</p>
                  <div className="flex flex-wrap gap-2">
                    {signatures.map((sig, i) => (
                      <span key={i} className="px-2 py-1 bg-white rounded border border-blue-200 text-[11px]">{sig}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ملاحظة التقرير */}
            <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-200 text-xs text-amber-800">
              <strong>ملاحظة:</strong> عند الضغط على "طباعة" سيتم إنشاء تقرير HTML من صفحتين:
              <strong> الصفحة 1</strong> - نموذج براءة الذمة (بيانات الموظف + النصوص + التوقيعات + ملاحظات الرئيس التنفيذي)،
              <strong> الصفحة 2</strong> - إقرار العهد (ملخص + جداول الأصول والعهد حسب القسم مع المستلم البديل).
            </div>
          </div>
        )}
      </div>

      {/* أزرار التنقل */}
      <div className="flex items-center justify-between">
        <div>
          {currentStep > 0 && (
            <Button variant="outline" onClick={prevStep} className="gap-2 text-xs h-9">
              <ChevronRight className="h-3.5 w-3.5" />
              السابق
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {currentStep === steps.length - 1 ? (
            <Button onClick={nextStep} disabled={createClearance.isPending} className="gap-2 text-xs h-9 bg-emerald-600 hover:bg-emerald-700">
              {createClearance.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              طباعة وحفظ براءة الذمة
            </Button>
          ) : (
            <Button onClick={nextStep} className="gap-2 text-xs h-9">
              التالي
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== تبويب إدارة براءة الذمة =====

function ClearanceManagement() {
  const { user } = useAuth();
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: clearanceData, isLoading } = trpc.operations.clearance.list.useQuery();
  const deleteClearance = trpc.operations.clearance.delete.useMutation();
  const utils = trpc.useUtils();

  // جلب بيانات براءة محددة مع عهد وأصول الموظف
  const { data: selectedClearanceData, isLoading: isLoadingSelected } =
    trpc.operations.clearance.getById.useQuery(
      { id: selectedId! },
      { enabled: !!selectedId }
    );

  const records = clearanceData || [];

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((r: any) =>
      (r.clearanceCode || "").toLowerCase().includes(q) ||
      (r.employeeName || "").toLowerCase().includes(q) ||
      (r.reason || "").toLowerCase().includes(q) ||
      (r.fingerprintId || "").toLowerCase().includes(q)
    );
  }, [searchQuery, records]);

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف براءة الذمة؟")) return;
    try {
      await deleteClearance.mutateAsync({ id });
      utils.operations.clearance.list.invalidate();
      if (selectedId === id) setSelectedId(null);
      toast.success("تم حذف براءة الذمة بنجاح");
    } catch {
      toast.error("حدث خطأ أثناء حذف براءة الذمة");
    }
  };

  const getDayName = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      return days[d.getDay()];
    } catch { return "غير محدد"; }
  };

  const handleReprintClearance = async (record: any) => {
    if (!selectedClearanceData) { toast.error("جاري تحميل البيانات..."); return; }
    setIsPrinting(true);
    try {
      const { record: rec, assets: empAssets, custody: empCustody, nationalId: empNationalId } = selectedClearanceData;
      const lastWorkDay = rec.lastWorkDay
        ? new Date(rec.lastWorkDay).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const replacementData = (rec.replacementData as Record<string, string>) || {};

      // تجميع الأصول حسب القسم
      const deptSet = new Set<string>();
      const assetsByDept: Record<string, any[]> = {};
      const custodyByDept: Record<string, any[]> = {};

      empAssets.forEach((a: any) => {
        const dept = a.departmentName || "عام";
        deptSet.add(dept);
        if (!assetsByDept[dept]) assetsByDept[dept] = [];
        assetsByDept[dept].push(a);
      });
      empCustody.forEach((c: any) => {
        const dept = c.departmentName || "عام";
        deptSet.add(dept);
        if (!custodyByDept[dept]) custodyByDept[dept] = [];
        custodyByDept[dept].push(c);
      });

      const departments = Array.from(deptSet).sort();
      const assetsForReport = departments.map(dept => ({
        department: dept,
        items: (assetsByDept[dept] || []).map((a: any) => ({
          id: a.id, name: a.name || a.assetName || "", code: a.code || a.assetCode || "", quantity: a.quantity || 1
        }))
      })).filter(d => d.items.length > 0);

      const custodyForReport = departments.map(dept => ({
        department: dept,
        items: (custodyByDept[dept] || []).map((c: any) => ({
          id: c.id, name: c.name || "", code: c.code || "", quantity: c.quantity || 1
        }))
      })).filter(d => d.items.length > 0);

      printClearanceReport({
        employeeName: rec.employeeName || "",
        fingerprintId: Number(rec.fingerprintId) || 0,
        idNumber: empNationalId || "",
        reason: rec.reason || "",
        lastWorkDay,
        dayName: getDayName(lastWorkDay),
        statements: [
          "المذكور ليس عليه أي متعلقات حتى آخر يوم عمل له يوم {day} الموافق {date} حيث أنه:",
          "غير مدين بحسابات ذمم العاملين وحسابات عهد المصروفات.",
          "وليس عليه أي التزامات تجاه الموردين أو الأطراف ذات العلاقة بالشركة.",
          "وليس عليه أي عهد شخصية أو عهد عامة. (تم التحقق آليًا بواسطة مسؤول العهد)",
          "وليس عليه أي التزامات إدارية تجاه الشركة (هاتف – سيارة – سكن – أخرى).",
          "وليس عليه أي إلتزامات أخرى."
        ],
        signatures: ["مسؤول العهد", "المسؤول المباشر", "م. قسم IT", "م. الشؤون الإدارية", "الحسابات"],
        assets: assetsForReport,
        custody: custodyForReport,
        departmentAlternates: replacementData,
        clearanceCode: rec.clearanceCode,
      });
      toast.success("جاري فتح نافذة الطباعة...");
    } catch (e) {
      toast.error("حدث خطأ أثناء إعداد التقرير");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] p-5">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          إدارة براءة الذمة
        </h2>

        {/* شريط البحث */}
        <div className="flex items-center gap-3 mb-5">
          <Label className="shrink-0 text-xs font-medium">بحث (اسم الموظف أو رقم البراءة):</Label>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ابحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-10 h-9" />
          </div>
        </div>

        {/* جدول البراءات */}
        <div className="border border-border/40 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground">كود البراءة</th>
                <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground">اسم الموظف</th>
                <th className="text-center px-4 py-3 font-semibold text-xs text-muted-foreground">سبب المغادرة</th>
                <th className="text-center px-4 py-3 font-semibold text-xs text-muted-foreground">تاريخ الإنشاء</th>
                <th className="text-center px-4 py-3 font-semibold text-xs text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground mt-2">جاري التحميل...</p>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    <ClipboardCheck className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                    لا توجد براءات ذمة مسجلة
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record: any) => (
                  <tr key={record.id}
                    className={`border-t border-border/20 hover:bg-muted/20 transition-colors cursor-pointer ${
                      selectedId === record.id ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""
                    }`}
                    onClick={() => setSelectedId(record.id)}>
                    <td className="px-4 py-3 font-mono text-xs">{record.clearanceCode}</td>
                    <td className="px-4 py-3 font-medium text-sm">{record.employeeName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        record.reason === "خروج نهائي" ? "bg-red-50 text-red-700"
                        : record.reason === "انتهاء عمل" ? "bg-orange-50 text-orange-700"
                        : record.reason === "إجازة داخلية" ? "bg-blue-50 text-blue-700"
                        : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {record.reason || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      {record.createdAt ? new Date(record.createdAt).toLocaleDateString("ar-SA") : "-"}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => { setSelectedId(record.id); setShowPreview(true); }} title="استعراض">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:bg-primary/5"
                          disabled={isPrinting}
                          onClick={() => { setSelectedId(record.id); setTimeout(() => handleReprintClearance(record), 100); }} title="إعادة طباعة">
                          {isPrinting && selectedId === record.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Printer className="h-3.5 w-3.5" />}
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(record.id)} title="حذف">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة استعراض براءة الذمة */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">استعراض براءة الذمة</DialogTitle>
          </DialogHeader>
          {isLoadingSelected ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="mr-3 text-sm text-muted-foreground">جاري تحميل البيانات...</span>
            </div>
          ) : selectedClearanceData ? (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {/* بيانات الموظف */}
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                <h3 className="text-sm font-bold text-primary mb-3">بيانات الموظف</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["كود البراءة", selectedClearanceData.record.clearanceCode],
                    ["اسم الموظف", selectedClearanceData.record.employeeName],
                    ["رقم البصمة", String(selectedClearanceData.record.fingerprintId || "—")],
                    ["سبب المغادرة", selectedClearanceData.record.reason || "—"],
                    ["آخر يوم عمل", selectedClearanceData.record.lastWorkDay
                      ? new Date(selectedClearanceData.record.lastWorkDay).toLocaleDateString("ar-SA")
                      : "—"],
                    ["تاريخ الإصدار", new Date(selectedClearanceData.record.createdAt).toLocaleDateString("ar-SA")],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
                      <span className="text-sm font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* أصول الموظف */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-3 bg-muted/30 border-b border-border">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Box className="w-4 h-4 text-primary" />
                    أصول الموظف ({selectedClearanceData.assets.length})
                  </h3>
                </div>
                {selectedClearanceData.assets.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">لا توجد أصول مسجلة</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/20">
                        <th className="px-3 py-2 text-right font-bold text-muted-foreground">الاسم</th>
                        <th className="px-3 py-2 text-right font-bold text-muted-foreground">الرمز</th>
                        <th className="px-3 py-2 text-center font-bold text-muted-foreground">الكمية</th>
                        <th className="px-3 py-2 text-right font-bold text-muted-foreground">القسم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClearanceData.assets.map((a: any) => (
                        <tr key={a.id} className="border-t border-border/30">
                          <td className="px-3 py-2">{a.name}</td>
                          <td className="px-3 py-2 font-mono">{a.code || "—"}</td>
                          <td className="px-3 py-2 text-center">{a.quantity}</td>
                          <td className="px-3 py-2 text-muted-foreground">{a.departmentName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* عهد الموظف */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-3 bg-muted/30 border-b border-border">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-600" />
                    عهد الموظف ({selectedClearanceData.custody.length})
                  </h3>
                </div>
                {selectedClearanceData.custody.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">لا توجد عهد مسجلة</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/20">
                        <th className="px-3 py-2 text-right font-bold text-muted-foreground">الاسم</th>
                        <th className="px-3 py-2 text-right font-bold text-muted-foreground">الرمز</th>
                        <th className="px-3 py-2 text-center font-bold text-muted-foreground">الكمية</th>
                        <th className="px-3 py-2 text-right font-bold text-muted-foreground">القسم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClearanceData.custody.map((c: any) => (
                        <tr key={c.id} className="border-t border-border/30">
                          <td className="px-3 py-2">{c.name}</td>
                          <td className="px-3 py-2 font-mono">{c.code || "—"}</td>
                          <td className="px-3 py-2 text-center">{c.quantity}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.departmentName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" className="gap-1.5 text-xs" disabled={isPrinting}
                  onClick={() => {
                    const rec = records.find((r: any) => r.id === selectedId);
                    if (rec) handleReprintClearance(rec);
                  }}>
                  {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                  إعادة طباعة البراءة
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowPreview(false)}>
                  إغلاق
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
