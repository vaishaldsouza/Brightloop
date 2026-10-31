import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role, InvoiceStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import InvoiceListClient, {
  SerializedInvoice,
} from "@/components/invoices/InvoiceListClient";

export const metadata = {
  title: "Invoices — Brightloop Subscriptions",
};

interface InvoicesPageProps {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    customerId?: string;
    includeCancelled?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const session = await auth();

  // Strict RBAC: Customers cannot access internal invoices list
  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    redirect(
      session?.user?.role === Role.CUSTOMER
        ? "/portal/invoices"
        : "/login"
    );
  }

  const isAdmin = session.user.role === Role.ADMIN;
  const isStaff = session.user.role === Role.STAFF;

  const resolvedParams = searchParams ? await searchParams : {};
  const q = resolvedParams.q?.trim() || "";
  const statusParam = resolvedParams.status?.trim() || "ALL";
  const customerIdParam = resolvedParams.customerId?.trim() || "ALL";
  const includeCancelled = resolvedParams.includeCancelled === "true";

  const currentPage = Math.max(1, parseInt(resolvedParams.page || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(resolvedParams.pageSize || "10", 10) || 10)
  );
  const skip = (currentPage - 1) * pageSize;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build Prisma where clause
  const where: any = {};

  // By default, exclude cancelled invoices (PRD §4.6 & §2)
  if (!includeCancelled) {
    where.cancelledAt = null;
  }

  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { subscription: { number: { contains: q, mode: "insensitive" } } },
      {
        subscription: {
          customer: { companyName: { contains: q, mode: "insensitive" } },
        },
      },
    ];
  }

  if (customerIdParam !== "ALL") {
    where.subscription = {
      ...where.subscription,
      customerId: customerIdParam,
    };
  }

  // Handle status filter and derived tags
  if (statusParam === "DRAFT") {
    where.status = InvoiceStatus.DRAFT;
  } else if (statusParam === "CONFIRMED") {
    where.status = InvoiceStatus.CONFIRMED;
  } else if (statusParam === "PAID") {
    where.status = InvoiceStatus.PAID;
  } else if (statusParam === "OVERDUE") {
    where.status = InvoiceStatus.CONFIRMED;
    where.dueDate = { lt: today };
  }

  // Execute queries in parallel
  const [invoices, totalCount, activeInvoicesForCounts, customers] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        subscription: {
          include: {
            customer: {
              select: {
                id: true,
                companyName: true,
                gstStateCode: true,
                gstin: true,
              },
            },
            plan: { select: { id: true, name: true, billingPeriod: true } },
          },
        },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where: { cancelledAt: null },
      select: {
        id: true,
        status: true,
        dueDate: true,
        totalPaise: true,
        paidPaise: true,
      },
    }),
    prisma.customer.findMany({
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    }),
  ]);

  // Compute status counts for active invoices
  const statusCounts = {
    ALL: activeInvoicesForCounts.length,
    DRAFT: 0,
    CONFIRMED: 0,
    PAID: 0,
    OVERDUE: 0,
    PARTIALLY_PAID: 0,
  };

  for (const inv of activeInvoicesForCounts) {
    if (inv.status === InvoiceStatus.DRAFT) statusCounts.DRAFT++;
    if (inv.status === InvoiceStatus.CONFIRMED) statusCounts.CONFIRMED++;
    if (inv.status === InvoiceStatus.PAID) statusCounts.PAID++;

    const isOverdue =
      inv.status === InvoiceStatus.CONFIRMED &&
      inv.dueDate < today &&
      inv.totalPaise - inv.paidPaise > 0;
    if (isOverdue) statusCounts.OVERDUE++;

    const isPartiallyPaid =
      inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise;
    if (isPartiallyPaid) statusCounts.PARTIALLY_PAID++;
  }

  // Serialize invoices for client
  const serializedInvoices: SerializedInvoice[] = invoices.map((inv) => {
    const isCancelled = Boolean(inv.cancelledAt);
    const duePaise = Math.max(0, inv.totalPaise - inv.paidPaise);
    const isOverdue =
      inv.status === InvoiceStatus.CONFIRMED &&
      inv.dueDate < today &&
      duePaise > 0 &&
      !isCancelled;
    const isPartiallyPaid =
      inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise && !isCancelled;

    return {
      id: inv.id,
      number: inv.number,
      subscriptionId: inv.subscriptionId,
      status: inv.status,
      billingPeriodStart: inv.billingPeriodStart.toISOString(),
      billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      subtotalPaise: inv.subtotalPaise,
      discountPaise: inv.discountPaise,
      taxPaise: inv.taxPaise,
      totalPaise: inv.totalPaise,
      paidPaise: inv.paidPaise,
      duePaise,
      isOverdue,
      isPartiallyPaid,
      isCancelled,
      cancelledAt: inv.cancelledAt ? inv.cancelledAt.toISOString() : null,
      subscription: {
        id: inv.subscription.id,
        number: inv.subscription.number,
        billingPeriod: inv.subscription.billingPeriod,
        planName: inv.subscription.planName || inv.subscription.plan.name,
        customer: {
          id: inv.subscription.customer.id,
          companyName: inv.subscription.customer.companyName,
          gstStateCode: inv.subscription.customer.gstStateCode,
          gstin: inv.subscription.customer.gstin,
        },
      },
    };
  });

  return (
    <InvoiceListClient
      initialInvoices={serializedInvoices}
      totalCount={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      initialSearch={q}
      initialStatus={statusParam}
      initialCustomerId={customerIdParam}
      initialIncludeCancelled={includeCancelled}
      availableCustomers={customers}
      statusCounts={statusCounts}
      isAdmin={isAdmin}
      isStaff={isStaff}
    />
  );
}
