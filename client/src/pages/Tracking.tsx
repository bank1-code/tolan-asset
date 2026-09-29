/**
 * Tracking.tsx - تتبع دورة حياة الأصول والعهد
 * خط زمني بصري يعرض كافة العمليات التي مرّت على أصل أو عهدة
 */
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Search, Activity, ArrowLeftRight, PenLine, PlusCircle,
  XCircle, ChevronDown, ChevronUp, X, Box, HandCoins,
  Clock, User, FileText, AlertCircle, Loader2
} from "lucide-react";

// ─── أنواع الأحداث وألوانها وأيقوناتها ──────────────────────────────────────
const EVENT_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  dot: string;
}> = {
  CREATE: {
    label: "إضافة جديدة",
    icon: PlusCircle,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  UPDATE: {
    label: "تحديث بيانات",
    icon: PenLine,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  TRANSFER: {
    label: "نقل ملكية",
    icon: ArrowLeftRight,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  EXCLUDE: {
    label: "استبعاد",
    icon: XCircle,
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-500",
  },
  DELETE: {
    label: "حذف",
    icon: XCircle,
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    dot: "bg-rose-500",
  },
};

const getEventConfig = (actionType: string) =>
  EVENT_CONFIG[actionType] || {
    label: actionType,
    icon: Activity,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border",
    dot: "bg-muted-foreground",
  };

// ─── ترجمة أسماء الحقول ──────────────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  assetName: "اسم الأصل",
  name: "الاسم",
  assetCode: "رمز الأصل",
  code: "الرمز",
  assetValue: "القيمة",
  quantity: "الكمية",
  status: "الحالة",
  notes: "الملاحظات",
  assignedTo: "مسند إلى",
  departmentId: "القسم",
  locationId: "الموقع",
  condition: "الحالة الفنية",
  fromEmployeeId: "من موظف",
  toEmployeeId: "إلى موظف",
  transferType: "نوع النقل",
  reason: "السبب",
  exclusionReason: "سبب الاستبعاد",
};

// ─── مكوّن نافذة التفاصيل (قبل / بعد) ───────────────────────────────────────
function EventDetailModal({ event, onClose }: { event: any; onClose: () => void }) {
  const cfg = getEventConfig(event.actionType);
  const Icon = cfg.icon;

  const oldData = event.oldData || {};
  const newData = event.newData || {};
  const changedFields: string[] = event.changedFields || Object.keys({ ...oldData, ...newData });

  // الحقول المراد عرضها (تجاهل الحقول الداخلية)
  const skipFields = ["id", "createdAt", "updatedAt", "createdBy", "performedBy"];
  const displayFields = changedFields.filter(f => !skipFields.includes(f));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* رأس النافذة */}
        <div className={`flex items-center gap-3 px-5 py-4 ${cfg.bg} border-b ${cfg.border}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
            <Icon className={`w-5 h-5 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-sm ${cfg.color}`}>{cfg.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {event.actionDescription || "تفاصيل العملية"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/10 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* معلومات العملية */}
        <div className="px-5 py-3 bg-muted/20 border-b border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            {event.performedByName || "غير معروف"}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {new Date(event.createdAt).toLocaleString("ar-SA")}
          </span>
          {event.tableName && (
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {event.tableName}
            </span>
          )}
        </div>

        {/* جدول قبل / بعد */}
        <div className="flex-1 overflow-y-auto p-5">
          {displayFields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              لا توجد تفاصيل إضافية لهذه العملية
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground w-1/3">الحقل</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-red-600/70 w-1/3">قبل</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-emerald-600/70 w-1/3">بعد</th>
                  </tr>
                </thead>
                <tbody>
                  {displayFields.map((field, i) => {
                    const before = oldData[field];
                    const after = newData[field];
                    const changed = JSON.stringify(before) !== JSON.stringify(after);
                    return (
                      <tr
                        key={field}
                        className={`border-b border-border/50 ${changed ? "" : "opacity-50"} ${i % 2 === 0 ? "bg-transparent" : "bg-muted/10"}`}
                      >
                        <td className="py-2.5 px-4 text-xs font-medium text-foreground">
                          {FIELD_LABELS[field] || field}
                        </td>
                        <td className="py-2.5 px-4 text-xs">
                          {before !== undefined && before !== null ? (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] ${changed ? "bg-red-50 text-red-700 border border-red-200" : "text-muted-foreground"}`}>
                              {String(before)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-xs">
                          {after !== undefined && after !== null ? (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] ${changed ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-muted-foreground"}`}>
                              {String(after)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── مكوّن حدث واحد في الخط الزمني ──────────────────────────────────────────
function TimelineEvent({ event, isLast }: { event: any; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const cfg = getEventConfig(event.actionType);
  const Icon = cfg.icon;

  return (
    <>
      <div className="flex gap-4 group">
        {/* العمود الأيسر: الخط والنقطة */}
        <div className="flex flex-col items-center">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border-2 shadow-sm flex-shrink-0 ${cfg.bg} ${cfg.border} transition-transform group-hover:scale-105`}>
            <Icon className={`w-4.5 h-4.5 ${cfg.color}`} />
          </div>
          {!isLast && (
            <div className="w-0.5 flex-1 mt-1 bg-gradient-to-b from-border to-transparent min-h-[2rem]" />
          )}
        </div>

        {/* المحتوى */}
        <div className={`flex-1 mb-5 rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden transition-shadow hover:shadow-md`}>
          {/* رأس الحدث */}
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                {event.actionDescription && (
                  <span className="text-xs text-muted-foreground truncate max-w-xs">
                    — {event.actionDescription}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {event.performedByName || "غير معروف"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(event.createdAt).toLocaleString("ar-SA")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={e => { e.stopPropagation(); setShowDetail(true); }}
                className={`text-[11px] px-3 py-1 rounded-lg border ${cfg.border} ${cfg.color} font-medium hover:opacity-80 transition-opacity`}
              >
                قبل / بعد
              </button>
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* تفاصيل موجزة عند التوسيع */}
          {expanded && (
            <div className="px-4 pb-3 border-t border-border/50 pt-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {event.changedFields && Array.isArray(event.changedFields) && event.changedFields.slice(0, 6).map((field: string) => {
                  const before = event.oldData?.[field];
                  const after = event.newData?.[field];
                  if (before === after) return null;
                  return (
                    <div key={field} className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2.5 py-1.5 border border-border/40">
                      <span className="font-medium text-foreground/70 shrink-0">{FIELD_LABELS[field] || field}:</span>
                      {before !== undefined && (
                        <span className="text-red-600 line-through text-[10px] truncate">{String(before)}</span>
                      )}
                      {before !== undefined && after !== undefined && <span className="text-muted-foreground">→</span>}
                      {after !== undefined && (
                        <span className="text-emerald-700 font-medium text-[10px] truncate">{String(after)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showDetail && <EventDetailModal event={event} onClose={() => setShowDetail(false)} />}
    </>
  );
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────────────────
export default function Tracking() {
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<{ id: number; type: "asset" | "custody"; name: string; code?: string | null } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const searchRef = useRef<HTMLDivElement>(null);

  // خيارات الفلتر
  const FILTER_OPTIONS = [
    { key: "ALL", label: "الكل" },
    { key: "CREATE", label: "إضافة" },
    { key: "UPDATE", label: "تحديث" },
    { key: "TRANSFER", label: "نقل" },
    { key: "EXCLUDE", label: "استبعاد" },
  ];

  // قراءة query params عند التحميل من جدول الأصول/العهد
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") as "asset" | "custody" | null;
    const id = params.get("id");
    const name = params.get("name");
    const code = params.get("code");
    if (type && id && name) {
      setSelectedEntity({ id: Number(id), type, name: decodeURIComponent(name), code: code ? decodeURIComponent(code) : null });
      setSearchQuery(decodeURIComponent(name));
    }
  }, [location]);

  // Debounce البحث
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: searchResults, isLoading: isSearching } = trpc.records.tracking.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  const { data: timeline, isLoading: isLoadingTimeline } = trpc.records.audit.getTimeline.useQuery(
    { entityType: selectedEntity?.type ?? "asset", entityId: selectedEntity?.id ?? 0 },
    { enabled: !!selectedEntity }
  );

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* رأس الصفحة */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">تتبع دورة الحياة</h1>
              <p className="text-xs text-muted-foreground">سجل تاريخي متكامل لكل الأحداث التي مرّت على الأصل أو العهدة</p>
            </div>
          </div>
        </div>

        {/* شريط البحث */}
        <div ref={searchRef} className="relative mb-8">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            {isSearching && (
              <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
            )}
            <input
              type="text"
              placeholder="ابحث عن أصل أو عهدة بالاسم أو الرمز..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => debouncedQuery.length >= 2 && setShowDropdown(true)}
              className="w-full h-12 pr-11 pl-11 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all shadow-sm"
            />
          </div>

          {/* نتائج البحث */}
          {showDropdown && searchResults && searchResults.length > 0 && (
            <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-xl z-30 overflow-hidden">
              {searchResults.map((item: any) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    setSelectedEntity({ id: item.id, type: item.type, name: item.name, code: item.code });
                    setSearchQuery(item.name);
                    setShowDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-right border-b border-border/50 last:border-0"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.type === "asset" ? "bg-blue-50 border border-blue-200" : "bg-teal-50 border border-teal-200"}`}>
                    {item.type === "asset"
                      ? <Box className="w-4 h-4 text-blue-600" />
                      : <HandCoins className="w-4 h-4 text-teal-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.type === "asset" ? "أصل" : "عهدة"}
                      {item.code ? ` · ${item.code}` : ""}
                      {item.employeeName ? ` · ${item.employeeName}` : ""}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    item.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                    item.status === "EXCLUDED" ? "bg-red-50 text-red-700 border border-red-200" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {item.status === "ACTIVE" ? "نشط" : item.status === "EXCLUDED" ? "مستبعد" : item.status}
                  </span>
                </button>
              ))}
            </div>
          )}

          {showDropdown && debouncedQuery.length >= 2 && !isSearching && searchResults?.length === 0 && (
            <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-xl z-30 px-4 py-6 text-center text-sm text-muted-foreground">
              لا توجد نتائج لـ "{debouncedQuery}"
            </div>
          )}
        </div>

        {/* الخط الزمني */}
        {!selectedEntity ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-base font-semibold text-muted-foreground mb-1">ابدأ بالبحث</h3>
            <p className="text-sm text-muted-foreground/60">ابحث عن أصل أو عهدة لعرض سجل دورة حياتها الكاملة</p>
          </div>
        ) : isLoadingTimeline ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">جاري تحميل السجل التاريخي...</p>
          </div>
        ) : !timeline || timeline.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <h3 className="text-base font-semibold text-muted-foreground mb-1">لا توجد سجلات</h3>
            <p className="text-sm text-muted-foreground/60">لم يتم تسجيل أي عمليات لهذا العنصر حتى الآن</p>
          </div>
        ) : (
          <div>
            {/* معلومات العنصر المحدد */}
            <div className="flex items-center gap-3 mb-6 p-4 bg-card rounded-xl border border-border shadow-sm">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedEntity.type === "asset" ? "bg-blue-50 border border-blue-200" : "bg-teal-50 border border-teal-200"}`}>
                {selectedEntity.type === "asset"
                  ? <Box className="w-5 h-5 text-blue-600" />
                  : <HandCoins className="w-5 h-5 text-teal-600" />
                }
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-foreground">{selectedEntity.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedEntity.type === "asset" ? "أصل" : "عهدة"}
                  {selectedEntity.code ? ` · ${selectedEntity.code}` : ""}
                  {" · "}
                  <span className="text-primary font-medium">{timeline.length} حدث مسجّل</span>
                </p>
              </div>
              <button
                onClick={() => { setSelectedEntity(null); setSearchQuery(""); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* أزرار الفلتر */}
            <div className="flex flex-wrap gap-2 mb-5">
              {FILTER_OPTIONS.map(opt => {
                const cfg = opt.key !== "ALL" ? getEventConfig(opt.key) : null;
                const isActive = activeFilter === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setActiveFilter(opt.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      isActive
                        ? cfg
                          ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                          : "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {cfg && (() => { const Icon = cfg.icon; return <Icon className="w-3.5 h-3.5" />; })()}
                    {opt.label}
                    {opt.key !== "ALL" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        isActive ? "bg-white/60" : "bg-muted"
                      }`}>
                        {(timeline as any[]).filter(e => e.actionType === opt.key).length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* الخط الزمني */}
            {(() => {
              const filtered = activeFilter === "ALL"
                ? (timeline as any[])
                : (timeline as any[]).filter(e => e.actionType === activeFilter);
              return filtered.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground">لا توجد أحداث من نوع "{FILTER_OPTIONS.find(o => o.key === activeFilter)?.label}"</p>
                </div>
              ) : (
                <div className="relative">
                  {filtered.map((event: any, index: number) => (
                    <TimelineEvent
                      key={event.id}
                      event={event}
                      isLast={index === filtered.length - 1}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
