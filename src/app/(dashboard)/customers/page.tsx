import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role, SubscriptionStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import CustomerListClient, {
  SerializedCustomer,
} from "@/components/customers/CustomerListClient";

export const metadata = {
  title: "Customers — Brightloop Subscriptions",
};

export default async function CustomersPage() {
  const session = await auth();

  // Strict role check: Customers cannot view internal customer management
  if (!session?.user || (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)) {
    redirect(session?.user?.role === Role.CUSTOMER ? "/portal/subscriptions" : "/login");
  }

  const customers = await prisma.customer.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscriptions: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedCustomers: SerializedCustomer[] = customers.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    gstin: c.gstin,
    gstState: c.gstState,
    gstStateCode: c.gstStateCode,
    phone: c.phone,
    billingAddress: c.billingAddress,
    createdAt: c.createdAt.toISOString(),
    user: {
      id: c.user.id,
      name: c.user.name,
      email: c.user.email,
    },
    activeSubscriptionsCount: c.subscriptions.filter(
      (s) => s.status === SubscriptionStatus.ACTIVE
    ).length,
    totalSubscriptionsCount: c.subscriptions.length,
  }));

  return (
    <CustomerListClient
      initialCustomers={serializedCustomers}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
