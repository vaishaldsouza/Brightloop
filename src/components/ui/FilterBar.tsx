import React from "react";

interface FilterBarProps {
  children: React.ReactNode;
  onReset?: () => void;
  trailingAction?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  children,
  onReset,
  trailingAction,
  actions,
  className = "",
}: FilterBarProps) {
  const actionContent = actions || trailingAction;
  return (
    <section className={`bg-surface-container-lowest border border-[#E2E8F0] rounded-xl p-3 shadow-xs ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2.5">
          {children}

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              suppressHydrationWarning
              className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-body-sm text-body-sm flex items-center gap-1 transition"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
              <span>Reset</span>
            </button>
          )}
        </div>

        {actionContent && (
          <div className="flex items-center shrink-0 self-start md:self-auto">
            {actionContent}
          </div>
        )}
      </div>
    </section>
  );
}

export default FilterBar;
