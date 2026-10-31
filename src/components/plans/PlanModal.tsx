"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import MoneyText from "@/components/ui/MoneyText";
import { BillingPeriod, PaymentTerms } from "@prisma/client";
import {
  PlanFormValues,
  BILLING_PERIODS,
  PAYMENT_TERMS_LIST,
} from "@/lib/validations/plan";
import { createPlanAction, updatePlanAction } from "@/app/actions/plans";

export interface PlanModalProductOption {
  id: string;
  name: string;
  type?: string | null;
  salesPricePaise: number;
}

export interface PlanFormData {
  id?: string;
  productId: string;
  name: string;
  description?: string | null;
  pricePaise: number;
  billingPeriod: BillingPeriod;
  paymentTerms: PaymentTerms;
  minQuantity: number;
  availableFrom?: string | null;
  availableTo?: string | null;
  isActive?: boolean;
  autoClose: boolean;
  isClosableEarly: boolean;
  isPausable: boolean;
  isRenewable: boolean;
}

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: PlanFormData | null;
  availableProducts: PlanModalProductOption[];
  onSuccess?: (planId?: string) => void;
}

export function PlanModal({
  isOpen,
  onClose,
  initialData,
  availableProducts,
  onSuccess,
}: PlanModalProps) {
  const isEdit = !!initialData?.id;

  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceRupees, setPriceRupees] = useState("0");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(BillingPeriod.YEARLY);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(PaymentTerms.DUE_ON_RECEIPT);
  const [minQuantity, setMinQuantity] = useState(1);
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  const [noExpiration, setNoExpiration] = useState(true);

  // Lifecycle & behavior toggles
  const [autoClose, setAutoClose] = useState(false);
  const [isClosableEarly, setIsClosableEarly] = useState(true);
  const [isPausable, setIsPausable] = useState(false);
  const [isRenewable, setIsRenewable] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setProductId(initialData.productId || "");
      setName(initialData.name || "");
      setDescription(initialData.description || "");
      setPriceRupees((initialData.pricePaise / 100).toString());
      setBillingPeriod(initialData.billingPeriod || BillingPeriod.YEARLY);
      setPaymentTerms(initialData.paymentTerms || PaymentTerms.DUE_ON_RECEIPT);
      setMinQuantity(initialData.minQuantity || 1);

      const fromStr = initialData.availableFrom
        ? new Date(initialData.availableFrom).toISOString().split("T")[0]
        : "";
      const toStr = initialData.availableTo
        ? new Date(initialData.availableTo).toISOString().split("T")[0]
        : "";

      setAvailableFrom(fromStr);
      setAvailableTo(toStr);
      setNoExpiration(!toStr);

      setAutoClose(initialData.autoClose ?? false);
      setIsClosableEarly(initialData.isClosableEarly ?? true);
      setIsPausable(initialData.isPausable ?? false);
      setIsRenewable(initialData.isRenewable ?? true);
    } else {
      const defaultProduct = availableProducts[0]?.id || "";
      setProductId(defaultProduct);
      setName("");
      setDescription("");
      setPriceRupees("0");
      setBillingPeriod(BillingPeriod.YEARLY);
      setPaymentTerms(PaymentTerms.DUE_ON_RECEIPT);
      setMinQuantity(1);
      setAvailableFrom("");
      setAvailableTo("");
      setNoExpiration(true);

      setAutoClose(false);
      setIsClosableEarly(true);
      setIsPausable(false);
      setIsRenewable(true);
    }
    setErrorMsg(null);
    setFieldErrors({});
  }, [initialData, isOpen, availableProducts]);

  // When a product is selected in create mode, optionally suggest its base price if price is 0
  const handleProductChange = (newProdId: string) => {
    setProductId(newProdId);
    if (!isEdit && (priceRupees === "0" || priceRupees === "")) {
      const prod = availableProducts.find((p) => p.id === newProdId);
      if (prod && prod.salesPricePaise > 0) {
        setPriceRupees((prod.salesPricePaise / 100).toString());
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setFieldErrors({});

    const parsedPricePaise = Math.round((parseFloat(priceRupees) || 0) * 100);

    const payload: PlanFormValues = {
      id: initialData?.id,
      productId,
      name: name.trim(),
      description: description.trim() || null,
      pricePaise: parsedPricePaise,
      billingPeriod,
      paymentTerms,
      minQuantity: Math.max(1, minQuantity),
      availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
      availableTo: noExpiration || !availableTo ? null : new Date(availableTo).toISOString(),
      isActive: true,
      autoClose,
      isClosableEarly,
      isPausable,
      isRenewable,
    };

    try {
      const res = isEdit && initialData?.id
        ? await updatePlanAction(initialData.id, payload)
        : await createPlanAction(payload);

      if (res.success) {
        onClose();
        if (onSuccess) {
          onSuccess(res.planId);
        }
      } else {
        setErrorMsg(res.error || "Failed to save subscription plan.");
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
      }
    } catch {
      setErrorMsg("An unexpected network or server error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = availableProducts.find((p) => p.id === productId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Subscription Plan" : "Create New Subscription Plan"}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition text-body-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-body-sm font-semibold hover:bg-primary-container shadow-xs transition disabled:opacity-50"
          >
            {loading && (
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
            )}
            <span>{isEdit ? "Save Changes" : "Create Plan"}</span>
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-body-sm text-rose-700 flex items-start gap-2">
            <span className="material-symbols-outlined text-rose-500 text-[18px] mt-0.5 shrink-0">
              error
            </span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* SECTION 1: Associated Product & Plan Basics */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <span className="material-symbols-outlined text-primary text-[20px]">
              layers
            </span>
            <h3 className="font-semibold text-on-surface text-body-md">
              Basic Plan Configuration
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Associated Product */}
            <div className="space-y-1 sm:col-span-2">
              <label
                htmlFor="plan-product-select"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Associated Product <span className="text-rose-500">*</span>
              </label>
              <select
                id="plan-product-select"
                value={productId}
                onChange={(e) => handleProductChange(e.target.value)}
                className={`w-full px-3 py-2 bg-white border rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition ${
                  fieldErrors.productId ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1]"
                }`}
              >
                {availableProducts.length === 0 ? (
                  <option value="">No products available (Create a product first)</option>
                ) : (
                  availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.type ? `(${p.type})` : ""} — Base: ₹{(p.salesPricePaise / 100).toLocaleString("en-IN")}
                    </option>
                  ))
                )}
              </select>
              {fieldErrors.productId && (
                <p className="text-xs text-rose-600">{fieldErrors.productId}</p>
              )}
            </div>

            {/* Plan Name */}
            <div className="space-y-1 sm:col-span-2">
              <label
                htmlFor="plan-name-input"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Plan Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="plan-name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Enterprise Annual, Growth Monthly"
                className={`w-full px-3 py-2 bg-white border rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition ${
                  fieldErrors.name ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1]"
                }`}
              />
              {fieldErrors.name && (
                <p className="text-xs text-rose-600">{fieldErrors.name}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1 sm:col-span-2">
              <label
                htmlFor="plan-desc-input"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Description / Contract Scope
              </label>
              <textarea
                id="plan-desc-input"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the tier terms, service SLA, or deployment model"
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition resize-none"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: Pricing & Cadence */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <span className="material-symbols-outlined text-primary text-[20px]">
              payments
            </span>
            <h3 className="font-semibold text-on-surface text-body-md">
              Pricing & Cadence
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Price (INR) */}
            <div className="space-y-1">
              <label
                htmlFor="plan-price-input"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Base Price (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-400 font-semibold select-none">
                  ₹
                </span>
                <input
                  id="plan-price-input"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={priceRupees}
                  onChange={(e) => setPriceRupees(e.target.value)}
                  className={`w-full pl-8 pr-3 py-2 bg-white border rounded-lg text-body-md text-on-surface font-mono font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition ${
                    fieldErrors.pricePaise ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1]"
                  }`}
                />
              </div>
              {fieldErrors.pricePaise && (
                <p className="text-xs text-rose-600">{fieldErrors.pricePaise}</p>
              )}
            </div>

            {/* Billing Period */}
            <div className="space-y-1">
              <label
                htmlFor="plan-period-select"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Billing Period <span className="text-rose-500">*</span>
              </label>
              <select
                id="plan-period-select"
                value={billingPeriod}
                onChange={(e) => setBillingPeriod(e.target.value as BillingPeriod)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
              >
                {BILLING_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {period.charAt(0) + period.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Minimum Quantity */}
            <div className="space-y-1">
              <label
                htmlFor="plan-min-qty-input"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Min Quantity <span className="text-rose-500">*</span>
              </label>
              <input
                id="plan-min-qty-input"
                type="number"
                min="1"
                step="1"
                required
                value={minQuantity}
                onChange={(e) => setMinQuantity(parseInt(e.target.value, 10) || 1)}
                className={`w-full px-3 py-2 bg-white border rounded-lg text-body-md text-on-surface font-mono text-center focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition ${
                  fieldErrors.minQuantity ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1]"
                }`}
              />
              {fieldErrors.minQuantity && (
                <p className="text-xs text-rose-600">{fieldErrors.minQuantity}</p>
              )}
            </div>
          </div>

          {/* Payment Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <label
                htmlFor="plan-terms-select"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Payment Terms <span className="text-rose-500">*</span>
              </label>
              <select
                id="plan-terms-select"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
              >
                <option value={PaymentTerms.DUE_ON_RECEIPT}>Due on Receipt</option>
                <option value={PaymentTerms.NET_15}>Net 15 Days</option>
                <option value={PaymentTerms.NET_30}>Net 30 Days</option>
              </select>
            </div>

            {selectedProduct && (
              <div className="flex items-center p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
                <span className="material-symbols-outlined text-primary text-[18px] mr-2">
                  info
                </span>
                <span>
                  Linked to <strong>{selectedProduct.name}</strong> (Base rate:{" "}
                  <MoneyText paise={selectedProduct.salesPricePaise} />)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Sales Availability Window */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                event
              </span>
              <h3 className="font-semibold text-on-surface text-body-md">
                Availability Window
              </h3>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noExpiration}
                onChange={(e) => {
                  setNoExpiration(e.target.checked);
                  if (e.target.checked) setAvailableTo("");
                }}
                className="rounded border-[#CBD5E1] text-primary focus:ring-primary"
              />
              <span>No expiration (Ongoing availability)</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="plan-from-date"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Available From
              </label>
              <input
                id="plan-from-date"
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
              />
              <span className="text-[11px] text-slate-500 block">
                Start date for new contract generation (optional)
              </span>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="plan-to-date"
                className="block text-body-sm font-semibold text-slate-700"
              >
                Available To
              </label>
              <input
                id="plan-to-date"
                type="date"
                disabled={noExpiration}
                value={availableTo}
                onChange={(e) => setAvailableTo(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition ${
                  noExpiration
                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-white border-[#CBD5E1]"
                } ${fieldErrors.availableTo ? "border-rose-400 bg-rose-50/20" : ""}`}
              />
              {fieldErrors.availableTo ? (
                <p className="text-xs text-rose-600">{fieldErrors.availableTo}</p>
              ) : (
                <span className="text-[11px] text-slate-500 block">
                  Ceases new subscription sales after this date
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 4: Lifecycle & Behavior Rules */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <span className="material-symbols-outlined text-primary text-[20px]">
              tune
            </span>
            <h3 className="font-semibold text-on-surface text-body-md">
              Lifecycle & Behavior Rules
            </h3>
          </div>

          <div className="divide-y divide-slate-200/70 space-y-3">
            {/* Auto-close at end date */}
            <div className="flex items-center justify-between pt-3 first:pt-0">
              <div className="pr-4">
                <label
                  htmlFor="toggle-auto-close"
                  className="font-medium text-body-sm text-on-surface cursor-pointer block"
                >
                  Auto-close at end date
                </label>
                <p className="text-xs text-slate-500">
                  Automatically move subscription to Closed when contract expires without renewal.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="toggle-auto-close"
                  type="checkbox"
                  checked={autoClose}
                  onChange={(e) => setAutoClose(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Closable early */}
            <div className="flex items-center justify-between pt-3">
              <div className="pr-4">
                <label
                  htmlFor="toggle-closable"
                  className="font-medium text-body-sm text-on-surface cursor-pointer block"
                >
                  Closable early
                </label>
                <p className="text-xs text-slate-500">
                  Allow finance staff or customer portal self-service early contract cancellation.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="toggle-closable"
                  type="checkbox"
                  checked={isClosableEarly}
                  onChange={(e) => setIsClosableEarly(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Pausable */}
            <div className="flex items-center justify-between pt-3">
              <div className="pr-4">
                <label
                  htmlFor="toggle-pausable"
                  className="font-medium text-body-sm text-on-surface cursor-pointer block"
                >
                  Pausable
                </label>
                <p className="text-xs text-slate-500">
                  Allow temporary pausing (skips billing schedule and extends or pauses charges).
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="toggle-pausable"
                  type="checkbox"
                  checked={isPausable}
                  onChange={(e) => setIsPausable(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Renewable */}
            <div className="flex items-center justify-between pt-3">
              <div className="pr-4">
                <label
                  htmlFor="toggle-renewable"
                  className="font-medium text-body-sm text-on-surface cursor-pointer block"
                >
                  Renewable
                </label>
                <p className="text-xs text-slate-500">
                  Allow automatic extension and contract renewal quotations upon period end.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="toggle-renewable"
                  type="checkbox"
                  checked={isRenewable}
                  onChange={(e) => setIsRenewable(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default PlanModal;
