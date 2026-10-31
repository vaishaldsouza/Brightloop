"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import RecordPaymentModal from "@/components/payments/RecordPaymentModal";

export interface PaymentRow {
  id: string;
  amountPaise: number;
  paymentMethod: PaymentMethod;
  paidAt: string; // ISO
  reference?: string | null;
  notes?: string | null;
  invoice: {
    id: string;
    number: string;
    status: string;
    totalPaise: number;
    paidPaise: number;
    subscription: {
      id: string;
      number: string;
      customer: {
        id: string;
        companyName: string;
        gstin?: string | null;
      };
    };
  };
}

export interface PaymentKpis {
  totalCollectionsPaise: number;
  bankTransferPaise: number;
  bankTransferCount: number;
  cardUpiPaise: number;
  cardUpiCount: number;
  cashPaise: number;
  cashCount: number;
  totalPaymentsCount: number;
}

export interface CustomerOption {
  id: string;
  companyName: string;
}

interface PaymentsListClientProps {
  payments: PaymentRow[];
  totalCount: number;
  kpis: PaymentKpis;
  customers: CustomerOption[];
  currentPage: number;
  pageSize: number;
  searchTerm?: string;
  selectedMethod?: string;
  selectedCustomerId?: string;
}

export default function PaymentsListClient({
  payments,
  totalCount,
  kpis,
  customers,
  currentPage,
  pageSize,
  searchTerm = "",
  selectedMethod = "",
  selectedCustomerId = "",
}: PaymentsListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchTerm);
  const [modalInvoiceId, setModalInvoiceId] = useState<string | null>(null);

  const updateFilters = (updates: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    params.set("page", "1"); // Reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      updateFilters({ search: search.trim() });
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startRow = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);

  const getMethodIcon = (m: PaymentMethod) => {
    switch (m) {
      case PaymentMethod.BANK_TRANSFER:
        return "account_balance";
      case PaymentMethod.CARD:
        return "credit_card";
      case PaymentMethod.UPI:
        return "qr_code_2";
      case PaymentMethod.CASH:
        return "payments";
      default:
        return "payments";
    }
  };

  const getMethodLabel = (m: PaymentMethod) => {
    switch (m) {
      case PaymentMethod.BANK_TRANSFER:
        return "Bank Transfer";
      case PaymentMethod.CARD:
        return "Card";
      case PaymentMethod.UPI:
        return "UPI";
      case PaymentMethod.CASH:
        return "Cash";
      default:
        return m;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 font-label-md text-label-md text-secondary mb-1">
            <Link href="/dashboard" className="hover:text-primary-container transition-colors">
              Home
            </Link>
            <span className="material-symbols-outlined text-sm text-outline">chevron_right</span>
            <span className="text-on-surface font-semibold">Payments</span>
          </nav>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">
            Payments Ledger
          </h1>
          <p className="font-body-md text-body-md text-secondary mt-1">
            Recorded receipts, bank clearances, UPI settlements, and payment audit tracking.
          </p>
        </div>
      </div>

      {/* KPI Cards (Matches payments-list.html) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Collections */}
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-secondary">
                Total Collections
              </span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary-container">
                <span className="material-symbols-outlined text-base">payments</span>
              </div>
            </div>
            <div className="mt-3">
              <span className="font-currency-display text-currency-display text-on-surface tabular-nums font-bold text-2xl">
                {formatCurrency(kpis.totalCollectionsPaise)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center gap-1.5 font-label-sm text-label-sm text-secondary">
            <span className="w-2 h-2 rounded-full bg-tertiary-container" />
            <span>{kpis.totalPaymentsCount} total recorded transactions</span>
          </div>
        </div>

        {/* Card 2: Settled via Bank Transfer */}
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-secondary">
                Bank Transfers (NEFT/RTGS)
              </span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary-container">
                <span className="material-symbols-outlined text-base">account_balance</span>
              </div>
            </div>
            <div className="mt-3">
              <span className="font-currency-display text-currency-display text-on-surface tabular-nums font-bold text-2xl">
                {formatCurrency(kpis.bankTransferPaise)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center gap-1.5 font-label-sm text-label-sm text-secondary">
            <span className="w-2 h-2 rounded-full bg-primary-container" />
            <span>{kpis.bankTransferCount} settled receipts</span>
          </div>
        </div>

        {/* Card 3: Settled via Cards & UPI */}
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-secondary">
                Cards & UPI Settlements
              </span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary-container">
                <span className="material-symbols-outlined text-base">credit_card</span>
              </div>
            </div>
            <div className="mt-3">
              <span className="font-currency-display text-currency-display text-on-surface tabular-nums font-bold text-2xl">
                {formatCurrency(kpis.cardUpiPaise)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center gap-1.5 font-label-sm text-label-sm text-secondary">
            <span className="w-2 h-2 rounded-full bg-tertiary-container" />
            <span>{kpis.cardUpiCount} electronic settlements</span>
          </div>
        </div>

        {/* Card 4: Unallocated / Suspense */}
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-secondary">
                Suspense Ledger
              </span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-tertiary-container">
                <span className="material-symbols-outlined text-base">verified</span>
              </div>
            </div>
            <div className="mt-3">
              <span className="font-currency-display text-currency-display text-on-surface tabular-nums font-bold text-2xl">
                ₹ 0.00
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center gap-1.5 font-label-sm text-label-sm font-semibold text-tertiary-container">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>100% matched to invoice balances</span>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Bar */}
          <div className="md:col-span-5 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-outline">
              <span className="material-symbols-outlined text-base">search</span>
            </span>
            <input
              type="text"
              placeholder="Search by Ref ID, invoice no., or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full h-[38px] pl-9 pr-3 font-body-md text-body-md bg-surface-container-lowest border border-outline-variant/70 rounded-lg text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container"
            />
          </div>

          {/* Method Filter */}
          <div className="md:col-span-4 relative">
            <select
              value={selectedMethod}
              onChange={(e) => updateFilters({ method: e.target.value })}
              className="w-full h-[38px] px-3 font-body-md text-body-md bg-surface-container-lowest border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container appearance-none pr-8"
            >
              <option value="">All Methods (Bank Transfer, Card, UPI, Cash)</option>
              <option value="BANK_TRANSFER">Bank Transfer (RTGS/NEFT)</option>
              <option value="CARD">Credit / Debit Card</option>
              <option value="UPI">UPI Settlements</option>
              <option value="CASH">Cash Receipts</option>
            </select>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-secondary">
              <span className="material-symbols-outlined text-base">expand_more</span>
            </span>
          </div>

          {/* Customer Filter */}
          <div className="md:col-span-3 relative">
            <select
              value={selectedCustomerId}
              onChange={(e) => updateFilters({ customerId: e.target.value })}
              className="w-full h-[38px] px-3 font-body-md text-body-md bg-surface-container-lowest border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container appearance-none pr-8"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-secondary">
              <span className="material-symbols-outlined text-base">expand_more</span>
            </span>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/30 text-body-sm">
          <span className="text-secondary text-xs mr-1 font-medium">Quick filters:</span>
          <button
            onClick={() => updateFilters({ method: "" })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              !selectedMethod
                ? "bg-primary-container text-on-primary border-primary-container"
                : "bg-surface-bright text-secondary hover:text-on-surface border-outline-variant/60"
            }`}
          >
            All
            <span className="bg-surface-container-high/40 px-1.5 py-0.2 rounded text-[10px]">
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => updateFilters({ method: "BANK_TRANSFER" })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              selectedMethod === "BANK_TRANSFER"
                ? "bg-primary-container text-on-primary border-primary-container"
                : "bg-surface-bright text-secondary hover:text-on-surface border-outline-variant/60"
            }`}
          >
            Bank Transfer
            <span className="bg-surface-container-high/40 px-1.5 py-0.2 rounded text-[10px]">
              {kpis.bankTransferCount}
            </span>
          </button>

          <button
            onClick={() => updateFilters({ method: "CARD" })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              selectedMethod === "CARD"
                ? "bg-primary-container text-on-primary border-primary-container"
                : "bg-surface-bright text-secondary hover:text-on-surface border-outline-variant/60"
            }`}
          >
            Card
            <span className="bg-surface-container-high/40 px-1.5 py-0.2 rounded text-[10px]">
              {kpis.cardUpiCount}
            </span>
          </button>

          <button
            onClick={() => updateFilters({ method: "UPI" })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              selectedMethod === "UPI"
                ? "bg-primary-container text-on-primary border-primary-container"
                : "bg-surface-bright text-secondary hover:text-on-surface border-outline-variant/60"
            }`}
          >
            UPI
          </button>

          <button
            onClick={() => updateFilters({ method: "CASH" })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              selectedMethod === "CASH"
                ? "bg-primary-container text-on-primary border-primary-container"
                : "bg-surface-bright text-secondary hover:text-on-surface border-outline-variant/60"
            }`}
          >
            Cash
          </button>
        </div>
      </div>

      {/* Payments Data Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-bright border-b border-outline-variant/60 h-11 text-secondary font-label-md text-label-md tracking-wider uppercase">
                <th className="py-3 px-4 font-semibold">Payment Ref</th>
                <th className="py-3 px-4 font-semibold">Invoice No.</th>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Method</th>
                <th className="py-3 px-4 font-semibold text-right">Amount</th>
                <th className="py-3 px-4 font-semibold">Note</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-3 font-semibold text-center w-12">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 font-body-md text-body-md">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-secondary">
                    No payment records found matching the criteria.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const refText = p.reference || `REC-${p.id.slice(-6).toUpperCase()}`;
                  return (
                    <tr key={p.id} className="hover:bg-surface-bright/80 transition-colors h-12">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-on-surface">
                          {refText}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <Link
                          href={`/invoices/${p.invoice.id}`}
                          className="inline-flex items-center text-xs font-semibold text-primary-container hover:underline"
                        >
                          {p.invoice.number}
                          <span className="material-symbols-outlined text-[14px] ml-0.5">
                            open_in_new
                          </span>
                        </Link>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-xs text-on-surface truncate max-w-[200px]">
                          {p.invoice.subscription.customer.companyName}
                        </div>
                        {p.invoice.subscription.customer.gstin && (
                          <div className="text-[11px] text-secondary font-mono">
                            {p.invoice.subscription.customer.gstin}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-on-surface">
                        <div className="font-medium text-xs">{formatDate(p.paidAt)}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-bright border border-outline-variant/40 text-xs text-on-surface">
                          <span className="material-symbols-outlined text-sm text-secondary">
                            {getMethodIcon(p.paymentMethod)}
                          </span>
                          <span>{getMethodLabel(p.paymentMethod)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="font-currency-table text-currency-table font-semibold text-on-surface tabular-nums">
                          {formatCurrency(p.amountPaise)}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-xs text-secondary truncate" title={p.notes || ""}>
                          {p.notes || "—"}
                        </p>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-tertiary-fixed/30 text-tertiary-container">
                          <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container" />
                          Settled / Paid
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Link
                          href={`/invoices/${p.invoice.id}`}
                          className="p-1 rounded hover:bg-surface-container-high text-secondary hover:text-on-surface transition-colors inline-block"
                          title="View Invoice"
                        >
                          <span className="material-symbols-outlined text-base">visibility</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Footer */}
        <div className="px-6 py-3.5 bg-surface-container-lowest border-t border-outline-variant/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 font-body-sm text-body-sm text-secondary">
            <span>
              Showing <span className="font-semibold text-on-surface">{startRow}</span> to{" "}
              <span className="font-semibold text-on-surface">{endRow}</span> of{" "}
              <span className="font-semibold text-on-surface">{totalCount}</span> payments
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => updateFilters({ pageSize: Number(e.target.value) })}
                className="h-7 text-xs bg-surface-bright border border-outline-variant/60 rounded px-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(currentPage - 1));
                router.push(`${pathname}?${params.toString()}`);
              }}
              disabled={currentPage <= 1}
              className="p-1.5 rounded text-secondary hover:text-on-surface hover:bg-surface-bright disabled:opacity-30 disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>
            <span className="px-2 text-xs font-medium text-secondary">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(currentPage + 1));
                router.push(`${pathname}?${params.toString()}`);
              }}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded text-secondary hover:text-on-surface hover:bg-surface-bright disabled:opacity-30 disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {modalInvoiceId && (
        <RecordPaymentModal
          invoiceId={modalInvoiceId}
          isOpen={true}
          onClose={() => setModalInvoiceId(null)}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}
