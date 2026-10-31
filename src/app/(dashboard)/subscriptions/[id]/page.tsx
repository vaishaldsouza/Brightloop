import React from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";
import SubscriptionDetailClient, {
  SubscriptionDetailData,
} from "@/components/subscriptions/SubscriptionDetailClient";

interface SubscriptionDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: SubscriptionDetailPageProps) {
  const { id } = await params;
  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: { number: true, customer: { select: { companyName: true } } },
  });

  if (!sub) {
    return { title: "Subscription Not Found — Brightloop" };
  }

  return {
    title: `${sub.number} — ${sub.customer.companyName} — Brightloop`,
  };
}

export default async function SubscriptionDetailPage({
  params,
}: SubscriptionDetailPageProps) {
  const { id } = await params;
  const session = await auth();

  // Strict role check: Customers cannot access internal subscription detail
  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    redirect(
      session?.user?.role === Role.CUSTOMER
        ? "/portal/subscriptions"
        : "/login"
    );
  }

  const isAdmin = session.user.role === Role.ADMIN;
  const isStaff = session.user.role === Role.STAFF;

  const [sub, auditLogs] = await Promise.all([
    prisma.subscription.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: true,
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            productVariant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        entityType: "Subscription",
        entityId: id,
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
  ]);

  if (!sub) {
    notFound();
  }

  const serializedSubscription: SubscriptionDetailData = {
    id: sub.id,
    number: sub.number,
    customerId: sub.customerId,
    planId: sub.planId,
    billingPeriod: sub.billingPeriod,
    paymentTerms: sub.paymentTerms,
    isPausable: sub.isPausable,
    isRenewable: sub.isRenewable,
    isClosableEarly: sub.isClosableEarly,
    autoClose: sub.autoClose,
    status: sub.status,
    isPaused: sub.isPaused,
    pausedAt: sub.pausedAt ? sub.pausedAt.toISOString() : null,
    startDate: sub.startDate.toISOString(),
    endDate: sub.endDate ? sub.endDate.toISOString() : null,
    nextBillingDate: sub.nextBillingDate
      ? sub.nextBillingDate.toISOString()
      : null,
    quotationExpiryDate: sub.quotationExpiryDate
      ? sub.quotationExpiryDate.toISOString()
      : null,
    closedAt: sub.closedAt ? sub.closedAt.toISOString() : null,
    notes: sub.notes,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
    customer: {
      id: sub.customer.id,
      companyName: sub.customer.companyName,
      gstin: sub.customer.gstin,
      gstState: sub.customer.gstState,
      gstStateCode: sub.customer.gstStateCode,
      billingAddress: sub.customer.billingAddress,
      phone: sub.customer.phone,
    },
    plan: {
      id: sub.plan.id,
      name: sub.plan.name,
      billingPeriod: sub.plan.billingPeriod,
      pricePaise: sub.plan.pricePaise,
    },
    lines: sub.lines.map((l) => ({
      id: l.id,
      productVariantId: l.productVariantId,
      description: l.description,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      sortOrder: l.sortOrder,
      taxRateBps: l.taxRateBps,
      taxAmountPaise: l.taxAmountPaise,
      productVariant: {
        id: l.productVariant.id,
        name: l.productVariant.name,
        product: {
          id: l.productVariant.product.id,
          name: l.productVariant.product.name,
        },
      },
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      user: log.user,
      meta: log.meta,
    })),
  };

  return (
    <SubscriptionDetailClient
      subscription={serializedSubscription}
      isAdmin={isAdmin}
      isStaff={isStaff}
    />
  );
}
