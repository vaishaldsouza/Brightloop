import React from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Role, InvoiceStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import InvoiceDetailClient from "@/components/invoices/InvoiceDetailClient";

interface InvoiceDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params }: InvoiceDetailPageProps) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { number: true },
  });

  if (!invoice) return { title: "Invoice Not Found — Brightloop" };
  return { title: `${invoice.number} — Brightloop Invoices` };
}

export default async function InvoiceDetailPage({
  params,
}: InvoiceDetailPageProps) {
  const session = await auth();

  // Strict RBAC: Customers cannot access internal invoice route
  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    redirect(
      session?.user?.role === Role.CUSTOMER
        ? `/portal/invoices`
        : "/login"
    );
  }

  const isAdmin = session.user.role === Role.ADMIN;
  const isStaff = session.user.role === Role.STAFF;

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          customer: {
            include: { user: true },
          },
          plan: true,
        },
      },
      lines: {
        include: {
          productVariant: {
            include: { product: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      taxes: true,
      payments: {
        orderBy: { paidAt: "desc" },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  // Fetch relevant audit logs for this invoice
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "Invoice",
      entityId: invoice.id,
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isCancelled = Boolean(invoice.cancelledAt);
  const duePaise = Math.max(0, invoice.totalPaise - invoice.paidPaise);
  const isOverdue =
    invoice.status === InvoiceStatus.CONFIRMED &&
    invoice.dueDate < today &&
    duePaise > 0 &&
    !isCancelled;
  const isPartiallyPaid =
    invoice.paidPaise > 0 && invoice.paidPaise < invoice.totalPaise && !isCancelled;

  const serializedInvoice = {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    billingPeriodStart: invoice.billingPeriodStart.toISOString(),
    billingPeriodEnd: invoice.billingPeriodEnd.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    subtotalPaise: invoice.subtotalPaise,
    discountPaise: invoice.discountPaise,
    taxPaise: invoice.taxPaise,
    totalPaise: invoice.totalPaise,
    paidPaise: invoice.paidPaise,
    notes: invoice.notes,
    sentAt: invoice.sentAt ? invoice.sentAt.toISOString() : null,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    cancelledAt: invoice.cancelledAt ? invoice.cancelledAt.toISOString() : null,
    duePaise,
    isOverdue,
    isPartiallyPaid,
    isCancelled,
    subscription: {
      id: invoice.subscription.id,
      number: invoice.subscription.number,
      billingPeriod: invoice.subscription.billingPeriod,
      paymentTerms: invoice.subscription.paymentTerms,
      planName: invoice.subscription.planName || invoice.subscription.plan.name,
      customerGstStateCode: invoice.subscription.customerGstStateCode,
      customer: {
        id: invoice.subscription.customer.id,
        companyName: invoice.subscription.customer.companyName,
        contactName: invoice.subscription.customer.user.name,
        billingEmail: invoice.subscription.customer.user.email,
        phone: invoice.subscription.customer.phone,
        gstin: invoice.subscription.customer.gstin,
        gstStateCode: invoice.subscription.customer.gstStateCode,
        billingAddress: invoice.subscription.customer.billingAddress,
      },
    },
    lines: invoice.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      subtotalPaise: l.subtotalPaise,
      productVariant: {
        id: l.productVariant.id,
        variantName: l.productVariant.name,
        product: {
          name: l.productVariant.product.name,
        },
      },
    })),
    taxes: invoice.taxes.map((t) => ({
      id: t.id,
      taxName: t.taxName,
      taxType: t.taxType,
      rateBps: t.rateBps,
      amountPaise: t.amountPaise,
    })),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amountPaise: p.amountPaise,
      paymentMethod: p.paymentMethod,
      paidAt: p.paidAt.toISOString(),
      reference: p.reference,
      notes: p.notes,
    })),
    auditLogs: auditLogs.map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.createdAt.toISOString(),
      user: a.user,
      meta: a.meta,
    })),
  };

  return (
    <InvoiceDetailClient
      invoice={serializedInvoice}
      isAdmin={isAdmin}
      isStaff={isStaff}
    />
  );
}
