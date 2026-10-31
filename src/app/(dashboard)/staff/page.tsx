import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import DataTable, { Column } from "@/components/ui/DataTable";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Staff Management (Admin) — Brightloop Subscriptions",
};

export default async function StaffPage() {
  const session = await auth();
  if (session?.user?.role !== Role.ADMIN) {
    redirect("/dashboard");
  }

  const staffMembers = await prisma.user.findMany({
    where: {
      role: { in: [Role.ADMIN, Role.STAFF] },
    },
    orderBy: { createdAt: "asc" },
  });

  const columns: Column<(typeof staffMembers)[0]>[] = [
    {
      header: "Name",
      accessor: "name",
      className: "font-semibold text-on-surface",
    },
    {
      header: "Email",
      accessor: "email",
      className: "text-on-surface-variant font-mono text-xs",
    },
    {
      header: "Role",
      accessor: "role",
      cell: (u) => (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            u.role === Role.ADMIN
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-secondary-fixed text-on-secondary-fixed-variant"
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {u.role === Role.ADMIN ? "shield" : "badge"}
          </span>
          {u.role}
        </span>
      ),
    },
    {
      header: "Created At",
      accessor: (u) => u.createdAt.toLocaleDateString("en-IN"),
      className: "text-xs font-mono text-on-surface-variant",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & User Management"
        subtitle="Manage administrative operators, internal staff credentials, and role privileges (Admin Only)"
        breadcrumbs={[{ label: "Staff" }]}
      />

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
        <DataTable
          columns={columns}
          data={staffMembers}
          keyExtractor={(u) => u.id}
          emptyMessage="No staff members found."
        />
      </div>
    </div>
  );
}
