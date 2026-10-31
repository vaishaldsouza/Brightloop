"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PortalBottomNav() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Subscriptions",
      href: "/portal/subscriptions",
      icon: "autorenew",
    },
    {
      label: "Invoices",
      href: "/portal/invoices",
      icon: "receipt_long",
    },
    {
      label: "Account",
      href: "/portal/account",
      icon: "person",
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-2 bg-surface-container-lowest border-t border-outline-variant shadow-lg"
    >
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-lg transition-colors min-h-[48px] ${
              isActive
                ? "bg-secondary-container text-primary font-semibold"
                : "text-secondary hover:text-on-surface hover:bg-surface-container-low"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[22px] ${
                isActive ? "text-primary font-bold" : "text-secondary"
              }`}
            >
              {item.icon}
            </span>
            <span className="text-[11px] font-medium mt-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
