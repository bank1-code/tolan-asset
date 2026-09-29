/*
 * Design: Calm Luxury - القائمة الجانبية
 * ✅ إصلاح جذري: لا z-index داخلي، زر إغلاق واضح، إغلاق تلقائي عند اختيار صفحة
 * ✅ PWA: زر تثبيت التطبيق احترافي في الـ Footer
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { cn } from "@/lib/utils";
import {
  Activity,
  Archive,
  ArrowLeftRight,
  BarChart3,
  Box,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Download,
  HandCoins,
  LayoutDashboard,
  Loader2,
  LogOut,
  ScanSearch,
  ScrollText,
  Settings,
  ShieldCheck,
  Smartphone,
  X,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
}

const menuGroups = [
  {
    label: "الرئيسية",
    items: [
      { path: "/", icon: LayoutDashboard, label: "لوحة التحكم" },
    ],
  },
  {
    label: "إدارة الممتلكات",
    items: [
      { path: "/assets", icon: Box, label: "الأصول" },
      { path: "/custody", icon: HandCoins, label: "العهد" },
    ],
  },
  {
    label: "العمليات",
    items: [
      { path: "/transfers", icon: ArrowLeftRight, label: "النقل" },
      { path: "/exclusions", icon: XCircle, label: "الاستبعادات" },
      { path: "/clearance", icon: ClipboardCheck, label: "براءة الذمة" },
    ],
  },
  {
    label: "السجلات",
    items: [
      { path: "/archive", icon: Archive, label: "الأرشيف" },
      { path: "/reports", icon: BarChart3, label: "التقارير" },
      { path: "/audit-log", icon: ScrollText, label: "سجل التدقيق" },
      { path: "/tracking", icon: Activity, label: "التتبع" },
      { path: "/inventory-count", icon: ClipboardList, label: "الجرد" },
      { path: "/browse-assets", icon: ScanSearch, label: "استعراض العهد والأصول" },
    ],
  },
  {
    label: "النظام",
    items: [
      { path: "/users", icon: ShieldCheck, label: "المستخدمين" },
      { path: "/settings", icon: Settings, label: "الإعدادات" },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { canInstall, isInstalled, isInstalling, install } = usePWAInstall();
  const { data: branding } = trpc.settings.branding.get.useQuery();
  const visibleMenuGroups = user?.role === "employee"
    ? [{ label: "حسابي", items: [{ path: "/my-items", icon: HandCoins, label: "أصولي وعهدي" }] }]
    : menuGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (user?.role === "accountant" && (item.path === "/users" || item.path === "/settings")) return false;
          if ((item.path === "/users" || item.path === "/settings") && user?.role !== "owner" && user?.role !== "admin") return false;
          return true;
        }),
      })).filter((group) => group.items.length > 0);

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  const handleMenuClick = (path: string) => {
    setLocation(path);
    // ✅ إغلاق الـ Sidebar على الهواتف عند الضغط على أي عنصر
    if (onClose) {
      onClose();
    }
  };

  return (
    <aside
      className={cn(
        "h-screen flex flex-col transition-all duration-300 ease-out",
        "bg-sidebar border-l border-sidebar-border",
        "shadow-[0_0_30px_rgba(0,0,0,0.08)]",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Header: Logo + زر إغلاق على الهواتف */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0 overflow-hidden">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="شعار النظام" className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-5 h-5 text-primary-foreground" />
          )}
        </div>
        {!collapsed && (
          <>
            <div className="overflow-hidden flex-1">
              <h1 className="text-sm font-bold text-sidebar-foreground truncate">
                {branding?.systemName || "إدارة العهد والأصول"}
              </h1>
              <p className="text-[10px] text-muted-foreground truncate">{branding?.systemSubtitle || "نظام سحابي متكامل"}</p>
            </div>
            {/* ✅ زر إغلاق واضح على الهواتف فقط */}
            {onClose && (
              <button
                onClick={onClose}
                className="md:hidden p-1.5 hover:bg-sidebar-accent rounded-lg transition-colors shrink-0"
                aria-label="إغلاق القائمة"
              >
                <X className="w-4 h-4 text-sidebar-foreground/70" />
              </button>
            )}
          </>
        )}
        {/* زر طي الـ Sidebar على الشاشات الكبيرة */}
        {!onClose && (
          <button
            onClick={onToggle}
            className="hidden md:flex p-1.5 hover:bg-sidebar-accent rounded-lg transition-colors shrink-0 mr-auto"
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            {collapsed ? (
              <ChevronLeft className="w-4 h-4 text-sidebar-foreground/70" />
            ) : (
              <ChevronRight className="w-4 h-4 text-sidebar-foreground/70" />
            )}
          </button>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {visibleMenuGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider px-2.5 mb-1.5">
                {group.label}
              </p>
            )}
            {collapsed && <div className="h-px bg-sidebar-border mx-2 mb-2" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  location === item.path ||
                  (item.path !== "/" && location.startsWith(item.path));
                return (
                  <li key={item.path}>
                    <button
                      onClick={() => handleMenuClick(item.path)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-200",
                        "hover:bg-sidebar-accent",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary font-bold shadow-sm"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "w-[18px] h-[18px] shrink-0 transition-colors",
                          isActive ? "text-sidebar-primary" : "text-muted-foreground"
                        )}
                      />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 shrink-0 space-y-1">

        {/* ✅ زر تثبيت PWA - يظهر فقط عند توفر الإمكانية */}
        {(canInstall || isInstalled) && (
          <>
            {collapsed ? (
              /* وضع المطوي: أيقونة فقط مع tooltip */
              <button
                onClick={canInstall ? install : undefined}
                disabled={isInstalling || isInstalled}
                title={isInstalled ? "التطبيق مثبت" : "تثبيت التطبيق"}
                className={cn(
                  "w-full flex items-center justify-center rounded-lg p-2 transition-all duration-200",
                  isInstalled
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-primary hover:bg-sidebar-accent"
                )}
              >
                {isInstalling ? (
                  <Loader2 className="w-[18px] h-[18px] animate-spin" />
                ) : isInstalled ? (
                  <CheckCircle2 className="w-[18px] h-[18px]" />
                ) : (
                  <Download className="w-[18px] h-[18px]" />
                )}
              </button>
            ) : (
              /* وضع الموسع: بطاقة تثبيت كاملة */
              <div className={cn(
                "rounded-xl p-3 mb-1 transition-all duration-300",
                isInstalled
                  ? "bg-emerald-50 border border-emerald-100"
                  : "bg-primary/5 border border-primary/10"
              )}>
                {isInstalled ? (
                  /* حالة: مثبت */
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="overflow-hidden flex-1">
                      <p className="text-xs font-semibold text-emerald-700 truncate">
                        التطبيق مثبت
                      </p>
                      <p className="text-[10px] text-emerald-600/70">
                        يعمل كتطبيق مستقل
                      </p>
                    </div>
                    <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                  </div>
                ) : (
                  /* حالة: يمكن التثبيت */
                  <button
                    onClick={install}
                    disabled={isInstalling}
                    className="w-full text-right"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {isInstalling ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="overflow-hidden flex-1">
                        <p className="text-xs font-semibold text-sidebar-foreground truncate">
                          {isInstalling ? "جاري التثبيت..." : "تثبيت التطبيق"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          يعمل بدون متصفح
                        </p>
                      </div>
                      {!isInstalling && (
                        <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <ChevronLeft className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* معلومات المستخدم */}
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">
              {user?.name?.charAt(0) || "A"}
            </span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">
                {user?.name || "المستخدم"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {({ owner: "المالك", admin: "مدير النظام", accountant: "المحاسب", employee: "الموظف" } as Record<string, string>)[user?.role || ""] || "مستخدم"}
              </p>
            </div>
          )}
        </div>

        {/* زر تسجيل الخروج */}
        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-200",
            "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span className="truncate">تسجيل الخروج</span>}
        </button>
      </div>
    </aside>
  );
}
