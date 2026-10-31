"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import MoneyText from "@/components/ui/MoneyText";
import PlanModal, {
  PlanFormData,
  PlanModalProductOption,
} from "@/components/plans/PlanModal";
import { BillingPeriod, PaymentTerms } from "@prisma/client";
import {
  getPlanAvailabilityStatus,
  PlanAvailabilityStatus,
  BILLING_PERIODS,
} from "@/lib/validations/plan";

export interface SerializedPlan {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  billingPeriod: BillingPeriod;
  paymentTerms: PaymentTerms;
  minQuantity: number;
  availableFrom: string | null;
  availableTo: string | null;
  isActive: boolean;
  autoClose: boolean;
  isClosableEarly: boolean;
  isPausable: boolean;
  isRenewable: boolean;
  product: {
    id: string;
    name: string;
    type: string | null;
    salesPricePaise: number;
  };
  subscriptionsCount: number;
  createdAt: string;
}

interface PlanListClientProps {
  initialPlans: SerializedPlan[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearch?: string;
  initialPeriod?: string;
  initialAvailability?: string;
  availableProducts: PlanModalProductOption[];
  isAdmin: boolean;
}

export default function PlanListClient({
  initialPlans,
  totalCount,
  currentPage,
  pageSize,
  initialSearch = "",
  initialPeriod = "ALL",
  initialAvailability = "ALL",
  availableProducts,
  isAdmin,
}: PlanListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [periodFilter, setPeriodFilter] = useState(initialPeriod);
  const [availabilityFilter, setAvailabilityFilter] = useState(initialAvailability);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanFormData | null>(null);

  // Synchronize when server parameters change
  useEffect(() => {
    setSearchQuery(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setPeriodFilter(initialPeriod);
  }, [initialPeriod]);

  useEffect(() => {
    setAvailabilityFilter(initialAvailability);
  }, [initialAvailability]);

  const updateServerParams = useCallback(
    (newQ: string, newPeriod: string, newAvail: string, newPage: number) => {
      startTransition(() => {
        const params = new URLSearchParams();
        if (newQ.trim()) params.set("q", newQ.trim());
        if (newPeriod && newPeriod !== "ALL") params.set("period", newPeriod);
        if (newAvail && newAvail !== "ALL") params.set("availability", newAvail);
        if (newPage > 1) params.set("page", newPage.toString());
        const query = params.toString();
        router.push(`/plans${query ? `?${query}` : ""}`);
      });
    },
    [router]
  );

  // Debounced search query sync to server
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== initialSearch) {
        updateServerParams(searchQuery, periodFilter, availabilityFilter, 1);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery, initialSearch, periodFilter, availabilityFilter, updateServerParams]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriodFilter(newPeriod);
    updateServerParams(searchQuery, newPeriod, availabilityFilter, 1);
  };

  const handleAvailabilityChange = (newAvail: string) => {
    setAvailabilityFilter(newAvail);
    updateServerParams(searchQuery, periodFilter, newAvail, 1);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setPeriodFilter("ALL");
    setAvailabilityFilter("ALL");
    updateServerParams("", "ALL", "ALL", 1);
  };

  const handlePageChange = (newPage: number) => {
    updateServerParams(searchQuery, periodFilter, availabilityFilter, newPage);
  };

