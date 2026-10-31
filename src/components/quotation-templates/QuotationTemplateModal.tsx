"use client";

import React, { useState, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import MoneyText from "@/components/ui/MoneyText";
import {
  createQuotationTemplateAction,
  updateQuotationTemplateAction,
} from "@/app/actions/quotationTemplates";
import { QuotationTemplateFormValues } from "@/lib/validations/quotationTemplate";

export interface ModalPlanOption {
  id: string;
  name: string;
  pricePaise: number;
  billingPeriod: string;
}

export interface ModalVariantOption {
  id: string;
  name: string;
  productName: string;
  defaultPricePaise: number;
}

export interface TemplateLineItemState {
  tempId: string;
  productVariantId: string;
  description: string;
  quantity: number;
  unitPriceRupees: string; // Rupees representation for the input
}

export interface QuotationTemplateFormData {
  id?: string;
  name: string;
  planId: string;
  description?: string | null;
  validityDays: number;
  isActive: boolean;
  lines: Array<{
    id?: string;
    productVariantId: string;
    description?: string | null;
    quantity: number;
    unitPricePaise: number;
    sortOrder?: number;
  }>;
}

interface QuotationTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (templateId?: string) => void;
  initialData?: QuotationTemplateFormData | null;
  availablePlans: ModalPlanOption[];
  availableVariants: ModalVariantOption[];
}

