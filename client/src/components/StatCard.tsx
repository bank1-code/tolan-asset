/*
 * Design: Calm Luxury - بطاقة إحصائيات
 * ظلال ناعمة متعددة الطبقات، أيقونات ملونة، أرقام كبيرة
 */
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  trend?: { value: number; label: string };
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
  trend,
}: StatCardProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] transition-shadow duration-300">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-extrabold text-foreground tracking-tight">
            {typeof value === "number" ? value.toLocaleString("ar-SA") : value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "text-[11px] font-bold",
                  trend.value >= 0 ? "text-emerald-600" : "text-red-500"
                )}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-[10px] text-muted-foreground">
                {trend.label}
              </span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
            iconBg
          )}
        >
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
