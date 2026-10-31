"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MoneyText from "@/components/ui/MoneyText";
import Modal from "@/components/ui/Modal";
import PlanModal, {
  PlanFormData,
  PlanModalProductOption,
} from "@/components/plans/PlanModal";
import { deletePlanAction } from "@/app/actions/plans";
import { BillingPeriod, PaymentTerms } from "@prisma/client";
import { getPlanAvailabilityStatus } from "@/lib/validations/plan";

export interface DetailAssociatedProduct {
  id: string;
  name: string;
  type?: string | null;
  salesPricePaise: number;
  description?: string | null;
  variantsCount: number;
}

export interface PlanDetailData {
  id: string;
  productId: string;
  name: string;
  description?: string | null;
  pricePaise: number;
  billingPeriod: BillingPeriod;
  paymentTerms: PaymentTerms;
  minQuantity: number;
  availableFrom?: string | null;
  availableTo?: string | null;
  isActive: boolean;
  autoClose: boolean;
  isClosableEarly: boolean;
  isPausable: boolean;
  isRenewable: boolean;
  createdAt: string;
  updatedAt: string;
  product: DetailAssociatedProduct;
  subscriptionsCount: number;
  activeSubscriptionsCount: number;
  quotationTemplatesCount: number;
}

interface PlanDetailClientProps {
  plan: PlanDetailData;
  availableProducts: PlanModalProductOption[];
  isAdmin: boolean;
}

