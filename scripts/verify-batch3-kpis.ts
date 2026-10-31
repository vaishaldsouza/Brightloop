import prisma from "../src/lib/prisma";
import { SubscriptionStatus, InvoiceStatus } from "@prisma/client";

async function verifyKpis() {
  console.log("==========================================================");
  console.log("📊 BATCH 3.1 – Real PostgreSQL Dashboard KPI Audit");
  console.log("==========================================================");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [subscriptions, invoices, payments, plans, customers] = await Promise.all([
    prisma.subscription.findMany({ include: { customer: true, plan: true } }),
    prisma.invoice.findMany({ include: { subscription: true } }),
    prisma.payment.findMany({ include: { invoice: true } }),
    prisma.plan.findMany(),
    prisma.customer.findMany(),
  ]);

  console.log(`\n[Database Cohort Snapshot]`);
  console.log(`- Total Subscriptions: ${subscriptions.length}`);
  console.log(`- Total Invoices: ${invoices.length}`);
  console.log(`- Total Payments: ${payments.length}`);
  console.log(`- Total Plans: ${plans.length}`);
  console.log(`- Total Customers: ${customers.length}`);

  // KPI 1: Active Subscriptions
  const activeSubs = subscriptions.filter((s) => s.status === SubscriptionStatus.ACTIVE);
  console.log(`\n[KPI 1: Active Subscriptions]`);
  console.log(`- Active Count: ${activeSubs.length}`);
  subscriptions.forEach((s) => {
    console.log(`  ${s.number}: status=${s.status}, isPaused=${s.isPaused}, plan=${s.plan.name}`);
  });

  // KPI 2: Revenue Collected
  const totalRevenuePaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);
  console.log(`\n[KPI 2: Revenue Collected (All Time)]`);
  console.log(`- Total Revenue Paise: ${totalRevenuePaise} (₹${(totalRevenuePaise / 100).toLocaleString("en-IN")})`);
  payments.forEach((p) => {
    console.log(`  Payment ${p.id.slice(0, 8)}: ₹${(p.amountPaise / 100).toLocaleString("en-IN")} via ${p.paymentMethod} on ${p.paidAt.toISOString().slice(0, 10)}`);
  });

  // KPI 3: Amount Outstanding on Confirmed Invoices
  const confirmedInvoices = invoices.filter((i) => i.status === InvoiceStatus.CONFIRMED && !i.cancelledAt);
  const totalOutstandingPaise = confirmedInvoices.reduce((sum, i) => sum + (i.totalPaise - i.paidPaise), 0);
  console.log(`\n[KPI 3: Outstanding on Confirmed Invoices]`);
  console.log(`- Confirmed Count: ${confirmedInvoices.length}`);
  console.log(`- Total Outstanding Paise: ${totalOutstandingPaise} (₹${(totalOutstandingPaise / 100).toLocaleString("en-IN")})`);
  confirmedInvoices.forEach((i) => {
    console.log(`  ${i.number}: total=₹${(i.totalPaise / 100).toLocaleString("en-IN")}, paid=₹${(i.paidPaise / 100).toLocaleString("en-IN")}, outstanding=₹${((i.totalPaise - i.paidPaise) / 100).toLocaleString("en-IN")}`);
  });

  // KPI 4: Overdue Invoices
  const overdueInvoices = invoices.filter((i) => {
    if (i.status !== InvoiceStatus.CONFIRMED || i.cancelledAt) return false;
    return i.dueDate < today && (i.totalPaise - i.paidPaise) > 0;
  });
  const totalOverduePaise = overdueInvoices.reduce((sum, i) => sum + (i.totalPaise - i.paidPaise), 0);
  console.log(`\n[KPI 4: Overdue Invoices]`);
  console.log(`- Overdue Count: ${overdueInvoices.length}`);
  console.log(`- Total Overdue Paise: ${totalOverduePaise} (₹${(totalOverduePaise / 100).toLocaleString("en-IN")})`);
  overdueInvoices.forEach((i) => {
    console.log(`  ${i.number}: due=${i.dueDate.toISOString().slice(0, 10)}, outstanding=₹${((i.totalPaise - i.paidPaise) / 100).toLocaleString("en-IN")}`);
  });

  await prisma.$disconnect();
}

verifyKpis().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
