/*
 * Design: Calm Luxury - التخطيط الرئيسي
 * شريط جانبي + منطقة محتوى مع شريط علوي
 * ✅ إصلاح جذري: Sidebar overlay صحيح لـ RTL، إغلاق تلقائي عند اختيار صفحة
 */
import { cn } from "@/lib/utils";
import { Search, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Sidebar from "./Sidebar";
import NotificationPanel from "./NotificationPanel";
import { useAuth } from "@/_core/hooks/useAuth";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function DashboardLayout({
  children,
  title,
  subtitle,
  actions,
}: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  // ✅ الإصلاح الجذري 1: إغلاق الـ Sidebar تلقائياً عند تغيير الصفحة
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // ✅ الإصلاح الجذري 2: منع التمرير خلف الـ overlay عند فتح الـ Sidebar
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">

      {/* ✅ الإصلاح الجذري 3: Overlay + Sidebar على الهواتف فقط */}
      {/* Overlay: يغطي الشاشة ويغلق الـ Sidebar عند الضغط */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-300",
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ✅ الإصلاح الجذري 4: Sidebar على الهواتف - يأتي من اليمين (RTL) */}
      <div
        className={cn(
          "fixed top-0 right-0 h-screen z-50 md:hidden transition-transform duration-300 ease-out",
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <Sidebar
          collapsed={false}
          onToggle={() => {}}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* ✅ Sidebar ثابت على الشاشات الكبيرة (md+) */}
      <div className="hidden md:block fixed top-0 right-0 h-screen z-30">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </div>

      {/* ✅ Main Content: هامش يسار يساوي عرض الـ Sidebar على md+ */}
      <main
        className={cn(
          "transition-all duration-300 ease-out min-h-screen",
          collapsed ? "md:mr-[72px]" : "md:mr-[260px]"
        )}
      >
        {/* ✅ Top Bar */}
        <header className="sticky top-0 z-20 h-16 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            {/* ✅ زر فتح Sidebar على الهواتف فقط */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="فتح القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>

            {title && (
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search */}
            <div className="relative hidden sm:block">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="بحث سريع..."
                className="w-full max-w-[200px] h-9 pr-9 pl-4 rounded-lg bg-muted/50 border border-border text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>

            {/* Notifications */}
            <NotificationPanel />

            {/* User Avatar */}
            <div className="hidden sm:flex items-center gap-2.5 pr-3 border-r border-border">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{(user?.name || "م").slice(0, 1)}</span>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-bold text-foreground">{user?.name || user?.username || "مستخدم"}</p>
                <p className="text-[10px] text-muted-foreground">{{ owner: "المالك", admin: "مدير النظام", accountant: "المحاسب", employee: "الموظف" }[user?.role || "employee"]}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Actions Bar */}
        {actions && (
          <div className="px-4 sm:px-6 py-3 border-b border-border bg-muted/30 flex items-center justify-between overflow-x-auto">
            {actions}
          </div>
        )}

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
