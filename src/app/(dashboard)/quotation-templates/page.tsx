import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import QuotationTemplateListClient, {
  SerializedQuotationTemplate,
} from "@/components/quotation-templates/QuotationTemplateListClient";
import {
  ModalPlanOption,
  ModalVariantOption,
} from "@/components/quotation-templates/QuotationTemplateModal";

export const metadata = {
  title: "Quotation Templates — Brightloop Subscriptions",
};

interface QuotationTemplatesPageProps {
  searchParams?: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function QuotationTemplatesPage({
  searchParams,
}: QuotationTemplatesPageProps) {
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

  const resolvedParams = searchParams ? await searchParams : {};
  const q = resolvedParams.q?.trim() || "";
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
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { plan: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  // Fetch paginated templates, total count, available plans, and available product variants in parallel
  const [templates, totalCount, plans, variants] = await Promise.all([
    prisma.quotationTemplate.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
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
    prisma.quotationTemplate.count({ where }),
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

  // Serialize templates for Client Component
  const serializedTemplates: SerializedQuotationTemplate[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    planId: t.planId,
    description: t.description,
    validityDays: t.validityDays,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    plan: {
      id: t.plan.id,
      name: t.plan.name,
      billingPeriod: t.plan.billingPeriod,
      pricePaise: t.plan.pricePaise,
    },
    lines: t.lines.map((l) => ({
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
  }));

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
    <QuotationTemplateListClient
      initialTemplates={serializedTemplates}
      totalCount={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      initialSearch={q}
      availablePlans={modalPlans}
      availableVariants={modalVariants}
      isAdmin={isAdmin}
      isStaff={isStaff}
    />
  );
}
