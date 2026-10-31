import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import MoneyText from "@/components/ui/MoneyText";

export const metadata = {
  title: "Subscriptions — Brightloop Subscriptions",
};

export default async function SubscriptionsPage() {
  const subscriptions = await prisma.subscription.findMany({
    include: {
      customer: true,
      plan: true,
      lines: true,
      invoices: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<(typeof subscriptions)[0]>[] = [
    {
      header: "Subscription #",
      accessor: "number",
      cell: (s) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {s.number}
        </span>
      ),
    },
    {
      header: "Customer",
      accessor: (s) => s.customer.companyName,
      className: "font-semibold text-on-surface",
    },
    {
      header: "Plan",
      accessor: (s) => s.plan.name,
      className: "text-on-surface-variant",
    },
    {
      header: "Billing Period",
      accessor: "billingPeriod",
      cell: (s) => (
        <span className="font-mono text-xs uppercase px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold">
          {s.billingPeriod}
        </span>
      ),
    },
    {
      header: "Subtotal",
      accessor: (s) =>
        s.lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0),
      cell: (s) => {
        const subtotal = s.lines.reduce(
          (sum, l) => sum + l.unitPricePaise * l.quantity,
          0
        );
        return <MoneyText paise={subtotal} className="font-semibold text-on-surface" />;
      },
    },
    {
      header: "Status",
      accessor: "status",
      cell: (s) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={s.status} />
          {s.isPaused && <TagBadge tag="PAUSED" />}
        </div>
      ),
    },
    {
      header: "Next Billing",
      accessor: (s) => (s.nextBillingDate ? s.nextBillingDate.toLocaleDateString("en-IN") : "—"),
      className: "text-xs font-mono text-on-surface-variant",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Manage recurring customer contracts, lifecycle states, and billing schedules"
        breadcrumbs={[{ label: "Subscriptions" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={subscriptions}
          keyExtractor={(s) => s.id}
          emptyMessage="No subscriptions found."
        />
      </div>
    </div>
  );
}
