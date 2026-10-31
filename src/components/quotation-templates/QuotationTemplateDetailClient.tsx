"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MoneyText from "@/components/ui/MoneyText";
import QuotationTemplateModal, {
  ModalPlanOption,
  ModalVariantOption,
} from "@/components/quotation-templates/QuotationTemplateModal";
import { deleteQuotationTemplateAction } from "@/app/actions/quotationTemplates";
import { SerializedQuotationTemplate } from "@/components/quotation-templates/QuotationTemplateListClient";

interface QuotationTemplateDetailClientProps {
  template: SerializedQuotationTemplate;
  availablePlans: ModalPlanOption[];
  availableVariants: ModalVariantOption[];
  isAdmin: boolean;
  isStaff: boolean;
}

export default function QuotationTemplateDetailClient({
  template,
  availablePlans,
  availableVariants,
  isAdmin,
  isStaff,
}: QuotationTemplateDetailClientProps) {
  const router = useRouter();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Compute total estimated contract value in Paise
  const totalEstimatedPaise = template.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPricePaise,
    0
  );

  async function handleDelete() {
    if (!isAdmin) return;
    if (
      !window.confirm(
        `Are you sure you want to permanently delete quotation template "${template.name}"?`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);

    try {
      const res = await deleteQuotationTemplateAction(template.id);
      if (!res.success) {
        setActionError(res.error || "Failed to delete quotation template");
        setIsDeleting(false);
      } else {
        router.push("/quotation-templates");
      }
    } catch (err) {
      console.error(err);
      setActionError("An unexpected error occurred during template deletion.");
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={template.name}
        subtitle="Standardized blueprint configuration and pre-configured itemized lines"
        breadcrumbs={[
          { label: "Quotation Templates", href: "/quotation-templates" },
          { label: template.name },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/quotation-templates"
              className="px-3.5 py-2 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface rounded-lg text-label-md font-medium transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>
              <span>All Templates</span>
            </Link>

            {(isAdmin || isStaff) && (
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="px-4 py-2 bg-primary-container text-on-primary hover:bg-primary rounded-lg text-label-md font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                <span>Edit Template</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 border border-outline-variant text-secondary hover:text-error hover:bg-error-container/20 rounded-lg transition-colors disabled:opacity-50"
                title="Delete Template"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isDeleting ? "hourglass_empty" : "delete"}
                </span>
              </button>
            )}
          </div>
        }
      />

      {/* Action error banner */}
      {actionError && (
        <div className="p-3.5 bg-error-container/30 border border-error/20 rounded-lg text-error text-body-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Associated Plan Card */}
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm space-y-1">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-label-sm uppercase tracking-wider">
              Associated Plan
            </span>
            <span className="material-symbols-outlined text-[20px] text-primary">
              layers
            </span>
          </div>
          <div className="text-headline-md font-bold text-on-surface truncate">
            {template.plan.name}
          </div>
          <div className="text-xs text-secondary">
            Billing Period: {template.plan.billingPeriod}
          </div>
        </div>

        {/* Validity Duration Card */}
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm space-y-1">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-label-sm uppercase tracking-wider">
              Validity Window
            </span>
            <span className="material-symbols-outlined text-[20px] text-primary">
              schedule
            </span>
          </div>
          <div className="text-headline-md font-bold text-on-surface">
            {template.validityDays} Days
          </div>
          <div className="text-xs text-secondary">
            Quotes expire after {template.validityDays} days from generation
          </div>
        </div>

        {/* Configured Lines Card */}
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm space-y-1">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-label-sm uppercase tracking-wider">
              Configured Lines
            </span>
            <span className="material-symbols-outlined text-[20px] text-primary">
              format_list_bulleted
            </span>
          </div>
          <div className="text-headline-md font-bold text-on-surface">
            {template.lines.length} {template.lines.length === 1 ? "Line" : "Lines"}
          </div>
          <div className="text-xs text-secondary">
            Pre-fills proposal line items
          </div>
        </div>

        {/* Total Estimated Value Card */}
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm space-y-1">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-label-sm uppercase tracking-wider">
              Estimated Total Value
            </span>
            <span className="material-symbols-outlined text-[20px] text-primary">
              payments
            </span>
          </div>
          <MoneyText
            amountPaise={totalEstimatedPaise}
            className="text-headline-md font-bold text-primary-container"
          />
          <div className="text-xs text-secondary">
            Calculated excluding taxes (applied at invoice)
          </div>
        </div>
      </div>

      {/* Description Card */}
      {template.description && (
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm space-y-2">
          <h3 className="font-title-sm text-on-surface font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">
              description
            </span>
            Blueprint Notes & Default Terms
          </h3>
          <p className="text-body-md text-secondary whitespace-pre-line">
            {template.description}
          </p>
        </div>
      )}

      {/* Pre-configured Line Items Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="p-5 border-b border-outline-variant flex items-center justify-between">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
              Pre-configured Product Lines
            </h2>
            <p className="text-body-sm text-secondary mt-0.5">
              These products, seats, and recurring services will automatically prefill into new quotation drafts
            </p>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm font-semibold ${
              template.isActive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {template.isActive ? "Template Active" : "Template Archived"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-label-md uppercase">
                <th className="py-3 px-5">Product & Variant</th>
                <th className="py-3 px-5 w-28 text-center">Quantity</th>
                <th className="py-3 px-5 w-48 text-right">Unit Price</th>
                <th className="py-3 px-5 w-48 text-right">Estimated Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60 font-body-md text-body-md">
              {template.lines.map((line) => {
                const lineTotalPaise = line.quantity * line.unitPricePaise;
                return (
                  <tr
                    key={line.id}
                    className="hover:bg-surface-container-low/40 transition-colors"
                  >
                    <td className="py-4 px-5">
                      <div className="font-semibold text-on-surface">
                        {line.productVariant.product.name}
                      </div>
                      <div className="text-xs text-secondary flex items-center gap-2 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                          Variant: {line.productVariant.name}
                        </span>
                        {line.description && <span>• {line.description}</span>}
                      </div>
                    </td>
                    <td className="py-4 px-5 text-center font-medium text-on-surface">
                      {line.quantity}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <MoneyText amountPaise={line.unitPricePaise} />
                    </td>
                    <td className="py-4 px-5 text-right font-semibold text-on-surface">
                      <MoneyText amountPaise={lineTotalPaise} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="bg-surface-container-low/40 p-5 border-t border-outline-variant flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-body-sm text-secondary">
            Note: All tax rates and discounts are computed dynamically upon quotation and invoice generation (PRD §4.7 & §12).
          </div>
          <div className="flex items-center gap-4 text-right">
            <span className="font-title-sm text-on-surface font-semibold">
              Total Estimated Contract Value:
            </span>
            <MoneyText
              amountPaise={totalEstimatedPaise}
              className="text-headline-md font-bold text-primary-container"
            />
          </div>
        </div>
      </div>

      {/* Audit Metadata */}
      <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm text-xs text-secondary flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          Template ID: <span className="font-mono text-on-surface">{template.id}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            Created: {new Date(template.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span>•</span>
          <span>
            Updated: {new Date(template.updatedAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Edit Modal */}
      <QuotationTemplateModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => {
          setIsEditModalOpen(false);
          router.refresh();
        }}
        initialData={{
          id: template.id,
          name: template.name,
          planId: template.planId,
          description: template.description,
          validityDays: template.validityDays,
          isActive: template.isActive,
          lines: template.lines.map((l) => ({
            id: l.id,
            productVariantId: l.productVariantId,
            description: l.description,
            quantity: l.quantity,
            unitPricePaise: l.unitPricePaise,
            sortOrder: l.sortOrder,
          })),
        }}
        availablePlans={availablePlans}
        availableVariants={availableVariants}
      />
    </div>
  );
}
