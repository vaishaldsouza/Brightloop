import React from "react";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import PortalSubscriptionsClient, {
  PortalSubscriptionItem,
} from "@/components/portal/PortalSubscriptionsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Subscriptions — Brightloop Customer Portal",
};

export default async function PortalSubscriptionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { customer: true },
  });

  if (!user) {
    redirect("/login");
  }

  const customerId = user.customer?.id;

  // Strict customer isolation: only query subscriptions belonging to this customer
  const dbSubs = customerId
    ? await prisma.subscription.findMany({
        where: { customerId },
        include: {
          plan: true,
          lines: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : user.role === Role.ADMIN || user.role === Role.STAFF
    ? await prisma.subscription.findMany({
        include: {
          plan: true,
          lines: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  const subscriptions: PortalSubscriptionItem[] = dbSubs.map((sub) => {
    const totalPaise = sub.lines.reduce(
      (sum, line) => sum + line.unitPricePaise * line.quantity,
      0
    );

    return {
      id: sub.id,
      number: sub.number,
      planName: sub.planName || sub.plan.name,
      billingPeriod: sub.billingPeriod,
      status: sub.status,
      isPaused: sub.isPaused,
      isPausable: sub.isPausable,
      isRenewable: sub.isRenewable,
      isClosableEarly: sub.isClosableEarly,
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate ? sub.endDate.toISOString() : null,
      nextBillingDate: sub.nextBillingDate ? sub.nextBillingDate.toISOString() : null,
      quotationExpiryDate: sub.quotationExpiryDate
        ? sub.quotationExpiryDate.toISOString()
        : null,
      totalPaise,
      itemCount: sub.lines.length,
    };
  });

  return <PortalSubscriptionsClient subscriptions={subscriptions} />;
}
