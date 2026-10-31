import React from "react";
import prisma from "@/lib/prisma";
import DashboardClientView, {
  DashboardSubscription,
  DashboardInvoice,
  DashboardPayment,
  PlanOption,
  CustomerOption,
} from "./DashboardClientView";

export const metadata = {
  title: "Dashboard — Brightloop Subscriptions",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [dbSubscriptions, dbInvoices, dbPayments, dbPlans, dbCustomers] =
    await Promise.all([
      prisma.subscription.findMany({
        include: {
          customer: { select: { id: true, companyName: true } },
          plan: { select: { id: true, name: true } },
          lines: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.findMany({
        include: {
          subscription: {
            include: {
              customer: { select: { id: true, companyName: true } },
              plan: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({
        include: {
          invoice: {
            include: {
              subscription: {
                select: {
                  customerId: true,
                  planId: true,
                },
              },
            },
          },
        },
        orderBy: { paidAt: "desc" },
      }),
      prisma.plan.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({
        select: { id: true, companyName: true },
        orderBy: { companyName: "asc" },
      }),
    ]);

  const initialSubscriptions: DashboardSubscription[] = dbSubscriptions.map(
    (sub) => ({
      id: sub.id,
      number: sub.number,
      status: sub.status,
      isPaused: sub.isPaused,
      startDate: sub.startDate.toISOString(),
      nextBillingDate: sub.nextBillingDate ? sub.nextBillingDate.toISOString() : null,
      billingPeriod: sub.billingPeriod,
      subtotalPaise: sub.lines.reduce(
        (sum, l) => sum + l.unitPricePaise * l.quantity,
        0
      ),
      planId: sub.planId,
      planName: sub.plan.name,
      customerId: sub.customerId,
      customerName: sub.customer.companyName,
    })
  );

  const initialInvoices: DashboardInvoice[] = dbInvoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    dueDate: inv.dueDate.toISOString(),
    billingPeriodStart: inv.billingPeriodStart.toISOString(),
    subtotalPaise: inv.subtotalPaise,
    taxPaise: inv.taxPaise,
    totalPaise: inv.totalPaise,
    paidPaise: inv.paidPaise,
    cancelledAt: inv.cancelledAt ? inv.cancelledAt.toISOString() : null,
    subscriptionId: inv.subscriptionId,
    subscriptionNumber: inv.subscription.number,
    subscriptionStatus: inv.subscription.status,
    billingPeriod: inv.subscription.billingPeriod,
    planId: inv.subscription.planId,
    planName: inv.subscription.plan.name,
    customerId: inv.subscription.customerId,
    customerName: inv.subscription.customer.companyName,
  }));

  const initialPayments: DashboardPayment[] = dbPayments.map((p) => ({
    id: p.id,
    amountPaise: p.amountPaise,
    paidAt: p.paidAt.toISOString(),
    paymentMethod: p.paymentMethod,
    invoiceId: p.invoiceId,
    customerId: p.invoice.subscription.customerId,
    planId: p.invoice.subscription.planId,
  }));

  const plans: PlanOption[] = dbPlans.map((pl) => ({
    id: pl.id,
    name: pl.name,
  }));

  const customers: CustomerOption[] = dbCustomers.map((c) => ({
    id: c.id,
    companyName: c.companyName,
  }));

  return (
    <DashboardClientView
      initialSubscriptions={initialSubscriptions}
      initialInvoices={initialInvoices}
      initialPayments={initialPayments}
      plans={plans}
      customers={customers}
    />
  );
}
