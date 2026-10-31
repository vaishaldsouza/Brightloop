import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Tax Rules & GST (Admin) — Brightloop Subscriptions",
};

export default async function TaxesPage() {
  const session = await auth();
  if (session?.user?.role !== Role.ADMIN) {
    redirect("/dashboard");
  }

  const taxes = await prisma.tax.findMany({
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<(typeof taxes)[0]>[] = [
    {
      header: "Tax Name",
      accessor: "name",
      className: "font-semibold text-on-surface",
    },
    {
      header: "Rate (Basis Points)",
      accessor: "rate",
      cell: (t) => (
        <span className="font-mono text-sm font-bold text-primary">
          {(t.rate / 100).toFixed(1)}% ({t.rate} bps)
        </span>
      ),
    },
    {
      header: "Tax Category",
      accessor: "taxType",
      cell: (t) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
            t.taxType === "IGST"
              ? "bg-purple-50 text-purple-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          {t.taxType === "IGST" ? "Inter-state (IGST)" : `Intra-state (${t.taxType})`}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: (t) => (t.isActive ? "Active" : "Disabled"),
      cell: (t) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            t.isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {t.isActive ? "Active" : "Disabled"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Rules & GST Jurisdiction"
        subtitle="Indian Goods and Services Tax (GST) definitions and basis point rate tables (Admin Only)"
        breadcrumbs={[{ label: "Taxes" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={taxes}
          keyExtractor={(t) => t.id}
          emptyMessage="No tax rules configured."
        />
      </div>
    </div>
  );
}
