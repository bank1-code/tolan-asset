import { cn } from "@/lib/utils";
import { statusLabels } from "@/lib/data";

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const info = statusLabels[status] || { label: status, color: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold", info.color)}>
      {info.label}
    </span>
  );
}
