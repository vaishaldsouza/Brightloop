"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import MoneyText from "@/components/ui/MoneyText";
import {
  createProductAction,
  updateProductAction,
} from "@/app/actions/products";
import { ProductFormValues } from "@/lib/validations/product";

export interface VariantFormData {
  id?: string;
  attributeName: string;
  attributeValue: string;
  priceExtraPaise: number;
}

export interface ProductFormData {
  id?: string;
  name: string;
  type: string;
  description?: string | null;
  notes?: string | null;
  salesPricePaise: number;
  costPricePaise?: number | null;
  variants: VariantFormData[];
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: ProductFormData | null;
  onSuccess?: (productId?: string) => void;
}

const COMMON_PRODUCT_TYPES = [
  "Software",
  "Service",
  "Digital License",
  "Recurring Service",
  "Add-on Module",
  "Hardware",
  "Consumable",
];

export function ProductModal({
  isOpen,
  onClose,
  initialData,
  onSuccess,
}: ProductModalProps) {
  const isEdit = !!initialData?.id;

  const [name, setName] = useState("");
  const [type, setType] = useState("Software");
  const [customType, setCustomType] = useState("");
  const [notes, setNotes] = useState("");
  const [salesPriceRupees, setSalesPriceRupees] = useState("0");
  const [costPriceRupees, setCostPriceRupees] = useState("");

  interface LocalVariant {
    id?: string;
    attributeName: string;
    attributeValue: string;
    priceExtraRupees: string;
  }

  const [variants, setVariants] = useState<LocalVariant[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      if (COMMON_PRODUCT_TYPES.includes(initialData.type)) {
        setType(initialData.type);
        setCustomType("");
      } else {
        setType("Other");
        setCustomType(initialData.type || "");
      }
      setNotes(initialData.notes || initialData.description || "");
      setSalesPriceRupees((initialData.salesPricePaise / 100).toString());
      setCostPriceRupees(
        initialData.costPricePaise != null
          ? (initialData.costPricePaise / 100).toString()
          : ""
      );
      setVariants(
        initialData.variants.map((v) => ({
          id: v.id,
          attributeName: v.attributeName,
          attributeValue: v.attributeValue,
          priceExtraRupees: (v.priceExtraPaise / 100).toString(),
        }))
      );
    } else {
      setName("");
      setType("Software");
      setCustomType("");
      setNotes("");
      setSalesPriceRupees("0");
      setCostPriceRupees("");
      setVariants([]);
    }
    setErrorMsg(null);
    setFieldErrors({});
  }, [initialData, isOpen]);

  const handleAddVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        attributeName: "Brand",
        attributeValue: "",
        priceExtraRupees: "0",
      },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVariantChange = (
    index: number,
    field: keyof LocalVariant,
    value: string
  ) => {
    setVariants((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const parsedBasePaise = Math.max(
    0,
    Math.round((parseFloat(salesPriceRupees) || 0) * 100)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setFieldErrors({});

    const selectedType = type === "Other" ? customType.trim() : type;

    const parsedSalesPricePaise = Math.round(
      (parseFloat(salesPriceRupees) || 0) * 100
    );
    const parsedCostPricePaise =
      costPriceRupees.trim() !== ""
        ? Math.round((parseFloat(costPriceRupees) || 0) * 100)
        : null;

    const formattedVariants = variants.map((v) => ({
      id: v.id,
      attributeName: v.attributeName.trim(),
      attributeValue: v.attributeValue.trim(),
      name: `${v.attributeName.trim()}: ${v.attributeValue.trim()}`,
      priceExtraPaise: Math.max(
        0,
        Math.round((parseFloat(v.priceExtraRupees) || 0) * 100)
      ),
    }));

    const payload: ProductFormValues = {
      id: initialData?.id,
      name: name.trim(),
      type: selectedType,
      description: notes.trim() || null,
      notes: notes.trim() || null,
      salesPricePaise: parsedSalesPricePaise,
      costPricePaise: parsedCostPricePaise,
      variants: formattedVariants,
    };

    try {
      const res =
        isEdit && initialData?.id
          ? await updateProductAction(initialData.id, payload)
          : await createProductAction(payload);

      if (res.success) {
        onClose();
        if (onSuccess) {
          onSuccess(res.productId);
        }
      } else {
        setErrorMsg(res.error || "Operation failed.");
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
      }
    } catch {
      setErrorMsg("An unexpected system error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Product & Variants" : "Add New Product"}
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-body-md font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="product-modal-form"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-body-md font-semibold hover:bg-primary-container transition disabled:opacity-50 shadow-xs"
          >
            {loading && (
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
            )}
            <span>{isEdit ? "Save Product" : "Create Product"}</span>
          </button>
        </div>
      }
    >
      <form id="product-modal-form" onSubmit={handleSubmit} className="space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-body-sm flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[20px] text-rose-600 mt-0.5 shrink-0">
              error
            </span>
            <div>{errorMsg}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Basic Info & Variants */}
          <div className="lg:col-span-7 space-y-5">
            {/* Card: Basic Information */}
            <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  inventory_2
                </span>
                <h3 className="font-semibold text-body-md text-on-surface">
                  Basic Information
                </h3>
              </div>

              {/* Product Name */}
              <div className="space-y-1">
                <label className="block text-body-sm font-semibold text-slate-700">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cloud Core Platform"
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 outline-none transition ${
                    fieldErrors.name
                      ? "border-rose-400 bg-rose-50/20"
                      : "border-[#CBD5E1] focus:border-primary"
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-rose-600">{fieldErrors.name}</p>
                )}
              </div>

              {/* Product Type */}
              <div className="space-y-1">
                <label className="block text-body-sm font-semibold text-slate-700">
                  Product Type <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                  >
                    {COMMON_PRODUCT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="Other">Other (Custom Type)</option>
                  </select>

                  {type === "Other" && (
                    <input
                      type="text"
                      required
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      placeholder="Specify product type"
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                    />
                  )}
                </div>
                {fieldErrors.type && (
                  <p className="text-xs text-rose-600">{fieldErrors.type}</p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="block text-body-sm font-semibold text-slate-700">
                  Internal Notes & Deliverable Description
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Enterprise high-concurrency cloud platform with dedicated SLA"
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition resize-none"
                />
              </div>
            </div>

            {/* Card: Variants Configuration */}
            <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    tune
                  </span>
                  <div>
                    <h3 className="font-semibold text-body-md text-on-surface">
                      Product Variants ({variants.length})
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-slate-100 text-primary font-semibold text-xs rounded-lg border border-primary/30 transition shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Add Variant</span>
                </button>
              </div>

              {variants.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-[#CBD5E1] rounded-lg bg-white text-slate-400 text-body-sm">
                  <span className="material-symbols-outlined text-2xl text-slate-300 block mb-1">
                    tune
                  </span>
                  <span>No variants defined. Click &apos;Add Variant&apos; to configure attribute add-ons (e.g. Brand: Odoo, Storage: 500GB).</span>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                  {variants.map((v, idx) => {
                    const extraPaise = Math.max(
                      0,
                      Math.round((parseFloat(v.priceExtraRupees) || 0) * 100)
                    );
                    const finalPaise = parsedBasePaise + extraPaise;

                    return (
                      <div
                        key={idx}
                        className="bg-white p-3 rounded-lg border border-[#CBD5E1] shadow-xs space-y-2"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          {/* Attribute Name */}
                          <div className="sm:col-span-4">
                            <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                              Attribute
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Brand, Tier"
                              value={v.attributeName}
                              onChange={(e) =>
                                handleVariantChange(
                                  idx,
                                  "attributeName",
                                  e.target.value
                                )
                              }
                              className="w-full px-2 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-body-sm text-on-surface focus:bg-white focus:border-primary outline-none"
                            />
                          </div>

                          {/* Attribute Value */}
                          <div className="sm:col-span-4">
                            <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                              Value
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Odoo, 500GB"
                              value={v.attributeValue}
                              onChange={(e) =>
                                handleVariantChange(
                                  idx,
                                  "attributeValue",
                                  e.target.value
                                )
                              }
                              className="w-full px-2 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-body-sm text-on-surface focus:bg-white focus:border-primary outline-none"
                            />
                          </div>

                          {/* Price Extra */}
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                              Price Extra (₹)
                            </label>
                            <div className="relative flex items-center">
                              <span className="absolute left-2 text-xs text-slate-400 font-bold">
                                +₹
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={v.priceExtraRupees}
                                onChange={(e) =>
                                  handleVariantChange(
                                    idx,
                                    "priceExtraRupees",
                                    e.target.value
                                  )
                                }
                                className="w-full pl-7 pr-2 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-body-sm font-currency-table text-on-surface focus:bg-white focus:border-primary outline-none text-right"
                              />
                            </div>
                          </div>

                          {/* Delete */}
                          <div className="sm:col-span-1 flex justify-end pt-3 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                              title="Remove variant"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                delete
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Calculated Final Price Hint */}
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                          <span>
                            Formula: Base (<MoneyText amountPaise={parsedBasePaise} />) + Extra (<MoneyText amountPaise={extraPaise} />)
                          </span>
                          <span className="font-semibold text-primary">
                            Final: <MoneyText amountPaise={finalPaise} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Pricing & Live Calculation Preview */}
          <div className="lg:col-span-5 space-y-5">
            {/* Pricing Card */}
            <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    payments
                  </span>
                  <h3 className="font-semibold text-body-md text-on-surface">
                    Base Pricing
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white border border-[#CBD5E1] text-secondary">
                  INR (₹)
                </span>
              </div>

              {/* Sales Price */}
              <div className="space-y-1">
                <label className="block text-body-sm font-semibold text-slate-700">
                  Sales Price (Base Rate) <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 font-semibold text-slate-500 text-body-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={salesPriceRupees}
                    onChange={(e) => setSalesPriceRupees(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md font-currency-table font-semibold text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition text-right"
                  />
                </div>
                {fieldErrors.salesPricePaise && (
                  <p className="text-xs text-rose-600">
                    {fieldErrors.salesPricePaise}
                  </p>
                )}
              </div>

              {/* Cost Price */}
              <div className="space-y-1">
                <label className="block text-body-sm font-semibold text-slate-700">
                  Cost Price (COGS, Optional)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 font-semibold text-slate-400 text-body-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={costPriceRupees}
                    onChange={(e) => setCostPriceRupees(e.target.value)}
                    placeholder="Optional cost rate"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-body-md font-currency-table text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition text-right"
                  />
                </div>
                {fieldErrors.costPricePaise && (
                  <p className="text-xs text-rose-600">
                    {fieldErrors.costPricePaise}
                  </p>
                )}
              </div>
            </div>

            {/* Interactive Final Price Preview Card */}
            <div className="bg-white border-2 border-primary/30 rounded-xl p-5 shadow-xs space-y-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
              <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                <div className="flex items-center gap-1.5 font-semibold text-body-sm text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    calculate
                  </span>
                  <span>Formula Summary</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                  PRD §4.2 Compliant
                </span>
              </div>

              <div className="space-y-2 text-body-sm">
                <div className="flex items-center justify-between text-secondary">
                  <span>Base Sales Price</span>
                  <MoneyText
                    amountPaise={parsedBasePaise}
                    className="font-semibold text-on-surface"
                  />
                </div>

                {variants.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Variant Price Breakdown
                    </span>
                    {variants.map((v, i) => {
                      const vExtra = Math.max(
                        0,
                        Math.round((parseFloat(v.priceExtraRupees) || 0) * 100)
                      );
                      const vFinal = parsedBasePaise + vExtra;

                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-50"
                        >
                          <span className="truncate max-w-[140px] font-medium text-slate-700">
                            {v.attributeValue || `Variant #${i + 1}`}
                          </span>
                          <span className="font-currency-table font-semibold text-emerald-700">
                            +<MoneyText amountPaise={vExtra} /> →{" "}
                            <span className="text-primary font-bold">
                              <MoneyText amountPaise={vFinal} />
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
                  <span className="text-body-sm font-semibold text-primary">
                    Starting Catalog Price:
                  </span>
                  <MoneyText
                    amountPaise={parsedBasePaise}
                    className="font-currency-metric text-headline-md font-bold text-primary"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default ProductModal;
