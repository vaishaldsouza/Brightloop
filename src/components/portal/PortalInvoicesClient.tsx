"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { InvoiceStatus } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface PortalInvoiceRow {
  id: string;
  number: string;
  subscriptionNumber: string;
  planName: string;
  createdAt: string;
  dueDate: string;
  totalPaise: number;
  paidPaise: number;
  duePaise: number;
  status: InvoiceStatus;
  isOverdue: boolean;
  isPartiallyPaid: boolean;
}

interface PortalInvoicesClientProps {
  invoices: PortalInvoiceRow[];
  totalOutstandingPaise: number;
}

type FilterChip = "ALL" | "PAID" | "CONFIRMED" | "OVERDUE";

export default function PortalInvoicesClient({
  invoices,
  totalOutstandingPaise,
}: PortalInvoicesClientProps) {
  const [filter, setFilter] = useState<FilterChip>("ALL");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    return {
      all: invoices.length,
      paid: invoices.filter((i) => i.status === InvoiceStatus.PAID).length,
      confirmed: invoices.filter(
        (i) => i.status === InvoiceStatus.CONFIRMED && !i.isOverdue
      ).length,
      overdue: invoices.filter((i) => i.isOverdue).length,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (filter === "PAID" && inv.status !== InvoiceStatus.PAID) return false;
      if (filter === "CONFIRMED" && (inv.status !== InvoiceStatus.CONFIRMED || inv.isOverdue)) {
        return false;
      }
      if (filter === "OVERDUE" && !inv.isOverdue) return false;

      if (search) {
        const q = search.toLowerCase();
        return (
          inv.number.toLowerCase().includes(q) ||
          inv.subscriptionNumber.toLowerCase().includes(q) ||
          inv.planName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [invoices, filter, search]);

  return (
    <div className="space-y-6">
      {/* Page Header & Outstanding KPI */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-outline-variant">
        <div>
          <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
            My Invoices
          </h1>
          <p className="font-body-md text-sm text-secondary mt-1">
            Review billing history, track payment statuses, and download official tax receipts.
          </p>
        </div>

        <div className="px-5 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xs text-right">
          <div className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
            Total Outstanding
          </div>
          <div className="text-xl font-bold text-primary">
            {formatCurrency(totalOutstandingPaise)}
          </div>
        </div>
      </div>

      {/* Filter Chips & Search Toolbar */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-xs flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Status Filter Chips */}
        <div className="flex items-center flex-wrap gap-2 w-full lg:w-auto">
          {(
            [
              { key: "ALL", label: `All (${counts.all})` },
              { key: "PAID", label: `Paid (${counts.paid})` },
              { key: "CONFIRMED", label: `Confirmed (${counts.confirmed})` },
              { key: "OVERDUE", label: `Overdue (${counts.overdue})` },
            ] as const
          ).map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              suppressHydrationWarning
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === chip.key
                  ? "bg-primary-container text-on-primary shadow-xs"
                  : "border border-outline-variant text-secondary hover:text-on-surface hover:bg-surface-container-low"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex items-center w-full lg:w-72">
          <span className="absolute left-3 text-secondary flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-[18px]">search</span>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice or contract..."
            suppressHydrationWarning
            className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-xs text-on-surface placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
        </div>
      </div>

      {/* Invoices Ledger Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xs overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-4xl text-secondary mb-2">
              receipt_long
            </span>
            <h3 className="font-title-sm text-base font-semibold text-on-surface">
              No invoices found
            </h3>
            <p className="text-xs text-secondary mt-1">
              {search
                ? "No invoices match your search."
                : "You have no invoices under this category."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-low text-secondary border-b border-outline-variant">
                  <th className="py-3 px-6">Invoice No.</th>
                  <th className="py-3 px-6">Contract</th>
                  <th className="py-3 px-6">Invoice Date</th>
                  <th className="py-3 px-6">Due Date</th>
                  <th className="py-3 px-6 text-right">Total Amount</th>
                  <th className="py-3 px-6 text-right">Balance Due</th>
                  <th className="py-3 px-6 text-center">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-surface-container-low transition-colors h-14"
                  >
                    <td className="py-3 px-6 font-semibold text-primary">
                      <Link
                        href={`/portal/invoices/${inv.id}`}
                        className="hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="py-3 px-6">
                      <span className="font-medium text-on-surface">
                        {inv.subscriptionNumber}
                      </span>
                      <span className="block text-[11px] text-secondary">
                        {inv.planName}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-on-surface">
                      {formatDate(inv.createdAt)}
                    </td>
                    <td className="py-3 px-6 text-on-surface">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="py-3 px-6 text-right font-semibold text-on-surface">
                      {formatCurrency(inv.totalPaise)}
                    </td>
                    <td className="py-3 px-6 text-right font-semibold">
                      {inv.duePaise === 0 ? (
                        <span className="text-tertiary">₹0.00</span>
                      ) : (
                        <span className="text-on-surface">
                          {formatCurrency(inv.duePaise)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-center">
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                        {inv.status === InvoiceStatus.PAID ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-tertiary-fixed text-on-tertiary-fixed-variant">
                            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                            Paid
                          </span>
                        ) : inv.isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-error-container text-error">
                            <span className="w-1.5 h-1.5 rounded-full bg-error" />
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary-fixed text-primary">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            Confirmed
                          </span>
                        )}

                        {inv.isPartiallyPaid && inv.status !== InvoiceStatus.PAID && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-secondary-fixed text-secondary">
                            Partially paid
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-6 text-right space-x-2">
                      <Link
                        href={`/portal/invoices/${inv.id}`}
                        className="text-xs font-semibold text-secondary hover:text-primary transition-colors"
                      >
                        View
                      </Link>
                      <Link
                        href={`/portal/invoices/${inv.id}/print`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          print
                        </span>
                        PDF
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
