import React from "react";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role, PaymentMethod, Prisma } from "@prisma/client";
import PaymentsListClient, {
  PaymentRow,
  PaymentKpis,
} from "@/components/payments/PaymentsListClient";

export const metadata = {
  title: "Payments — Brightloop Subscriptions",
  description: "View and manage recorded customer payment transactions and receipts.",
};

interface PaymentsPageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    method?: string;
    customerId?: string;
  }>;
}

export default async function PaymentsPage(props: PaymentsPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role === Role.CUSTOMER) {
    redirect("/portal/invoices");
  }

  const searchParams = await props.searchParams;
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.pageSize || "10", 10)));
  const search = searchParams.search?.trim() || "";
  const method = searchParams.method?.trim() as PaymentMethod | undefined;
  const customerId = searchParams.customerId?.trim() || "";

  // Build filter query
  const where: Prisma.PaymentWhereInput = {};

  if (method && Object.values(PaymentMethod).includes(method)) {
    where.paymentMethod = method;
  }

  if (customerId) {
    where.invoice = {
      subscription: {
        customerId,
      },
    };
  }

  if (search) {
    where.OR = [
      { reference: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      {
        invoice: {
          number: { contains: search, mode: "insensitive" },
        },
      },
      {
        invoice: {
          subscription: {
            customer: {
              companyName: { contains: search, mode: "insensitive" },
            },
          },
        },
      },
    ];
  }

  // Aggregate KPIs across all payments
  const [
    allPaymentsStats,
    bankStats,
    cardStats,
    upiStats,
    cashStats,
    totalCount,
    paymentsData,
    customersList,
  ] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amountPaise: true },
      _count: { id: true },
    }),
    prisma.payment.aggregate({
      where: { paymentMethod: PaymentMethod.BANK_TRANSFER },
      _sum: { amountPaise: true },
      _count: { id: true },
    }),
    prisma.payment.aggregate({
      where: { paymentMethod: PaymentMethod.CARD },
      _sum: { amountPaise: true },
      _count: { id: true },
    }),
    prisma.payment.aggregate({
      where: { paymentMethod: PaymentMethod.UPI },
      _sum: { amountPaise: true },
      _count: { id: true },
    }),
    prisma.payment.aggregate({
      where: { paymentMethod: PaymentMethod.CASH },
      _sum: { amountPaise: true },
      _count: { id: true },
    }),
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            status: true,
            totalPaise: true,
            paidPaise: true,
            subscription: {
              select: {
                id: true,
                number: true,
                customer: {
                  select: {
                    id: true,
                    companyName: true,
                    gstin: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.findMany({
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    }),
  ]);

  const cardUpiPaise =
    (cardStats._sum.amountPaise || 0) + (upiStats._sum.amountPaise || 0);
  const cardUpiCount =
    (cardStats._count.id || 0) + (upiStats._count.id || 0);

  const kpis: PaymentKpis = {
    totalCollectionsPaise: allPaymentsStats._sum.amountPaise || 0,
    bankTransferPaise: bankStats._sum.amountPaise || 0,
    bankTransferCount: bankStats._count.id || 0,
    cardUpiPaise,
    cardUpiCount,
    cashPaise: cashStats._sum.amountPaise || 0,
    cashCount: cashStats._count.id || 0,
    totalPaymentsCount: allPaymentsStats._count.id || 0,
  };

  const payments: PaymentRow[] = paymentsData.map((p) => ({
    id: p.id,
    amountPaise: p.amountPaise,
    paymentMethod: p.paymentMethod,
    paidAt: p.paidAt.toISOString(),
    reference: p.reference,
    notes: p.notes,
    invoice: {
      id: p.invoice.id,
      number: p.invoice.number,
      status: p.invoice.status,
      totalPaise: p.invoice.totalPaise,
      paidPaise: p.invoice.paidPaise,
      subscription: {
        id: p.invoice.subscription.id,
        number: p.invoice.subscription.number,
        customer: {
          id: p.invoice.subscription.customer.id,
          companyName: p.invoice.subscription.customer.companyName,
          gstin: p.invoice.subscription.customer.gstin,
        },
      },
    },
  }));

  return (
    <PaymentsListClient
      payments={payments}
      totalCount={totalCount}
      kpis={kpis}
      customers={customersList}
      currentPage={page}
      pageSize={pageSize}
      searchTerm={search}
      selectedMethod={method || ""}
      selectedCustomerId={customerId}
    />
  );
}
