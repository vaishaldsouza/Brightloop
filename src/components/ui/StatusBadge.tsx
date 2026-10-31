import React from "react";
import { SubscriptionStatus, InvoiceStatus } from "@prisma/client";

export type EntityStatus = SubscriptionStatus | InvoiceStatus | string;

interface StatusBadgeProps {
  status: EntityStatus;
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, className = "", dot = true }: StatusBadgeProps) {
  const normalized = status.toUpperCase();

  // Consistent color mapping:
  // Draft: Gray
  // Quotation: Blue
  // Confirmed: Amber
  // Active/Paid: Emerald
  // Closed/Overdue/Void: Rose
  let styleClasses = "bg-slate-100 text-slate-700 border-slate-200";
  let dotColor = "bg-slate-500";
  let label = status;

  switch (normalized) {
    case "DRAFT":
      styleClasses = "bg-slate-100 text-slate-700 border-slate-200";
      dotColor = "bg-slate-400";
      label = "Draft";
      break;
    case "QUOTATION":
      styleClasses = "bg-blue-50 text-blue-700 border-blue-200";
      dotColor = "bg-blue-500";
      label = "Quotation";
      break;
    case "CONFIRMED":
      styleClasses = "bg-amber-50 text-amber-800 border-amber-200";
      dotColor = "bg-amber-500";
      label = "Confirmed";
      break;
    case "ACTIVE":
      styleClasses = "bg-emerald-50 text-emerald-700 border-emerald-200";
      dotColor = "bg-emerald-500";
      label = "Active";
      break;
    case "PAID":
      styleClasses = "bg-emerald-50 text-emerald-700 border-emerald-700/20";
      dotColor = "bg-emerald-500";
      label = "Paid";
      break;
    case "CLOSED":
      styleClasses = "bg-rose-50 text-rose-700 border-rose-200";
      dotColor = "bg-rose-500";
      label = "Closed";
      break;
    default:
      styleClasses = "bg-slate-100 text-slate-700 border-slate-200";
      dotColor = "bg-slate-400";
      label = status;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styleClasses} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      {label}
    </span>
  );
}

export default StatusBadge;
