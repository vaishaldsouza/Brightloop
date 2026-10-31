import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import MoneyText from "@/components/ui/MoneyText";
import { InvoiceStatus } from "@prisma/client";

export const metadata = {
  title: "Invoices — Brightloop Subscriptions",
};

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    include: {
      subscription: {
        include: {
          customer: true,
          plan: true,
        },
      },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const columns: Column<(typeof invoices)[0]>[] = [
    {
      header: "Invoice #",
      accessor: "number",
      cell: (inv) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {inv.number}
        </span>
      ),
    },
    {
      header: "Customer",
      accessor: (inv) => inv.subscription.customer.companyName,
      className: "font-semibold text-on-surface",
    },
    {
      header: "Plan",
      accessor: (inv) => inv.subscription.plan.name,
      className: "text-on-surface-variant",
    },
    {
      header: "Due Date",
      accessor: (inv) => inv.dueDate.toLocaleDateString("en-IN"),
      className: "text-xs font-mono text-on-surface-variant",
    },
    {
      header: "Total",
      accessor: "totalPaise",
      cell: (inv) => <MoneyText paise={inv.totalPaise} className="font-semibold text-on-surface" />,
    },
    {
      header: "Paid",
      accessor: "paidPaise",
      cell: (inv) => <MoneyText paise={inv.paidPaise} className="text-on-surface-variant" />,
    },
    {
      header: "Status & Tags",
      accessor: "status",
      cell: (inv) => {
        const isCancelled = !!inv.cancelledAt;
        const isOverdue =
          inv.status === InvoiceStatus.CONFIRMED &&
          inv.dueDate < today &&
          inv.totalPaise - inv.paidPaise > 0 &&
          !isCancelled;
        const isPartiallyPaid =
          inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise;

        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={inv.status} />
            {isOverdue && <TagBadge tag="OVERDUE" />}
            {isPartiallyPaid && <TagBadge tag="PARTIALLY_PAID" />}
            {isCancelled && <TagBadge tag="CANCELLED" />}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Itemized billing records, tax calculations, and payment tracking"
        breadcrumbs={[{ label: "Invoices" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={invoices}
          keyExtractor={(i) => i.id}
          emptyMessage="No invoices found."
        />
      </div>
    </div>
  );
}
