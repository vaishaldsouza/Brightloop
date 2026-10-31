import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import MoneyText from "@/components/ui/MoneyText";

export const metadata = {
  title: "Discounts & Vouchers (Admin) — Brightloop Subscriptions",
};

export default async function DiscountsPage() {
  const session = await auth();
  if (session?.user?.role !== Role.ADMIN) {
    redirect("/dashboard");
  }

  const discounts = await prisma.discount.findMany({
    orderBy: { createdAt: "desc" },
  });

  const columns: Column<(typeof discounts)[0]>[] = [
    {
      header: "Promo Code",
      accessor: "code",
      cell: (d) => (
        <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant">
          {d.code}
        </span>
      ),
    },
    {
      header: "Type",
      accessor: "discountType",
      className: "font-mono text-xs uppercase text-on-surface",
    },
    {
      header: "Value / Rate",
      accessor: "value",
      cell: (d) =>
        d.discountType === "PERCENTAGE" ? (
          <span className="font-semibold text-primary">{(d.value / 100).toFixed(0)}%</span>
        ) : (
          <MoneyText paise={d.value} className="font-semibold text-primary" />
        ),
    },
    {
      header: "Validity",
      accessor: "id",
      cell: (d) => (
        <span className="text-xs text-on-surface-variant font-mono">
          {d.startDate ? d.startDate.toLocaleDateString("en-IN") : "Immediate"} — {d.expiresAt ? d.expiresAt.toLocaleDateString("en-IN") : "Indefinite"}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: (d) => (d.isActive ? "Active" : "Disabled"),
      cell: (d) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            d.isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {d.isActive ? "Active" : "Disabled"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discounts & Vouchers"
        subtitle="Manage promotional discount codes, percentage vouchers, and fixed deductions (Admin Only)"
        breadcrumbs={[{ label: "Discounts" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={discounts}
          keyExtractor={(d) => d.id}
          emptyMessage="No discount codes configured."
        />
      </div>
    </div>
  );
}
