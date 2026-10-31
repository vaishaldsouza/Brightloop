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
  subtotalPaise: number;
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
  subscriptionStatus: SubscriptionStatus;
  billingPeriod: BillingPeriod;
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

export interface UnifiedLedgerItem {
  id: string;
  type: "SUBSCRIPTION" | "INVOICE";
  number: string;
  customerName: string;
  planName: string;
  billingPeriod: BillingPeriod;
  date: string; // Due date for invoice, nextBillingDate or startDate for sub
  status: SubscriptionStatus | InvoiceStatus;
  isPaused?: boolean;
  isOverdue?: boolean;
  overdueDays?: number;
  isPartiallyPaid?: boolean;
  totalPaise: number;
  outstandingPaise: number;
  paidPaise?: number;
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
  const [viewMode, setViewMode] = useState<"summary" | "detailed">("summary");

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

      // Smart Status filter
      if (selectedStatus !== "all") {
        if (selectedStatus === "ACTIVE" && sub.status !== SubscriptionStatus.ACTIVE) return false;
        if (selectedStatus === "CONFIRMED" && sub.status !== SubscriptionStatus.CONFIRMED) return false;
        if (selectedStatus === "QUOTATION" && sub.status !== SubscriptionStatus.QUOTATION) return false;
        if (selectedStatus === "DRAFT" && sub.status !== SubscriptionStatus.DRAFT) return false;
        if (selectedStatus === "CLOSED" && sub.status !== SubscriptionStatus.CLOSED) return false;
        if (selectedStatus === "OVERDUE") {
          // Check if subscription has any overdue invoices
          const hasOverdueInv = initialInvoices.some(
            (inv) =>
              inv.subscriptionId === sub.id &&
              inv.status === InvoiceStatus.CONFIRMED &&
              !inv.cancelledAt &&
              new Date(inv.dueDate) < today &&
              inv.totalPaise - inv.paidPaise > 0
          );
          if (!hasOverdueInv) return false;
        }
        if (selectedStatus === "PAID") return false; // Subscriptions do not have PAID status
      }

      if (dateCutoff) {
        const subDate = new Date(sub.startDate);
        if (subDate < dateCutoff) return false;
      }

