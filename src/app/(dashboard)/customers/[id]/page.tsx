import React from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Role, SubscriptionStatus, InvoiceStatus } from "@prisma/client";
import CustomerDetailClient, {
  CustomerDetailData,
  DetailedSubscription,
  DetailedInvoice,
  DetailedPayment,
} from "@/components/customers/CustomerDetailClient";

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { companyName: true },
  });

  if (!customer) {
    return { title: "Customer Not Found — Brightloop" };
  }

  return {
    title: `${customer.companyName} — Customers — Brightloop`,
  };
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const session = await auth();

  // Strict role check
  if (!session?.user || (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)) {
    redirect(session?.user?.role === Role.CUSTOMER ? "/portal/subscriptions" : "/login");
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      },
      subscriptions: {
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
            select: {
              id: true,
              quantity: true,
              unitPricePaise: true,
            },
          },
          invoices: {
            include: {
              payments: {
                orderBy: { paidAt: "desc" },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) {
    notFound();
  }

  const detailedSubscriptions: DetailedSubscription[] = customer.subscriptions.map((s) => {
    const linesTotal = s.lines.reduce(
      (sum, line) => sum + line.unitPricePaise * line.quantity,
      0
    );
    const recurringSubtotalPaise = Math.max(0, linesTotal - (s.discountAmountPaise || 0));

    return {
      id: s.id,
      number: s.number,
      status: s.status,
      isPaused: s.isPaused,
      billingPeriod: s.billingPeriod,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate ? s.endDate.toISOString() : null,
      nextBillingDate: s.nextBillingDate ? s.nextBillingDate.toISOString() : null,
      discountAmountPaise: s.discountAmountPaise,
      plan: {
        id: s.plan.id,
        name: s.plan.name,
        billingPeriod: s.plan.billingPeriod,
        pricePaise: s.plan.pricePaise,
      },
      recurringSubtotalPaise,
    };
  });

  const now = new Date();
  const allInvoices = customer.subscriptions.flatMap((s) =>
    s.invoices.map((inv) => ({
      ...inv,
      subscriptionNumber: s.number,
    }))
  );

  const detailedInvoices: DetailedInvoice[] = allInvoices
    .filter((inv) => !inv.cancelledAt)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((inv) => {
      const balancePaise = Math.max(0, inv.totalPaise - inv.paidPaise);
      const isOverdue =
        inv.status !== InvoiceStatus.PAID && new Date(inv.dueDate) < now;
      const isPartiallyPaid =
        inv.paidPaise > 0 && inv.paidPaise < inv.totalPaise;

      return {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        billingPeriodStart: inv.billingPeriodStart.toISOString(),
        billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        subtotalPaise: inv.subtotalPaise,
        taxPaise: inv.taxPaise,
        totalPaise: inv.totalPaise,
        paidPaise: inv.paidPaise,
        balancePaise,
        isOverdue,
        isPartiallyPaid,
        subscriptionNumber: inv.subscriptionNumber,
      };
    });

  const detailedPayments: DetailedPayment[] = allInvoices
    .flatMap((inv) =>
      inv.payments.map((p) => ({
        id: p.id,
        amountPaise: p.amountPaise,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
        invoiceNumber: inv.number,
      }))
    )
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  const activeSubscriptions = customer.subscriptions.filter(
    (s) => s.status === SubscriptionStatus.ACTIVE
  ).length;

  const totalInvoicedPaise = detailedInvoices.reduce(
    (sum, inv) => sum + inv.totalPaise,
    0
  );

  const totalOutstandingPaise = detailedInvoices
    .filter((inv) => inv.status !== InvoiceStatus.PAID)
    .reduce((sum, inv) => sum + inv.balancePaise, 0);

  const detailData: CustomerDetailData = {
    id: customer.id,
    companyName: customer.companyName,
    gstin: customer.gstin,
    gstState: customer.gstState,
    gstStateCode: customer.gstStateCode,
    phone: customer.phone,
    billingAddress: customer.billingAddress,
    createdAt: customer.createdAt.toISOString(),
    user: {
      id: customer.user.id,
      name: customer.user.name,
      email: customer.user.email,
    },
    metrics: {
      activeSubscriptions,
      totalSubscriptions: customer.subscriptions.length,
      totalInvoicedPaise,
      totalOutstandingPaise,
    },
    subscriptions: detailedSubscriptions,
    invoices: detailedInvoices,
    payments: detailedPayments,
  };

  return (
    <CustomerDetailClient
      customer={detailData}
      isAdmin={session.user.role === Role.ADMIN}
    />
  );
}
