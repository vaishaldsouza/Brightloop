import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import MoneyText from "@/components/ui/MoneyText";

export const metadata = {
  title: "Payments — Brightloop Subscriptions",
};

export default async function PaymentsPage() {
  const payments = await prisma.payment.findMany({
    include: {
      invoice: {
        include: {
          subscription: {
            include: {
              customer: true,
            },
          },
        },
      },
    },
    orderBy: { paidAt: "desc" },
  });

  const columns: Column<(typeof payments)[0]>[] = [
    {
      header: "Payment ID",
      accessor: "id",
      cell: (p) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {p.id.slice(0, 8)}...
        </span>
      ),
    },
    {
      header: "Invoice #",
      accessor: (p) => p.invoice.number,
      className: "font-mono text-xs text-on-surface",
    },
    {
      header: "Customer",
      accessor: (p) => p.invoice.subscription.customer.companyName,
      className: "font-semibold text-on-surface",
    },
    {
      header: "Payment Method",
      accessor: "paymentMethod",
      cell: (p) => (
        <span className="font-mono text-xs uppercase px-2 py-0.5 rounded bg-surface-container text-on-surface">
          {p.paymentMethod.replace("_", " ")}
        </span>
      ),
    },
    {
      header: "Transaction Reference",
      accessor: (p) => p.reference || "—",
      className: "font-mono text-xs text-on-surface-variant",
    },
    {
      header: "Paid Date",
      accessor: (p) => p.paidAt.toLocaleDateString("en-IN"),
      className: "text-xs font-mono text-on-surface-variant",
    },
    {
      header: "Amount",
      accessor: "amountPaise",
      cell: (p) => (
        <MoneyText
          paise={p.amountPaise}
          className="font-bold text-emerald-700"
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Financial ledger of client remittances, bank transfers, and payment gateways"
        breadcrumbs={[{ label: "Payments" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={payments}
          keyExtractor={(p) => p.id}
          emptyMessage="No payment transactions recorded."
        />
      </div>
    </div>
  );
}
