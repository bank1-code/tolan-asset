/*
 * Design: Calm Luxury - جدول بيانات
 * جدول أنيق مع فلاتر وبحث وترقيم صفحات
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchKey?: string;
  searchKeys?: string[]; // بحث في عدة حقول
  onRowClick?: (item: T) => void;
  actions?: (item: T) => React.ReactNode;
  emptyMessage?: string;
  pageSize?: number;
}

export default function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = "بحث...",
  searchKey,
  searchKeys,
  onRowClick,
  actions,
  emptyMessage = "لا توجد بيانات",
  pageSize = 10,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // دالة مساعدة: هل النص يحتوي على كلمة البحث؟
  const matchesSearch = (item: T): boolean => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();

    // إذا تم تمرير searchKeys → نبحث في كل الحقول المحددة
    if (searchKeys && searchKeys.length > 0) {
      return searchKeys.some((k) =>
        String(item[k] ?? "").toLowerCase().includes(q)
      );
    }

    // إذا تم تمرير searchKey → نبحث في هذا الحقل فقط
    if (searchKey) {
      return String(item[searchKey] ?? "").toLowerCase().includes(q);
    }

    // لا يوجد مفتاح → نبحث في جميع قيم الكائن
    return Object.values(item).some((v) =>
      String(v ?? "").toLowerCase().includes(q)
    );
  };

  const filtered = (searchKey || searchKeys)
    ? data.filter(matchesSearch)
    : data;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
      {/* Search */}
      {(searchKey || searchKeys) && (
        <div className="p-4 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 pr-9 pl-4 rounded-lg bg-muted/50 border border-border text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "text-right text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3",
                    col.className
                  )}
                >
                  {col.label}
                </th>
              ))}
              {actions && (
                <th className="text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3 w-24">
                  إجراءات
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actions ? 1 : 0)}
                  className="text-center py-12 text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((item, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    "border-b border-border/50 transition-colors",
                    onRowClick && "cursor-pointer",
                    "hover:bg-muted/30"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3 text-sm", col.className)}>
                      {col.render ? col.render(item) : item[col.key]}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 text-center">{actions(item)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            عرض {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filtered.length)} من {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(
              (p) => (
                <Button
                  key={p}
                  variant={page === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(p)}
                  className="h-7 w-7 p-0 text-xs"
                >
                  {p}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
