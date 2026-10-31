import React from "react";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role, InvoiceStatus } from "@prisma/client";
import PortalInvoicesClient, {
  PortalInvoiceRow,
} from "@/components/portal/PortalInvoicesClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Invoices — Brightloop Customer Portal",
};

export default async function PortalInvoicesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { customer: true },
  });

  if (!user) {
    redirect("/login");
  }

  const customerId = user.customer?.id;

  const dbInvoices = customerId
    ? await prisma.invoice.findMany({
        where: {
          subscription: { customerId },
        },
        include: {
          subscription: {
            include: { plan: true },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : user.role === Role.ADMIN || user.role === Role.STAFF
    ? await prisma.invoice.findMany({
        include: {
          subscription: {
            include: { plan: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : [];

  const now = new Date();

  let totalOutstandingPaise = 0;

  const invoices: PortalInvoiceRow[] = dbInvoices.map((inv) => {
    const duePaise = Math.max(0, inv.totalPaise - inv.paidPaise);
    const dueDate = new Date(inv.dueDate);
    const isOverdue =
      inv.status === InvoiceStatus.CONFIRMED &&
      !inv.cancelledAt &&
      dueDate < now &&
      duePaise > 0;
    const isPartiallyPaid = inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise;

    if (inv.status === InvoiceStatus.CONFIRMED && !inv.cancelledAt) {
      totalOutstandingPaise += duePaise;
    }

    return {
      id: inv.id,
      number: inv.number,
      subscriptionNumber: inv.subscription.number,
      planName: inv.subscription.planName || inv.subscription.plan.name,
      createdAt: inv.createdAt.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      totalPaise: inv.totalPaise,
      paidPaise: inv.paidPaise,
      duePaise,
      status: inv.status,
      isOverdue,
      isPartiallyPaid,
    };
  });

  return (
    <PortalInvoicesClient
      invoices={invoices}
      totalOutstandingPaise={totalOutstandingPaise}
    />
  );
}
