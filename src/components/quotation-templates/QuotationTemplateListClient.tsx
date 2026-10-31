"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import MoneyText from "@/components/ui/MoneyText";
import QuotationTemplateModal, {
  ModalPlanOption,
  ModalVariantOption,
  QuotationTemplateFormData,
} from "@/components/quotation-templates/QuotationTemplateModal";
import { deleteQuotationTemplateAction } from "@/app/actions/quotationTemplates";

export interface SerializedQuotationTemplate {
  id: string;
  name: string;
  planId: string;
  description: string | null;
  validityDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  plan: {
    id: string;
    name: string;
    billingPeriod: string;
    pricePaise: number;
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

interface QuotationTemplateListClientProps {
  initialTemplates: SerializedQuotationTemplate[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearch?: string;
  availablePlans: ModalPlanOption[];
  availableVariants: ModalVariantOption[];
  isAdmin: boolean;
  isStaff: boolean;
}

export default function QuotationTemplateListClient({
  initialTemplates,
  totalCount,
  currentPage,
  pageSize,
  initialSearch = "",
  availablePlans,
  availableVariants,
  isAdmin,
  isStaff,
}: QuotationTemplateListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(initialSearch);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<QuotationTemplateFormData | null>(null);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Synchronize when server search parameter changes
  useEffect(() => {
    setSearchQuery(initialSearch);
  }, [initialSearch]);

  const updateServerParams = useCallback(
    (newSearch: string, newPage: number) => {
      const params = new URLSearchParams();
      if (newSearch.trim()) params.set("q", newSearch.trim());
      if (newPage > 1) params.set("page", newPage.toString());

      startTransition(() => {
        router.push(`/quotation-templates?${params.toString()}`);
      });
    },
    [router]
  );

  // Debounced Search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== initialSearch) {
        updateServerParams(searchQuery, 1);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery, initialSearch, updateServerParams]);

  function handlePageChange(newPage: number) {
    updateServerParams(searchQuery, newPage);
  }

  function handleResetFilters() {
    setSearchQuery("");
    updateServerParams("", 1);
  }

  function handleOpenCreateModal() {
    setEditingTemplate(null);
    setIsModalOpen(true);
  }

  function handleOpenEditModal(template: SerializedQuotationTemplate) {
    setEditingTemplate({
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
    });
    setIsModalOpen(true);
  }

  async function handleDelete(templateId: string, templateName: string) {
    if (!isAdmin) return;
    if (
      !window.confirm(
        `Are you sure you want to delete template "${templateName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(templateId);
    setDeleteError(null);

    try {
      const res = await deleteQuotationTemplateAction(templateId);
      if (!res.success) {
        setDeleteError(res.error || "Failed to delete quotation template");
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setDeleteError("An error occurred while deleting the template.");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Table Columns Definition
  const columns: Column<SerializedQuotationTemplate>[] = [
    {
      header: "Template Name",
      accessor: "name",
      className: "font-medium text-on-surface min-w-[200px]",
      cell: (t) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[18px]">feed</span>
          </div>
          <div>
            <Link
              href={`/quotation-templates/${t.id}`}
              className="font-semibold text-on-surface hover:text-primary transition-colors block"
            >
              {t.name}
            </Link>
            {t.description && (
              <span className="text-xs text-secondary line-clamp-1">
                {t.description}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Associated Plan",
      accessor: (t) => t.plan.name,
      className: "text-on-surface min-w-[150px]",
      cell: (t) => (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface-container font-medium text-on-surface text-body-sm">
            {t.plan.name}
          </span>
          <span className="text-xs text-secondary block mt-0.5">
            {t.plan.billingPeriod}
          </span>
        </div>
      ),
    },
    {
      header: "Validity",
      accessor: (t) => `${t.validityDays} days`,
      cell: (t) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-label-sm font-semibold bg-secondary-fixed text-on-secondary-fixed">
          <span className="material-symbols-outlined text-[13px]">schedule</span>
          {t.validityDays} Days
        </span>
      ),
    },
    {
      header: "Line Items",
      accessor: (t) => `${t.lines.length} lines`,
      cell: (t) => {
        const estimatedTotal = t.lines.reduce(
          (sum, line) => sum + line.quantity * line.unitPricePaise,
          0
        );
        return (
          <div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md font-label-sm font-medium bg-surface-container-high text-on-surface-variant">
              {t.lines.length} {t.lines.length === 1 ? "line" : "lines"}
            </span>
            <span className="text-xs text-secondary block mt-0.5">
              Est: <MoneyText amountPaise={estimatedTotal} />
            </span>
          </div>
        );
      },
    },
    {
      header: "Status",
      accessor: (t) => (t.isActive ? "Active" : "Archived"),
      cell: (t) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm font-semibold ${
            t.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {t.isActive ? "Active" : "Archived"}
        </span>
      ),
    },
    {
      header: "Actions",
      accessor: () => "",
      className: "text-right",
      cell: (t) => (
        <div className="flex items-center justify-end gap-1.5 text-secondary">
          <Link
            href={`/quotation-templates/${t.id}`}
            className="p-1 hover:text-primary rounded hover:bg-surface-container transition-colors"
            title="View Details"
          >
            <span className="material-symbols-outlined text-[18px]">
              visibility
            </span>
          </Link>
          {(isAdmin || isStaff) && (
            <button
              onClick={() => handleOpenEditModal(t)}
              className="p-1 hover:text-primary-container rounded hover:bg-surface-container transition-colors"
              title="Edit Template"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => handleDelete(t.id, t.name)}
              disabled={deletingId === t.id}
              className="p-1 hover:text-error rounded hover:bg-error-container/30 transition-colors disabled:opacity-50"
              title="Delete Template"
            >
              <span className="material-symbols-outlined text-[18px]">
                {deletingId === t.id ? "hourglass_empty" : "delete"}
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
        title="Quotation Templates"
        subtitle="Standardized quotation blueprints and pre-configured contract terms for quick deal assembly"
        breadcrumbs={[{ label: "Quotation Templates" }]}
        actions={
          (isAdmin || isStaff) && (
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary rounded-lg font-medium text-body-md hover:bg-primary transition-colors duration-150 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ New Template</span>
            </button>
          )
        }
      />

      {/* Delete error notification banner */}
      {deleteError && (
        <div className="p-3.5 bg-error-container/30 border border-error/20 rounded-lg text-error text-body-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{deleteError}</span>
          </div>
          <button
            onClick={() => setDeleteError(null)}
            className="text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Action & Filter Bar (No KPI Cards) */}
      <FilterBar onReset={searchQuery ? handleResetFilters : undefined}>
        <div className="relative min-w-[280px] max-w-md flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-secondary">
            search
          </span>
          <input
            type="text"
            placeholder="Filter by blueprint name or plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container outline-none transition"
          />
        </div>
      </FilterBar>

      {/* Quotation Templates Data Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={initialTemplates}
          keyExtractor={(t) => t.id}
          isLoading={isPending}
          emptyMessage={
            searchQuery
              ? `No quotation templates match "${searchQuery}".`
              : "No quotation templates configured yet."
          }
        />

        {/* Pagination Bar */}
        {totalCount > 0 && (
          <div className="px-6 py-3.5 border-t border-outline-variant bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-4 text-body-sm text-secondary">
            <div>
              Showing <span className="font-semibold text-on-surface">{startItem}</span> to{" "}
              <span className="font-semibold text-on-surface">{endItem}</span> of{" "}
              <span className="font-semibold text-on-surface">{totalCount}</span> templates
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="h-8 px-2.5 rounded border border-outline-variant bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_left
                </span>
                <span>Previous</span>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => handlePageChange(pg)}
                  disabled={isPending}
                  className={`h-8 w-8 rounded text-body-sm font-medium transition-colors ${
                    pg === currentPage
                      ? "bg-primary-container text-on-primary"
                      : "border border-outline-variant hover:bg-surface-container-low text-on-surface"
                  }`}
                >
                  {pg}
                </button>
              ))}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="h-8 px-2.5 rounded border border-outline-variant bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span>Next</span>
                <span className="material-symbols-outlined text-[16px]">
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Template Modal */}
      <QuotationTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          router.refresh();
        }}
        initialData={editingTemplate}
        availablePlans={availablePlans}
        availableVariants={availableVariants}
      />
    </div>
  );
}
