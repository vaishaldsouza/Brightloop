"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import CustomerModal, { CustomerFormData } from "@/components/customers/CustomerModal";
import { COMPANY_GST_STATE_CODE } from "@/lib/gstStates";

export interface SerializedCustomer {
  id: string;
  companyName: string;
  gstin: string | null;
  gstState: string | null;
  gstStateCode: string | null;
  phone: string | null;
  billingAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  activeSubscriptionsCount: number;
  totalSubscriptionsCount: number;
}

interface CustomerListClientProps {
  initialCustomers: SerializedCustomer[];
  isAdmin: boolean;
}

export default function CustomerListClient({
  initialCustomers,
  isAdmin,
}: CustomerListClientProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerFormData | null>(null);

  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (c: SerializedCustomer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer({
      id: c.id,
      companyName: c.companyName,
      contactName: c.user.name,
      email: c.user.email,
      phone: c.phone,
      gstState: c.gstState || "Maharashtra",
      gstStateCode: c.gstStateCode || "27",
      gstin: c.gstin,
      billingAddress: c.billingAddress,
    });
    setIsModalOpen(true);
  };

  const handleModalSuccess = (newCustomerId?: string) => {
    router.refresh();
    if (newCustomerId && !editingCustomer) {
      router.push(`/customers/${newCustomerId}`);
    }
  };

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return initialCustomers.filter((c) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesCompany = c.companyName.toLowerCase().includes(query);
        const matchesName = c.user.name.toLowerCase().includes(query);
        const matchesEmail = c.user.email.toLowerCase().includes(query);
        const matchesGstin = c.gstin ? c.gstin.toLowerCase().includes(query) : false;
        const matchesState = c.gstState ? c.gstState.toLowerCase().includes(query) : false;

        if (!matchesCompany && !matchesName && !matchesEmail && !matchesGstin && !matchesState) {
          return false;
        }
      }

      // Jurisdiction filter
      if (jurisdictionFilter === "INTRA") {
        if (c.gstStateCode !== COMPANY_GST_STATE_CODE) return false;
      } else if (jurisdictionFilter === "INTER") {
        if (c.gstStateCode === COMPANY_GST_STATE_CODE) return false;
      }

      return true;
    });
  }, [initialCustomers, searchQuery, jurisdictionFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const hasActiveFilters = searchQuery.trim() !== "" || jurisdictionFilter !== "ALL";

  const handleResetFilters = () => {
    setSearchQuery("");
    setJurisdictionFilter("ALL");
    setCurrentPage(1);
  };

  const columns: Column<SerializedCustomer>[] = [
    {
      header: "Company",
      accessor: (c) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[18px]">business</span>
          </div>
          <div>
            <Link
              href={`/customers/${c.id}`}
              className="font-semibold text-on-surface hover:text-primary transition-colors block"
            >
              {c.companyName}
            </Link>
            <span className="text-xs text-secondary">
              Added {new Date(c.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
      ),
      className: "min-w-[200px]",
    },
    {
      header: "Contact Person",
      accessor: (c) => (
        <div>
          <div className="font-medium text-on-surface">{c.user.name}</div>
          <div className="text-xs text-secondary font-mono">{c.user.email}</div>
        </div>
      ),
    },
    {
      header: "State / Jurisdiction",
      accessor: (c) => {
        const isIntra = c.gstStateCode === COMPANY_GST_STATE_CODE;
        return (
          <div className="space-y-1">
            <div className="text-body-sm font-medium text-on-surface">
              {c.gstState || "Unknown"} ({c.gstStateCode || "—"})
            </div>
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                isIntra
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-purple-50 text-purple-700 border border-purple-200"
              }`}
            >
              {isIntra ? "Intra-state (27)" : "Inter-state"}
            </span>
          </div>
        );
      },
    },
    {
      header: "GSTIN",
      accessor: (c) => (
        c.gstin ? (
          <span className="font-mono text-xs font-medium px-2 py-1 bg-surface-container-high rounded text-on-surface-variant">
            {c.gstin}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">Unregistered</span>
        )
      ),
    },
    {
      header: "Subscriptions",
      align: "center",
      accessor: (c) => (
        <div className="flex flex-col items-center">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            c.activeSubscriptionsCount > 0
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}>
            {c.activeSubscriptionsCount} active
          </span>
          {c.totalSubscriptionsCount > c.activeSubscriptionsCount && (
            <span className="text-[10px] text-slate-400 mt-0.5">
              {c.totalSubscriptionsCount} total
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Actions",
      align: "right",
      accessor: (c) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/customers/${c.id}`}
            className="px-2.5 py-1 text-xs font-medium rounded-lg text-primary hover:bg-primary/5 transition inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            <span>View</span>
          </Link>
          <button
            type="button"
            onClick={(e) => handleOpenEditModal(c, e)}
            className="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
            <span>Edit</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Manage client accounts, GST profiles, and billing information"
        breadcrumbs={[{ label: "Customers" }]}
        actions={
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-md font-body-md font-semibold hover:bg-primary-container shadow-xs transition"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>New Customer</span>
          </button>
        }
      />

      {/* Filter and Search Bar */}
      <FilterBar onReset={hasActiveFilters ? handleResetFilters : undefined}>
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
            search
          </span>
          <input
            type="text"
            placeholder="Search company, contact, email, GSTIN..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-body-sm text-secondary font-medium">Jurisdiction:</span>
          <select
            value={jurisdictionFilter}
            onChange={(e) => {
              setJurisdictionFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          >
            <option value="ALL">All Jurisdictions</option>
            <option value="INTRA">Intra-State (Maharashtra 27)</option>
            <option value="INTER">Inter-State (Other States)</option>
          </select>
        </div>
      </FilterBar>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={paginatedCustomers}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
        emptyIcon="person_search"
        emptyMessage={
          hasActiveFilters
            ? "No customers match your active search and filter criteria."
            : "No customer accounts found. Click 'New Customer' to register one."
        }
      />

      {/* Pagination Footer */}
      {filteredCustomers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm text-secondary px-1">
          <div>
            Showing{" "}
            <span className="font-semibold text-on-surface">
              {(currentPage - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-on-surface">
              {Math.min(currentPage * pageSize, filteredCustomers.length)}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-on-surface">
              {filteredCustomers.length}
            </span>{" "}
            customers
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 font-medium"
            >
              <span>Next</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      )}

      {/* Customer Create/Edit Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={editingCustomer}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
