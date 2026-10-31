import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import MoneyText from "@/components/ui/MoneyText";

export const metadata = {
  title: "Subscription Plans — Brightloop Subscriptions",
};

export default async function PlansPage() {
  const session = await auth();
  const isStaff = session?.user?.role === Role.STAFF;

  const plans = await prisma.plan.findMany({
    include: {
      product: true,
      _count: { select: { subscriptions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<(typeof plans)[0]>[] = [
    {
      header: "Plan Name",
      accessor: "name",
      cell: (p) => (
        <div>
          <div className="font-semibold text-on-surface">{p.name}</div>
          <div className="text-xs text-on-surface-variant">{p.product.name}</div>
        </div>
      ),
    },
    {
      header: "Billing Period",
      accessor: "billingPeriod",
      cell: (p) => (
        <span className="font-mono text-xs uppercase px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold">
          {p.billingPeriod}
        </span>
      ),
    },
    {
      header: "Base Price",
      accessor: "pricePaise",
      cell: (p) => <MoneyText paise={p.pricePaise} className="font-semibold text-on-surface" />,
    },
    {
      header: "Subscribers",
      accessor: (p) => p._count.subscriptions.toString(),
      className: "text-right font-medium",
    },
    {
      header: "Capabilities",
      accessor: "id",
      cell: (p) => (
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={`px-1.5 py-0.5 rounded ${
              p.isPausable ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-400"
            }`}
            title="Pausable"
          >
            Pausable
          </span>
          <span
            className={`px-1.5 py-0.5 rounded ${
              p.isClosableEarly ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-400"
            }`}
            title="Early Close"
          >
            Early Close
          </span>
          <span
            className={`px-1.5 py-0.5 rounded ${
              p.isRenewable ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-400"
            }`}
            title="Renewable"
          >
            Renewable
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription Plans"
        subtitle="Manage recurring plan tiers, base rates, and lifecycle permissions"
        breadcrumbs={[{ label: "Plans" }]}
        actions={
          !isStaff ? (
            <button
              disabled
              title="Full creation form in Batch 4"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg opacity-80 cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-base">add</span>
              New Plan
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
              Staff members have read-only access to plans. Plan creation and rule alterations require Administrator privileges.
            </p>
          </div>
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={plans}
          keyExtractor={(p) => p.id}
          emptyMessage="No plans configured."
        />
      </div>
    </div>
  );
}
