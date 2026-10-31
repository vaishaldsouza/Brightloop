"use client";

import React, { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import MoneyText from "@/components/ui/MoneyText";
import { InvoiceStatus } from "@prisma/client";
import { confirmInvoiceAction, runAutomatedBillingAction } from "@/app/actions/invoices";

export interface SerializedInvoice {
  id: string;
  number: string;
  subscriptionId: string;
  status: InvoiceStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
  createdAt: string;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  paidPaise: number;
  duePaise: number;
  isOverdue: boolean;
  isPartiallyPaid: boolean;
  isCancelled: boolean;
  cancelledAt: string | null;
  subscription: {
    id: string;
    number: string;
    billingPeriod: string;
    planName: string;
    customer: {
      id: string;
      companyName: string;
      gstStateCode: string | null;
      gstin: string | null;
    };
  };
}

interface InvoiceListClientProps {
  initialInvoices: SerializedInvoice[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearch?: string;
  initialStatus?: string;
  initialCustomerId?: string;
  initialIncludeCancelled?: boolean;
  availableCustomers: Array<{ id: string; companyName: string }>;
  statusCounts: Record<string, number>;
  isAdmin: boolean;
  isStaff: boolean;
}

export default function InvoiceListClient({
  initialInvoices,
  totalCount,
  currentPage,
  pageSize,
  initialSearch = "",
  initialStatus = "ALL",
  initialCustomerId = "ALL",
  initialIncludeCancelled = false,
  availableCustomers,
  statusCounts,
  isAdmin,
  isStaff,
}: InvoiceListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [customerFilter, setCustomerFilter] = useState(initialCustomerId);
  const [includeCancelled, setIncludeCancelled] = useState(initialIncludeCancelled);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const applyFilters = useCallback(
    (newSearch?: string, newStatus?: string, newCustomer?: string, newCancelled?: boolean, newPage?: number) => {
      const q = newSearch !== undefined ? newSearch : search;
      const status = newStatus !== undefined ? newStatus : statusFilter;
      const customer = newCustomer !== undefined ? newCustomer : customerFilter;
      const cancelled = newCancelled !== undefined ? newCancelled : includeCancelled;
      const page = newPage !== undefined ? newPage : 1;

      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status && status !== "ALL") params.set("status", status);
      if (customer && customer !== "ALL") params.set("customerId", customer);
      if (cancelled) params.set("includeCancelled", "true");
      if (page > 1) params.set("page", String(page));
      if (pageSize !== 10) params.set("pageSize", String(pageSize));

      startTransition(() => {
        router.push(`/invoices?${params.toString()}`);
      });
    },
    [router, search, statusFilter, customerFilter, includeCancelled, pageSize]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(search, statusFilter, customerFilter, includeCancelled, 1);
  };

  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
    applyFilters(search, status, customerFilter, includeCancelled, 1);
  };

  const handleCustomerChange = (customerId: string) => {
    setCustomerFilter(customerId);
    applyFilters(search, statusFilter, customerId, includeCancelled, 1);
  };

  const handleCancelledToggle = (checked: boolean) => {
    setIncludeCancelled(checked);
    applyFilters(search, statusFilter, customerFilter, checked, 1);
  };

  const handleConfirmInvoice = async (invoiceId: string) => {
    if (!window.confirm("Are you sure you want to confirm this invoice?")) return;
    setActionMessage(null);
    try {
      const res = await confirmInvoiceAction(invoiceId);
      if (res.success) {
        setActionMessage({ type: "success", text: `Invoice ${res.invoiceNumber} confirmed successfully.` });
        router.refresh();
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to confirm invoice." });
      }
    } catch (err) {
      setActionMessage({ type: "error", text: "An error occurred while confirming the invoice." });
    }
  };

  const handleRunBilling = async () => {
    setActionMessage(null);
    try {
      const res = await runAutomatedBillingAction();
      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Automated billing completed: ${res.invoicesGenerated} invoices generated across ${res.subscriptionsProcessed} active subscriptions.`,
        });
        router.refresh();
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to run automated billing." });
      }
    } catch (err) {
      setActionMessage({ type: "error", text: "An error occurred while running automated billing." });
    }
  };

  const handleExportCSV = () => {
    if (initialInvoices.length === 0) {
      alert("No invoices to export.");
      return;
    }

    const headers = [
      "Invoice Number",
      "Customer",
      "Subscription Number",
      "Plan",
      "Status",
      "Billing Period Start",
      "Billing Period End",
      "Due Date",
      "Subtotal (INR)",
      "Tax (INR)",
      "Total (INR)",
      "Paid (INR)",
      "Due (INR)",
      "Is Overdue",
      "Is Partially Paid",
      "Is Cancelled",
    ];

    const rows = initialInvoices.map((inv) => [
      inv.number,
      `"${inv.subscription.customer.companyName.replace(/"/g, '""')}"`,
      inv.subscription.number,
      `"${inv.subscription.planName.replace(/"/g, '""')}"`,
      inv.status,
      new Date(inv.billingPeriodStart).toLocaleDateString("en-IN"),
      new Date(inv.billingPeriodEnd).toLocaleDateString("en-IN"),
      new Date(inv.dueDate).toLocaleDateString("en-IN"),
      (inv.subtotalPaise / 100).toFixed(2),
      (inv.taxPaise / 100).toFixed(2),
      (inv.totalPaise / 100).toFixed(2),
      (inv.paidPaise / 100).toFixed(2),
      (inv.duePaise / 100).toFixed(2),
      inv.isOverdue ? "Yes" : "No",
      inv.isPartiallyPaid ? "Yes" : "No",
      inv.isCancelled ? "Yes" : "No",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `invoices_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: Column<SerializedInvoice>[] = [
    {
      header: "Invoice #",
      accessor: "number",
      cell: (inv) => (
        <Link
          href={`/invoices/${inv.id}`}
          className="font-mono text-xs font-semibold text-primary hover:underline"
        >
          {inv.number}
        </Link>
      ),
    },
    {
      header: "Customer",
      accessor: (inv) => inv.subscription.customer.companyName,
      cell: (inv) => (
        <div>
          <div className="font-semibold text-on-surface text-sm">
            {inv.subscription.customer.companyName}
          </div>
          <div className="text-[11px] text-on-surface-variant font-mono">
            {inv.subscription.customer.gstin || "Unregistered"} • Code: {inv.subscription.customer.gstStateCode || "27"}
          </div>
        </div>
      ),
    },
    {
      header: "Subscription",
      accessor: (inv) => inv.subscription.number,
      cell: (inv) => (
        <div>
          <Link
            href={`/subscriptions/${inv.subscriptionId}`}
            className="font-mono text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            <span>{inv.subscription.number}</span>
          </Link>
          <div className="text-xs text-on-surface-variant">
            {inv.subscription.planName}
          </div>
        </div>
      ),
    },
    {
      header: "Period",
      accessor: "billingPeriodStart",
      cell: (inv) => (
        <div className="text-xs text-on-surface-variant font-mono">
          <div>{new Date(inv.billingPeriodStart).toLocaleDateString("en-IN")}</div>
          <div className="text-[11px] text-secondary">to {new Date(inv.billingPeriodEnd).toLocaleDateString("en-IN")}</div>
        </div>
      ),
    },
    {
      header: "Due Date",
      accessor: "dueDate",
      cell: (inv) => {
        const dueDate = new Date(inv.dueDate);
        return (
          <div className={`text-xs font-mono ${inv.isOverdue ? "text-rose-600 font-bold" : "text-on-surface-variant"}`}>
            {dueDate.toLocaleDateString("en-IN")}
          </div>
        );
      },
    },
    {
      header: "Total",
      accessor: "totalPaise",
      cell: (inv) => (
        <MoneyText paise={inv.totalPaise} className="font-semibold text-on-surface text-sm" />
      ),
    },
    {
      header: "Balance Due",
      accessor: "duePaise",
      cell: (inv) => (
        <div>
          <MoneyText
            paise={inv.duePaise}
            className={`font-semibold text-xs ${inv.duePaise > 0 ? "text-amber-800" : "text-emerald-700"}`}
          />
          {inv.paidPaise > 0 && (
            <div className="text-[11px] text-secondary">
              Paid: ₹{(inv.paidPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      ),
    },
    {
      header: "Status & Tags",
      accessor: "status",
      cell: (inv) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={inv.status} />
          {inv.isOverdue && <TagBadge tag="OVERDUE" />}
          {inv.isPartiallyPaid && <TagBadge tag="PARTIALLY_PAID" />}
          {inv.isCancelled && <TagBadge tag="CANCELLED" />}
        </div>
      ),
    },
    {
      header: "Actions",
      accessor: "id",
      cell: (inv) => (
        <div className="flex items-center gap-1.5">
          <Link
            href={`/invoices/${inv.id}`}
            className="p-1.5 text-secondary hover:text-primary rounded hover:bg-surface-container-low transition-colors"
            title="Inspect Invoice"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
          </Link>
          {inv.status === InvoiceStatus.DRAFT && !inv.isCancelled && (isAdmin || isStaff) && (
            <button
              type="button"
              onClick={() => handleConfirmInvoice(inv.id)}
              disabled={isPending}
              className="p-1.5 text-amber-700 hover:text-amber-900 rounded hover:bg-amber-50 transition-colors"
              title="Confirm Invoice"
            >
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Itemized recurring billing invoices generated automatically from active customer contracts."
        breadcrumbs={[{ label: "Invoices" }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface font-title-sm text-body-sm shadow-sm hover:bg-surface-container-low hover:border-outline focus:outline-none transition-all"
            >
              <span className="material-symbols-outlined text-secondary text-[18px]">download</span>
              <span>Export</span>
            </button>
            {(isAdmin || isStaff) && (
              <button
                type="button"
                onClick={handleRunBilling}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary-container text-white font-title-sm text-body-sm shadow-sm hover:bg-primary transition-all disabled:opacity-60"
                title="Evaluate automated billing for all due active subscriptions"
              >
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                <span>Trigger Billing</span>
              </button>
            )}
          </div>
        }
      />

      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">
              {actionMessage.type === "success" ? "check_circle" : "error"}
            </span>
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-secondary hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* FILTER CONTROLS & TABS */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-outline-variant pb-3 overflow-x-auto">
          {[
            { key: "ALL", label: "All Active", count: statusCounts.ALL || 0 },
            { key: "DRAFT", label: "Draft", count: statusCounts.DRAFT || 0 },
            { key: "CONFIRMED", label: "Confirmed", count: statusCounts.CONFIRMED || 0 },
            { key: "PAID", label: "Paid", count: statusCounts.PAID || 0 },
            { key: "OVERDUE", label: "Overdue", count: statusCounts.OVERDUE || 0 },
            { key: "PARTIALLY_PAID", label: "Partially Paid", count: statusCounts.PARTIALLY_PAID || 0 },
          ].map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleStatusChange(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-primary-container text-white"
                    : "text-secondary hover:text-on-surface hover:bg-surface-container-low"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-surface-container-high text-secondary"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Dropdown Filters Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <form onSubmit={handleSearchSubmit} className="md:col-span-5 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice #, customer, or subscription..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-container-low border border-outline-variant text-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
            />
          </form>

          <div className="md:col-span-4">
            <select
              value={customerFilter}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
            >
              <option value="ALL">All Customers</option>
              {availableCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCancelled}
                onChange={(e) => handleCancelledToggle(e.target.checked)}
                className="rounded border-outline-variant text-primary-container focus:ring-primary-container h-4 w-4"
              />
              <span>Show Cancelled</span>
            </label>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden">
        <DataTable
          columns={columns}
          data={initialInvoices}
          keyExtractor={(inv) => inv.id}
          isLoading={isPending}
          emptyMessage="No invoices found matching the current criteria."
        />

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <div className="px-6 py-3.5 border-t border-outline-variant bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-secondary">
            <div>
              Showing <span className="font-semibold text-on-surface">{(currentPage - 1) * pageSize + 1}</span> to{" "}
              <span className="font-semibold text-on-surface">
                {Math.min(currentPage * pageSize, totalCount)}
              </span>{" "}
              of <span className="font-semibold text-on-surface">{totalCount}</span> invoices
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyFilters(undefined, undefined, undefined, undefined, currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="h-8 px-2.5 rounded border border-outline-variant bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                <span>Previous</span>
              </button>

              {Array.from({ length: Math.ceil(totalCount / pageSize) }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  type="button"
                  onClick={() => applyFilters(undefined, undefined, undefined, undefined, pg)}
                  disabled={isPending}
                  className={`h-8 w-8 rounded text-xs font-medium transition-colors ${
                    pg === currentPage
                      ? "bg-primary-container text-white"
                      : "border border-outline-variant hover:bg-surface-container-low text-on-surface"
                  }`}
                >
                  {pg}
                </button>
              ))}

              <button
                type="button"
                onClick={() => applyFilters(undefined, undefined, undefined, undefined, currentPage + 1)}
                disabled={currentPage >= Math.ceil(totalCount / pageSize) || isPending}
                className="h-8 px-2.5 rounded border border-outline-variant bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span>Next</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
