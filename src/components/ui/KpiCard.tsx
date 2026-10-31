import React from "react";

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  helperText?: string;
  icon: string;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  footerText?: string;
  footerSubtext?: string;
  variant?: "default" | "primary" | "danger" | "success" | "warning";
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  helperText,
  icon,
  iconColor = "text-primary-container",
  iconBg = "bg-indigo-50",
  trend,
  footerText,
  footerSubtext,
  variant = "default",
  className = "",
}: KpiCardProps) {
  const sub = subtitle || helperText;
  let cardBorder = "border-[#E2E8F0] hover:border-[#CBD5E1]";
  let cardBg = "bg-surface-container-lowest";

  if (variant === "danger") {
    cardBorder = "border-rose-200/80 hover:border-rose-300";
    cardBg = "bg-gradient-to-b from-white to-rose-50/20";
  } else if (variant === "warning") {
    cardBorder = "border-amber-200/80 hover:border-amber-300";
  } else if (variant === "success") {
    cardBorder = "border-emerald-200/80 hover:border-emerald-300";
  } else if (variant === "primary") {
    cardBorder = "border-indigo-200/80 hover:border-indigo-300";
  }

  return (
    <div
      className={`rounded-xl border ${cardBorder} ${cardBg} p-5 shadow-xs relative overflow-hidden group transition-all ${className}`}
    >
      <div className="flex items-center justify-between text-secondary mb-2">
        <span
          className={`font-label-md text-label-md uppercase tracking-wider font-semibold ${
            variant === "danger" ? "text-rose-800" : "text-slate-500"
          }`}
        >
          {title}
        </span>
        <div className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <div
          className={`font-currency-display text-currency-display font-bold tabular-nums ${
            variant === "danger" ? "text-rose-950" : "text-on-surface"
          }`}
        >
          {value}
        </div>
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-label-sm font-semibold px-1.5 py-0.5 rounded-md ${
              trend.isPositive
                ? "text-emerald-700 bg-emerald-50"
                : "text-rose-700 bg-rose-50"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {trend.isPositive ? "trending_up" : "trending_down"}
            </span>
            {trend.value}
          </span>
        )}
      </div>

      {sub && <p className="text-body-sm text-secondary mt-1">{sub}</p>}

      {(footerText || footerSubtext) && (
        <div
          className={`mt-2.5 pt-2.5 border-t ${
            variant === "danger" ? "border-rose-100 text-rose-900" : "border-[#F1F5F9] text-secondary"
          } flex items-center justify-between text-body-sm font-body-sm`}
        >
          <span>{footerText}</span>
          {footerSubtext && <span className="text-xs text-slate-400">{footerSubtext}</span>}
        </div>
      )}
    </div>
  );
}

export default KpiCard;
