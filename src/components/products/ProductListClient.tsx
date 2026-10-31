"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { Column } from "@/components/ui/DataTable";
import MoneyText from "@/components/ui/MoneyText";
import ProductModal, { ProductFormData } from "@/components/products/ProductModal";

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
  isAdmin: boolean;
}

export default function ProductListClient({
  initialProducts,
  isAdmin,
}: ProductListClientProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFormData | null>(null);

  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: SerializedProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct({
      id: p.id,
      name: p.name,
      type: p.type || "Software",
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

  // Distinct types for filter dropdown
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    initialProducts.forEach((p) => {
      if (p.type) set.add(p.type);
    });
    return Array.from(set).sort();
  }, [initialProducts]);

  // Filtering
  const filteredProducts = useMemo(() => {
    return initialProducts.filter((p) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesType = p.type ? p.type.toLowerCase().includes(query) : false;
        const matchesNotes = p.notes ? p.notes.toLowerCase().includes(query) : false;
        const matchesVariant = p.variants.some(
          (v) =>
            v.name.toLowerCase().includes(query) ||
            (v.attributeValue && v.attributeValue.toLowerCase().includes(query))
        );

        if (!matchesName && !matchesType && !matchesNotes && !matchesVariant) {
          return false;
        }
      }

      if (typeFilter !== "ALL") {
        if (p.type !== typeFilter) return false;
      }

      return true;
    });
  }, [initialProducts, searchQuery, typeFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const hasActiveFilters = searchQuery.trim() !== "" || typeFilter !== "ALL";

  const handleResetFilters = () => {
    setSearchQuery("");
    setTypeFilter("ALL");
    setCurrentPage(1);
  };

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
            ) : (
              <span className="text-xs text-slate-400 italic">No description</span>
            )}
          </div>
        </div>
      ),
      className: "min-w-[220px]",
    },
    {
      header: "Type",
      accessor: (p) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface border border-[#E2E8F0]">
          {p.type || "Software"}
        </span>
      ),
    },
    {
      header: "Sales Price",
      align: "right",
      accessor: (p) => (
        <MoneyText
          amountPaise={p.salesPricePaise}
          className="font-currency-table font-semibold text-on-surface"
        />
      ),
    },
    {
      header: "Cost Price",
      align: "right",
      accessor: (p) => (
        p.costPricePaise != null ? (
          <MoneyText
            amountPaise={p.costPricePaise}
            className="font-currency-table text-secondary"
          />
        ) : (
          <span className="text-xs text-slate-400 italic">—</span>
        )
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 border border-slate-200"
              >
                <span>{v.attributeValue || v.name}</span>
                {v.priceExtraPaise > 0 && (
                  <span className="text-primary font-semibold text-[11px]">
                    +<MoneyText amountPaise={v.priceExtraPaise} showDecimals={false} />
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
      header: "Actions",
      align: "right",
      accessor: (p) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/products/${p.id}`}
            className="px-2.5 py-1 text-xs font-medium rounded-lg text-primary hover:bg-primary/5 transition inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            <span>View</span>
          </Link>

          {isAdmin && (
            <button
              type="button"
              onClick={(e) => handleOpenEditModal(p, e)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span>Edit</span>
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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-body-sm text-secondary font-medium">Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-sm text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
          >
            <option value="ALL">All Types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={paginatedProducts}
        keyExtractor={(p) => p.id}
        onRowClick={(p) => router.push(`/products/${p.id}`)}
        emptyIcon="inventory_2"
        emptyMessage={
          hasActiveFilters
            ? "No products match your active search and filter criteria."
            : "No products configured in catalog. Click 'New Product' to add one."
        }
      />

      {/* Pagination Footer */}
      {filteredProducts.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm text-secondary px-1">
          <div>
            Showing{" "}
            <span className="font-semibold text-on-surface">
              {(currentPage - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-on-surface">
              {Math.min(currentPage * pageSize, filteredProducts.length)}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-on-surface">
              {filteredProducts.length}
            </span>{" "}
            products
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 font-medium"
            >
              <span>Next</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      )}

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
