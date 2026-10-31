"use client";

import React, { useState, useRef, useEffect } from "react";
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

export function TopBar({ user, onOpenMobileMenu }: TopBarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
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

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 h-16 w-full bg-surface-container-lowest border-b border-[#E2E8F0] shadow-xs">
      {/* Mobile Menu Button + Search */}
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
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subscriptions, customers, invoices (₹ INR)..."
            className="w-full pl-9 pr-14 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-md font-body-md text-on-surface placeholder:text-slate-400 focus:bg-white focus:border-primary-container focus:ring-2 focus:ring-primary-container/15 transition-all outline-none"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 bg-white border border-[#CBD5E1] rounded shadow-xs">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right Trailing Cluster: Notifications + User Profile Menu */}
      <div className="flex items-center gap-3 sm:gap-4 ml-4 shrink-0">
        {/* Notifications */}
        <button
          className="relative p-2 text-secondary hover:text-on-surface hover:bg-surface-container-low rounded-lg transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white"></span>
        </button>

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
