"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import MoneyText from "@/components/ui/MoneyText";
import { SubscriptionStatus } from "@prisma/client";
import { getSubscriptionDerivedTags } from "@/lib/validations/subscription";

export interface SerializedSubscription {
  id: string;
  number: string;
  customerId: string;
  planId: string;
  billingPeriod: string;
  paymentTerms: string;
  isPausable: boolean;
  isRenewable: boolean;
  isClosableEarly: boolean;
  autoClose: boolean;
  status: SubscriptionStatus;
  isPaused: boolean;
  startDate: string;
  endDate: string | null;
  quotationExpiryDate: string | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  customer: {
    id: string;
    companyName: string;
    gstin: string | null;
    gstState: string | null;
  };
  plan: {
    id: string;
    name: string;
    billingPeriod: string;
  };
}

interface SubscriptionListClientProps {
  initialSubscriptions: SerializedSubscription[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearch?: string;
  initialStatus?: string;
  initialPlanId?: string;
  initialCustomerId?: string;
  availablePlans: Array<{ id: string; name: string }>;
  availableCustomers: Array<{ id: string; companyName: string }>;
  statusCounts: Record<string, number>;
  isAdmin: boolean;
  isStaff: boolean;
}

export default function SubscriptionListClient({
  initialSubscriptions,
  totalCount,
  currentPage,
  pageSize,
  initialSearch = "",
  initialStatus = "ALL",
  initialPlanId = "ALL",
  initialCustomerId = "ALL",
  availablePlans,
  availableCustomers,
  statusCounts,
  isAdmin,
  isStaff,
}: SubscriptionListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [planFilter, setPlanFilter] = useState(initialPlanId);
  const [customerFilter, setCustomerFilter] = useState(initialCustomerId);

  useEffect(() => {
    setSearchQuery(initialSearch);
    setStatusFilter(initialStatus);
    setPlanFilter(initialPlanId);
    setCustomerFilter(initialCustomerId);
  }, [initialSearch, initialStatus, initialPlanId, initialCustomerId]);

  const updateServerParams = useCallback(
    (
      newSearch: string,
      newStatus: string,
      newPlan: string,
      newCustomer: string,
      newPage: number
    ) => {
      const params = new URLSearchParams();
      if (newSearch.trim()) params.set("q", newSearch.trim());
      if (newStatus !== "ALL") params.set("status", newStatus);
      if (newPlan !== "ALL") params.set("planId", newPlan);
      if (newCustomer !== "ALL") params.set("customerId", newCustomer);
      if (newPage > 1) params.set("page", newPage.toString());

      startTransition(() => {
        router.push(`/subscriptions?${params.toString()}`);
      });
    },
    [router]
  );

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== initialSearch) {
        updateServerParams(
          searchQuery,
          statusFilter,
          planFilter,
          customerFilter,
          1
        );
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [
    searchQuery,
    initialSearch,
    statusFilter,
    planFilter,
    customerFilter,
    updateServerParams,
  ]);

  function handleStatusChange(status: string) {
    setStatusFilter(status);
    updateServerParams(searchQuery, status, planFilter, customerFilter, 1);
  }

