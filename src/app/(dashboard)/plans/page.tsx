import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role, BillingPeriod } from "@prisma/client";
import prisma from "@/lib/prisma";
import PlanListClient, {
  SerializedPlan,
} from "@/components/plans/PlanListClient";
import { PlanModalProductOption } from "@/components/plans/PlanModal";

export const metadata = {
  title: "Subscription Plans — Brightloop Subscriptions",
};

interface PlansPageProps {
  searchParams?: Promise<{
    q?: string;
    period?: string;
    availability?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const session = await auth();

  // Strict role check: Customers cannot access internal plans management
  // Staff Read-Only View: Staff has read-only access (creation and editing actions suppressed)
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

  const resolvedParams = searchParams ? await searchParams : {};
  const q = resolvedParams.q?.trim() || "";
  const period = resolvedParams.period?.trim() || "ALL";
  const availability = resolvedParams.availability?.trim() || "ALL";
  const currentPage = Math.max(1, parseInt(resolvedParams.page || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(resolvedParams.pageSize || "10", 10) || 10));
  const skip = (currentPage - 1) * pageSize;

  // Build database query
  const where: any = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { product: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (period !== "ALL" && Object.values(BillingPeriod).includes(period as BillingPeriod)) {
    where.billingPeriod = period as BillingPeriod;
  }

  if (availability !== "ALL") {
    const now = new Date();
    if (availability === "ACTIVE") {
      where.isActive = true;
      where.AND = [
        { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
        { OR: [{ availableTo: null }, { availableTo: { gte: now } }] },
      ];
    } else if (availability === "SCHEDULED") {
      where.isActive = true;
      where.availableFrom = { gt: now };
    } else if (availability === "EXPIRED") {
      where.availableTo = { lt: now };
    }
  }

  const [totalCount, plans, products] = await Promise.all([
    prisma.plan.count({ where }),
    prisma.plan.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            type: true,
            salesPricePaise: true,
          },
        },
        _count: {
          select: { subscriptions: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        salesPricePaise: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedPlans: SerializedPlan[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    pricePaise: p.pricePaise,
    billingPeriod: p.billingPeriod,
    paymentTerms: p.paymentTerms,
    minQuantity: p.minQuantity,
    availableFrom: p.availableFrom ? p.availableFrom.toISOString() : null,
    availableTo: p.availableTo ? p.availableTo.toISOString() : null,
    isActive: p.isActive,
    autoClose: p.autoClose,
    isClosableEarly: p.isClosableEarly,
    isPausable: p.isPausable,
    isRenewable: p.isRenewable,
    product: {
      id: p.product.id,
      name: p.product.name,
      type: p.product.type,
      salesPricePaise: p.product.salesPricePaise,
    },
    subscriptionsCount: p._count.subscriptions,
    createdAt: p.createdAt.toISOString(),
  }));

  const productOptions: PlanModalProductOption[] = products.map((prod) => ({
    id: prod.id,
    name: prod.name,
    type: prod.type,
    salesPricePaise: prod.salesPricePaise,
  }));

  return (
    <PlanListClient
      initialPlans={serializedPlans}
      totalCount={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      initialSearch={q}
      initialPeriod={period}
      initialAvailability={availability}
      availableProducts={productOptions}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
