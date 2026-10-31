import React from "react";
import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  statusBadge?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  subtitle,
  breadcrumbs,
  actions,
  statusBadge,
  className = "",
}: PageHeaderProps) {
  const desc = description || subtitle;
  return (
    <div className={`space-y-4 pb-2 border-b border-[#E2E8F0] ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-body-sm font-body-sm text-secondary">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.label}>
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-primary-container transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-medium text-on-surface" : ""}>
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <span className="material-symbols-outlined text-[14px] text-slate-400">
                    chevron_right
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">
              {title}
            </h1>
            {statusBadge}
          </div>
          {desc && (
            <p className="font-body-md text-body-md text-secondary mt-0.5">
              {desc}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center flex-wrap gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
