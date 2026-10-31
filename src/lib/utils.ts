import { formatPaise } from "./currency";

/**
 * Format paise into Indian Rupee representation (e.g., ₹14,50,000.00)
 */
export function formatCurrency(paise: number): string {
  return formatPaise(paise);
}

/**
 * Format a Date or ISO string into "DD MMM YYYY" (e.g. "01 Jan 2026")
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format a Date or ISO string into "DD MMM YYYY, hh:mm a"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export { formatPaise };
