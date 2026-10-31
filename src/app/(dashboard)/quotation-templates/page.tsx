import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";

export const metadata = {
  title: "Quotation Templates — Brightloop Subscriptions",
};

export default async function QuotationTemplatesPage() {
  const templates = await prisma.quotationTemplate.findMany({
    include: {
      plan: true,
      lines: {
        include: { productVariant: { include: { product: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<(typeof templates)[0]>[] = [
    {
      header: "Template Name",
      accessor: "name",
      className: "font-semibold text-on-surface",
    },
    {
      header: "Associated Plan",
      accessor: (t) => t.plan?.name || "None",
      className: "text-on-surface-variant",
    },
    {
      header: "Itemized Lines",
      accessor: (t) => `${t.lines.length} lines`,
      cell: (t) => (
        <span className="text-xs text-on-surface-variant">
          {t.lines
            .map(
              (l) =>
                `${l.quantity}x ${l.productVariant.product.name} (${l.productVariant.name})`
            )
            .join(", ")}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: (t) => (t.isActive ? "Active" : "Archived"),
      cell: (t) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            t.isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {t.isActive ? "Active" : "Archived"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotation Templates"
        subtitle="Reusable pre-configured quotation drafts for rapid subscription onboarding"
        breadcrumbs={[{ label: "Quotation Templates" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={templates}
          keyExtractor={(t) => t.id}
          emptyMessage="No quotation templates configured."
        />
      </div>
    </div>
  );
}
