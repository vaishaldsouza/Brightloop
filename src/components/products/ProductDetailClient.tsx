"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MoneyText from "@/components/ui/MoneyText";
import DataTable, { Column } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import ProductModal, { ProductFormData } from "@/components/products/ProductModal";
import { deleteProductAction } from "@/app/actions/products";

export interface DetailVariant {
  id: string;
  name: string;
  attributeName: string | null;
  attributeValue: string | null;
  priceExtraPaise: number;
  finalPricePaise: number;
  subscriptionLinesCount: number;
  invoiceLinesCount: number;
}

export interface DetailPlan {
  id: string;
  name: string;
  billingPeriod: string;
  pricePaise: number;
  isPausable: boolean;
  isRenewable: boolean;
}

export interface ProductDetailData {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  notes: string | null;
  salesPricePaise: number;
  costPricePaise: number | null;
  createdAt: string;
  updatedAt: string;
  variants: DetailVariant[];
  plans: DetailPlan[];
  totalReferencesCount: number;
}

interface ProductDetailClientProps {
  product: ProductDetailData;
  isAdmin: boolean;
}

export default function ProductDetailClient({
  product,
  isAdmin,
}: ProductDetailClientProps) {
  const router = useRouter();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editFormData: ProductFormData = {
    id: product.id,
    name: product.name,
    type: product.type || "Software",
    description: product.description,
    notes: product.notes,
    salesPricePaise: product.salesPricePaise,
    costPricePaise: product.costPricePaise,
    variants: product.variants.map((v) => ({
      id: v.id,
      attributeName: v.attributeName || "Brand",
      attributeValue: v.attributeValue || v.name,
      priceExtraPaise: v.priceExtraPaise,
    })),
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteProductAction(product.id);
      if (res.success) {
        setIsDeleteModalOpen(false);
        router.push("/products");
      } else {
        setDeleteError(res.error || "Failed to delete product.");
      }
    } catch {
      setDeleteError("An unexpected error occurred while deleting product.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Variants Table Columns
  const variantColumns: Column<DetailVariant>[] = [
    {
      header: "Attribute Name",
      accessor: (v) => (
        <span className="font-semibold text-on-surface">
          {v.attributeName || "Option"}
        </span>
      ),
    },
    {
      header: "Attribute Value",
      accessor: (v) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-body-sm font-medium bg-slate-100 text-slate-800 border border-slate-200">
          {v.attributeValue || v.name}
        </span>
      ),
    },
    {
      header: "Variant Additional Price",
      align: "right",
      accessor: (v) => (
        <div className="font-currency-table text-body-md font-semibold text-emerald-700">
          +<MoneyText amountPaise={v.priceExtraPaise} />
        </div>
      ),
    },
    {
      header: "Final Price (Base + Extra)",
      align: "right",
      accessor: (v) => (
        <div className="font-currency-table text-body-md font-bold text-primary">
          <MoneyText amountPaise={v.finalPricePaise} />
        </div>
      ),
    },
  ];

  // Linked Plans Table Columns
  const planColumns: Column<DetailPlan>[] = [
    {
      header: "Plan Name",
      accessor: (pl) => (
        <span className="font-semibold text-on-surface">{pl.name}</span>
      ),
    },
    {
      header: "Billing Period",
      accessor: (pl) => (
        <span className="capitalize text-body-sm text-secondary">
          {pl.billingPeriod.toLowerCase()}
        </span>
      ),
    },
    {
      header: "Price",
      align: "right",
      accessor: (pl) => (
        <MoneyText
          amountPaise={pl.pricePaise}
          className="font-currency-table font-semibold text-on-surface"
        />
      ),
    },
    {
      header: "Flags",
      accessor: (pl) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {pl.isPausable && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Pausable
            </span>
          )}
          {pl.isRenewable && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Renewable
            </span>
          )}
        </div>
      ),
    },
  ];

  const canDelete = isAdmin && product.totalReferencesCount === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={product.name}
        subtitle="Catalog Specification, Pricing Formulas, and Variant Breakdown"
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: product.name },
        ]}
        statusBadge={
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            {product.type || "Software"}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/products"
              className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-body-md font-medium text-slate-700 bg-white hover:bg-slate-50 transition inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>
              <span>Back</span>
            </Link>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-body-md font-semibold hover:bg-primary-container shadow-xs transition"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                  <span>Edit Product</span>
                </button>

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 text-body-md font-semibold transition"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    <span>Delete</span>
                  </button>
                )}
              </>
            )}
          </div>
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
              Staff accounts have read-only visibility into products, plans, and catalog pricing. Configuration updates require Administrator privileges.
            </p>
          </div>
        </div>
      )}

      {/* Product Overview Bento Card */}
      <div className="bg-surface-container-lowest border border-[#CBD5E1] rounded-xl p-6 shadow-xs space-y-6">
        <div className="border-b border-[#F1F5F9] pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">
              inventory_2
            </span>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">
              Product Overview & Economics
            </h2>
          </div>
          <span className="text-xs text-secondary">
            Created on{" "}
            {new Date(product.createdAt).toLocaleDateString("en-IN", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Product Type
            </div>
            <div className="text-body-md font-semibold text-on-surface mt-1">
              {product.type || "Software"}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Base Sales Price
            </div>
            <div className="mt-1">
              <MoneyText
                amountPaise={product.salesPricePaise}
                className="font-currency-metric text-headline-sm font-bold text-primary"
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Cost Price (COGS)
            </div>
            <div className="mt-1">
              {product.costPricePaise != null ? (
                <MoneyText
                  amountPaise={product.costPricePaise}
                  className="font-currency-metric text-title-md font-medium text-secondary"
                />
              ) : (
                <span className="text-body-sm text-slate-400 italic">
                  Not specified
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Gross Margin
            </div>
            <div className="text-body-md font-semibold text-emerald-700 mt-1">
              {product.costPricePaise != null && product.salesPricePaise > 0
                ? `${Math.round(
                    ((product.salesPricePaise - product.costPricePaise) /
                      product.salesPricePaise) *
                      100
                  )}%`
                : "—"}
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-4">
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Notes & Deliverable Description
            </div>
            <div className="text-body-sm text-on-surface mt-1 whitespace-pre-line bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-lg">
              {product.notes || product.description || (
                <span className="text-slate-400 italic">
                  No internal notes recorded for this catalog item.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Variants Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              tune
            </span>
            <h3 className="font-title-md text-title-md font-bold text-on-surface">
              Configured Variants ({product.variants.length})
            </h3>
          </div>
          <span className="text-xs text-secondary font-medium">
            Formula: Final Price = Base Sales Price + Variant Extra
          </span>
        </div>
        <DataTable
          columns={variantColumns}
          data={product.variants}
          keyExtractor={(v) => v.id}
          emptyIcon="tune"
          emptyMessage="No variants configured for this product. Pricing is uniform across all deliveries."
        />
      </div>

      {/* Linked Plans Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              layers
            </span>
            <h3 className="font-title-md text-title-md font-bold text-on-surface">
              Associated Subscription Plans ({product.plans.length})
            </h3>
          </div>
        </div>
        <DataTable
          columns={planColumns}
          data={product.plans}
          keyExtractor={(pl) => pl.id}
          emptyIcon="layers"
          emptyMessage="No subscription plans currently bundle this product item."
        />
      </div>

      {/* Product Edit Modal (Admin only) */}
      {isAdmin && (
        <ProductModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          initialData={editFormData}
          onSuccess={() => {
            setIsEditModalOpen(false);
            router.refresh();
          }}
        />
      )}

      {/* Delete Confirmation Modal (Admin only) */}
      {canDelete && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Product"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-body-md font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-body-md font-semibold hover:bg-rose-700 transition disabled:opacity-50"
              >
                {isDeleting && (
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                )}
                <span>Confirm Delete</span>
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {deleteError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-body-sm">
                {deleteError}
              </div>
            )}
            <p className="text-body-md text-on-surface">
              Are you sure you want to delete the product{" "}
              <strong>{product.name}</strong>?
            </p>
            <p className="text-body-sm text-secondary">
              This product has no active plans or line references. Deleting will permanently remove it from the catalog.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
