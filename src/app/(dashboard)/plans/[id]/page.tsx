import React from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Role, SubscriptionStatus } from "@prisma/client";
import PlanDetailClient, {
  PlanDetailData,
} from "@/components/plans/PlanDetailClient";
import { PlanModalProductOption } from "@/components/plans/PlanModal";

interface PlanDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PlanDetailPageProps) {
  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!plan) {
    return { title: "Plan Not Found — Brightloop" };
  }

  return {
    title: `${plan.name} — Subscription Plans — Brightloop`,
  };
}

export default async function PlanDetailPage({ params }: PlanDetailPageProps) {
  const { id } = await params;
  const session = await auth();

  // Strict role check: Customers cannot access internal plans
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

  const [plan, products] = await Promise.all([
    prisma.plan.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            variants: { select: { id: true } },
          },
        },
        subscriptions: {
          select: { id: true, status: true },
        },
        quotationTemplates: {
          select: { id: true },
        },
      },
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

  if (!plan) {
    notFound();
  }

  const activeSubsCount = plan.subscriptions.filter(
    (s) => s.status === SubscriptionStatus.ACTIVE
  ).length;

  const planDetail: PlanDetailData = {
    id: plan.id,
    productId: plan.productId,
    name: plan.name,
    description: plan.description,
    pricePaise: plan.pricePaise,
    billingPeriod: plan.billingPeriod,
    paymentTerms: plan.paymentTerms,
    minQuantity: plan.minQuantity,
    availableFrom: plan.availableFrom ? plan.availableFrom.toISOString() : null,
    availableTo: plan.availableTo ? plan.availableTo.toISOString() : null,
    isActive: plan.isActive,
    autoClose: plan.autoClose,
    isClosableEarly: plan.isClosableEarly,
    isPausable: plan.isPausable,
    isRenewable: plan.isRenewable,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    product: {
      id: plan.product.id,
      name: plan.product.name,
      type: plan.product.type,
      salesPricePaise: plan.product.salesPricePaise,
      description: plan.product.description,
      variantsCount: plan.product.variants.length,
    },
    subscriptionsCount: plan.subscriptions.length,
    activeSubscriptionsCount: activeSubsCount,
    quotationTemplatesCount: plan.quotationTemplates.length,
  };

  const productOptions: PlanModalProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    salesPricePaise: p.salesPricePaise,
  }));

  return (
    <PlanDetailClient
      plan={planDetail}
      availableProducts={productOptions}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
