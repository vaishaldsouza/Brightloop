import React from "react";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Role, InvoiceStatus } from "@prisma/client";
import { calculateOrderTax } from "@/lib/tax";
import PortalSubscriptionDetailClient from "@/components/portal/PortalSubscriptionDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PortalSubscriptionDetailPage(props: Props) {
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

  const sub = await prisma.subscription.findUnique({
    where: { id },
    include: {
      customer: true,
      plan: true,
      lines: {
        include: {
          productVariant: {
            include: { product: true },
          },
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!sub) {
    notFound();
  }

  // Strict customer isolation check
  if (user.role === Role.CUSTOMER && sub.customerId !== user.customer?.id) {
    notFound();
  }

  const now = new Date();

  // Calculate order lines and taxes using project tax engine
  const orderLines = sub.lines.map((line) => ({
    productVariantId: line.productVariantId,
    quantity: line.quantity,
    unitPricePaise: line.unitPricePaise,
  }));

  const customerState = sub.customerGstStateCode || sub.customer.gstStateCode || "27";
  const taxCalculation = calculateOrderTax(orderLines, customerState);

  const subtotalPaise = taxCalculation.subtotalPaise;
  const cgstPaise = taxCalculation.cgstPaise;
  const sgstPaise = taxCalculation.sgstPaise;
  const igstPaise = taxCalculation.igstPaise;
  const totalPaise = taxCalculation.totalPaise;

  const linesWithData = sub.lines.map((line) => {
    return {
      id: line.id,
      productName: line.productName || line.productVariant.product.name,
      variantName: line.variantName || line.productVariant.name,
      description: line.description,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      subtotalPaise: line.unitPricePaise * line.quantity,
      taxRatePercent: 18,
    };
  });

  const invoicesWithData = sub.invoices.map((inv) => {
    const isOverdue =
      inv.status === InvoiceStatus.CONFIRMED &&
      !inv.cancelledAt &&
      new Date(inv.dueDate) < now &&
      inv.totalPaise > inv.paidPaise;

    return {
      id: inv.id,
      number: inv.number,
      createdAt: inv.createdAt.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      totalPaise: inv.totalPaise,
      paidPaise: inv.paidPaise,
      status: inv.status,
      isOverdue,
    };
  });

  return (
    <PortalSubscriptionDetailClient
      subscription={{
        id: sub.id,
        number: sub.number,
        planName: sub.planName || sub.plan.name,
        billingPeriod: sub.billingPeriod,
        paymentTerms: sub.paymentTerms.replace(/_/g, " "),
        customerGstState: sub.customer.gstState || "Maharashtra",
        customerGstStateCode: customerState,
        customerCompanyName: sub.customer.companyName,
        status: sub.status,
        isPaused: sub.isPaused,
        isPausable: sub.isPausable,
        isRenewable: sub.isRenewable,
        isClosableEarly: sub.isClosableEarly,
        startDate: sub.startDate.toISOString(),
        endDate: sub.endDate ? sub.endDate.toISOString() : null,
        nextBillingDate: sub.nextBillingDate ? sub.nextBillingDate.toISOString() : null,
        closedAt: sub.closedAt ? sub.closedAt.toISOString() : null,
        subtotalPaise,
        cgstPaise,
        sgstPaise,
        igstPaise,
        totalPaise,
        lines: linesWithData,
        invoices: invoicesWithData,
      }}
    />
  );
}
