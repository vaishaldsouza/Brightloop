import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import NewSubscriptionFromTemplateClient, {
  TemplateOption,
  CustomerOption,
  ProductVariantOption,
} from "@/components/subscriptions/NewSubscriptionFromTemplateClient";

export const metadata = {
  title: "New Subscription from Template — Brightloop Subscriptions",
};

export default async function NewSubscriptionFromTemplatePage() {
  const session = await auth();

  // Strict role check: Customers cannot access internal subscription creation
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

  // Fetch active quotation templates, customers, and product variants in parallel
  const [templates, customers, variants] = await Promise.all([
    prisma.quotationTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
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
    prisma.customer.findMany({
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        companyName: true,
        gstin: true,
        gstState: true,
        gstStateCode: true,
        billingAddress: true,
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

  const templateOptions: TemplateOption[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    validityDays: t.validityDays,
    planId: t.planId,
    plan: {
      id: t.plan.id,
      name: t.plan.name,
      billingPeriod: t.plan.billingPeriod,
      pricePaise: t.plan.pricePaise,
      paymentTerms: t.plan.paymentTerms,
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
          id: l.productVariant.product.id,
          name: l.productVariant.product.name,
        },
      },
    })),
  }));

  const customerOptions: CustomerOption[] = customers.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    gstin: c.gstin,
    gstState: c.gstState,
    gstStateCode: c.gstStateCode,
    billingAddress: c.billingAddress,
  }));

  const variantOptions: ProductVariantOption[] = variants.map((v) => ({
    id: v.id,
    name: v.name,
    productName: v.product.name,
    defaultPricePaise: v.product.salesPricePaise + v.priceExtraPaise,
  }));

  return (
    <NewSubscriptionFromTemplateClient
      templates={templateOptions}
      customers={customerOptions}
      variants={variantOptions}
    />
  );
}
