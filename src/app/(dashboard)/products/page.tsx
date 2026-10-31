import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import ProductListClient, {
  SerializedProduct,
} from "@/components/products/ProductListClient";

export const metadata = {
  title: "Products & Variants — Brightloop Subscriptions",
};

export default async function ProductsPage() {
  const session = await auth();

  // Strict role check: Customers cannot access internal product catalog
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

  const products = await prisma.product.findMany({
    include: {
      variants: {
        orderBy: { priceExtraPaise: "asc" },
      },
      plans: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedProducts: SerializedProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    description: p.description,
    notes: p.notes,
    salesPricePaise: p.salesPricePaise,
    costPricePaise: p.costPricePaise,
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      attributeName: v.attributeName,
      attributeValue: v.attributeValue,
      priceExtraPaise: v.priceExtraPaise,
    })),
    plansCount: p.plans.length,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <ProductListClient
      initialProducts={serializedProducts}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