      return true;
    });
  }, [initialSubscriptions, initialInvoices, selectedPlan, selectedCustomer, selectedStatus, dateCutoff, today]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return initialInvoices.filter((inv) => {
      // Exclude cancelled invoices from standard ledger operations per PRD §4.6
      if (inv.cancelledAt) return false;
      if (selectedPlan !== "all" && inv.planId !== selectedPlan) return false;
      if (selectedCustomer !== "all" && inv.customerId !== selectedCustomer) return false;

      // Smart Status filter
      if (selectedStatus !== "all") {
        const isOverdue =
          inv.status === InvoiceStatus.CONFIRMED &&
          new Date(inv.dueDate) < today &&
          inv.totalPaise - inv.paidPaise > 0;

        if (selectedStatus === "OVERDUE") {
          if (!isOverdue) return false;
        } else if (selectedStatus === "ACTIVE") {
          if (inv.subscriptionStatus !== SubscriptionStatus.ACTIVE) return false;
        } else if (selectedStatus === "CONFIRMED") {
          if (inv.status !== InvoiceStatus.CONFIRMED) return false;
        } else if (selectedStatus === "PAID") {
          if (inv.status !== InvoiceStatus.PAID) return false;
        } else if (selectedStatus === "DRAFT") {
          if (inv.status !== InvoiceStatus.DRAFT) return false;
        } else if (selectedStatus === "QUOTATION" || selectedStatus === "CLOSED") {
          return false; // Invoices do not have Quotation or Closed lifecycle states
        }
      }

      if (dateCutoff) {
        const invDate = new Date(inv.dueDate);
        if (invDate < dateCutoff) return false;
      }
      return true;
    });
  }, [initialInvoices, selectedPlan, selectedCustomer, selectedStatus, dateCutoff, today]);

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

  // Unified Ledger Items for Detailed List View
  const unifiedLedgerItems = useMemo((): UnifiedLedgerItem[] => {
    const invoiceItems: UnifiedLedgerItem[] = filteredInvoices.map((inv) => {
      const dueDate = new Date(inv.dueDate);
      const outstanding = Math.max(0, inv.totalPaise - inv.paidPaise);
      const isOverdue =
        inv.status === InvoiceStatus.CONFIRMED && dueDate < today && outstanding > 0;
      const overdueDays = isOverdue
        ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;
      const isPartiallyPaid = inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise;

      return {
        id: inv.id,
        type: "INVOICE",
        number: inv.number,
        customerName: inv.customerName,
        planName: inv.planName,
        billingPeriod: inv.billingPeriod,
        date: inv.dueDate,
        status: inv.status,
        isOverdue,
        overdueDays,
        isPartiallyPaid,
        totalPaise: inv.totalPaise,
        outstandingPaise: outstanding,
        paidPaise: inv.paidPaise,
      };
    });

    const subItems: UnifiedLedgerItem[] = filteredSubscriptions.map((sub) => ({
      id: sub.id,
      type: "SUBSCRIPTION",
      number: sub.number,
      customerName: sub.customerName,
      planName: sub.planName,
      billingPeriod: sub.billingPeriod,
      date: sub.nextBillingDate || sub.startDate,
      status: sub.status,
      isPaused: sub.isPaused,
      totalPaise: sub.subtotalPaise,
      outstandingPaise: 0,
    }));

    return [...invoiceItems, ...subItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [filteredInvoices, filteredSubscriptions, today]);

  const handleResetFilters = () => {
    setDateRange("all");
    setSelectedPlan("all");
    setSelectedCustomer("all");
    setSelectedStatus("all");
  };

  // CSV Export
  const handleExportReport = () => {
    const headers = [
      "Record Type",
      "Ref / Number",
      "Customer",
      "Plan",
      "Due / Billing Date",
      "Total Amount (INR)",
      "Paid Amount (INR)",
      "Outstanding (INR)",
      "Status",
    ];
    const rows = unifiedLedgerItems.map((item) => [
      item.type,
      item.number,
      `"${item.customerName}"`,
      `"${item.planName} (${item.billingPeriod})"`,
      new Date(item.date).toLocaleDateString("en-IN"),
      (item.totalPaise / 100).toFixed(2),
      item.paidPaise !== undefined ? (item.paidPaise / 100).toFixed(2) : "0.00",
      (item.outstandingPaise / 100).toFixed(2),
      item.status,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `brightloop-dashboard-report-${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Invoice Columns (for Summary view card)
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
      align: "center",
      cell: (inv) => {
        const isOverdue =
          inv.status === InvoiceStatus.CONFIRMED &&
          new Date(inv.dueDate) < today &&
          inv.totalPaise - inv.paidPaise > 0;
        const isPartiallyPaid = inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise;

        return (
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <StatusBadge status={inv.status} />
            {isOverdue && <TagBadge tag="OVERDUE" />}
            {isPartiallyPaid && <TagBadge tag="PARTIALLY_PAID" />}
          </div>
        );
      },
    },
  ];

  // Subscription Columns (for Summary view card)
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
      cell: (sub) => (
        <span className="text-secondary">
          {sub.planName} ({sub.billingPeriod})
        </span>
      ),
    },
    {
      header: "Next Billing",
      cell: (sub) =>
        sub.nextBillingDate
          ? new Date(sub.nextBillingDate).toLocaleDateString("en-IN")
          : "—",
    },
    {
      header: "Subtotal",
      align: "right",
      cell: (sub) => <MoneyText amountPaise={sub.subtotalPaise} />,
    },
    {
      header: "Status",
      align: "center",
      cell: (sub) => (
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <StatusBadge status={sub.status} />
          {sub.isPaused && <TagBadge tag="PAUSED" />}
        </div>
      ),
    },
  ];

  // Unified Ledger Columns matching design/screens/dashboard.html
  const unifiedColumns: Column<UnifiedLedgerItem>[] = [
    {
      header: "Ref / No.",
      cell: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-primary hover:underline">
            {item.number}
          </span>
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-surface-container text-secondary">
            {item.type === "INVOICE" ? "INV" : "SUB"}
          </span>
        </div>
      ),
    },
    {
      header: "Customer & Plan Details",
      cell: (item) => (
        <div>
          <div className="font-medium text-slate-900">{item.customerName}</div>
          <div className="text-xs text-secondary font-mono">
            {item.planName} • {item.billingPeriod}
          </div>
        </div>
      ),
    },
    {
      header: "Due / Next Billing",
      cell: (item) => (
        <span suppressHydrationWarning className="text-xs font-mono text-slate-700">
          {new Date(item.date).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      header: "Status & Tags",
      cell: (item) => {
        if (item.type === "INVOICE") {
          return (
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={item.status as InvoiceStatus} />
              {item.isOverdue && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                  Overdue {item.overdueDays ? `${item.overdueDays}d` : ""}
                </span>
              )}
              {item.isPartiallyPaid && <TagBadge tag="PARTIALLY_PAID" />}
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={item.status as SubscriptionStatus} />
            {item.isPaused && <TagBadge tag="PAUSED" />}
          </div>
        );
      },
    },
    {
      header: "Amount & Balance (₹ INR)",
      align: "right",
      cell: (item) => (
        <div className="text-right">
          <MoneyText amountPaise={item.totalPaise} className="font-bold text-slate-900" />
          {item.outstandingPaise > 0 && (
            <div className="text-xs font-medium text-amber-700">
              Due: <MoneyText amountPaise={item.outstandingPaise} />
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb & Automated Sync Row ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <nav className="flex items-center gap-2 text-body-sm font-body-sm text-secondary">
          <span>Home</span>
          <span className="material-symbols-outlined text-[14px] text-slate-400">
            chevron_right
          </span>
          <span className="font-medium text-on-surface">Dashboard</span>
        </nav>
        <div className="flex items-center gap-2 text-label-sm font-label-sm text-slate-500">
          <span className="material-symbols-outlined text-[16px] text-emerald-600">
            sync
          </span>
          <span>
            Automated sync: <strong className="text-slate-700 font-medium">Real-Time PostgreSQL</strong>
          </span>
        </div>
      </div>

      {/* ── Page Header with Export Report Button ────────────────────── */}
      <PageHeader
        title="Dashboard"
        description="Recurring revenue, real-time subscriber cohorts & ledger recovery metrics."
        actions={
          <button
            type="button"
            onClick={handleExportReport}
            suppressHydrationWarning
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary-container text-white font-body-md text-body-md font-medium hover:bg-primary transition-all shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Export Report</span>
          </button>
        }
      />

      {/* ── Filter Bar matching design/screens/dashboard.html ─────────── */}
      <FilterBar
        onReset={handleResetFilters}
        actions={
          /* Segmented View Toggle Buttons matching dashboard.html lines 487-496 */
          <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-lg shrink-0 self-start md:self-auto border border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => setViewMode("summary")}
              suppressHydrationWarning
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "summary"
                  ? "bg-white text-on-surface shadow-xs"
                  : "text-secondary hover:text-on-surface"
              }`}
              id="viewSummaryBtn"
            >
              <span className="material-symbols-outlined text-[15px]">bar_chart</span>
              <span>Summary View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("detailed")}
              suppressHydrationWarning
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "detailed"
                  ? "bg-white text-on-surface shadow-xs"
                  : "text-secondary hover:text-on-surface"
              }`}
              id="viewDetailedBtn"
            >
              <span className="material-symbols-outlined text-[15px]">table_rows</span>
              <span>Detailed List</span>
            </button>
          </div>
        }
      >
        {/* Period Selector */}
        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            suppressHydrationWarning
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
            suppressHydrationWarning
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
            suppressHydrationWarning
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
            suppressHydrationWarning
            className="appearance-none pl-3 pr-8 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg font-body-sm text-body-sm font-medium text-slate-700 hover:border-slate-400 focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container outline-none transition cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="OVERDUE">Overdue</option>
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
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5" id="kpiContainer">
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

      {/* ── View Presentation Modes ───────────────────────────────────── */}
      {viewMode === "summary" ? (
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
                type="button"
                onClick={() => setViewMode("detailed")}
                suppressHydrationWarning
                className="text-body-sm font-semibold text-primary hover:underline"
              >
                View all ({filteredInvoices.length})
              </button>
            </div>
            <DataTable
              columns={invoiceColumns}
              data={filteredInvoices.slice(0, 5)}
              keyExtractor={(i) => i.id}
              emptyMessage="No invoices matching selected filters"
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
                type="button"
                onClick={() => setViewMode("detailed")}
                suppressHydrationWarning
                className="text-body-sm font-semibold text-primary hover:underline"
              >
                View all ({filteredSubscriptions.length})
              </button>
            </div>
            <DataTable
              columns={subscriptionColumns}
              data={filteredSubscriptions.slice(0, 5)}
              keyExtractor={(s) => s.id}
              emptyMessage="No subscriptions matching selected filters"
            />
          </div>
        </div>
      ) : (
        /* Detailed List: Unified Invoices & Subscriptions Ledger matching dashboard.html lines 807-837 */
        <div className="bg-surface-container-lowest border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden space-y-0" id="tableContainer">
          <div className="p-6 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-container"></span>
                <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
                  Invoices &amp; Subscriptions Ledger
                </h2>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {unifiedLedgerItems.length} Records
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-secondary mt-1">
                Unified financial ledger of active recurring subscriptions and reconcilable invoice receivables.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedStatus(selectedStatus === "OVERDUE" ? "all" : "OVERDUE")}
                suppressHydrationWarning
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-body-md font-medium transition shadow-xs ${
                  selectedStatus === "OVERDUE"
                    ? "bg-rose-50 border-rose-300 text-rose-700 font-semibold"
                    : "border-[#CBD5E1] bg-white text-on-surface hover:bg-[#F8FAFC]"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {selectedStatus === "OVERDUE" ? "check_circle" : "filter_list"}
                </span>
                <span>Filter Overdue ({overdueStats.count})</span>
              </button>
            </div>
          </div>

          <DataTable
            columns={unifiedColumns}
            data={unifiedLedgerItems}
            keyExtractor={(item) => item.id}
            emptyMessage="No ledger records matching current filters"
          />
        </div>
      )}
    </div>
  );
}

export default DashboardClientView;
