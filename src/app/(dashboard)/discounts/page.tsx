import React from "react";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import DiscountsListClient from "@/components/discounts/DiscountsListClient";
import { DiscountItem, ProductOption } from "@/components/discounts/DiscountModal";

export const metadata = {
  title: "Discounts & Vouchers — Brightloop Subscriptions",
  description: "Promotional codes, customer retention rebates, and recurring contract discounts.",
};

export default async function DiscountsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role === Role.CUSTOMER) {
    redirect("/portal/subscriptions");
  }

  const [discountsData, productsData] = await Promise.all([
    prisma.discount.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const discounts: DiscountItem[] = discountsData.map((d) => ({
    id: d.id,
    code: d.code,
    description: d.description,
    discountType: d.discountType,
    scope: d.scope,
    value: d.value,
    minQuantity: d.minQuantity,
    minPurchasePaise: d.minPurchasePaise,
    productId: d.productId,
    maxUses: d.maxUses,
    usedCount: d.usedCount,
    startDate: d.startDate?.toISOString() || null,
    expiresAt: d.expiresAt?.toISOString() || null,
    isActive: d.isActive,
  }));

  const products: ProductOption[] = productsData.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <DiscountsListClient
      discounts={discounts}
      products={products}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