export default function QuotationTemplateModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  availablePlans,
  availableVariants,
}: QuotationTemplateModalProps) {
  const isEditing = Boolean(initialData?.id);

  // Form State
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<TemplateLineItemState[]>([]);

  // Feedback State
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createDefaultLine = useCallback((): TemplateLineItemState => {
    const defaultVariant = availableVariants[0];
    const defaultPriceRupees = defaultVariant
      ? (defaultVariant.defaultPricePaise / 100).toFixed(2)
      : "0.00";

    return {
      tempId: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productVariantId: defaultVariant?.id ?? "",
      description: "",
      quantity: 1,
      unitPriceRupees: defaultPriceRupees,
    };
  }, [availableVariants]);

  // Reset or initialize form whenever modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setFieldErrors({});

      if (initialData) {
        setName(initialData.name || "");
        setPlanId(initialData.planId || (availablePlans[0]?.id ?? ""));
        setValidityDays(initialData.validityDays ?? 30);
        setDescription(initialData.description || "");
        setIsActive(initialData.isActive ?? true);

        if (initialData.lines && initialData.lines.length > 0) {
          setLines(
            initialData.lines.map((l, idx) => ({
              tempId: `line-${idx}-${Date.now()}`,
              productVariantId: l.productVariantId,
              description: l.description || "",
              quantity: l.quantity,
              unitPriceRupees: (l.unitPricePaise / 100).toFixed(2),
            }))
          );
        } else {
          // Default initial single line
          setLines([createDefaultLine()]);
        }
      } else {
        setName("");
        setPlanId(availablePlans[0]?.id ?? "");
        setValidityDays(30);
        setDescription("");
        setIsActive(true);
        setLines([createDefaultLine()]);
      }
    }
  }, [isOpen, initialData, availablePlans, createDefaultLine]);

  function handleAddLine() {
    // Find first unused variant if available, otherwise just use default
    const usedVariantIds = new Set(lines.map((l) => l.productVariantId));
    const nextAvailableVariant =
      availableVariants.find((v) => !usedVariantIds.has(v.id)) ||
      availableVariants[0];

    const defaultPriceRupees = nextAvailableVariant
      ? (nextAvailableVariant.defaultPricePaise / 100).toFixed(2)
      : "0.00";

    setLines((prev) => [
      ...prev,
      {
        tempId: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productVariantId: nextAvailableVariant?.id ?? "",
        description: "",
        quantity: 1,
        unitPriceRupees: defaultPriceRupees,
      },
    ]);
  }

  function handleRemoveLine(tempId: string) {
    if (lines.length <= 1) {
      setFormError("A quotation template must have at least one line item.");
      return;
    }
    setLines((prev) => prev.filter((l) => l.tempId !== tempId));
  }

  function handleLineChange(
    tempId: string,
    field: keyof TemplateLineItemState,
    value: any
  ) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.tempId !== tempId) return line;

        const updated = { ...line, [field]: value };

        // When user changes productVariantId, auto-populate unitPriceRupees if desired
        if (field === "productVariantId") {
          const variant = availableVariants.find((v) => v.id === value);
          if (variant) {
            updated.unitPriceRupees = (variant.defaultPricePaise / 100).toFixed(2);
          }
        }

        return updated;
      })
    );
  }

  // Calculate estimated total contract value in Paise
  const totalEstimatedPaise = lines.reduce((acc, line) => {
    const qty = Number(line.quantity) || 0;
    const priceRupees = parseFloat(line.unitPriceRupees) || 0;
    const pricePaise = Math.round(priceRupees * 100);
    return acc + (qty > 0 && pricePaise >= 0 ? qty * pricePaise : 0);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    // Client-side quick check
    if (!name.trim()) {
      setFieldErrors({ name: "Template name is required" });
      return;
    }
    if (!planId) {
      setFieldErrors({ planId: "Associated plan is required" });
      return;
    }
    if (lines.length === 0) {
      setFormError("At least one product line is required.");
      return;
    }

    // Check for duplicate variants
    const variantIds = lines.map((l) => l.productVariantId).filter(Boolean);
    if (new Set(variantIds).size !== variantIds.length) {
      setFormError(
        "Duplicate product variants selected in line items. Please combine quantities or select distinct variants."
      );
      return;
    }

    // Convert lines into submission format
    const formattedLines = lines.map((line, idx) => {
      const qty = parseInt(String(line.quantity), 10);
      const parsedRupees = parseFloat(line.unitPriceRupees);
      const unitPricePaise = isNaN(parsedRupees)
        ? 0
        : Math.round(parsedRupees * 100);

      return {
        productVariantId: line.productVariantId,
        description: line.description.trim() || null,
        quantity: isNaN(qty) ? 1 : qty,
        unitPricePaise,
        sortOrder: idx + 1,
      };
    });

    const payload: QuotationTemplateFormValues = {
      name: name.trim(),
      planId,
      description: description.trim() || null,
      validityDays: parseInt(String(validityDays), 10) || 30,
      isActive,
      lines: formattedLines,
    };

    setIsSubmitting(true);

    try {
      if (isEditing && initialData?.id) {
        const res = await updateQuotationTemplateAction(initialData.id, payload);
        if (!res.success) {
          setFormError(res.error || "Failed to update quotation template");
          if (res.fieldErrors) setFieldErrors(res.fieldErrors);
          setIsSubmitting(false);
          return;
        }
        onSuccess(initialData.id);
      } else {
        const res = await createQuotationTemplateAction(payload);
        if (!res.success) {
          setFormError(res.error || "Failed to create quotation template");
          if (res.fieldErrors) setFieldErrors(res.fieldErrors);
          setIsSubmitting(false);
          return;
        }
        onSuccess(res.templateId);
      }

      onClose();
    } catch (err) {
      console.error(err);
      setFormError("A network or system error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Quotation Template" : "New Quotation Template"}
      description={
        isEditing
          ? "Update blueprint contract terms and pre-configured itemized product lines"
          : "Create a reusable quotation blueprint for rapid proposal assembly"
      }
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="p-3.5 bg-error-container/30 border border-error/20 rounded-lg text-error text-body-sm flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
              error
            </span>
            <span>{formError}</span>
          </div>
        )}

        {/* Section 1: Template Information */}
        <div className="bg-surface-container-low/40 p-4 rounded-xl border border-outline-variant/60 space-y-4">
          <h3 className="font-title-sm text-on-surface font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">
              feed
            </span>
            Template Specification
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Template Name */}
            <div>
              <label
                htmlFor="templateName"
                className="block font-label-md text-label-md text-on-surface mb-1"
              >
                Template Name <span className="text-error">*</span>
              </label>
              <input
                id="templateName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Enterprise Annual Standard Pack"
                required
                className={`w-full h-10 px-3 bg-surface-container-lowest border rounded-lg text-body-md text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary-container/20 ${
                  fieldErrors.name
                    ? "border-error focus:border-error"
                    : "border-outline-variant focus:border-primary-container"
                }`}
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-error">{fieldErrors.name}</p>
              )}
            </div>

            {/* Associated Plan */}
            <div>
              <label
                htmlFor="templatePlan"
                className="block font-label-md text-label-md text-on-surface mb-1"
              >
                Associated Plan <span className="text-error">*</span>
              </label>
              <select
                id="templatePlan"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                required
                className={`w-full h-10 px-3 bg-surface-container-lowest border rounded-lg text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20 ${
                  fieldErrors.planId
                    ? "border-error focus:border-error"
                    : "border-outline-variant focus:border-primary-container"
                }`}
              >
                {availablePlans.length === 0 ? (
                  <option value="" disabled>
                    No plans available
                  </option>
                ) : (
                  availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.billingPeriod})
                    </option>
                  ))
                )}
              </select>
              {fieldErrors.planId && (
                <p className="mt-1 text-xs text-error">{fieldErrors.planId}</p>
              )}
            </div>

            {/* Validity Days */}
            <div>
              <label
                htmlFor="validityDays"
                className="block font-label-md text-label-md text-on-surface mb-1"
              >
                Validity Period (Days) <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input
                  id="validityDays"
                  type="number"
                  min="1"
                  max="365"
                  value={validityDays}
                  onChange={(e) =>
                    setValidityDays(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  required
                  className={`w-full h-10 pl-3 pr-16 bg-surface-container-lowest border rounded-lg text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20 ${
                    fieldErrors.validityDays
                      ? "border-error focus:border-error"
                      : "border-outline-variant focus:border-primary-container"
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-body-sm text-secondary pointer-events-none">
                  days
                </span>
              </div>
              <p className="mt-1 text-xs text-secondary">
                Proposals created from this template will expire after this duration.
              </p>
              {fieldErrors.validityDays && (
                <p className="mt-1 text-xs text-error">
                  {fieldErrors.validityDays}
                </p>
              )}
            </div>

            {/* Active Toggle */}
            <div className="flex items-center pt-6">
              <label className="relative flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-outline-variant text-primary-container focus:ring-primary-container cursor-pointer"
                />
                <div>
                  <span className="font-label-md text-on-surface block">
                    Template Active
                  </span>
                  <span className="text-xs text-secondary">
                    Active templates appear in new quotation selectors
                  </span>
                </div>
              </label>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label
                htmlFor="description"
                className="block font-label-md text-label-md text-on-surface mb-1"
              >
                Description / Contract Notes (Optional)
              </label>
              <textarea
                id="description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Internal notes or default terms included in quotation drafts..."
                className="w-full p-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Pre-configured Product Lines */}
        <div className="bg-surface-container-low/40 p-4 rounded-xl border border-outline-variant/60 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/50 pb-3">
            <div>
              <h3 className="font-title-sm text-on-surface font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  inventory_2
                </span>
                Pre-configured Product Lines
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Individual products, seat licenses, or recurring items added to quotes
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddLine}
              className="px-3 py-1.5 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface rounded-lg text-label-md font-medium flex items-center gap-1.5 transition-colors shadow-sm self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add Line</span>
            </button>
          </div>

          {/* Line items table */}
          <div className="overflow-x-auto border border-outline-variant/60 rounded-lg bg-surface-container-lowest">
            <table className="w-full text-left border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-secondary font-label-sm uppercase">
                  <th className="py-2.5 px-3">Product / Variant</th>
                  <th className="py-2.5 px-3 w-28">Quantity</th>
                  <th className="py-2.5 px-3 w-40 text-right">Unit Price (₹)</th>
                  <th className="py-2.5 px-3 w-36 text-right">Estimated Line Total</th>
                  <th className="py-2.5 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {lines.map((line, index) => {
                  const qty = Number(line.quantity) || 0;
                  const priceRupees = parseFloat(line.unitPriceRupees) || 0;
                  const lineTotalPaise = Math.round(qty * priceRupees * 100);

                  return (
                    <tr
                      key={line.tempId}
                      className="hover:bg-surface-container-low/40 transition-colors"
                    >
                      {/* Product Variant Select */}
                      <td className="py-2.5 px-3">
                        <select
                          value={line.productVariantId}
                          onChange={(e) =>
                            handleLineChange(
                              line.tempId,
                              "productVariantId",
                              e.target.value
                            )
                          }
                          className="w-full h-9 px-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm text-on-surface focus:outline-none focus:border-primary-container"
                        >
                          {availableVariants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.productName} — {v.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) =>
                            handleLineChange(
                              line.tempId,
                              "description",
                              e.target.value
                            )
                          }
                          placeholder="Optional line notes..."
                          className="w-full mt-1.5 h-7 px-2 bg-surface-container-lowest border border-outline-variant/60 rounded text-xs text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary-container"
                        />
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineChange(
                              line.tempId,
                              "quantity",
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            )
                          }
                          className="w-full h-9 px-2.5 text-center bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm text-on-surface focus:outline-none focus:border-primary-container"
                        />
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary text-xs pointer-events-none">
                            ₹
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unitPriceRupees}
                            onChange={(e) =>
                              handleLineChange(
                                line.tempId,
                                "unitPriceRupees",
                                e.target.value
                              )
                            }
                            className="w-full h-9 pl-6 pr-2.5 text-right bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm text-on-surface focus:outline-none focus:border-primary-container"
                          />
                        </div>
                      </td>

                      {/* Estimated Line Total */}
                      <td className="py-2.5 px-3 text-right font-medium text-on-surface">
                        <MoneyText amountPaise={lineTotalPaise} />
                      </td>

                      {/* Delete Action */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.tempId)}
                          disabled={lines.length <= 1}
                          className="p-1 text-secondary hover:text-error hover:bg-error-container/20 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title="Remove line item"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            delete
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Subtotal preview panel */}
          <div className="flex justify-end pt-2">
            <div className="w-full sm:w-72 bg-surface-container-lowest rounded-lg border border-outline-variant/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-body-sm text-secondary">
                <span>Configured Lines</span>
                <span className="font-semibold text-on-surface">
                  {lines.length} {lines.length === 1 ? "line" : "lines"}
                </span>
              </div>
              <div className="h-px bg-outline-variant/40" />
              <div className="flex items-center justify-between">
                <span className="font-title-sm text-on-surface">
                  Total Estimated Value
                </span>
                <MoneyText
                  amountPaise={totalEstimatedPaise}
                  className="font-headline-md font-bold text-primary-container"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container-low rounded-lg text-label-md font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-primary-container text-on-primary hover:bg-primary font-medium rounded-lg text-label-md shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">
                  progress_activity
                </span>
                <span>Saving Template...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  check
                </span>
                <span>{isEditing ? "Save Changes" : "Create Template"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
