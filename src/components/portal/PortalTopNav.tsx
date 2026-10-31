"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface PortalTopNavProps {
  user: {
    id: string;
    name: string;
    email: string;
    companyName?: string | null;
  };
}

export default function PortalTopNav({ user }: PortalTopNavProps) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const navItems = [
    { label: "My Subscriptions", href: "/portal/subscriptions" },
    { label: "My Invoices", href: "/portal/invoices" },
    { label: "Account", href: "/portal/account" },
  ];

  const getInitials = (name: string) => {
    if (!name) return "CP";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-surface-container-lowest border-b border-outline-variant shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand & Navigation */}
        <div className="flex items-center gap-8">
          <Link
            href="/portal/subscriptions"
            className="flex items-center gap-2.5 text-primary group"
          >
            <div className="w-9 h-9 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-bold text-lg shadow-sm group-hover:bg-primary transition-colors">
              B
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md font-bold text-on-surface text-lg leading-tight tracking-tight">
                Brightloop
              </span>
              <span className="font-label-sm text-[10px] text-secondary uppercase tracking-widest font-semibold">
                Customer Portal
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`font-label-md text-sm py-1 border-b-2 transition-colors duration-150 ${
                    isActive
                      ? "border-primary text-primary font-semibold"
                      : "border-transparent text-secondary hover:text-on-surface hover:border-outline-variant"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: User Menu & Actions */}
        <div className="flex items-center gap-3">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-surface-container-low transition-colors duration-150 focus:outline-none"
              aria-expanded={dropdownOpen}
            >
              <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-fixed flex items-center justify-center font-label-md text-xs font-semibold border border-outline-variant">
                {getInitials(user.name)}
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="font-label-md text-xs font-semibold text-on-surface leading-tight">
                  {user.name}
                </span>
                <span className="font-label-sm text-[11px] text-secondary leading-tight truncate max-w-[150px]">
                  {user.companyName || user.email}
                </span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-secondary">
                expand_more
              </span>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-4 py-2.5 border-b border-outline-variant/50">
                  <p className="font-title-sm text-sm font-semibold text-on-surface">
                    {user.name}
                  </p>
                  <p className="font-body-sm text-xs text-secondary truncate">
                    {user.email}
                  </p>
                  {user.companyName && (
                    <span className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {user.companyName}
                    </span>
                  )}
                </div>

                <div className="py-1">
                  <Link
                    href="/portal/account"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px] text-secondary">
                      manage_accounts
                    </span>
                    Account Settings
                  </Link>
                  <Link
                    href="/portal/invoices"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px] text-secondary">
                      receipt_long
                    </span>
                    Invoices & Receipts
                  </Link>
                </div>

                <div className="border-t border-outline-variant/50 pt-1">
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-error hover:bg-error-container/30 transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      logout
                    </span>
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
