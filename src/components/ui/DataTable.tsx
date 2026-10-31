import React from "react";

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  accessor?: keyof T | ((item: T) => React.ReactNode);
  cell?: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  emptyIcon?: string;
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No records found matching criteria",
  emptyIcon = "inbox",
  isLoading = false,
  onRowClick,
  className = "",
}: DataTableProps<T>) {
  return (
    <div className={`w-full overflow-hidden border border-[#E2E8F0] rounded-xl bg-surface-container-lowest shadow-xs ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              {columns.map((col, idx) => {
                const alignClass =
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                    ? "text-center"
                    : "text-left";
                return (
                  <th
                    key={idx}
                    className={`px-4 py-3 text-label-sm font-semibold uppercase tracking-wider text-slate-500 ${alignClass} ${
                      col.className || ""
                    }`}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-2xl text-primary">
                      progress_activity
                    </span>
                    <span className="text-body-sm">Loading records...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-3xl text-slate-300">
                      {emptyIcon}
                    </span>
                    <span className="text-body-sm">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={() => onRowClick && onRowClick(item)}
                  className={`transition-colors hover:bg-[#F8FAFC] ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col, idx) => {
                    const alignClass =
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left";
                    return (
                      <td
                        key={idx}
                        className={`px-4 py-3 text-body-md font-body-md text-on-surface ${alignClass} ${
                          col.className || ""
                        }`}
                      >
                        {col.cell
                          ? col.cell(item)
                          : typeof col.accessor === "function"
                          ? col.accessor(item)
                          : col.accessor
                          ? String(item[col.accessor] ?? "")
                          : col.accessorKey
                          ? String(item[col.accessorKey] ?? "")
                          : null}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
