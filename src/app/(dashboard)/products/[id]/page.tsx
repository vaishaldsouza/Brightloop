import React from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";
import ProductDetailClient, {
  ProductDetailData,
  DetailVariant,
  DetailPlan,
} from "@/components/products/ProductDetailClient";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!product) {
    return { title: "Product Not Found — Brightloop" };
  }

  return {
    title: `${product.name} — Products — Brightloop`,
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const session = await auth();

  // Strict role check: Customers cannot view internal product details
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

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      plans: {
        select: {
          id: true,
          name: true,
          billingPeriod: true,
          pricePaise: true,
          isPausable: true,
          isRenewable: true,
        },
        orderBy: { createdAt: "desc" },
      },
      variants: {
        include: {
          _count: {
            select: {
              subscriptionLines: true,
              invoiceLines: true,
              quotationTemplateLines: true,
            },
          },
        },
        orderBy: { priceExtraPaise: "asc" },
      },
    },
  });

  if (!product) {
    notFound();
  }

  let totalReferencesCount = product.plans.length;

  const variants: DetailVariant[] = product.variants.map((v) => {
    const lineRefs =
      v._count.subscriptionLines +
      v._count.invoiceLines +
      v._count.quotationTemplateLines;
    totalReferencesCount += lineRefs;

    return {
      id: v.id,
      name: v.name,
      attributeName: v.attributeName,
      attributeValue: v.attributeValue,
      priceExtraPaise: v.priceExtraPaise,
      finalPricePaise: product.salesPricePaise + v.priceExtraPaise,
      subscriptionLinesCount: v._count.subscriptionLines,
      invoiceLinesCount: v._count.invoiceLines,
    };
  });

  const plans: DetailPlan[] = product.plans.map((p) => ({
    id: p.id,
    name: p.name,
    billingPeriod: p.billingPeriod,
    pricePaise: p.pricePaise,
    isPausable: p.isPausable,
    isRenewable: p.isRenewable,
  }));

  const productData: ProductDetailData = {
    id: product.id,
    name: product.name,
    type: product.type,
    description: product.description,
    notes: product.notes,
    salesPricePaise: product.salesPricePaise,
    costPricePaise: product.costPricePaise,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants,
    plans,
    totalReferencesCount,
  };

  return (
    <ProductDetailClient
      product={productData}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
