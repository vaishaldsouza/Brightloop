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

interface ProductsPageProps {
  searchParams?: Promise<{
    q?: string;
    type?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
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

  const resolvedParams = searchParams ? await searchParams : {};
  const q = resolvedParams.q?.trim() || "";
  const type = resolvedParams.type?.trim() || "ALL";
  const currentPage = Math.max(1, parseInt(resolvedParams.page || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(resolvedParams.pageSize || "10", 10) || 10));
  const skip = (currentPage - 1) * pageSize;

  // Server-side filtering across the entire product database
  const where: any = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { type: { contains: q, mode: "insensitive" } },
      { variants: { some: { name: { contains: q, mode: "insensitive" } } } },
      { variants: { some: { attributeValue: { contains: q, mode: "insensitive" } } } },
    ];
  }

  if (type !== "ALL") {
    where.type = type;
  }

  // Server-side pagination query: does not load the complete catalogue unnecessarily
  const [totalCount, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        variants: {
          orderBy: { priceExtraPaise: "asc" },
        },
        plans: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

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
      totalCount={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      initialSearch={q}
      initialType={type}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
