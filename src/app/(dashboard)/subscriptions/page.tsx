import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role, SubscriptionStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import SubscriptionListClient, {
  SerializedSubscription,
} from "@/components/subscriptions/SubscriptionListClient";
import { PERMITTED_SUBSCRIPTION_STATUSES } from "@/lib/validations/subscription";
import { calculateOrderTax } from "@/lib/tax";

export const metadata = {
  title: "Subscriptions — Brightloop Subscriptions",
};

interface SubscriptionsPageProps {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    planId?: string;
    customerId?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function SubscriptionsPage({
  searchParams,
}: SubscriptionsPageProps) {
  const session = await auth();

  // Strict role check: Customers cannot access internal subscriptions list
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

  const resolvedParams = searchParams ? await searchParams : {};
  const q = resolvedParams.q?.trim() || "";
  const statusParam = resolvedParams.status?.trim() || "ALL";
  const planIdParam = resolvedParams.planId?.trim() || "ALL";
  const customerIdParam = resolvedParams.customerId?.trim() || "ALL";

  const currentPage = Math.max(1, parseInt(resolvedParams.page || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(resolvedParams.pageSize || "10", 10) || 10)
  );
  const skip = (currentPage - 1) * pageSize;

  // Build database query
  const where: any = {};

  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
      { plan: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (
    statusParam !== "ALL" &&
    PERMITTED_SUBSCRIPTION_STATUSES.includes(statusParam as SubscriptionStatus)
  ) {
    where.status = statusParam as SubscriptionStatus;
  }

  if (planIdParam !== "ALL") {
    where.planId = planIdParam;
  }

  if (customerIdParam !== "ALL") {
    where.customerId = customerIdParam;
  }

  // Fetch subscriptions, count, status groups, plans, and customers in parallel
  const [subscriptions, totalCount, statusGroups, plans, customers] =
    await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          customer: {
            select: {
              id: true,
              companyName: true,
              gstin: true,
              gstState: true,
              gstStateCode: true,
            },
          },
          plan: {
            select: {
              id: true,
              name: true,
              billingPeriod: true,
            },
          },
          lines: {
            select: {
              quantity: true,
              unitPricePaise: true,
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.plan.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({
        select: { id: true, companyName: true },
        orderBy: { companyName: "asc" },
      }),
    ]);

  const statusCounts: Record<string, number> = {};
  for (const sg of statusGroups) {
    statusCounts[sg.status] = sg._count.id;
  }

  // Serialize subscriptions with tax & total calculations
  const serializedSubscriptions: SerializedSubscription[] = subscriptions.map(
    (s) => {
      const taxRes = calculateOrderTax(s.lines, s.customer.gstStateCode);
      return {
        id: s.id,
        number: s.number,
        customerId: s.customerId,
        planId: s.planId,
        billingPeriod: s.billingPeriod,
        paymentTerms: s.paymentTerms,
        isPausable: s.isPausable,
        isRenewable: s.isRenewable,
        isClosableEarly: s.isClosableEarly,
        autoClose: s.autoClose,
        status: s.status,
        isPaused: s.isPaused,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate ? s.endDate.toISOString() : null,
        quotationExpiryDate: s.quotationExpiryDate
          ? s.quotationExpiryDate.toISOString()
          : null,
        subtotalPaise: taxRes.subtotalPaise,
        taxPaise: taxRes.taxPaise,
        totalPaise: taxRes.totalPaise,
        customer: {
          id: s.customer.id,
          companyName: s.customer.companyName,
          gstin: s.customer.gstin,
          gstState: s.customer.gstState,
        },
        plan: {
          id: s.plan.id,
          name: s.plan.name,
          billingPeriod: s.plan.billingPeriod,
        },
      };
    }
  );

  return (
    <SubscriptionListClient
      initialSubscriptions={serializedSubscriptions}
      totalCount={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      initialSearch={q}
      initialStatus={statusParam}
      initialPlanId={planIdParam}
      initialCustomerId={customerIdParam}
      availablePlans={plans}
      availableCustomers={customers}
      statusCounts={statusCounts}
      isAdmin={isAdmin}
      isStaff={isStaff}
    />
  );
}
