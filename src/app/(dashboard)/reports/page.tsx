import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import MoneyText from "@/components/ui/MoneyText";
import KpiCard from "@/components/ui/KpiCard";
import { InvoiceStatus, SubscriptionStatus } from "@prisma/client";

export const metadata = {
  title: "Reports — Brightloop Subscriptions",
};

export default async function ReportsPage() {
  const [activeSubs, allInvoices, allPayments] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE },
      include: { plan: true, lines: true },
    }),
    prisma.invoice.findMany({
      include: { subscription: true },
    }),
    prisma.payment.findMany(),
  ]);

  const totalCollectedPaise = allPayments.reduce(
    (sum, p) => sum + p.amountPaise,
    0
  );

  const totalInvoicedPaise = allInvoices
    .filter((i) => !i.cancelledAt)
    .reduce((sum, i) => sum + i.totalPaise, 0);

  const outstandingPaise = allInvoices
    .filter((i) => i.status === InvoiceStatus.CONFIRMED && !i.cancelledAt)
    .reduce((sum, i) => sum + (i.totalPaise - i.paidPaise), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial & Subscription Reports"
        subtitle="Aggregate accounting reports and portfolio revenue analytics"
        breadcrumbs={[{ label: "Reports" }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <KpiCard
          title="Total Collections"
          value={<MoneyText paise={totalCollectedPaise} />}
          icon="payments"
          variant="success"
          helperText="All-time recorded client remittances"
        />
        <KpiCard
          title="Total Billed"
          value={<MoneyText paise={totalInvoicedPaise} />}
          icon="receipt_long"
          variant="primary"
          helperText="Gross active invoice billings"
        />
        <KpiCard
          title="Pending Receivables"
          value={<MoneyText paise={outstandingPaise} />}
          icon="account_balance_wallet"
          variant="warning"
          helperText="Uncollected confirmed balances"
        />
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6 space-y-4">
        <h3 className="font-headline-md font-bold text-on-surface">
          Active Subscription Portfolio Breakdown
        </h3>
        <p className="text-sm text-on-surface-variant">
          Currently managing {activeSubs.length} active recurring contracts.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {activeSubs.map((sub) => (
            <div
              key={sub.id}
              className="border border-outline-variant rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-sm text-on-surface">
                  {sub.number}
                </div>
                <div className="text-xs text-on-surface-variant">
                  {sub.plan.name} ({sub.billingPeriod})
                </div>
              </div>
              <MoneyText
                paise={sub.lines.reduce((acc, l) => acc + l.unitPricePaise * l.quantity, 0)}
                className="font-bold text-primary"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
