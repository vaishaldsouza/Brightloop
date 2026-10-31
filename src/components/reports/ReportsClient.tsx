"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { PaymentMethod, SubscriptionStatus, InvoiceStatus, BillingPeriod } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface ReportPaymentItem {
  id: string;
  amountPaise: number;
  paymentMethod: PaymentMethod;
  paidAt: string; // ISO
  reference?: string | null;
  customerName: string;
  invoiceNumber: string;
}

export interface ReportInvoiceItem {
  id: string;
  number: string;
  customerName: string;
  customerState?: string | null;
  status: InvoiceStatus;
  dueDate: string; // ISO
  createdAt: string; // ISO
  cancelledAt?: string | null;
  totalPaise: number;
  paidPaise: number;
  duePaise: number;
  isOverdue: boolean;
  overdueDays: number;
}

export interface ReportSubscriptionItem {
  id: string;
  number: string;
  customerName: string;
  planName: string;
  billingPeriod: BillingPeriod;
  status: SubscriptionStatus;
  isPaused: boolean;
  startDate: string; // ISO
  nextBillingDate?: string | null;
  totalPaise: number;
}

export interface ReportCustomerSummary {
  id: string;
  companyName: string;
  gstin?: string | null;
  state?: string | null;
  activeSubscriptionsCount: number;
  totalInvoicedPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
}

interface ReportsClientProps {
  payments: ReportPaymentItem[];
  invoices: ReportInvoiceItem[];
  subscriptions: ReportSubscriptionItem[];
  customers: ReportCustomerSummary[];
}

type ReportTab = "REVENUE" | "OUTSTANDING" | "OVERDUE" | "SUBSCRIPTIONS" | "CUSTOMERS";

