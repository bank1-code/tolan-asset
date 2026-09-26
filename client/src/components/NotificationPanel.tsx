/**
 * NotificationPanel - لوحة الإشعارات
 * تعرض آخر العمليات من سجل التدقيق كإشعارات حقيقية
 */
import { useState, useRef, useEffect } from "react";
import { Bell, X, CheckCheck, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

const ACTION_ICONS: Record<string, string> = {
  CREATE: "➕",
  UPDATE: "✏️",
  DELETE: "🗑️",
  TRANSFER: "🔄",
  EXCLUSION: "❌",
  CLEARANCE: "✅",
  BACKUP: "💾",
  RESTORE: "♻️",
  LOGIN: "🔐",
  LOGOUT: "🚪",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "text-emerald-600",
  UPDATE: "text-blue-600",
  DELETE: "text-red-600",
  TRANSFER: "text-purple-600",
  EXCLUSION: "text-orange-600",
  CLEARANCE: "text-teal-600",
  BACKUP: "text-gray-600",
  RESTORE: "text-indigo-600",
  LOGIN: "text-green-600",
  LOGOUT: "text-yellow-600",
};

function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "الآن";
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export default function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem("readNotifications");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // جلب آخر 10 عمليات من سجل التدقيق
  const canViewAudit = user?.role === "owner" || user?.role === "admin" || user?.role === "accountant";
  const { data, refetch } = trpc.records.audit.list.useQuery(
    { limit: 10, offset: 0 },
    { refetchInterval: 30000, enabled: canViewAudit }
  );

  const notifications = data?.rows || [];
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  // إغلاق عند النقر خارج اللوحة
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const markAllRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadIds(allIds);
    localStorage.setItem("readNotifications", JSON.stringify(Array.from(allIds)));
  };

  const markRead = (id: number) => {
    const newSet = new Set(readIds);
    newSet.add(id);
    setReadIds(newSet);
    localStorage.setItem("readNotifications", JSON.stringify(Array.from(newSet)));
  };

  const handleViewAll = () => {
    setOpen(false);
    setLocation("/audit");
  };

  if (!canViewAudit) return null;

  return (
    <div className="relative" ref={panelRef}>
      {/* زر الجرس */}
      <button
        onClick={() => { setOpen(!open); if (!open) refetch(); }}
        className="relative w-9 h-9 rounded-lg bg-muted/50 border border-border flex items-center justify-center hover:bg-accent transition-colors"
        title="الإشعارات"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-primary text-[9px] text-primary-foreground font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* لوحة الإشعارات */}
      {open && (
        <div className="absolute left-0 top-11 w-80 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* رأس اللوحة */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">الإشعارات</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  title="تعليم الكل كمقروء"
                >
                  <CheckCheck className="w-3 h-3" />
                  قراءة الكل
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-muted rounded">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* قائمة الإشعارات */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                لا توجد إشعارات
              </div>
            ) : (
              notifications.map((n) => {
                const isRead = readIds.has(n.id);
                const icon = ACTION_ICONS[n.actionType] || "📌";
                const color = ACTION_COLORS[n.actionType] || "text-foreground";
                return (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`flex gap-3 px-4 py-3 border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors ${isRead ? "opacity-60" : "bg-primary/5"}`}
                  >
                    {/* النقطة الزرقاء للغير مقروء */}
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <span className="text-base">{icon}</span>
                      {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-snug ${color}`}>
                        {n.actionDescription}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {n.performedByName || "النظام"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">·</span>
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* تذييل اللوحة */}
          <div className="px-4 py-2.5 border-t border-border bg-muted/20">
            <button
              onClick={handleViewAll}
              className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              عرض سجل التدقيق الكامل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