  function handlePlanChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const plan = e.target.value;
    setPlanFilter(plan);
    updateServerParams(searchQuery, statusFilter, plan, customerFilter, 1);
  }

  function handleCustomerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const cust = e.target.value;
    setCustomerFilter(cust);
    updateServerParams(searchQuery, statusFilter, planFilter, cust, 1);
  }

  function handleResetFilters() {
    setSearchQuery("");
    setStatusFilter("ALL");
    setPlanFilter("ALL");
    setCustomerFilter("ALL");
    updateServerParams("", "ALL", "ALL", "ALL", 1);
  }

  function handlePageChange(newPage: number) {
    updateServerParams(
      searchQuery,
      statusFilter,
      planFilter,
      customerFilter,
      newPage
    );
  }

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "ALL" ||
    planFilter !== "ALL" ||
    customerFilter !== "ALL";

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Data table columns
  const columns: Column<SerializedSubscription>[] = [
    {
      header: "Subscription No.",
      accessor: "number",
      cell: (s) => (
        <Link
          href={`/subscriptions/${s.id}`}
          className="font-mono text-body-sm font-semibold text-primary-container hover:underline block"
        >
          {s.number}
        </Link>
      ),
    },
    {
      header: "Customer & GSTIN",
      accessor: (s) => s.customer.companyName,
      cell: (s) => (
        <div>
          <span className="font-medium text-on-surface block">
            {s.customer.companyName}
          </span>
          {s.customer.gstin ? (
            <span className="font-mono text-xs text-secondary">
              GSTIN: {s.customer.gstin}
            </span>
          ) : (
            <span className="text-xs text-secondary">Unregistered</span>
          )}
        </div>
      ),
    },
    {
      header: "Plan",
      accessor: (s) => s.plan.name,
      cell: (s) => (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface-container font-medium text-on-surface text-body-sm">
            {s.plan.name}
          </span>
          <span className="text-xs text-secondary block mt-0.5 font-mono uppercase">
            {s.billingPeriod} • {s.paymentTerms}
          </span>
        </div>
      ),
    },
    {
      header: "Start Date",
      accessor: "startDate",
      cell: (s) => (
        <span className="text-body-sm text-secondary font-mono">
          {new Date(s.startDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      header: "Expiry Date",
      accessor: (s) => s.quotationExpiryDate || s.endDate || "—",
      cell: (s) => {
        const dateToDisplay = s.status === SubscriptionStatus.QUOTATION
          ? s.quotationExpiryDate
          : s.endDate;

        if (!dateToDisplay) return <span className="text-xs text-secondary">—</span>;

        return (
          <span className="text-body-sm text-secondary font-mono">
            {new Date(dateToDisplay).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        );
      },
    },
    {
      header: "Total (INR)",
      accessor: (s) => s.totalPaise,
      className: "text-right",
      cell: (s) => (
        <div className="text-right">
          <MoneyText
            amountPaise={s.totalPaise}
            className="font-currency-table font-semibold text-on-surface"
          />
          <span className="text-xs text-secondary block">
            Subtotal: <MoneyText amountPaise={s.subtotalPaise} />
          </span>
        </div>
      ),
    },
    {
      header: "Status",
      accessor: "status",
      cell: (s) => {
        const derivedTags = getSubscriptionDerivedTags(
          s.status,
          s.isPaused,
          s.quotationExpiryDate
        );

        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={s.status} />
            {derivedTags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        );
      },
    },
    {
      header: "Actions",
      accessor: () => "",
      className: "text-right",
      cell: (s) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            href={`/subscriptions/${s.id}`}
            className="p-1 hover:text-primary-container rounded hover:bg-surface-container transition-colors text-secondary"
            title="View Details"
          >
            <span className="material-symbols-outlined text-[18px]">
              visibility
            </span>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Subscriptions"
        subtitle="Manage recurring customer contracts, lifecycle states, and billing schedules"
        breadcrumbs={[{ label: "Subscriptions" }]}
        actions={
          (isAdmin || isStaff) && (
            <div className="flex items-center gap-2.5">
              <Link
                href="/subscriptions/new-from-template"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface font-label-md text-label-md transition-colors shadow-xs"
              >
                <span className="material-symbols-outlined text-[18px]">
                  post_add
                </span>
                <span>New from template</span>
              </Link>
            </div>
          )
        }
      />

      {/* Filter and Status Segmented Bar */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/80 p-4 shadow-sm space-y-3.5">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-outline-variant/40">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="font-label-md text-secondary mr-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">
                filter_list
              </span>
              <span>Status:</span>
            </span>

            <button
              onClick={() => handleStatusChange("ALL")}
              className={`px-3 py-1 rounded-lg font-label-sm font-semibold transition-colors ${
                statusFilter === "ALL"
                  ? "bg-primary-container text-on-primary shadow-xs"
                  : "bg-surface-container-low/70 hover:bg-surface-container-low text-secondary hover:text-on-surface"
              }`}
            >
              All ({totalCount})
            </button>

            <button
              onClick={() => handleStatusChange(SubscriptionStatus.DRAFT)}
              className={`px-3 py-1 rounded-lg font-label-sm font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === SubscriptionStatus.DRAFT
                  ? "bg-primary-container text-on-primary shadow-xs"
                  : "bg-surface-container-low/70 hover:bg-surface-container-low text-secondary hover:text-on-surface"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Draft ({statusCounts[SubscriptionStatus.DRAFT] || 0})
            </button>

            <button
              onClick={() => handleStatusChange(SubscriptionStatus.QUOTATION)}
              className={`px-3 py-1 rounded-lg font-label-sm font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === SubscriptionStatus.QUOTATION
                  ? "bg-primary-container text-on-primary shadow-xs"
                  : "bg-surface-container-low/70 hover:bg-surface-container-low text-secondary hover:text-on-surface"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Quotation ({statusCounts[SubscriptionStatus.QUOTATION] || 0})
            </button>

            <button
              onClick={() => handleStatusChange(SubscriptionStatus.CONFIRMED)}
              className={`px-3 py-1 rounded-lg font-label-sm font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === SubscriptionStatus.CONFIRMED
                  ? "bg-primary-container text-on-primary shadow-xs"
                  : "bg-surface-container-low/70 hover:bg-surface-container-low text-secondary hover:text-on-surface"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Confirmed ({statusCounts[SubscriptionStatus.CONFIRMED] || 0})
            </button>

            <button
              onClick={() => handleStatusChange(SubscriptionStatus.ACTIVE)}
              className={`px-3 py-1 rounded-lg font-label-sm font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === SubscriptionStatus.ACTIVE
                  ? "bg-primary-container text-on-primary shadow-xs"
                  : "bg-surface-container-low/70 hover:bg-surface-container-low text-secondary hover:text-on-surface"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active ({statusCounts[SubscriptionStatus.ACTIVE] || 0})
            </button>

            <button
              onClick={() => handleStatusChange(SubscriptionStatus.CLOSED)}
              className={`px-3 py-1 rounded-lg font-label-sm font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === SubscriptionStatus.CLOSED
                  ? "bg-primary-container text-on-primary shadow-xs"
                  : "bg-surface-container-low/70 hover:bg-surface-container-low text-secondary hover:text-on-surface"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Closed ({statusCounts[SubscriptionStatus.CLOSED] || 0})
            </button>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-primary-container hover:text-primary font-label-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                restart_alt
              </span>
              <span>Reset filters</span>
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Search by Number */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search by SUB- or customer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-body-sm bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface placeholder-secondary focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none"
            />
          </div>

          {/* Plan Filter Dropdown */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
              layers
            </span>
            <select
              value={planFilter}
              onChange={handlePlanChange}
              className="w-full pl-9 pr-8 py-2 text-body-sm bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none appearance-none"
            >
              <option value="ALL">All Plans</option>
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Filter Dropdown */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
              domain
            </span>
            <select
              value={customerFilter}
              onChange={handleCustomerChange}
              className="w-full pl-9 pr-8 py-2 text-body-sm bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none appearance-none"
            >
              <option value="ALL">All Customers</option>
              {availableCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Subscriptions Data Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/80 shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={initialSubscriptions}
          keyExtractor={(s) => s.id}
          isLoading={isPending}
          emptyMessage={
            hasActiveFilters
              ? "No subscriptions match the selected filters."
              : "No subscriptions configured yet."
          }
        />

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <div className="px-6 py-3.5 border-t border-outline-variant bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-4 text-body-sm text-secondary">
            <div>
              Showing <span className="font-semibold text-on-surface">{startItem}</span> to{" "}
              <span className="font-semibold text-on-surface">{endItem}</span> of{" "}
              <span className="font-semibold text-on-surface">{totalCount}</span> subscriptions
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="h-8 px-2.5 rounded border border-outline-variant bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_left
                </span>
                <span>Previous</span>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => handlePageChange(pg)}
                  disabled={isPending}
                  className={`h-8 w-8 rounded text-body-sm font-medium transition-colors ${
                    pg === currentPage
                      ? "bg-primary-container text-on-primary"
                      : "border border-outline-variant hover:bg-surface-container-low text-on-surface"
                  }`}
                >
                  {pg}
                </button>
              ))}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="h-8 px-2.5 rounded border border-outline-variant bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span>Next</span>
                <span className="material-symbols-outlined text-[16px]">
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
