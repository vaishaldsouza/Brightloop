import React from "react";
import prisma from "@/lib/prisma";
import { InvoiceStatus, SubscriptionStatus } from "@prisma/client";
import ReportsClient, {
  ReportPaymentItem,
  ReportInvoiceItem,
  ReportSubscriptionItem,
  ReportCustomerSummary,
} from "@/components/reports/ReportsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reports & Financial Analytics — Brightloop",
};

export default async function ReportsPage() {
  const now = new Date();

  const [dbPayments, dbInvoices, dbSubscriptions, dbCustomers] = await Promise.all([
    prisma.payment.findMany({
      include: {
        invoice: {
          include: {
            subscription: {
              include: { customer: true },
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.invoice.findMany({
      include: {
        subscription: {
          include: { customer: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscription.findMany({
      include: {
        customer: true,
        plan: true,
        lines: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({
      include: {
        subscriptions: {
          include: {
            invoices: true,
          },
        },
      },
      orderBy: { companyName: "asc" },
    }),
  ]);

  const payments: ReportPaymentItem[] = dbPayments.map((p) => ({
    id: p.id,
    amountPaise: p.amountPaise,
    paymentMethod: p.paymentMethod,
    paidAt: p.paidAt.toISOString(),
    reference: p.reference,
    customerName: p.invoice.subscription.customer.companyName,
    invoiceNumber: p.invoice.number,
  }));

  const invoices: ReportInvoiceItem[] = dbInvoices.map((inv) => {
    const duePaise = Math.max(0, inv.totalPaise - inv.paidPaise);
    const dueDate = new Date(inv.dueDate);
    const isOverdue =
      inv.status === InvoiceStatus.CONFIRMED &&
      !inv.cancelledAt &&
      dueDate < now &&
      duePaise > 0;
    const overdueDays = isOverdue
      ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      id: inv.id,
      number: inv.number,
      customerName: inv.subscription.customer.companyName,
      customerState: inv.subscription.customer.gstState,
      status: inv.status,
      dueDate: inv.dueDate.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      cancelledAt: inv.cancelledAt ? inv.cancelledAt.toISOString() : null,
      totalPaise: inv.totalPaise,
      paidPaise: inv.paidPaise,
      duePaise,
      isOverdue,
      overdueDays,
    };
  });

  const subscriptions: ReportSubscriptionItem[] = dbSubscriptions.map((sub) => {
    const totalPaise = sub.lines.reduce(
      (acc, l) => acc + l.unitPricePaise * l.quantity,
      0
    );

    return {
      id: sub.id,
      number: sub.number,
      customerName: sub.customer.companyName,
      planName: sub.plan.name,
      billingPeriod: sub.billingPeriod,
      status: sub.status,
      isPaused: sub.isPaused,
      startDate: sub.startDate.toISOString(),
      nextBillingDate: sub.nextBillingDate ? sub.nextBillingDate.toISOString() : null,
      totalPaise,
    };
  });

  const customers: ReportCustomerSummary[] = dbCustomers.map((c) => {
    const activeSubs = c.subscriptions.filter(
      (s) => s.status === SubscriptionStatus.ACTIVE
    );
    const allCustInvoices = c.subscriptions.flatMap((s) => s.invoices);

    const totalInvoicedPaise = allCustInvoices
      .filter((i) => !i.cancelledAt)
      .reduce((sum, i) => sum + i.totalPaise, 0);

    const totalPaidPaise = allCustInvoices.reduce(
      (sum, i) => sum + i.paidPaise,
      0
    );

    const outstandingPaise = allCustInvoices
      .filter((i) => i.status === InvoiceStatus.CONFIRMED && !i.cancelledAt)
      .reduce((sum, i) => sum + Math.max(0, i.totalPaise - i.paidPaise), 0);

    return {
      id: c.id,
      companyName: c.companyName,
      gstin: c.gstin,
      state: c.gstState,
      activeSubscriptionsCount: activeSubs.length,
      totalInvoicedPaise,
      totalPaidPaise,
      outstandingPaise,
    };
  });

  return (
    <ReportsClient
      payments={payments}
      invoices={invoices}
      subscriptions={subscriptions}
      customers={customers}
    />
  );
}
