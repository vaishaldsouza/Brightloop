import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import MoneyText from "@/components/ui/MoneyText";

export const metadata = {
  title: "Products & Variants — Brightloop Subscriptions",
};

export default async function ProductsPage() {
  const session = await auth();
  const isStaff = session?.user?.role === Role.STAFF;

  const products = await prisma.product.findMany({
    include: {
      variants: true,
      plans: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<(typeof products)[0]>[] = [
    {
      header: "Product Name",
      accessor: "name",
      cell: (p) => (
        <div>
          <div className="font-semibold text-on-surface">{p.name}</div>
          {p.description && (
            <div className="text-xs text-on-surface-variant line-clamp-1">{p.description}</div>
          )}
        </div>
      ),
    },
    {
      header: "Active Plans",
      accessor: (p) => `${p.plans.length} plans`,
      className: "text-on-surface-variant",
    },
    {
      header: "Variants",
      accessor: (p) =>
        p.variants.length > 0
          ? p.variants.map((v) => `${v.name} (+₹${(v.priceExtraPaise / 100).toLocaleString("en-IN")})`).join(", ")
          : "None",
      cell: (p) => (
        <div className="text-xs space-y-1">
          {p.variants.length > 0 ? (
            p.variants.map((v) => (
              <div key={v.id} className="inline-flex items-center gap-1.5 mr-2 bg-surface-container px-2 py-0.5 rounded text-on-surface">
                <span>{v.name}</span>
                <span className="text-primary font-medium">
                  +<MoneyText paise={v.priceExtraPaise} />
                </span>
              </div>
            ))
          ) : (
            <span className="text-on-surface-variant italic">No variants</span>
          )}
        </div>
      ),
    },
    {
      header: "Status",
      accessor: (p) => (p.isActive ? "Active" : "Archived"),
      cell: (p) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            p.isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {p.isActive ? "Active" : "Archived"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Variants"
        subtitle="Catalogue of software modules, add-ons, and pricing variants"
        breadcrumbs={[{ label: "Products" }]}
        actions={
          !isStaff ? (
            <button
              disabled
              title="Full creation form in Batch 4"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg opacity-80 cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-base">add</span>
              New Product
            </button>
          ) : undefined
        }
      />

      {isStaff && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 mt-0.5">info</span>
          <div>
            <h4 className="text-sm font-bold">Staff Read-Only View</h4>
            <p className="text-xs text-amber-700 mt-0.5">
              Staff members have read-only access to products and plans. Product creation, variant pricing, and plan configuration require Administrator privileges.
            </p>
          </div>
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={products}
          keyExtractor={(p) => p.id}
          emptyMessage="No products configured in catalog."
        />
      </div>
    </div>
  );
}
