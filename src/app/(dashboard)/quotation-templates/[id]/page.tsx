import React from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";
import QuotationTemplateDetailClient from "@/components/quotation-templates/QuotationTemplateDetailClient";
import { SerializedQuotationTemplate } from "@/components/quotation-templates/QuotationTemplateListClient";
import {
  ModalPlanOption,
  ModalVariantOption,
} from "@/components/quotation-templates/QuotationTemplateModal";

interface QuotationTemplateDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: QuotationTemplateDetailPageProps) {
  const { id } = await params;
  const template = await prisma.quotationTemplate.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!template) {
    return { title: "Quotation Template Not Found — Brightloop" };
  }

  return {
    title: `${template.name} — Quotation Templates — Brightloop`,
  };
}

export default async function QuotationTemplateDetailPage({
  params,
}: QuotationTemplateDetailPageProps) {
  const { id } = await params;
  const session = await auth();

  // Strict role check: Customers cannot access internal quotation templates
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

  const [template, plans, variants] = await Promise.all([
    prisma.quotationTemplate.findUnique({
      where: { id },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            billingPeriod: true,
            pricePaise: true,
          },
        },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            productVariant: {
              select: {
                id: true,
                name: true,
                priceExtraPaise: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    salesPricePaise: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        pricePaise: true,
        billingPeriod: true,
      },
    }),
    prisma.productVariant.findMany({
      where: {
        isActive: true,
        product: { isActive: true },
      },
      orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        priceExtraPaise: true,
        product: {
          select: {
            name: true,
            salesPricePaise: true,
          },
        },
      },
    }),
  ]);

  if (!template) {
    notFound();
  }

  const serializedTemplate: SerializedQuotationTemplate = {
    id: template.id,
    name: template.name,
    planId: template.planId,
    description: template.description,
    validityDays: template.validityDays,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    plan: {
      id: template.plan.id,
      name: template.plan.name,
      billingPeriod: template.plan.billingPeriod,
      pricePaise: template.plan.pricePaise,
    },
    lines: template.lines.map((l) => ({
      id: l.id,
      productVariantId: l.productVariantId,
      description: l.description,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      sortOrder: l.sortOrder,
      productVariant: {
        id: l.productVariant.id,
        name: l.productVariant.name,
        product: {
          id: l.productVariant.product.name,
          name: l.productVariant.product.name,
        },
      },
    })),
  };

  const modalPlans: ModalPlanOption[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    pricePaise: p.pricePaise,
    billingPeriod: p.billingPeriod,
  }));

  const modalVariants: ModalVariantOption[] = variants.map((v) => ({
    id: v.id,
    name: v.name,
    productName: v.product.name,
    defaultPricePaise: v.product.salesPricePaise + v.priceExtraPaise,
  }));

  return (
    <QuotationTemplateDetailClient
      template={serializedTemplate}
      availablePlans={modalPlans}
      availableVariants={modalVariants}
      isAdmin={isAdmin}
      isStaff={isStaff}
    />
  );
}
