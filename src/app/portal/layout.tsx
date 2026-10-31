import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import PortalTopNav from "@/components/portal/PortalTopNav";
import PortalBottomNav from "@/components/portal/PortalBottomNav";

export const metadata = {
  title: "Customer Portal — Brightloop Subscriptions",
  description: "Self-service customer portal for managing subscriptions, invoices, and billing profile.",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { customer: true },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface">
      {/* Customer Portal Top Nav (Desktop & Tablet) */}
      <PortalTopNav
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          companyName: user.customer?.companyName || null,
        }}
      />

      {/* Main Workspace Canvas (with bottom padding on mobile for BottomNav) */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {children}
      </div>

      {/* Shared Portal Minimal Footer */}
      <footer className="hidden md:block w-full bg-surface border-t border-outline-variant mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-secondary">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-on-surface">Brightloop</span>
            <span>&copy; {new Date().getFullYear()} Brightloop Inc. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <span>PCI-DSS Compliant</span>
            <span>GST Registered</span>
            <span>256-Bit SSL Secured</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <PortalBottomNav />
    </div>
  );
}
