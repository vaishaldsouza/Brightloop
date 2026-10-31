"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@prisma/client";

interface SidebarProps {
  userRole?: Role | null;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: string;
  adminOnly?: boolean;
}

export function Sidebar({
  userRole,
  isOpenMobile = false,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();

  // Navigation order specified in requirements:
  // 1. Dashboard, 2. Customers, 3. Products, 4. Plans, 5. Quotation Templates,
  // 6. Subscriptions, 7. Invoices, 8. Payments, 9. Reports
  const mainNav: NavItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { name: "Customers", href: "/customers", icon: "group" },
    { name: "Products", href: "/products", icon: "inventory_2" },
    { name: "Plans", href: "/plans", icon: "layers" },
    { name: "Quotation Templates", href: "/quotation-templates", icon: "description" },
    { name: "Subscriptions", href: "/subscriptions", icon: "autorenew" },
    { name: "Invoices", href: "/invoices", icon: "receipt_long" },
    { name: "Payments", href: "/payments", icon: "payments" },
    { name: "Reports", href: "/reports", icon: "bar_chart" },
  ];

  // Admin only group: 10. Discounts, 11. Taxes, 12. Staff
  const adminNav: NavItem[] = [
    { name: "Discounts", href: "/discounts", icon: "percent", adminOnly: true },
    { name: "Taxes", href: "/taxes", icon: "account_balance", adminOnly: true },
    { name: "Staff", href: "/staff", icon: "badge", adminOnly: true },
  ];

  const isAdmin = userRole === Role.ADMIN;

  const renderLink = (item: NavItem) => {
    const isActive =
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(item.href);

    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={onCloseMobile}
        className={`flex items-center justify-between px-3 py-2 rounded-lg text-body-md font-body-md transition-colors duration-150 ${
          isActive
            ? "bg-surface-container-low text-primary-container font-semibold border-r-2 border-primary-container"
            : "text-secondary hover:text-on-surface hover:bg-surface-container-low"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`material-symbols-outlined text-[20px] ${
              isActive ? "text-primary-container font-semibold" : "text-secondary"
            }`}
          >
            {item.icon}
          </span>
          <span>{item.name}</span>
        </div>
        {item.adminOnly && (
          <span className="material-symbols-outlined text-slate-400 text-[14px]" title="Admin Only">
            lock
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container: Fixed 256px (w-64) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-surface-container-lowest border-r border-[#E2E8F0] transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold text-headline-md shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[20px]">all_inclusive</span>
            </div>
            <div className="flex flex-col truncate">
              <span className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight truncate leading-none">
                Brightloop
              </span>
              <span className="font-label-sm text-label-sm text-secondary truncate mt-1">
                Billing &amp; Revenue Ops
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            suppressHydrationWarning
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 lg:hidden"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Organization Badge Switcher */}
        <div className="px-4 py-2.5 bg-surface-container-low/60 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium truncate">
              Brightloop India Pvt Ltd
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
            {userRole}
          </span>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          <div className="px-3 py-1 font-label-sm text-label-sm font-semibold text-secondary uppercase tracking-wider">
            Navigation
          </div>

          {/* 1 - 9 Core Navigation */}
          {mainNav.map(renderLink)}

          {/* Admin Only Section (Only shown to ADMIN) */}
          {isAdmin && (
            <div className="pt-3 border-t border-[#F1F5F9] space-y-1">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="font-label-sm text-label-sm font-semibold uppercase text-slate-400 tracking-wider">
                  Admin only
                </span>
                <span className="material-symbols-outlined text-slate-400 text-[14px]">
                  lock
                </span>
              </div>
              {adminNav.map(renderLink)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC] text-center text-xs text-slate-400">
          Brightloop Revenue OS v4.18
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