  const handleOpenCreateModal = () => {
    setEditingPlan(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: SerializedPlan, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPlan({
      id: p.id,
      productId: p.product.id,
      name: p.name,
      description: p.description,
      pricePaise: p.pricePaise,
      billingPeriod: p.billingPeriod,
      paymentTerms: p.paymentTerms,
      minQuantity: p.minQuantity,
      availableFrom: p.availableFrom,
      availableTo: p.availableTo,
      isActive: p.isActive,
      autoClose: p.autoClose,
      isClosableEarly: p.isClosableEarly,
      isPausable: p.isPausable,
      isRenewable: p.isRenewable,
    });
    setIsModalOpen(true);
  };

  const handleModalSuccess = (planId?: string) => {
    router.refresh();
    if (planId && !editingPlan) {
      router.push(`/plans/${planId}`);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters =
    searchQuery.trim() !== "" || periodFilter !== "ALL" || availabilityFilter !== "ALL";

  const columns: Column<SerializedPlan>[] = [
    {
      header: "Plan Name",
      accessor: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[20px]">
              layers
            </span>
          </div>
          <div>
            <Link
              href={`/plans/${p.id}`}
              className="font-semibold text-on-surface hover:text-primary transition-colors block"
            >
              {p.name}
            </Link>
            <span className="text-xs text-secondary">
              Product: <span className="text-slate-700 font-medium">{p.product.name}</span>
            </span>
          </div>
        </div>
      ),
    },
    {
      header: "Base Price",
      align: "right",
      accessor: "pricePaise",
      cell: (p) => (
        <span className="font-semibold text-on-surface font-mono">
          <MoneyText paise={p.pricePaise} />
        </span>
      ),
    },
    {
      header: "Billing Period",
      align: "center",
      accessor: "billingPeriod",
      cell: (p) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-surface-container text-on-surface border border-outline-variant/60 capitalize">
          {p.billingPeriod.toLowerCase()}
        </span>
      ),
    },
    {
      header: "Min Qty",
      align: "center",
      accessor: "minQuantity",
      cell: (p) => (
        <span className="font-mono text-body-sm text-slate-700 font-medium">
          {p.minQuantity}
        </span>
      ),
    },
    {
      header: "Availability Window",
      accessor: (p) => {
        const status = getPlanAvailabilityStatus(p);
        let badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
        let dotStyle = "bg-emerald-500";
        if (status === "SCHEDULED") {
          badgeStyle = "bg-blue-50 text-blue-700 border-blue-200";
          dotStyle = "bg-blue-500";
        } else if (status === "EXPIRED") {
          badgeStyle = "bg-slate-100 text-slate-600 border-slate-200";
          dotStyle = "bg-slate-400";
        } else if (status === "ARCHIVED") {
          badgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
          dotStyle = "bg-rose-500";
        }

        return (
          <div className="space-y-1">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${badgeStyle}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
              <span>{status}</span>
            </span>
            <div className="text-[11px] text-slate-500">
              {p.availableTo
                ? `Until ${new Date(p.availableTo).toLocaleDateString("en-IN")}`
                : "No expiration"}
            </div>
          </div>
        );
      },
    },
    {
      header: "Rules",
      accessor: (p) => (
        <div className="flex items-center gap-1 text-xs">
          <span
            className={`px-1.5 py-0.5 rounded font-medium ${
              p.isPausable ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400"
            }`}
            title={p.isPausable ? "Pausable enabled" : "Pausing disabled"}
          >
            Pausable
          </span>
          <span
            className={`px-1.5 py-0.5 rounded font-medium ${
              p.isRenewable ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400"
            }`}
            title={p.isRenewable ? "Renewable enabled" : "Renewal disabled"}
          >
            Renewable
          </span>
        </div>
      ),
    },
    {
      header: "Actions",
      align: "right",
      accessor: (p) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/plans/${p.id}`}
            className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition"
            title="View Details"
          >
            <span className="material-symbols-outlined text-[18px]">
              visibility
            </span>
          </Link>
          {isAdmin && (
            <button
              type="button"
              onClick={(e) => handleOpenEditModal(p, e)}
              className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition"
              title="Edit Plan"
            >
              <span className="material-symbols-outlined text-[18px]">
                edit
              </span>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Subscription Plans"
        subtitle="Manage recurring contract tiers, base rates, cadence, and lifecycle policies"
        breadcrumbs={[{ label: "Plans" }]}
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-md font-semibold hover:bg-primary-container shadow-xs transition"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Plan</span>
            </button>
          ) : undefined
        }
      />

      {/* Staff Read-Only Banner */}
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 shadow-xs">
          <span className="material-symbols-outlined text-amber-600 text-[22px] mt-0.5 shrink-0">
            info
          </span>
          <div>
            <h4 className="text-body-sm font-bold">Staff Read-Only View</h4>
            <p className="text-body-sm text-amber-800 mt-0.5">
              Staff members have read-only access to plans. Plan creation and rule alterations require Administrator privileges.
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <FilterBar onReset={hasActiveFilters ? handleResetFilters : undefined}>
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
            search
          </span>
          <input
            type="text"
            placeholder="Search plan name, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-body-sm text-secondary font-medium">Cadence:</span>
          <select
            value={periodFilter}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          >
            <option value="ALL">All Cadences</option>
            {BILLING_PERIODS.map((bp) => (
              <option key={bp} value={bp}>
                {bp.charAt(0) + bp.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-body-sm text-secondary font-medium">Status:</span>
          <select
            value={availabilityFilter}
            onChange={(e) => handleAvailabilityChange(e.target.value)}
            className="px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active (Available)</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </FilterBar>

      {/* Plan Data Table */}
      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={initialPlans}
          keyExtractor={(p) => p.id}
          isLoading={isPending}
          emptyMessage={
            hasActiveFilters
              ? "No plans found matching your search or filters."
              : "No subscription plans configured."
          }
          onRowClick={(p) => router.push(`/plans/${p.id}`)}
        />

        {/* Server-Side Pagination Bar */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm text-secondary px-1">
            <div>
              Showing{" "}
              <span className="font-semibold text-on-surface">
                {(currentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-on-surface">
                {Math.min(currentPage * pageSize, totalCount)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-on-surface">
                {totalCount}
              </span>{" "}
              plans
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1 || isPending}
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 font-medium"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                <span>Previous</span>
              </button>
              <span className="text-body-sm font-medium px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages || isPending}
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 font-medium"
              >
                <span>Next</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Plan Create / Edit Modal (Admin only) */}
      {isAdmin && (
        <PlanModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          initialData={editingPlan}
          availableProducts={availableProducts}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
