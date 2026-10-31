"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MoneyText from "@/components/ui/MoneyText";
import { PaymentTerms } from "@prisma/client";
import { createSubscriptionFromTemplateAction } from "@/app/actions/subscriptions";
import { calculateOrderTax, calculateLineTax } from "@/lib/tax";
import { isIntraState } from "@/lib/gstStates";

export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  validityDays: number;
  planId: string;
  plan: {
    id: string;
    name: string;
    billingPeriod: string;
    pricePaise: number;
    paymentTerms: PaymentTerms;
  };
  lines: Array<{
    id: string;
    productVariantId: string;
    description: string | null;
    quantity: number;
    unitPricePaise: number;
    sortOrder: number;
    productVariant: {
      id: string;
      name: string;
      product: {
        id: string;
        name: string;
      };
    };
  }>;
}

export interface CustomerOption {
  id: string;
  companyName: string;
  gstin: string | null;
  gstState: string | null;
  gstStateCode: string | null;
  billingAddress: string | null;
}

export interface ProductVariantOption {
  id: string;
  name: string;
  productName: string;
  defaultPricePaise: number;
}

interface NewSubscriptionFromTemplateClientProps {
  templates: TemplateOption[];
  customers: CustomerOption[];
  variants: ProductVariantOption[];
}

interface EditableLineState {
  tempId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  description: string;
  quantity: number;
  unitPriceRupees: string;
}

