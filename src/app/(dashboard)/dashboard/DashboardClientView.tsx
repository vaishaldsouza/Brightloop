"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import KpiCard from "@/components/ui/KpiCard";
import MoneyText from "@/components/ui/MoneyText";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import { formatPaise } from "@/lib/currency";
import { SubscriptionStatus, InvoiceStatus, BillingPeriod } from "@prisma/client";

export interface DashboardSubscription {
  id: string;
  number: string;
  status: SubscriptionStatus;
  isPaused: boolean;
  startDate: string;
  nextBillingDate: string | null;
  billingPeriod: BillingPeriod;
  planId: string;
  planName: string;
  customerId: string;
  customerName: string;
}

export interface DashboardInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  dueDate: string;
  billingPeriodStart: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  paidPaise: number;
  cancelledAt: string | null;
  subscriptionId: string;
  subscriptionNumber: string;
  planId: string;
  planName: string;
  customerId: string;
  customerName: string;
}

export interface DashboardPayment {
  id: string;
  amountPaise: number;
  paidAt: string;
  paymentMethod: string;
  invoiceId: string;
  customerId: string;
  planId: string;
}

export interface PlanOption {
  id: string;
  name: string;
}

export interface CustomerOption {
  id: string;
  companyName: string;
}

interface DashboardClientViewProps {
  initialSubscriptions: DashboardSubscription[];
  initialInvoices: DashboardInvoice[];
  initialPayments: DashboardPayment[];
  plans: PlanOption[];
  customers: CustomerOption[];
}

