"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DiscountType, DiscountScope } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import DiscountModal, {
  DiscountItem,
  ProductOption,
} from "@/components/discounts/DiscountModal";
import {
  toggleDiscountActiveAction,
  deleteDiscountAction,
} from "@/app/actions/discounts";

interface DiscountsListClientProps {
  discounts: DiscountItem[];
  products: ProductOption[];
  isAdmin: boolean;
}

export default function DiscountsListClient({
  discounts,
  products,
  isAdmin,
}: DiscountsListClientProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"ALL" | "ACTIVE" | "SCHEDULED" | "EXPIRED">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const now = new Date();

  // Helper to determine status
  const getDiscountStatus = (d: DiscountItem) => {
    if (!d.isActive) return "INACTIVE";
    if (d.startDate && new Date(d.startDate) > now) return "SCHEDULED";
    if (d.expiresAt && new Date(d.expiresAt) < now) return "EXPIRED";
    if (d.maxUses !== null && d.maxUses !== undefined && d.usedCount >= d.maxUses)
      return "EXHAUSTED";
    return "ACTIVE";
  };

  // Filter discounts
  const filteredDiscounts = discounts.filter((d) => {
    const status = getDiscountStatus(d);
    if (activeTab === "ACTIVE" && status !== "ACTIVE") return false;
    if (activeTab === "SCHEDULED" && status !== "SCHEDULED") return false;
    if (activeTab === "EXPIRED" && status !== "EXPIRED" && status !== "EXHAUSTED") return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const codeMatch = d.code.toLowerCase().includes(term);
      const descMatch = d.description?.toLowerCase().includes(term);
      if (!codeMatch && !descMatch) return false;
    }
    return true;
  });

  const handleOpenCreate = () => {
    setEditingDiscount(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (discount: DiscountItem) => {
    setEditingDiscount(discount);
    setIsModalOpen(true);
  };

  const handleToggle = async (id: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await toggleDiscountActiveAction(id);
      if (res.success) {
        setActionSuccess("Discount status updated.");
        router.refresh();
      } else {
        setActionError(res.error || "Failed to toggle status.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error updating status.");
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!window.confirm(`Are you sure you want to delete discount rule "${code}"?`)) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await deleteDiscountAction(id);
      if (res.success) {
        setActionSuccess(`Discount "${code}" deleted.`);
        router.refresh();
      } else {
        setActionError(res.error || "Failed to delete discount.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error deleting discount.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-secondary font-label-md text-label-md mb-1">
            <Link href="/dashboard" className="hover:text-on-surface transition-colors">
              Home
            </Link>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Discounts</span>
          </nav>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">
            Discounts & Vouchers
          </h1>
          <p className="font-body-md text-body-md text-secondary mt-1">
            Promotional codes, customer retention rebates, and recurring contract discounts.
          </p>
        </div>

        {isAdmin && (
          <div>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 bg-[#4F46E5] hover:bg-[#3730A3] text-on-primary font-medium px-4 py-2 rounded-lg shadow-sm transition-colors duration-150"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span className="font-title-sm text-title-sm">New Discount</span>
            </button>
          </div>
        )}
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-body-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-body-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-700 hover:text-rose-900">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
              activeTab === "ALL"
                ? "bg-surface-container-low text-primary-container font-semibold"
                : "text-secondary hover:text-on-surface hover:bg-surface-container-low"
            }`}
          >
            All ({discounts.length})
          </button>
          <button
            onClick={() => setActiveTab("ACTIVE")}
            className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
              activeTab === "ACTIVE"
                ? "bg-surface-container-low text-primary-container font-semibold"
                : "text-secondary hover:text-on-surface hover:bg-surface-container-low"
            }`}
          >
            Active ({discounts.filter((d) => getDiscountStatus(d) === "ACTIVE").length})
          </button>
          <button
            onClick={() => setActiveTab("SCHEDULED")}
            className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
              activeTab === "SCHEDULED"
                ? "bg-surface-container-low text-primary-container font-semibold"
                : "text-secondary hover:text-on-surface hover:bg-surface-container-low"
            }`}
          >
            Scheduled ({discounts.filter((d) => getDiscountStatus(d) === "SCHEDULED").length})
          </button>
          <button
            onClick={() => setActiveTab("EXPIRED")}
            className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
              activeTab === "EXPIRED"
                ? "bg-surface-container-low text-primary-container font-semibold"
                : "text-secondary hover:text-on-surface hover:bg-surface-container-low"
            }`}
          >
            Expired / Exhausted ({discounts.filter((d) => ["EXPIRED", "EXHAUSTED"].includes(getDiscountStatus(d))).length})
          </button>
        </div>

        {/* Search */}
        <div className="w-full sm:w-72 relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
            <span className="material-symbols-outlined text-[18px]">search</span>
          </span>
          <input
            type="text"
            placeholder="Search discounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-container-low border border-outline-variant/60 rounded-lg font-body-md text-body-md text-on-surface placeholder-secondary focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-outline-variant/60 font-label-md text-label-md text-[#475569] h-11">
                <th className="py-3 px-4 min-w-[200px]">Discount Name & Code</th>
                <th className="py-3 px-4 min-w-[100px]">Type</th>
                <th className="py-3 px-4 min-w-[100px] text-right">Value</th>
                <th className="py-3 px-4 min-w-[160px]">Applies To</th>
                <th className="py-3 px-4 min-w-[140px] text-right">Min Purchase / Qty</th>
                <th className="py-3 px-4 min-w-[180px]">Validity Period</th>
                <th className="py-3 px-4 min-w-[150px]">Usage Progress</th>
                <th className="py-3 px-4 min-w-[100px] text-center">Status</th>
                {isAdmin && <th className="py-3 px-4 min-w-[100px] text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] font-body-sm text-body-sm text-on-surface">
              {filteredDiscounts.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="py-12 text-center text-secondary">
                    No discount rules match the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredDiscounts.map((d) => {
                  const status = getDiscountStatus(d);
                  const usagePercent =
                    d.maxUses && d.maxUses > 0
                      ? Math.min(100, Math.round((d.usedCount / d.maxUses) * 100))
                      : 0;

                  return (
                    <tr key={d.id} className="hover:bg-[#F8FAFC] transition-colors duration-100">
                      {/* Name & Code */}
                      <td className="py-3.5 px-4">
                        <div className="font-title-sm text-title-sm font-semibold text-on-surface">
                          {d.description || d.code}
                        </div>
                        <div className="flex items-center gap-1 font-body-sm text-secondary mt-0.5">
                          <span className="font-mono bg-surface-container-low px-1.5 py-0.5 rounded text-[11px] text-on-surface-variant font-semibold">
                            {d.code}
                          </span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-container-low text-secondary border border-outline-variant/60">
                          {d.discountType === DiscountType.PERCENTAGE ? "Percentage" : "Fixed Amount"}
                        </span>
                      </td>

                      {/* Value */}
                      <td className="py-3.5 px-4 text-right font-currency-table text-currency-table font-semibold text-on-surface">
                        {d.discountType === DiscountType.PERCENTAGE
                          ? `${(d.value / 100).toFixed(0)}%`
                          : formatCurrency(d.value)}
                      </td>

                      {/* Applies To */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-container-low text-on-surface-variant border border-outline-variant/60">
                          {d.scope === DiscountScope.SUBSCRIPTION
                            ? "Whole Subscriptions"
                            : "Specific Products"}
                        </span>
                      </td>

                      {/* Min Purchase / Qty */}
                      <td className="py-3.5 px-4 text-right font-currency-table text-currency-table text-secondary">
                        {d.minPurchasePaise ? formatCurrency(d.minPurchasePaise) : `Qty ≥ ${d.minQuantity}`}
                      </td>

                      {/* Validity Period */}
                      <td className="py-3.5 px-4 text-secondary whitespace-nowrap text-xs">
                        {d.startDate ? formatDate(d.startDate) : "Anytime"} –{" "}
                        {d.expiresAt ? formatDate(d.expiresAt) : "No expiry"}
                      </td>

                      {/* Usage Progress */}
                      <td className="py-3.5 px-4">
                        <div className="w-full">
                          <div className="flex justify-between items-center text-[11px] mb-1 font-medium">
                            <span className="text-on-surface font-mono">
                              {d.usedCount}
                              {d.maxUses ? ` / ${d.maxUses}` : " uses"}
                            </span>
                            {d.maxUses ? (
                              <span className="text-secondary font-mono">{usagePercent}%</span>
                            ) : null}
                          </div>
                          {d.maxUses ? (
                            <div className="w-full bg-[#E2E8F0] rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full ${
                                  usagePercent >= 100 ? "bg-rose-500" : "bg-[#059669]"
                                }`}
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                          ) : (
                            <div className="w-full bg-[#E2E8F0] rounded-full h-1.5">
                              <div className="bg-primary h-1.5 rounded-full w-1/4" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {status === "ACTIVE" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                            Active
                          </span>
                        )}
                        {status === "SCHEDULED" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
                            Scheduled
                          </span>
                        )}
                        {status === "EXPIRED" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Expired
                          </span>
                        )}
                        {status === "EXHAUSTED" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            Exhausted
                          </span>
                        )}
                        {status === "INACTIVE" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Disabled
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      {isAdmin && (
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEdit(d)}
                              className="p-1 text-secondary hover:text-on-surface hover:bg-surface-container-low rounded transition-colors"
                              title="Edit Discount"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>

                            <button
                              onClick={() => handleToggle(d.id)}
                              className="p-1 text-secondary hover:text-on-surface hover:bg-surface-container-low rounded transition-colors"
                              title={d.isActive ? "Deactivate" : "Activate"}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {d.isActive ? "pause_circle" : "play_circle"}
                              </span>
                            </button>

                            <button
                              onClick={() => handleDelete(d.id, d.code)}
                              className="p-1 text-secondary hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Delete Discount"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <DiscountModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setActionSuccess("Discount saved successfully.");
            router.refresh();
          }}
          discountToEdit={editingDiscount}
          products={products}
        />
      )}
    </div>
  );
}
