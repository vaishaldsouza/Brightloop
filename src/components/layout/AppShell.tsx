"use client";

import React, { useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { Role } from "@prisma/client";

interface AppShellProps {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: Role | null;
  } | null;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-on-surface flex flex-row">
      {/* Sidebar: Fixed 256px, with role-based navigation */}
      <Sidebar
        userRole={user?.role}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Workspace Viewport: Pushed right by sidebar 256px (lg:pl-64) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* TopBar: Sticky 64px */}
        <TopBar
          user={user}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
