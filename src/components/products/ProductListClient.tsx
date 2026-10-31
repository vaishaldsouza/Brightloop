"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import MoneyText from "@/components/ui/MoneyText";
import ProductModal, { ProductFormData } from "@/components/products/ProductModal";
import { PRODUCT_TYPES } from "@/lib/validations/product";

export interface SerializedVariant {
  id: string;
  name: string;
  attributeName: string | null;
  attributeValue: string | null;
  priceExtraPaise: number;
}

export interface SerializedProduct {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  notes: string | null;
  salesPricePaise: number;
  costPricePaise: number | null;
  variants: SerializedVariant[];
  plansCount: number;
  createdAt: string;
}

interface ProductListClientProps {
  initialProducts: SerializedProduct[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialSearch?: string;
  initialType?: string;
  isAdmin: boolean;
}

export default function ProductListClient({
  initialProducts,
  totalCount,
  currentPage,
  pageSize,
  initialSearch = "",
  initialType = "ALL",
  isAdmin,
}: ProductListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [typeFilter, setTypeFilter] = useState(initialType);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFormData | null>(null);

  // Synchronize when initialSearch/initialType changes from server
  useEffect(() => {
    setSearchQuery(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setTypeFilter(initialType);
  }, [initialType]);

  const updateServerParams = useCallback(
    (newQ: string, newType: string, newPage: number) => {
      startTransition(() => {
        const params = new URLSearchParams();
        if (newQ.trim()) params.set("q", newQ.trim());
        if (newType && newType !== "ALL") params.set("type", newType);
        if (newPage > 1) params.set("page", newPage.toString());
        const query = params.toString();
        router.push(`/products${query ? `?${query}` : ""}`);
      });
    },
    [router]
  );

  // Debounced search query sync to server
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== initialSearch) {
        updateServerParams(searchQuery, typeFilter, 1);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery, initialSearch, typeFilter, updateServerParams]);

  const handleTypeChange = (newType: string) => {
    setTypeFilter(newType);
    updateServerParams(searchQuery, newType, 1);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setTypeFilter("ALL");
    updateServerParams("", "ALL", 1);
  };

  const handlePageChange = (newPage: number) => {
    updateServerParams(searchQuery, typeFilter, newPage);
  };

  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: SerializedProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct({
      id: p.id,
      name: p.name,
      type: p.type || "Recurring Service",
      description: p.description,
      notes: p.notes,
      salesPricePaise: p.salesPricePaise,
      costPricePaise: p.costPricePaise,
      variants: p.variants.map((v) => ({
        id: v.id,
        attributeName: v.attributeName || "Brand",
        attributeValue: v.attributeValue || v.name,
        priceExtraPaise: v.priceExtraPaise,
      })),
    });
    setIsModalOpen(true);
  };

  const handleModalSuccess = (productId?: string) => {
    router.refresh();
    if (productId && !editingProduct) {
      router.push(`/products/${productId}`);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = searchQuery.trim() !== "" || typeFilter !== "ALL";

  const columns: Column<SerializedProduct>[] = [
    {
      header: "Product Name",
      accessor: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[20px]">
              inventory_2
            </span>
          </div>
          <div>
            <Link
              href={`/products/${p.id}`}
              className="font-semibold text-on-surface hover:text-primary transition-colors block"
            >
              {p.name}
            </Link>
            {p.notes ? (
              <span className="text-xs text-secondary line-clamp-1 max-w-xs">
                {p.notes}
              </span>
            ) : p.description ? (
              <span className="text-xs text-secondary line-clamp-1 max-w-xs">
                {p.description}
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      header: "Product Type",
      accessor: "type",
      cell: (p) => {
        let badgeStyle = "bg-slate-100 text-slate-700 border-slate-200";
        if (p.type === "Recurring Service") {
          badgeStyle = "bg-blue-50 text-blue-700 border-blue-200";
        } else if (p.type === "Digital License") {
          badgeStyle = "bg-purple-50 text-purple-700 border-purple-200";
        } else if (p.type === "Hardware") {
          badgeStyle = "bg-amber-50 text-amber-800 border-amber-200";
        } else if (p.type === "Consumable") {
          badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-200";
        }

        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${badgeStyle}`}
          >
            {p.type || "General"}
          </span>
        );
      },
    },
    {
      header: "Sales Price",
      align: "right",
      accessor: "salesPricePaise",
      cell: (p) => (
        <span className="font-semibold text-on-surface font-mono">
          <MoneyText paise={p.salesPricePaise} />
        </span>
      ),
    },
    {
      header: "Cost Price",
      align: "right",
      accessor: "costPricePaise",
      cell: (p) =>
        p.costPricePaise != null ? (
          <span className="text-secondary font-mono text-body-sm">
            <MoneyText paise={p.costPricePaise} />
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        ),
    },
    {
      header: "Variants",
      accessor: (p) => (
        <div className="flex flex-wrap items-center gap-1.5 max-w-sm">
          {p.variants.length > 0 ? (
            p.variants.map((v) => (
              <span
                key={v.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F1F5F9] text-slate-700 rounded text-xs border border-slate-200/60"
              >
                <span>{v.attributeValue || v.name}</span>
                {v.priceExtraPaise > 0 && (
                  <span className="text-primary font-medium">
                    +<MoneyText paise={v.priceExtraPaise} />
                  </span>
                )}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400 italic">No variants</span>
          )}
        </div>
      ),
    },
    {
      header: "Plans",
      align: "center",
      accessor: (p) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
          {p.plansCount} {p.plansCount === 1 ? "plan" : "plans"}
        </span>
      ),
    },
    {
      header: "Actions",
      align: "right",
      accessor: (p) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/products/${p.id}`}
            className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition"
            title="View Details"
          >
            <span className="material-symbols-outlined text-[18px]">
              visibility
            </span>
          </Link>
          {isAdmin && (
            <button
              type="button"
              onClick={(e) => handleOpenEditModal(p, e)}
              className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition"
              title="Edit Product"
            >
              <span className="material-symbols-outlined text-[18px]">
                edit
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
        title="Products"
        subtitle="Catalogue of software modules, deliverables, and pricing variants"
        breadcrumbs={[{ label: "Products" }]}
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-md font-semibold hover:bg-primary-container shadow-xs transition"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Product</span>
            </button>
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
              Staff members have read-only access to products and plans. Product creation, variant pricing, and plan configuration require Administrator privileges.
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <FilterBar onReset={hasActiveFilters ? handleResetFilters : undefined}>
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
            search
          </span>
          <input
            type="text"
            placeholder="Search product name, type, variant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-body-sm text-secondary font-medium">Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          >
            <option value="ALL">All Types</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      {/* Product Data Table */}
      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={initialProducts}
          keyExtractor={(p) => p.id}
          isLoading={isPending}
          emptyMessage={
            hasActiveFilters
              ? "No products found matching your search or filters."
              : "No products configured in catalog."
          }
          onRowClick={(p) => router.push(`/products/${p.id}`)}
        />

        {/* Server-Side Pagination Bar */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm text-secondary px-1">
            <div>
              Showing{" "}
              <span className="font-semibold text-on-surface">
                {(currentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-on-surface">
                {Math.min(currentPage * pageSize, totalCount)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-on-surface">
                {totalCount}
              </span>{" "}
              products
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1 || isPending}
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
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
                disabled={currentPage >= totalPages || isPending}
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 font-medium"
              >
                <span>Next</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product Create / Edit Modal (Admin only) */}
      {isAdmin && (
        <ProductModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          initialData={editingProduct}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
