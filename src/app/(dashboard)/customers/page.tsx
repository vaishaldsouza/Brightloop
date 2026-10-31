import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";

export const metadata = {
  title: "Customers — Brightloop Subscriptions",
};

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    include: {
      user: { select: { name: true, email: true } },
      subscriptions: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<(typeof customers)[0]>[] = [
    {
      header: "Company Name",
      accessor: "companyName",
      className: "font-medium text-on-surface",
    },
    {
      header: "Contact Person",
      accessor: (c) => c.user.name,
      className: "text-on-surface-variant",
    },
    {
      header: "Email",
      accessor: (c) => c.user.email,
      className: "text-on-surface-variant font-mono text-xs",
    },
    {
      header: "GSTIN",
      accessor: (c) => c.gstin || "Unregistered",
      className: "font-mono text-xs text-on-surface-variant",
    },
    {
      header: "Jurisdiction",
      accessor: (c) =>
        c.gstStateCode ? `${c.gstState || ""} (${c.gstStateCode})` : "—",
      className: "text-on-surface-variant text-xs",
    },
    {
      header: "Active Subscriptions",
      accessor: (c) => c.subscriptions.length.toString(),
      className: "text-right font-medium",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Manage client accounts, GST profiles, and billing information"
        breadcrumbs={[{ label: "Customers" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={customers}
          keyExtractor={(c) => c.id}
          emptyMessage="No customers found in system."
        />
      </div>
    </div>
  );
}