export function PlanDetailClient({
  plan,
  availableProducts,
  isAdmin,
}: PlanDetailClientProps) {
  const router = useRouter();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const availabilityStatus = getPlanAvailabilityStatus(plan);

  const totalReferences = plan.subscriptionsCount + plan.quotationTemplatesCount;
  const isDeletable = totalReferences === 0;

  const handleDeletePlan = async () => {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await deletePlanAction(plan.id);
      if (res.success) {
        setIsDeleteModalOpen(false);
        router.push("/plans");
        router.refresh();
      } else {
        setDeleteError(res.error || "Failed to delete plan.");
      }
    } catch {
      setDeleteError("An unexpected server error occurred.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const planFormData: PlanFormData = {
    id: plan.id,
    productId: plan.productId,
    name: plan.name,
    description: plan.description,
    pricePaise: plan.pricePaise,
    billingPeriod: plan.billingPeriod,
    paymentTerms: plan.paymentTerms,
    minQuantity: plan.minQuantity,
    availableFrom: plan.availableFrom,
    availableTo: plan.availableTo,
    isActive: plan.isActive,
    autoClose: plan.autoClose,
    isClosableEarly: plan.isClosableEarly,
    isPausable: plan.isPausable,
    isRenewable: plan.isRenewable,
  };

  let statusBadgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
  let statusDotStyle = "bg-emerald-500";
  if (availabilityStatus === "SCHEDULED") {
    statusBadgeStyle = "bg-blue-50 text-blue-700 border-blue-200";
    statusDotStyle = "bg-blue-500";
  } else if (availabilityStatus === "EXPIRED") {
    statusBadgeStyle = "bg-slate-100 text-slate-600 border-slate-200";
    statusDotStyle = "bg-slate-400";
  } else if (availabilityStatus === "ARCHIVED") {
    statusBadgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
    statusDotStyle = "bg-rose-500";
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title={plan.name}
        subtitle={`Tier code: ${plan.id} • Cadence: ${plan.billingPeriod.toLowerCase()}`}
        breadcrumbs={[
          { label: "Plans", href: "/plans" },
          { label: plan.name },
        ]}
        actions={
          isAdmin ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] text-slate-700 hover:bg-slate-50 font-semibold text-body-sm shadow-xs transition"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                <span>Edit Plan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setIsDeleteModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-semibold text-body-sm shadow-xs transition"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                <span>Delete</span>
              </button>
            </div>
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

      {/* Key Metric Highlights Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Base Price */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <span className="text-body-sm font-medium text-secondary">Base Rate</span>
          <div className="mt-2">
            <div className="text-headline-md font-bold text-on-surface font-mono">
              <MoneyText paise={plan.pricePaise} />
            </div>
            <span className="text-xs text-slate-500">
              per {plan.billingPeriod.toLowerCase()} cycle
            </span>
          </div>
        </div>

        {/* Metric 2: Billing Cadence & Terms */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <span className="text-body-sm font-medium text-secondary">Recurrence Cadence</span>
          <div className="mt-2">
            <div className="text-headline-md font-bold text-on-surface capitalize">
              {plan.billingPeriod.toLowerCase()}
            </div>
            <span className="text-xs text-slate-500">
              Terms: {plan.paymentTerms.replace("_", " ").toLowerCase()}
            </span>
          </div>
        </div>

        {/* Metric 3: Minimum Quantity */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <span className="text-body-sm font-medium text-secondary">Minimum Quantity</span>
          <div className="mt-2">
            <div className="text-headline-md font-bold text-on-surface font-mono">
              {plan.minQuantity} {plan.minQuantity === 1 ? "seat" : "seats"}
            </div>
            <span className="text-xs text-slate-500">enforced on contracts</span>
          </div>
        </div>

        {/* Metric 4: Availability Status */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <span className="text-body-sm font-medium text-secondary">Availability Status</span>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusBadgeStyle}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusDotStyle}`} />
              <span>{availabilityStatus}</span>
            </span>
          </div>
          <span className="text-xs text-slate-500 mt-1">
            {plan.availableTo
              ? `Until ${new Date(plan.availableTo).toLocaleDateString("en-IN")}`
              : "Ongoing / No expiration"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Associated Product & Description */}
        <div className="lg:col-span-2 space-y-6">
          {/* Associated Product Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  inventory_2
                </span>
                <h3 className="font-semibold text-on-surface text-body-md">
                  Associated Product Deliverable
                </h3>
              </div>
              <Link
                href={`/products/${plan.product.id}`}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>View Product</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-secondary block">Product Name</span>
                <span className="text-body-md font-semibold text-on-surface block mt-0.5">
                  {plan.product.name}
                </span>
              </div>
              <div>
                <span className="text-xs text-secondary block">Product Type</span>
                <span className="text-body-md font-semibold text-on-surface block mt-0.5">
                  {plan.product.type || "General"}
                </span>
              </div>
              <div>
                <span className="text-xs text-secondary block">Product Catalog Base Price</span>
                <span className="text-body-md font-semibold text-on-surface font-mono block mt-0.5">
                  <MoneyText paise={plan.product.salesPricePaise} />
                </span>
              </div>
              <div>
                <span className="text-xs text-secondary block">Configured Variants</span>
                <span className="text-body-md font-semibold text-on-surface block mt-0.5">
                  {plan.product.variantsCount} variant option(s) available
                </span>
              </div>
            </div>

            {plan.description && (
              <div className="pt-3 border-t border-slate-100">
                <span className="text-xs text-secondary block">Plan Description</span>
                <p className="text-body-sm text-slate-700 mt-1 whitespace-pre-line">
                  {plan.description}
                </p>
              </div>
            )}
          </div>

          {/* Lifecycle & Automation Rules */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <span className="material-symbols-outlined text-primary text-[20px]">
                tune
              </span>
              <h3 className="font-semibold text-on-surface text-body-md">
                Lifecycle & Behavior Rules
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pausable */}
              <div className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50 flex items-start gap-3">
                <span
                  className={`material-symbols-outlined text-[20px] mt-0.5 ${
                    plan.isPausable ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {plan.isPausable ? "check_circle" : "cancel"}
                </span>
                <div>
                  <h4 className="text-body-sm font-semibold text-on-surface">Pausable</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {plan.isPausable
                      ? "Subscriptions can be paused; pauses skip billing runs."
                      : "Pausing is disallowed for subscriptions on this tier."}
                  </p>
                </div>
              </div>

              {/* Renewable */}
              <div className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50 flex items-start gap-3">
                <span
                  className={`material-symbols-outlined text-[20px] mt-0.5 ${
                    plan.isRenewable ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {plan.isRenewable ? "check_circle" : "cancel"}
                </span>
                <div>
                  <h4 className="text-body-sm font-semibold text-on-surface">Renewable</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {plan.isRenewable
                      ? "Allows 1-click contract renewal & automated extensions."
                      : "Non-renewable contract tier upon term expiration."}
                  </p>
                </div>
              </div>

              {/* Closable early */}
              <div className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50 flex items-start gap-3">
                <span
                  className={`material-symbols-outlined text-[20px] mt-0.5 ${
                    plan.isClosableEarly ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {plan.isClosableEarly ? "check_circle" : "cancel"}
                </span>
                <div>
                  <h4 className="text-body-sm font-semibold text-on-surface">Closable Early</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {plan.isClosableEarly
                      ? "Finance admins & clients may terminate prior to term expiry."
                      : "Firm commitment tier; early termination blocked."}
                  </p>
                </div>
              </div>

              {/* Auto-close at end date */}
              <div className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50 flex items-start gap-3">
                <span
                  className={`material-symbols-outlined text-[20px] mt-0.5 ${
                    plan.autoClose ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {plan.autoClose ? "check_circle" : "cancel"}
                </span>
                <div>
                  <h4 className="text-body-sm font-semibold text-on-surface">Auto-close at End</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {plan.autoClose
                      ? "Automatically closes when end date arrives without renewal."
                      : "Remains pending manual action or active until explicitly closed."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Reference Statistics & Metadata */}
        <div className="space-y-6">
          {/* Reference Statistics Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <span className="material-symbols-outlined text-primary text-[20px]">
                bar_chart
              </span>
              <h3 className="font-semibold text-on-surface text-body-md">
                Contract Usage & Integrity
              </h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-body-sm text-secondary">Active Subscriptions</span>
                <span className="text-body-md font-bold text-on-surface font-mono">
                  {plan.activeSubscriptionsCount}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-body-sm text-secondary">Total Subscriptions</span>
                <span className="text-body-md font-bold text-on-surface font-mono">
                  {plan.subscriptionsCount}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-body-sm text-secondary">Quotation Templates</span>
                <span className="text-body-md font-bold text-on-surface font-mono">
                  {plan.quotationTemplatesCount}
                </span>
              </div>
            </div>

            <div className="pt-2 text-xs text-slate-500">
              {isDeletable ? (
                <span className="text-emerald-600 flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  No active references. Plan may be deleted cleanly.
                </span>
              ) : (
                <span className="text-amber-700 flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  Referenced by {totalReferences} contract(s)/template(s). Protected from deletion.
                </span>
              )}
            </div>
          </div>

          {/* Timestamps Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs p-6 space-y-3 text-xs text-secondary">
            <div className="flex justify-between">
              <span>Created:</span>
              <span className="font-medium text-on-surface">
                {new Date(plan.createdAt).toLocaleString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Last Modified:</span>
              <span className="font-medium text-on-surface">
                {new Date(plan.updatedAt).toLocaleString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            {plan.availableFrom && (
              <div className="flex justify-between">
                <span>Sales Start:</span>
                <span className="font-medium text-on-surface">
                  {new Date(plan.availableFrom).toLocaleDateString("en-IN")}
                </span>
              </div>
            )}
            {plan.availableTo && (
              <div className="flex justify-between">
                <span>Sales End:</span>
                <span className="font-medium text-on-surface">
                  {new Date(plan.availableTo).toLocaleDateString("en-IN")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isAdmin && (
        <PlanModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          initialData={planFormData}
          availableProducts={availableProducts}
          onSuccess={() => {
            setIsEditModalOpen(false);
            router.refresh();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {isAdmin && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Subscription Plan"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deleteLoading}
                className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition text-body-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePlan}
                disabled={deleteLoading || !isDeletable}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold text-body-sm hover:bg-rose-700 shadow-xs transition disabled:opacity-50"
              >
                {deleteLoading && (
                  <span className="material-symbols-outlined animate-spin text-[16px]">
                    progress_activity
                  </span>
                )}
                <span>Delete Plan</span>
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-body-sm text-rose-700 flex items-start gap-2">
                <span className="material-symbols-outlined text-rose-500 text-[18px] mt-0.5 shrink-0">
                  error
                </span>
                <span>{deleteError}</span>
              </div>
            )}

            {!isDeletable ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-body-sm text-amber-800 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">
                    warning
                  </span>
                  <span>Deletion Blocked</span>
                </div>
                <p className="text-xs">
                  This plan is referenced by {plan.subscriptionsCount} subscription(s) and{" "}
                  {plan.quotationTemplatesCount} quotation template(s). To maintain financial ledger and contract audit integrity, plans with active or historical references cannot be deleted.
                </p>
              </div>
            ) : (
              <p className="text-body-sm text-slate-600">
                Are you sure you want to delete the plan <strong>{plan.name}</strong>? This action cannot be undone.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PlanDetailClient;