export default function NewSubscriptionFromTemplateClient({
  templates,
  customers,
  variants,
}: NewSubscriptionFromTemplateClientProps) {
  const router = useRouter();

  // Wizard State
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || ""
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id || ""
  );
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(
    templates[0]?.plan.paymentTerms || PaymentTerms.NET_30
  );
  const [notes, setNotes] = useState<string>("");

  // Line items state
  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || templates[0];
  }, [templates, selectedTemplateId]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || customers[0];
  }, [customers, selectedCustomerId]);

  const [lines, setLines] = useState<EditableLineState[]>(() => {
    if (!templates[0]) return [];
    return templates[0].lines.map((l, idx) => ({
      tempId: `line-${idx}-${Date.now()}`,
      productVariantId: l.productVariantId,
      productName: l.productVariant.product.name,
      variantName: l.productVariant.name,
      description: l.description || "",
      quantity: l.quantity,
      unitPriceRupees: (l.unitPricePaise / 100).toFixed(2),
    }));
  });

  // When user picks another template, re-initialize lines and payment terms
  function handleSelectTemplate(tplId: string) {
    setSelectedTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      setPaymentTerms(tpl.plan.paymentTerms);
      setLines(
        tpl.lines.map((l, idx) => ({
          tempId: `line-${idx}-${Date.now()}`,
          productVariantId: l.productVariantId,
          productName: l.productVariant.product.name,
          variantName: l.productVariant.name,
          description: l.description || "",
          quantity: l.quantity,
          unitPriceRupees: (l.unitPricePaise / 100).toFixed(2),
        }))
      );
    }
  }

  // Line management
  function handleAddLine() {
    const defaultVar = variants[0];
    setLines((prev) => [
      ...prev,
      {
        tempId: `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productVariantId: defaultVar?.id || "",
        productName: defaultVar?.productName || "Product",
        variantName: defaultVar?.name || "Standard",
        description: "",
        quantity: 1,
        unitPriceRupees: defaultVar
          ? (defaultVar.defaultPricePaise / 100).toFixed(2)
          : "0.00",
      },
    ]);
  }

  function handleRemoveLine(tempId: string) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.tempId !== tempId));
  }

  function handleLineChange(
    tempId: string,
    field: keyof EditableLineState,
    val: any
  ) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.tempId !== tempId) return l;
        const updated = { ...l, [field]: val };
        if (field === "productVariantId") {
          const found = variants.find((v) => v.id === val);
          if (found) {
            updated.productName = found.productName;
            updated.variantName = found.name;
            updated.unitPriceRupees = (found.defaultPricePaise / 100).toFixed(2);
          }
        }
        return updated;
      })
    );
  }

  // Real-time tax & total calculation
  const taxCalculation = useMemo(() => {
    const rawLines = lines.map((l) => {
      const rupees = parseFloat(l.unitPriceRupees) || 0;
      return {
        quantity: Math.max(1, Number(l.quantity) || 1),
        unitPricePaise: Math.round(rupees * 100),
      };
    });
    return calculateOrderTax(rawLines, selectedCustomer?.gstStateCode);
  }, [lines, selectedCustomer?.gstStateCode]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!selectedTemplateId) {
      setFormError("Please select a quotation template");
      return;
    }
    if (!selectedCustomerId) {
      setFormError("Please select a customer");
      return;
    }
    if (lines.length === 0) {
      setFormError("At least one order line is required");
      return;
    }

    setIsSubmitting(true);

    const formattedLines = lines.map((l, idx) => {
      const qty = parseInt(String(l.quantity), 10);
      const parsedRupees = parseFloat(l.unitPriceRupees);
      const unitPricePaise = isNaN(parsedRupees)
        ? 0
        : Math.round(parsedRupees * 100);

      return {
        productVariantId: l.productVariantId,
        description: l.description.trim() || null,
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        unitPricePaise,
        sortOrder: idx + 1,
      };
    });

    try {
      const res = await createSubscriptionFromTemplateAction({
        templateId: selectedTemplateId,
        customerId: selectedCustomerId,
        startDate,
        paymentTerms,
        notes: notes.trim() || null,
        lines: formattedLines,
      });

      if (!res.success) {
        setFormError(res.error || "Failed to create subscription draft");
        setIsSubmitting(false);
        return;
      }

      // Redirect to subscription detail page upon creation
      router.push(`/subscriptions/${res.subscriptionId}`);
    } catch (err) {
      console.error(err);
      setFormError("A network error occurred while creating the subscription.");
      setIsSubmitting(false);
    }
  }

  const isIntra = isIntraState(selectedCustomer?.gstStateCode);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <PageHeader
        title="New Subscription from Template"
        subtitle="Create and configure a recurring contract using a pre-approved quotation template"
        breadcrumbs={[
          { label: "Subscriptions", href: "/subscriptions" },
          { label: "New from Template" },
        ]}
      />

      {formError && (
        <div className="p-4 bg-error-container/40 border border-error/30 rounded-xl text-error text-body-sm flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
            error
          </span>
          <span>{formError}</span>
        </div>
      )}

      {/* Stepper Indicator */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/80 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-container-low/70 border border-primary-container/30">
            <div className="h-8 w-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0 font-bold text-sm">
              1
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                Step 1
              </span>
              <span className="font-title-sm text-on-surface font-semibold">
                Quotation Template
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-container-low/70 border border-primary-container/30">
            <div className="h-8 w-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0 font-bold text-sm">
              2
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                Step 2
              </span>
              <span className="font-title-sm text-on-surface font-semibold">
                Customer & Terms
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-container-low/70 border border-primary-container/30">
            <div className="h-8 w-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0 font-bold text-sm">
              3
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                Step 3
              </span>
              <span className="font-title-sm text-on-surface font-semibold">
                Review & Edit Lines
              </span>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveDraft} className="space-y-6">
        {/* STEP 1: CHOOSE QUOTATION TEMPLATE */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40">
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-md bg-primary-fixed flex items-center justify-center text-primary text-xs font-bold">
                1
              </span>
              <h2 className="font-headline-md text-on-surface font-bold">
                Choose Quotation Template
              </h2>
            </div>
            <span className="text-xs text-secondary font-medium">
              {templates.length} active blueprints available
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <label
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl.id)}
                  className={`relative flex flex-col p-4 rounded-xl cursor-pointer shadow-sm transition-all border-2 ${
                    isSelected
                      ? "border-primary-container bg-surface-container-low/40"
                      : "border-outline-variant/80 bg-surface-container-lowest hover:border-primary-container/60 hover:bg-surface-container-low/20"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-container/10 text-primary border border-primary-container/20">
                      Validity: {tpl.validityDays} days
                    </span>
                    <input
                      type="radio"
                      name="quotation_template"
                      checked={isSelected}
                      onChange={() => handleSelectTemplate(tpl.id)}
                      className="h-4 w-4 text-primary-container focus:ring-primary-container border-outline-variant"
                    />
                  </div>
                  <h3 className="font-title-sm text-on-surface font-semibold mt-3">
                    {tpl.name}
                  </h3>
                  {tpl.description && (
                    <p className="text-xs text-secondary mt-1 line-clamp-2">
                      {tpl.description}
                    </p>
                  )}
                  <div className="mt-4 pt-3 border-t border-outline-variant/40 flex items-baseline justify-between">
                    <span className="text-xs text-secondary">Base Plan</span>
                    <span className="text-xs font-semibold text-on-surface">
                      {tpl.plan.name} ({tpl.plan.billingPeriod})
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* STEP 2: CUSTOMER & CONTRACT TERMS */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/80 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40">
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-md bg-primary-container flex items-center justify-center text-on-primary text-xs font-bold">
                2
              </span>
              <h2 className="font-headline-md text-on-surface font-bold">
                Customer & Contract Terms
              </h2>
            </div>
            <span className="text-xs text-primary font-medium">
              Tax regime automatically resolves from customer state
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Customer Dropdown */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-body-sm font-semibold text-on-surface">
                Customer Entity <span className="text-error">*</span>
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-body-sm text-on-surface"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} {c.gstin ? `(GSTIN: ${c.gstin})` : "(Unregistered)"}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span
                  className={`px-2 py-0.5 rounded font-semibold border ${
                    isIntra
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {isIntra ? "Intra-State GST (CGST 9% + SGST 9%)" : "Inter-State GST (IGST 18%)"}
                </span>
                <span className="text-secondary">
                  State: {selectedCustomer?.gstState || "Maharashtra"} (Code: {selectedCustomer?.gstStateCode || "27"})
                </span>
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="block text-body-sm font-semibold text-on-surface">
                Contract Start Date <span className="text-error">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-body-sm text-on-surface"
              />
            </div>

            {/* Payment Terms */}
            <div className="space-y-1.5">
              <label className="block text-body-sm font-semibold text-on-surface">
                Payment Terms <span className="text-error">*</span>
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-body-sm text-on-surface"
              >
                <option value={PaymentTerms.NET_30}>Net 30 (Payment due within 30 days)</option>
                <option value={PaymentTerms.NET_15}>Net 15 (Payment due within 15 days)</option>
                <option value={PaymentTerms.DUE_ON_RECEIPT}>Due on Receipt (Immediate settlement)</option>
              </select>
            </div>

            {/* Internal Notes */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-body-sm font-semibold text-on-surface">
                Internal Agreement Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special terms, client purchase order reference, or custom dunning instructions..."
                className="w-full p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-body-sm text-on-surface resize-none"
              />
            </div>
          </div>
        </section>

        {/* STEP 3: REVIEW PRE-FILLED ORDER LINES (EDITABLE) */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40">
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-md bg-secondary-container flex items-center justify-center text-on-secondary-container text-xs font-bold">
                3
              </span>
              <h2 className="font-headline-md text-on-surface font-bold">
                Review Pre-filled Order Lines (Editable)
              </h2>
            </div>
            <button
              type="button"
              onClick={handleAddLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                add_circle
              </span>
              <span>Add Custom Line</span>
            </button>
          </div>

          {/* Lines Table */}
          <div className="overflow-x-auto rounded-lg border border-outline-variant/60">
            <table className="w-full text-left border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-secondary uppercase font-label-sm">
                  <th className="py-2.5 px-3">Product / Variant</th>
                  <th className="py-2.5 px-3 w-24 text-center">Qty</th>
                  <th className="py-2.5 px-3 w-36 text-right">Unit Price (₹)</th>
                  <th className="py-2.5 px-3 w-28 text-center">Taxes</th>
                  <th className="py-2.5 px-3 w-36 text-right">Line Total (₹)</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {lines.map((line) => {
                  const qty = Number(line.quantity) || 1;
                  const priceRupees = parseFloat(line.unitPriceRupees) || 0;
                  const lineSubtotalPaise = Math.round(qty * priceRupees * 100);
                  const lineTaxRes = calculateLineTax(
                    qty,
                    Math.round(priceRupees * 100),
                    selectedCustomer?.gstStateCode
                  );

                  return (
                    <tr
                      key={line.tempId}
                      className="hover:bg-surface-container-low/30 transition-colors"
                    >
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
                          className="w-full h-8 px-2 bg-surface-container-lowest border border-outline-variant rounded text-xs font-medium text-on-surface focus:outline-none focus:border-primary-container"
                        >
                          {variants.map((v) => (
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
                          className="w-full mt-1 h-6 px-1.5 bg-surface-container-lowest border border-outline-variant/60 rounded text-[11px] text-on-surface"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-center">
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
                          className="w-16 h-8 text-center rounded border border-outline-variant text-body-sm focus:border-primary-container"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary text-xs">
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
                            className="w-28 h-8 pl-5 pr-2 text-right rounded border border-outline-variant text-body-sm font-mono focus:border-primary-container"
                          />
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-container text-secondary">
                          {isIntra ? "GST 18% (C+S)" : "IGST 18%"}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-medium text-on-surface">
                        <MoneyText amountPaise={lineTaxRes.totalPaise} />
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.tempId)}
                          disabled={lines.length <= 1}
                          className="text-secondary hover:text-error transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete line"
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

          {/* Financial Totals Panel */}
          <div className="flex justify-end pt-3">
            <div className="w-full sm:w-80 bg-surface-container-low/50 rounded-xl p-4 border border-outline-variant/60 space-y-2 text-body-sm">
              <div className="flex items-center justify-between text-secondary">
                <span>Gross Subtotal</span>
                <MoneyText
                  amountPaise={taxCalculation.subtotalPaise}
                  className="text-on-surface font-medium"
                />
              </div>

              {taxCalculation.breakdown.map((tax) => (
                <div
                  key={tax.taxName}
                  className="flex items-center justify-between text-secondary"
                >
                  <span>
                    {tax.taxName} ({tax.ratePercent})
                  </span>
                  <MoneyText
                    amountPaise={tax.amountPaise}
                    className="text-on-surface font-medium"
                  />
                </div>
              ))}

              <div className="pt-2 border-t border-outline-variant/80 flex items-center justify-between font-bold">
                <span className="font-title-sm text-on-surface">
                  Estimated Contract Total
                </span>
                <MoneyText
                  amountPaise={taxCalculation.totalPaise}
                  className="text-headline-md text-primary-container"
                />
              </div>
              <p className="text-[11px] text-secondary text-right pt-0.5">
                Saved initially as Draft • Review prior to customer issuance
              </p>
            </div>
          </div>
        </section>

        {/* Footer Navigation Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <Link
            href="/subscriptions"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface font-medium hover:bg-surface-container-low transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">
              arrow_back
            </span>
            <span>Back to Subscriptions</span>
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary-container text-on-primary font-medium hover:bg-primary transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">
                  progress_activity
                </span>
                <span>Saving Draft...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  save
                </span>
                <span>Save as Draft</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
