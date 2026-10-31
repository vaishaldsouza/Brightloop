"use client";

import React, { useState } from "react";
import { DiscountType, DiscountScope } from "@prisma/client";
import {
  createDiscountAction,
  updateDiscountAction,
} from "@/app/actions/discounts";
import { formatCurrency } from "@/lib/utils";

export interface DiscountItem {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  scope: DiscountScope;
  value: number; // in bps or paise
  minQuantity: number;
  minPurchasePaise?: number | null;
  productId?: string | null;
  maxUses?: number | null;
  usedCount: number;
  startDate?: string | null; // ISO
  expiresAt?: string | null; // ISO
  isActive: boolean;
}

export interface ProductOption {
  id: string;
  name: string;
}

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  discountToEdit?: DiscountItem | null;
  products: ProductOption[];
}

export default function DiscountModal({
  isOpen,
  onClose,
  onSuccess,
  discountToEdit,
  products,
}: DiscountModalProps) {
  const isEditing = Boolean(discountToEdit);

  const [code, setCode] = useState(discountToEdit?.code || "");
  const [description, setDescription] = useState(discountToEdit?.description || "");
  const [discountType, setDiscountType] = useState<DiscountType>(
    discountToEdit?.discountType || DiscountType.PERCENTAGE
  );
  const [scope, setScope] = useState<DiscountScope>(
    discountToEdit?.scope || DiscountScope.SUBSCRIPTION
  );

  // If percentage: value is stored as basis points (e.g. 1000 = 10%)
  // If fixed: value is stored as paise (e.g. 500000 = 5000)
  const [valueInput, setValueInput] = useState<string>(
    discountToEdit
      ? discountToEdit.discountType === DiscountType.PERCENTAGE
        ? (discountToEdit.value / 100).toString()
        : (discountToEdit.value / 100).toString()
      : "10"
  );

  const [minQuantity, setMinQuantity] = useState(
    discountToEdit ? discountToEdit.minQuantity.toString() : "1"
  );
  const [minPurchaseRupees, setMinPurchaseRupees] = useState<string>(
    discountToEdit?.minPurchasePaise
      ? (discountToEdit.minPurchasePaise / 100).toString()
      : ""
  );
  const [productId, setProductId] = useState<string>(
    discountToEdit?.productId || (products[0]?.id || "")
  );
  const [maxUses, setMaxUses] = useState<string>(
    discountToEdit?.maxUses ? discountToEdit.maxUses.toString() : ""
  );
  const [startDate, setStartDate] = useState(
    discountToEdit?.startDate
      ? new Date(discountToEdit.startDate).toISOString().split("T")[0]
      : ""
  );
  const [expiresAt, setExpiresAt] = useState(
    discountToEdit?.expiresAt
      ? new Date(discountToEdit.expiresAt).toISOString().split("T")[0]
      : ""
  );
  const [isActive, setIsActive] = useState(
    discountToEdit ? discountToEdit.isActive : true
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numericValue = parseFloat(valueInput);
    if (isNaN(numericValue) || numericValue <= 0) {
      setError("Please enter a valid positive discount value.");
      return;
    }

    if (discountType === DiscountType.PERCENTAGE && (numericValue <= 0 || numericValue > 100)) {
      setError("Percentage discount must be between 1% and 100%.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        description: description.trim(),
        discountType,
        scope,
        value: numericValue,
        minQuantity: parseInt(minQuantity, 10) || 1,
        minPurchaseRupees: minPurchaseRupees ? parseFloat(minPurchaseRupees) : null,
        productId: scope === DiscountScope.LINE_ITEM ? productId : null,
        maxUses: maxUses ? parseInt(maxUses, 10) : null,
        startDate: startDate ? new Date(startDate) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive,
      };

      const res = isEditing && discountToEdit
        ? await updateDiscountAction(discountToEdit.id, payload)
        : await createDiscountAction(payload);

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || "Failed to save discount rule.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-all duration-200">
      <div className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant flex items-start justify-between bg-surface-container-lowest shrink-0">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">
              {isEditing ? `Edit Discount: ${discountToEdit?.code}` : "New Discount Rule"}
            </h2>
            <p className="font-body-sm text-body-sm text-secondary mt-0.5">
              Configure promotional coupons, volume rebates, or whole subscription discounts.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-secondary hover:text-on-surface hover:bg-surface-container-low p-1.5 rounded-lg transition-colors -mr-1"
            type="button"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 rounded-lg bg-error-container text-on-error-container text-body-sm flex items-start gap-2">
              <span className="material-symbols-outlined text-base shrink-0 mt-0.5">
                error
              </span>
              <span>{error}</span>
            </div>
          )}

          <form id="discount-modal-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Name & Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Discount Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Rebate 2026"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Discount Code / Slug
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ENT-10"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface uppercase font-mono focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                />
              </div>
            </div>

            {/* Type & Value */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Discount Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscountType(DiscountType.PERCENTAGE)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      discountType === DiscountType.PERCENTAGE
                        ? "border-2 border-primary-container bg-surface-container-low text-primary-container font-semibold"
                        : "border-outline-variant text-secondary hover:bg-surface-container-low"
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">percent</span>
                    <span>Percentage</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiscountType(DiscountType.FIXED)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      discountType === DiscountType.FIXED
                        ? "border-2 border-primary-container bg-surface-container-low text-primary-container font-semibold"
                        : "border-outline-variant text-secondary hover:bg-surface-container-low"
                    }`}
                  >
                    <span className="font-mono text-sm">₹</span>
                    <span>Fixed Amount</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Discount Value {discountType === DiscountType.PERCENTAGE ? "(%)" : "(₹)"}
                </label>
                <div className="relative flex rounded-lg">
                  <input
                    type="number"
                    step={discountType === DiscountType.PERCENTAGE ? "1" : "0.01"}
                    min="1"
                    max={discountType === DiscountType.PERCENTAGE ? "100" : undefined}
                    required
                    value={valueInput}
                    onChange={(e) => setValueInput(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none font-semibold"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-secondary font-medium">
                    {discountType === DiscountType.PERCENTAGE ? "%" : "INR"}
                  </div>
                </div>
              </div>
            </div>

            {/* Scope: Whole vs Line Item */}
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                Applies To
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScope(DiscountScope.SUBSCRIPTION)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    scope === DiscountScope.SUBSCRIPTION
                      ? "border-2 border-primary-container bg-surface-container-low"
                      : "border-outline-variant hover:bg-surface-container-low"
                  }`}
                >
                  <span className="block font-semibold text-sm text-on-surface">
                    Whole subscriptions
                  </span>
                  <span className="block text-xs text-secondary mt-0.5">
                    Deducts from aggregate invoice contract subtotal
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope(DiscountScope.LINE_ITEM)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    scope === DiscountScope.LINE_ITEM
                      ? "border-2 border-primary-container bg-surface-container-low"
                      : "border-outline-variant hover:bg-surface-container-low"
                  }`}
                >
                  <span className="block font-semibold text-sm text-on-surface">
                    Specific product line
                  </span>
                  <span className="block text-xs text-secondary mt-0.5">
                    Restricts discount exclusively to target module
                  </span>
                </button>
              </div>
            </div>

            {/* Target Product (if specific) */}
            {scope === DiscountScope.LINE_ITEM && (
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Target Product
                </label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none bg-surface-container-lowest"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Min Quantity & Min Purchase */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Minimum Quantity (Seats / Units)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Minimum Purchase Amount (₹ Optional)
                </label>
                <div className="relative flex rounded-lg">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-outline-variant bg-surface-container-low text-secondary text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 50000"
                    value={minPurchaseRupees}
                    onChange={(e) => setMinPurchaseRupees(e.target.value)}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-lg border border-outline-variant text-on-surface text-body-md font-body-md focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Validity Dates & Max Uses */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  End Date / Expiry
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                  Max Uses Limit (Optional)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited if empty"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                />
              </div>
            </div>

            {/* Active Toggle */}
            <div className="pt-2 flex items-center gap-3">
              <input
                id="is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-primary-container border-outline-variant rounded focus:ring-primary-container"
              />
              <label htmlFor="is-active" className="text-sm font-medium text-on-surface cursor-pointer">
                Discount rule is Active and eligible for automatic application
              </label>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-surface-container-lowest border border-outline-variant hover:bg-surface text-on-surface font-body-md text-body-md font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            form="discount-modal-form"
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-container hover:bg-primary text-on-primary font-body-md text-body-md font-medium rounded-lg shadow-sm transition-all disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined animate-spin text-base">
                  progress_activity
                </span>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">check</span>
                <span>{isEditing ? "Save Changes" : "Create Discount"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
