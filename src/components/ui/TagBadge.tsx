import React from "react";

export type DerivedTag = "OVERDUE" | "PARTIALLY_PAID" | "PAUSED" | "CANCELLED" | string;

interface TagBadgeProps {
  tag: DerivedTag;
  label?: string;
  className?: string;
}

export function TagBadge({ tag, label, className = "" }: TagBadgeProps) {
  const normalized = tag.toUpperCase();

  let styleClasses = "bg-slate-100 text-slate-700 border-slate-200";
  let icon = "label";
  let displayLabel = label;

  if (normalized.includes("OVERDUE")) {
    styleClasses = "bg-rose-50 text-rose-700 border-rose-200";
    icon = "warning";
    displayLabel = label || "Overdue";
  } else if (normalized.includes("PARTIAL")) {
    styleClasses = "bg-amber-50 text-amber-800 border-amber-200";
    icon = "timelapse";
    displayLabel = label || "Partially paid";
  } else if (normalized.includes("PAUSED")) {
    styleClasses = "bg-slate-100 text-slate-700 border-slate-200";
    icon = "pause_circle";
    displayLabel = label || "Paused";
  } else if (normalized.includes("CANCEL")) {
    styleClasses = "bg-slate-100 text-slate-500 border-slate-300 line-through";
    icon = "cancel";
    displayLabel = label || "Cancelled";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${styleClasses} ${className}`}
    >
      <span className="material-symbols-outlined text-[13px]">{icon}</span>
      <span>{displayLabel}</span>
    </span>
  );
}

export default TagBadge;
