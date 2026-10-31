"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Role } from "@prisma/client";

interface TopBarProps {
  user?: {
    name?: string | null;
    email?: string | null;
    role?: Role | null;
  } | null;
  onOpenMobileMenu?: () => void;
}

interface SearchRoute {
  name: string;
  href: string;
  category: string;
  icon: string;
  adminOnly?: boolean;
}

export function TopBar({ user, onOpenMobileMenu }: TopBarProps) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === Role.ADMIN;

  const filteredRoutes = useMemo(() => {
    const searchableRoutes: SearchRoute[] = [
      { name: "Dashboard", href: "/dashboard", category: "Core Navigation", icon: "dashboard" },
      { name: "Customers & Accounts", href: "/customers", category: "Core Navigation", icon: "group" },
      { name: "Products & Variants", href: "/products", category: "Core Navigation", icon: "inventory_2" },
      { name: "Subscription Plans", href: "/plans", category: "Core Navigation", icon: "layers" },
      { name: "Quotation Templates", href: "/quotation-templates", category: "Core Navigation", icon: "description" },
      { name: "Subscriptions Lifecycle", href: "/subscriptions", category: "Core Navigation", icon: "autorenew" },
      { name: "Invoices & GST Ledger", href: "/invoices", category: "Core Navigation", icon: "receipt_long" },
      { name: "Payment Remittances", href: "/payments", category: "Core Navigation", icon: "payments" },
      { name: "Financial & Portfolio Reports", href: "/reports", category: "Core Navigation", icon: "bar_chart" },
      ...(isAdmin
        ? [
            { name: "Discounts & Vouchers", href: "/discounts", category: "Admin Only", icon: "percent", adminOnly: true },
            { name: "Tax Rules & GST", href: "/taxes", category: "Admin Only", icon: "account_balance", adminOnly: true },
            { name: "Staff Management", href: "/staff", category: "Admin Only", icon: "badge", adminOnly: true },
          ]
        : []),
    ];

    if (!searchQuery.trim()) return searchableRoutes.slice(0, 6);
    const q = searchQuery.toLowerCase().trim();
    return searchableRoutes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.href.toLowerCase().includes(q)
    );
  }, [searchQuery, isAdmin]);

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchFocused(true);
      } else if (e.key === "Escape") {
        setSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
      if (
        notifMenuRef.current &&
        !notifMenuRef.current.contains(e.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (name?: string | null) => {
    if (!name) return "BL";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const handleSelectRoute = (href: string) => {
    setSearchQuery("");
    setSearchFocused(false);
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 h-16 w-full bg-surface-container-lowest border-b border-[#E2E8F0] shadow-xs">
      {/* Mobile Menu Button + Search Input with Command Palette */}
      <div className="flex items-center gap-3 w-full max-w-xl">
        <button
          onClick={onOpenMobileMenu}
          className="p-1.5 -ml-1 text-secondary hover:text-on-surface hover:bg-slate-100 rounded-lg lg:hidden"
          title="Toggle Navigation"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>

        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <span className="material-symbols-outlined text-[19px]">search</span>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or jump to module (e.g. Subscriptions, Invoices)..."
            className="w-full pl-9 pr-14 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-md font-body-md text-on-surface placeholder:text-slate-400 focus:bg-white focus:border-primary-container focus:ring-2 focus:ring-primary-container/15 transition-all outline-none"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 bg-white border border-[#CBD5E1] rounded shadow-xs">
              ⌘K
            </kbd>
          </div>

          {/* Quick Jump Search Dropdown */}
          {searchFocused && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setSearchFocused(false)}
              />
              <div className="absolute left-0 right-0 mt-2 bg-surface-container-lowest border border-[#CBD5E1] rounded-xl shadow-lg z-30 overflow-hidden">
                <div className="px-3 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-xs text-secondary">
                  <span>Quick Navigation ({filteredRoutes.length} results)</span>
                  <span className="font-mono text-[10px]">Esc to dismiss</span>
                </div>
                <div className="max-h-64 overflow-y-auto py-1 divide-y divide-[#F1F5F9]">
                  {filteredRoutes.length === 0 ? (
                    <div className="px-4 py-6 text-center text-secondary text-body-sm">
                      No matching navigation targets found for &quot;{searchQuery}&quot;
                    </div>
                  ) : (
                    filteredRoutes.map((route) => (
                      <button
                        key={route.href}
                        onClick={() => handleSelectRoute(route.href)}
                        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-[#F8FAFC] text-left transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-[18px] text-secondary">
                            {route.icon}
                          </span>
                          <div>
                            <div className="text-body-sm font-semibold text-on-surface">
                              {route.name}
                            </div>
                            <div className="text-[11px] text-secondary">
                              {route.category}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-xs text-slate-400">{route.href}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Trailing Cluster: Notifications Popover + User Profile Menu */}
      <div className="flex items-center gap-3 sm:gap-4 ml-4 shrink-0">
        {/* Notifications Popover */}
        <div className="relative" ref={notifMenuRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 text-secondary hover:text-on-surface hover:bg-surface-container-low rounded-lg transition-colors"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-surface-container-lowest border border-[#E2E8F0] shadow-lg p-4 z-30">
              <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                <h4 className="text-body-sm font-bold text-on-surface">Notifications</h4>
                <span className="text-xs text-slate-400 font-medium">0 unread</span>
              </div>
              <div className="py-6 text-center text-slate-400 space-y-1">
                <span className="material-symbols-outlined text-3xl text-slate-300">
                  notifications_paused
                </span>
                <p className="text-body-sm text-secondary font-medium">No pending alerts</p>
                <p className="text-xs text-slate-400">
                  All systems operational. Recurring billing alerts will appear here.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-[#E2E8F0]"></div>

        {/* User Profile Menu */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-surface-container-low transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-on-primary-fixed text-xs ring-1 ring-primary-container/20">
              {getInitials(user?.name)}
            </div>
            <div className="hidden md:block text-left leading-tight">
              <div className="font-title-sm text-title-sm text-on-surface font-semibold truncate max-w-[140px]">
                {user?.name || "User"}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {user?.role || "STAFF"}
                </span>
                <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                  {user?.email}
                </span>
              </div>
            </div>
            <span className="material-symbols-outlined text-secondary text-sm">
              expand_more
            </span>
          </button>

          {/* Dropdown Menu */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl bg-surface-container-lowest border border-[#E2E8F0] shadow-lg py-2 z-30 animate-fade-in">
              <div className="px-4 py-2 border-b border-[#F1F5F9]">
                <p className="text-body-md font-semibold text-on-surface">
                  {user?.name}
                </p>
                <p className="text-body-sm text-secondary truncate">
                  {user?.email}
                </p>
                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Role: {user?.role}
                  </span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-body-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;