export function DashboardClientView({
  initialSubscriptions,
  initialInvoices,
  initialPayments,
  plans,
  customers,
}: DashboardClientViewProps) {
  // Filter States
  const [dateRange, setDateRange] = useState<string>("all");
  const [selectedPlan, setSelectedPlan] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"summary" | "invoices" | "subscriptions">("summary");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Date range cutoff computation
  const dateCutoff = useMemo(() => {
    if (dateRange === "30d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return d;
    }
    if (dateRange === "90d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      return d;
    }
    if (dateRange === "year") {
      const d = new Date(today);
      d.setDate(d.getDate() - 365);
      return d;
    }
    return null; // All time
  }, [dateRange, today]);

  // Filtered Subscriptions
  const filteredSubscriptions = useMemo(() => {
    return initialSubscriptions.filter((sub) => {
      if (selectedPlan !== "all" && sub.planId !== selectedPlan) return false;
      if (selectedCustomer !== "all" && sub.customerId !== selectedCustomer) return false;
      if (selectedStatus !== "all" && sub.status !== selectedStatus) return false;
      return true;
    });
  }, [initialSubscriptions, selectedPlan, selectedCustomer, selectedStatus]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return initialInvoices.filter((inv) => {
      // Exclude cancelled invoices from standard ledger operations per PRD §4.6
      if (inv.cancelledAt) return false;
      if (selectedPlan !== "all" && inv.planId !== selectedPlan) return false;
      if (selectedCustomer !== "all" && inv.customerId !== selectedCustomer) return false;
      if (selectedStatus !== "all" && inv.status !== selectedStatus) return false;

      if (dateCutoff) {
        const invDate = new Date(inv.dueDate);
        if (invDate < dateCutoff) return false;
      }
      return true;
    });
  }, [initialInvoices, selectedPlan, selectedCustomer, selectedStatus, dateCutoff]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return initialPayments.filter((pmt) => {
      if (selectedPlan !== "all" && pmt.planId !== selectedPlan) return false;
      if (selectedCustomer !== "all" && pmt.customerId !== selectedCustomer) return false;
      if (dateCutoff) {
        const pmtDate = new Date(pmt.paidAt);
        if (pmtDate < dateCutoff) return false;
      }
      return true;
    });
  }, [initialPayments, selectedPlan, selectedCustomer, dateCutoff]);

  // ── Exact 4 PRD KPI Calculations ───────────────────────────────────

  // 1. Active Subscriptions Count
  const activeSubscriptionsCount = useMemo(() => {
    return filteredSubscriptions.filter((s) => s.status === SubscriptionStatus.ACTIVE).length;
  }, [filteredSubscriptions]);

  // 2. Revenue Collected (sum of recorded payments in selected date range)
  const revenueCollectedPaise = useMemo(() => {
    return filteredPayments.reduce((acc, p) => acc + p.amountPaise, 0);
  }, [filteredPayments]);

  // 3. Amount Outstanding on Confirmed Invoices
  const amountOutstandingPaise = useMemo(() => {
    return filteredInvoices
      .filter((inv) => inv.status === InvoiceStatus.CONFIRMED)
      .reduce((acc, inv) => acc + Math.max(0, inv.totalPaise - inv.paidPaise), 0);
  }, [filteredInvoices]);

  // 4. Overdue Invoice Count and Overdue Amount
  // Confirmed invoice, due date before today, and outstanding amount > 0
  const overdueStats = useMemo(() => {
    const overdueInvoices = filteredInvoices.filter((inv) => {
      if (inv.status !== InvoiceStatus.CONFIRMED) return false;
      const dueDate = new Date(inv.dueDate);
      const outstanding = inv.totalPaise - inv.paidPaise;
      return dueDate < today && outstanding > 0;
    });

    const count = overdueInvoices.length;
    const amountPaise = overdueInvoices.reduce(
      (acc, inv) => acc + (inv.totalPaise - inv.paidPaise),
      0
    );

    return { count, amountPaise };
  }, [filteredInvoices, today]);

  const handleResetFilters = () => {
    setDateRange("all");
    setSelectedPlan("all");
    setSelectedCustomer("all");
    setSelectedStatus("all");
  };

  // CSV Export
  const handleExportReport = () => {
    const headers = ["Invoice Number", "Customer", "Plan", "Due Date", "Total (INR)", "Paid (INR)", "Outstanding (INR)", "Status"];
    const rows = filteredInvoices.map((inv) => [
      inv.number,
      `"${inv.customerName}"`,
      `"${inv.planName}"`,
      new Date(inv.dueDate).toLocaleDateString("en-IN"),
      (inv.totalPaise / 100).toFixed(2),
      (inv.paidPaise / 100).toFixed(2),
      ((inv.totalPaise - inv.paidPaise) / 100).toFixed(2),
      inv.status,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `brightloop-dashboard-report-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Invoice Columns
  const invoiceColumns: Column<DashboardInvoice>[] = [
    {
      header: "Invoice #",
      accessorKey: "number",
      cell: (inv) => <span className="font-semibold text-primary">{inv.number}</span>,
    },
    {
      header: "Customer",
      accessorKey: "customerName",
    },
    {
      header: "Plan",
      accessorKey: "planName",
      cell: (inv) => <span className="text-secondary">{inv.planName}</span>,
    },
    {
      header: "Due Date",
      cell: (inv) => new Date(inv.dueDate).toLocaleDateString("en-IN"),
    },
    {
      header: "Total",
      align: "right",
      cell: (inv) => <MoneyText amountPaise={inv.totalPaise} />,
    },
    {
      header: "Outstanding",
      align: "right",
      cell: (inv) => {
        const outstanding = Math.max(0, inv.totalPaise - inv.paidPaise);
        return (
          <span className={outstanding > 0 ? "font-semibold text-rose-700" : "text-emerald-700"}>
            <MoneyText amountPaise={outstanding} />
          </span>
        );
      },
    },
    {
      header: "Status",
      cell: (inv) => <StatusBadge status={inv.status} />,
    },
    {
      header: "Derived Tag",
      cell: (inv) => {
        const dueDate = new Date(inv.dueDate);
        const outstanding = inv.totalPaise - inv.paidPaise;
        if (inv.status === InvoiceStatus.CONFIRMED && dueDate < today && outstanding > 0) {
          const daysOverdue = Math.round((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
          return <TagBadge tag="OVERDUE" label={`Overdue ${daysOverdue}d`} />;
        }
        if (inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise) {
          return <TagBadge tag="PARTIALLY_PAID" label="Partially paid" />;
        }
        return <span className="text-xs text-slate-400">—</span>;
      },
    },
  ];

  // Subscription Columns
  const subscriptionColumns: Column<DashboardSubscription>[] = [
    {
      header: "Subscription #",
      accessorKey: "number",
      cell: (sub) => <span className="font-semibold text-primary">{sub.number}</span>,
    },
    {
      header: "Customer",
      accessorKey: "customerName",
    },
    {
      header: "Plan",
      accessorKey: "planName",
    },
    {
      header: "Billing Period",
      cell: (sub) => <span className="text-xs font-semibold uppercase">{sub.billingPeriod}</span>,
    },
    {
      header: "Status",
      cell: (sub) => <StatusBadge status={sub.status} />,
    },
    {
      header: "State / Tag",
      cell: (sub) => (sub.isPaused ? <TagBadge tag="PAUSED" label="Paused" /> : <span className="text-xs text-slate-400">—</span>),
    },
    {
      header: "Next Billing",
      cell: (sub) => (sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString("en-IN") : "—"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Dashboard"
        description="Recurring revenue, real-time subscriber cohorts &amp; ledger recovery metrics."
        breadcrumbs={[{ label: "Home", href: "/dashboard" }, { label: "Dashboard" }]}
        actions={
          <button
            onClick={handleExportReport}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary-container text-white font-body-md text-body-md font-medium hover:bg-primary transition-all shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Export Report</span>
          </button>
        }
      />

      {/* Filter Bar */}
      <FilterBar
        onReset={handleResetFilters}
        trailingAction={
          <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-lg border border-[#E2E8F0]">
            <button
              onClick={() => setActiveTab("summary")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === "summary"
                  ? "bg-white text-on-surface shadow-xs"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">bar_chart</span>
              <span>Summary</span>
            </button>
            <button
              onClick={() => setActiveTab("invoices")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === "invoices"
                  ? "bg-white text-on-surface shadow-xs"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">receipt_long</span>
              <span>Invoices</span>
            </button>
            <button
              onClick={() => setActiveTab("subscriptions")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === "subscriptions"
                  ? "bg-white text-on-surface shadow-xs"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">autorenew</span>
              <span>Subscriptions</span>
            </button>
          </div>
        }
      >
        {/* Date Range Selector */}
        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg font-body-sm text-body-sm font-medium text-slate-700 hover:border-slate-400 focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container outline-none transition cursor-pointer"
          >
            <option value="all">Billing Cycle: All Time</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="year">Full Year (365d)</option>
          </select>
          <span className="material-symbols-outlined absolute right-2 top-2 pointer-events-none text-slate-500 text-[18px]">
            expand_more
          </span>
        </div>

        {/* Plan Filter */}
        <div className="relative">
          <select
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg font-body-sm text-body-sm font-medium text-slate-700 hover:border-slate-400 focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container outline-none transition cursor-pointer"
          >
            <option value="all">All Plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2 top-2 pointer-events-none text-slate-500 text-[18px]">
            expand_more
          </span>
        </div>

        {/* Customer Filter */}
        <div className="relative">
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg font-body-sm text-body-sm font-medium text-slate-700 hover:border-slate-400 focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container outline-none transition cursor-pointer"
          >
            <option value="all">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2 top-2 pointer-events-none text-slate-500 text-[18px]">
            expand_more
          </span>
        </div>

        {/* Status Filter */}
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg font-body-sm text-body-sm font-medium text-slate-700 hover:border-slate-400 focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container outline-none transition cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PAID">Paid</option>
            <option value="QUOTATION">Quotation</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
          </select>
          <span className="material-symbols-outlined absolute right-2 top-2 pointer-events-none text-slate-500 text-[18px]">
            expand_more
          </span>
        </div>
      </FilterBar>

      {/* ── 4 KPI CARDS ONLY (PRD §4.10) ─────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* Metric 1: Active Subscriptions */}
        <KpiCard
          title="Active Subscriptions"
          value={activeSubscriptionsCount.toLocaleString("en-IN")}
          icon="autorenew"
          iconBg="bg-indigo-50"
          iconColor="text-primary-container"
          footerText={`${filteredSubscriptions.length} total subscriptions`}
          footerSubtext="PRD cohort"
        />

        {/* Metric 2: Revenue Collected */}
        <KpiCard
          title="Revenue Collected"
          value={formatPaise(revenueCollectedPaise)}
          icon="payments"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-700"
          footerText={`From ${filteredPayments.length} recorded payments`}
          footerSubtext="INR gross"
        />

        {/* Metric 3: Amount Outstanding */}
        <KpiCard
          title="Amount Outstanding"
          value={formatPaise(amountOutstandingPaise)}
          icon="schedule"
          iconBg="bg-amber-50"
          iconColor="text-amber-700"
          footerText="On Confirmed invoices"
          footerSubtext="Normal cycle"
        />

        {/* Metric 4: Overdue Invoices */}
        <KpiCard
          title="Overdue Invoices"
          value={formatPaise(overdueStats.amountPaise)}
          variant="danger"
          icon="warning"
          iconBg="bg-rose-100"
          iconColor="text-rose-700"
          footerText={`${overdueStats.count} delinquent invoices`}
          footerSubtext="Action required"
        />
      </section>

      {/* Tabular Views */}
      {activeTab === "summary" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Invoices Card */}
          <div className="bg-surface-container-lowest border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[20px]">
                  receipt_long
                </span>
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                  Invoices Overview
                </h3>
              </div>
              <button
                onClick={() => setActiveTab("invoices")}
                className="text-body-sm font-semibold text-primary hover:underline"
              >
                View all ({filteredInvoices.length})
              </button>
            </div>
            <DataTable
              columns={invoiceColumns}
              data={filteredInvoices.slice(0, 5)}
              keyExtractor={(i) => i.id}
            />
          </div>

          {/* Subscriptions Overview Card */}
          <div className="bg-surface-container-lowest border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[20px]">
                  autorenew
                </span>
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                  Subscriptions Cohort
                </h3>
              </div>
              <button
                onClick={() => setActiveTab("subscriptions")}
                className="text-body-sm font-semibold text-primary hover:underline"
              >
                View all ({filteredSubscriptions.length})
              </button>
            </div>
            <DataTable
              columns={subscriptionColumns}
              data={filteredSubscriptions.slice(0, 5)}
              keyExtractor={(s) => s.id}
            />
          </div>
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md font-bold text-on-surface">
              Detailed Invoices Ledger ({filteredInvoices.length})
            </h3>
          </div>
          <DataTable
            columns={invoiceColumns}
            data={filteredInvoices}
            keyExtractor={(i) => i.id}
          />
        </div>
      )}

      {activeTab === "subscriptions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md font-bold text-on-surface">
              Subscriptions Cohort ({filteredSubscriptions.length})
            </h3>
          </div>
          <DataTable
            columns={subscriptionColumns}
            data={filteredSubscriptions}
            keyExtractor={(s) => s.id}
          />
        </div>
      )}
    </div>
  );
}

export default DashboardClientView;