export default function ReportsClient({
  payments,
  invoices,
  subscriptions,
  customers,
}: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>("REVENUE");
  const [startDateStr, setStartDateStr] = useState<string>("");
  const [endDateStr, setEndDateStr] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const startDate = useMemo(() => (startDateStr ? new Date(startDateStr) : null), [startDateStr]);
  const endDate = useMemo(
    () => (endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`) : null),
    [endDateStr]
  );

  // 1. Filtered Payments for Revenue Report
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const pDate = new Date(p.paidAt);
      if (startDate && pDate < startDate) return false;
      if (endDate && pDate > endDate) return false;
      if (methodFilter && p.paymentMethod !== methodFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.invoiceNumber.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q) ||
          p.reference?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [payments, startDate, endDate, methodFilter, searchQuery]);

  // Revenue KPI Stats
  const revenueTotalPaise = useMemo(() => {
    return filteredPayments.reduce((acc, p) => acc + p.amountPaise, 0);
  }, [filteredPayments]);

  const methodBreakdown = useMemo(() => {
    const map: Record<string, { count: number; totalPaise: number }> = {
      BANK_TRANSFER: { count: 0, totalPaise: 0 },
      CARD: { count: 0, totalPaise: 0 },
      UPI: { count: 0, totalPaise: 0 },
      CASH: { count: 0, totalPaise: 0 },
    };
    filteredPayments.forEach((p) => {
      if (map[p.paymentMethod]) {
        map[p.paymentMethod].count += 1;
        map[p.paymentMethod].totalPaise += p.amountPaise;
      }
    });
    return map;
  }, [filteredPayments]);

  // 2. Filtered Outstanding Invoices
  const filteredOutstanding = useMemo(() => {
    return invoices.filter((i) => {
      if (i.cancelledAt || i.status !== InvoiceStatus.CONFIRMED || i.duePaise <= 0) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          i.number.toLowerCase().includes(q) ||
          i.customerName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [invoices, searchQuery]);

  const totalOutstandingPaise = useMemo(() => {
    return filteredOutstanding.reduce((acc, i) => acc + i.duePaise, 0);
  }, [filteredOutstanding]);

  // 3. Filtered Overdue Invoices
  const filteredOverdue = useMemo(() => {
    return invoices.filter((i) => {
      if (i.cancelledAt || !i.isOverdue || i.duePaise <= 0) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          i.number.toLowerCase().includes(q) ||
          i.customerName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [invoices, searchQuery]);

  const totalOverduePaise = useMemo(() => {
    return filteredOverdue.reduce((acc, i) => acc + i.duePaise, 0);
  }, [filteredOverdue]);

  // 4. Subscriptions
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.number.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.planName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [subscriptions, searchQuery]);

  // 5. Customer Summaries
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          c.companyName.toLowerCase().includes(q) ||
          c.gstin?.toLowerCase().includes(q) ||
          c.state?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [customers, searchQuery]);

  // CSV Export Handler
  const handleExportCsv = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let filename = `brightloop_${activeTab.toLowerCase()}_report.csv`;

    if (activeTab === "REVENUE") {
      headers = ["Payment Date", "Invoice #", "Customer", "Method", "Reference", "Amount (INR)"];
      rows = filteredPayments.map((p) => [
        formatDate(p.paidAt),
        p.invoiceNumber,
        `"${p.customerName.replace(/"/g, '""')}"`,
        p.paymentMethod,
        p.reference ? `"${p.reference.replace(/"/g, '""')}"` : "",
        (p.amountPaise / 100).toFixed(2),
      ]);
    } else if (activeTab === "OUTSTANDING") {
      headers = ["Invoice #", "Customer", "Issue Date", "Due Date", "Total (INR)", "Paid (INR)", "Outstanding (INR)"];
      rows = filteredOutstanding.map((i) => [
        i.number,
        `"${i.customerName.replace(/"/g, '""')}"`,
        formatDate(i.createdAt),
        formatDate(i.dueDate),
        (i.totalPaise / 100).toFixed(2),
        (i.paidPaise / 100).toFixed(2),
        (i.duePaise / 100).toFixed(2),
      ]);
    } else if (activeTab === "OVERDUE") {
      headers = ["Invoice #", "Customer", "Due Date", "Days Overdue", "Outstanding (INR)"];
      rows = filteredOverdue.map((i) => [
        i.number,
        `"${i.customerName.replace(/"/g, '""')}"`,
        formatDate(i.dueDate),
        i.overdueDays,
        (i.duePaise / 100).toFixed(2),
      ]);
    } else if (activeTab === "SUBSCRIPTIONS") {
      headers = ["Subscription #", "Customer", "Plan", "Billing Period", "Status", "Contract Value (INR)"];
      rows = filteredSubscriptions.map((s) => [
        s.number,
        `"${s.customerName.replace(/"/g, '""')}"`,
        `"${s.planName.replace(/"/g, '""')}"`,
        s.billingPeriod,
        s.isPaused ? "PAUSED" : s.status,
        (s.totalPaise / 100).toFixed(2),
      ]);
    } else if (activeTab === "CUSTOMERS") {
      headers = ["Customer", "GSTIN", "State", "Active Subs", "Invoiced (INR)", "Collected (INR)", "Outstanding (INR)"];
      rows = filteredCustomers.map((c) => [
        `"${c.companyName.replace(/"/g, '""')}"`,
        c.gstin || "",
        c.state || "",
        c.activeSubscriptionsCount,
        (c.totalInvoicedPaise / 100).toFixed(2),
        (c.totalPaidPaise / 100).toFixed(2),
        (c.outstandingPaise / 100).toFixed(2),
      ]);
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 font-label-md text-label-md text-secondary mb-1">
            <Link href="/dashboard" className="hover:text-on-surface transition-colors">
              Home
            </Link>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Reports</span>
          </nav>
          <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">
            Financial & Operations Reports
          </h1>
          <p className="font-body-md text-body-md text-secondary mt-1">
            Reconciled collections, accounts receivable, overdue aging, and subscription summaries.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-title-sm text-title-sm transition-colors shadow-sm self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-base">download</span>
          <span>Export to CSV</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab("REVENUE")}
          className={`flex items-center gap-2 py-3 px-4 font-title-sm text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "REVENUE"
              ? "border-primary-container text-primary-container font-bold"
              : "border-transparent text-secondary hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-base">payments</span>
          <span>Revenue Collected</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-surface-container text-xs">
            {filteredPayments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("OUTSTANDING")}
          className={`flex items-center gap-2 py-3 px-4 font-title-sm text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "OUTSTANDING"
              ? "border-primary-container text-primary-container font-bold"
              : "border-transparent text-secondary hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-base">pending_actions</span>
          <span>Outstanding Invoices</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-surface-container text-xs">
            {filteredOutstanding.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("OVERDUE")}
          className={`flex items-center gap-2 py-3 px-4 font-title-sm text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "OVERDUE"
              ? "border-primary-container text-primary-container font-bold"
              : "border-transparent text-secondary hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-base">warning</span>
          <span>Overdue Aging</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-xs">
            {filteredOverdue.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("SUBSCRIPTIONS")}
          className={`flex items-center gap-2 py-3 px-4 font-title-sm text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "SUBSCRIPTIONS"
              ? "border-primary-container text-primary-container font-bold"
              : "border-transparent text-secondary hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-base">autorenew</span>
          <span>Subscription Portfolio</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-surface-container text-xs">
            {filteredSubscriptions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("CUSTOMERS")}
          className={`flex items-center gap-2 py-3 px-4 font-title-sm text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "CUSTOMERS"
              ? "border-primary-container text-primary-container font-bold"
              : "border-transparent text-secondary hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-base">group</span>
          <span>Customer Summaries</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-surface-container text-xs">
            {filteredCustomers.length}
          </span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
            <span className="material-symbols-outlined text-base">search</span>
          </span>
          <input
            type="text"
            placeholder="Search report entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-container-low border border-outline-variant/60 rounded-lg text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container"
          />
        </div>

        {/* Date Range (For Revenue Tab) */}
        {activeTab === "REVENUE" && (
          <div className="flex items-center gap-2 text-sm text-secondary">
            <span>From:</span>
            <input
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              className="px-2.5 py-1.5 border border-outline-variant/60 rounded-lg text-xs bg-surface-container-lowest text-on-surface"
            />
            <span>To:</span>
            <input
              type="date"
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              className="px-2.5 py-1.5 border border-outline-variant/60 rounded-lg text-xs bg-surface-container-lowest text-on-surface"
            />
            {(startDateStr || endDateStr) && (
              <button
                onClick={() => {
                  setStartDateStr("");
                  setEndDateStr("");
                }}
                className="text-xs text-primary-container hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Method Filter (For Revenue Tab) */}
        {activeTab === "REVENUE" && (
          <div className="relative">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-1.5 border border-outline-variant/60 rounded-lg text-xs bg-surface-container-lowest text-on-surface pr-8"
            >
              <option value="">All Methods</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
            </select>
          </div>
        )}
      </div>

      {/* 1. REVENUE REPORT VIEW */}
      {activeTab === "REVENUE" && (
        <div className="space-y-6">
          {/* Revenue KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Total Collections
              </span>
              <div className="text-2xl font-bold text-on-surface mt-2 tabular-nums">
                {formatCurrency(revenueTotalPaise)}
              </div>
              <p className="text-xs text-secondary mt-1">{filteredPayments.length} recorded payments</p>
            </div>

            <div className="p-5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Bank Transfer
              </span>
              <div className="text-2xl font-bold text-on-surface mt-2 tabular-nums">
                {formatCurrency(methodBreakdown.BANK_TRANSFER.totalPaise)}
              </div>
              <p className="text-xs text-secondary mt-1">{methodBreakdown.BANK_TRANSFER.count} transactions</p>
            </div>

            <div className="p-5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Card & UPI
              </span>
              <div className="text-2xl font-bold text-on-surface mt-2 tabular-nums">
                {formatCurrency(methodBreakdown.CARD.totalPaise + methodBreakdown.UPI.totalPaise)}
              </div>
              <p className="text-xs text-secondary mt-1">
                {methodBreakdown.CARD.count + methodBreakdown.UPI.count} transactions
              </p>
            </div>

            <div className="p-5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Cash / Counter
              </span>
              <div className="text-2xl font-bold text-on-surface mt-2 tabular-nums">
                {formatCurrency(methodBreakdown.CASH.totalPaise)}
              </div>
              <p className="text-xs text-secondary mt-1">{methodBreakdown.CASH.count} transactions</p>
            </div>
          </div>

          {/* Revenue Table */}
          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#F8FAFC] border-b border-outline-variant/60 text-xs text-secondary uppercase tracking-wider h-11">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Payment Date</th>
                    <th className="py-3 px-4 font-semibold">Invoice #</th>
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Method</th>
                    <th className="py-3 px-4 font-semibold">Reference</th>
                    <th className="py-3 px-4 font-semibold text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-secondary">
                        No payments found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-bright transition-colors h-12">
                        <td className="py-3 px-4 whitespace-nowrap">{formatDate(p.paidAt)}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Link href={`/invoices/${p.invoiceNumber}`} className="text-primary-container font-semibold hover:underline">
                            {p.invoiceNumber}
                          </Link>
                        </td>
                        <td className="py-3 px-4 font-medium text-on-surface">{p.customerName}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-bright border border-outline-variant/40 text-xs text-on-surface">
                            {p.paymentMethod.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-secondary">
                          {p.reference || "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold font-mono text-emerald-700">
                          {formatCurrency(p.amountPaise)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. OUTSTANDING INVOICES VIEW */}
      {activeTab === "OUTSTANDING" && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Total Outstanding Balance
              </span>
              <div className="text-2xl font-bold text-amber-800 mt-1 tabular-nums">
                {formatCurrency(totalOutstandingPaise)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-secondary">Pending Invoices</span>
              <div className="text-xl font-bold text-on-surface">{filteredOutstanding.length}</div>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#F8FAFC] border-b border-outline-variant/60 text-xs text-secondary uppercase tracking-wider h-11">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Invoice #</th>
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Issue Date</th>
                    <th className="py-3 px-4 font-semibold">Due Date</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Amount</th>
                    <th className="py-3 px-4 font-semibold text-right">Already Paid</th>
                    <th className="py-3 px-4 font-semibold text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredOutstanding.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-secondary">
                        No outstanding confirmed invoices found. All accounts clear!
                      </td>
                    </tr>
                  ) : (
                    filteredOutstanding.map((i) => (
                      <tr key={i.id} className="hover:bg-surface-bright transition-colors h-12">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Link href={`/invoices/${i.id}`} className="text-primary-container font-semibold hover:underline">
                            {i.number}
                          </Link>
                        </td>
                        <td className="py-3 px-4 font-medium text-on-surface">{i.customerName}</td>
                        <td className="py-3 px-4 text-secondary text-xs">{formatDate(i.createdAt)}</td>
                        <td className="py-3 px-4 text-xs font-medium text-on-surface">{formatDate(i.dueDate)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(i.totalPaise)}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700">{formatCurrency(i.paidPaise)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-800">
                          {formatCurrency(i.duePaise)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. OVERDUE INVOICES VIEW */}
      {activeTab === "OVERDUE" && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-error-container/60 bg-error-container/20 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-error">
                Total Overdue Arrears
              </span>
              <div className="text-2xl font-bold text-error mt-1 tabular-nums">
                {formatCurrency(totalOverduePaise)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-error font-medium">Delinquent Invoices</span>
              <div className="text-xl font-bold text-error">{filteredOverdue.length}</div>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#F8FAFC] border-b border-outline-variant/60 text-xs text-secondary uppercase tracking-wider h-11">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Invoice #</th>
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Due Date</th>
                    <th className="py-3 px-4 font-semibold text-center">Days Overdue</th>
                    <th className="py-3 px-4 font-semibold text-right">Delinquent Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredOverdue.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-secondary">
                        No overdue invoices! All confirmed invoices are within terms.
                      </td>
                    </tr>
                  ) : (
                    filteredOverdue.map((i) => (
                      <tr key={i.id} className="hover:bg-surface-bright transition-colors h-12">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Link href={`/invoices/${i.id}`} className="text-primary-container font-semibold hover:underline">
                            {i.number}
                          </Link>
                        </td>
                        <td className="py-3 px-4 font-medium text-on-surface">{i.customerName}</td>
                        <td className="py-3 px-4 text-xs font-medium text-error">{formatDate(i.dueDate)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-error-container text-on-error-container">
                            {i.overdueDays} days
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-error">
                          {formatCurrency(i.duePaise)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. SUBSCRIPTION PORTFOLIO VIEW */}
      {activeTab === "SUBSCRIPTIONS" && (
        <div className="space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#F8FAFC] border-b border-outline-variant/60 text-xs text-secondary uppercase tracking-wider h-11">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Subscription #</th>
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Plan</th>
                    <th className="py-3 px-4 font-semibold">Billing Period</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Contract Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredSubscriptions.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-bright transition-colors h-12">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Link href={`/subscriptions/${s.id}`} className="text-primary-container font-semibold hover:underline">
                          {s.number}
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-medium text-on-surface">{s.customerName}</td>
                      <td className="py-3 px-4 font-medium text-secondary">{s.planName}</td>
                      <td className="py-3 px-4 text-xs font-mono">{s.billingPeriod}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.isPaused
                              ? "bg-amber-100 text-amber-800"
                              : s.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-surface-container text-secondary"
                          }`}
                        >
                          {s.isPaused ? "PAUSED" : s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-on-surface">
                        {formatCurrency(s.totalPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. CUSTOMER SUMMARIES VIEW */}
      {activeTab === "CUSTOMERS" && (
        <div className="space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#F8FAFC] border-b border-outline-variant/60 text-xs text-secondary uppercase tracking-wider h-11">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Customer Company</th>
                    <th className="py-3 px-4 font-semibold">State / Region</th>
                    <th className="py-3 px-4 font-semibold text-center">Active Subs</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Invoiced</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Paid</th>
                    <th className="py-3 px-4 font-semibold text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-bright transition-colors h-12">
                      <td className="py-3 px-4">
                        <Link href={`/customers/${c.id}`} className="font-semibold text-on-surface hover:text-primary-container">
                          {c.companyName}
                        </Link>
                        {c.gstin && <div className="text-[11px] text-secondary font-mono">{c.gstin}</div>}
                      </td>
                      <td className="py-3 px-4 text-secondary text-xs">{c.state || "—"}</td>
                      <td className="py-3 px-4 text-center font-semibold text-on-surface">
                        {c.activeSubscriptionsCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{formatCurrency(c.totalInvoicedPaise)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700">
                        {formatCurrency(c.totalPaidPaise)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-800">
                        {formatCurrency(c.outstandingPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
