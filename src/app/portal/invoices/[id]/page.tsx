import React from "react";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Role, InvoiceStatus } from "@prisma/client";
import PortalInvoiceDetailClient from "@/components/portal/PortalInvoiceDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PortalInvoiceDetailPage(props: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await props.params;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { customer: true },
  });

  if (!user) {
    redirect("/login");
  }

  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          customer: true,
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

  if (!inv) {
    notFound();
  }

  // Strict customer isolation check
  if (user.role === Role.CUSTOMER && inv.subscription.customerId !== user.customer?.id) {
    notFound();
  }

  const now = new Date();
  const duePaise = Math.max(0, inv.totalPaise - inv.paidPaise);
  const isOverdue =
    inv.status === InvoiceStatus.CONFIRMED &&
    !inv.cancelledAt &&
    new Date(inv.dueDate) < now &&
    duePaise > 0;
  const isPartiallyPaid = inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise;

  return (
    <PortalInvoiceDetailClient
      invoice={{
        id: inv.id,
        number: inv.number,
        status: inv.status,
        isOverdue,
        isPartiallyPaid,
        createdAt: inv.createdAt.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        billingPeriodStart: inv.billingPeriodStart.toISOString(),
        billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
        subtotalPaise: inv.subtotalPaise,
        discountPaise: inv.discountPaise,
        taxPaise: inv.taxPaise,
        totalPaise: inv.totalPaise,
        paidPaise: inv.paidPaise,
        duePaise,
        notes: inv.notes,
        subscription: {
          id: inv.subscription.id,
          number: inv.subscription.number,
          planName: inv.subscription.planName || inv.subscription.plan.name,
          paymentTerms: inv.subscription.paymentTerms.replace(/_/g, " "),
        },
        customer: {
          id: inv.subscription.customer.id,
          companyName: inv.subscription.customer.companyName,
          gstin: inv.subscription.customer.gstin,
          gstState: inv.subscription.customer.gstState,
          gstStateCode: inv.subscription.customer.gstStateCode,
          billingAddress: inv.subscription.customer.billingAddress,
          phone: inv.subscription.customer.phone,
        },
        lines: inv.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          unitPricePaise: l.unitPricePaise,
          subtotalPaise: l.subtotalPaise,
          productName: l.productVariant.product.name,
          variantName: l.productVariant.name,
        })),
        taxes: inv.taxes.map((t) => ({
          id: t.id,
          taxName: t.taxName,
          rateBps: t.rateBps,
          amountPaise: t.amountPaise,
        })),
        payments: inv.payments.map((p) => ({
          id: p.id,
          amountPaise: p.amountPaise,
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          notes: p.notes,
          paidAt: p.paidAt.toISOString(),
        })),
      }}
    />
  );
}
