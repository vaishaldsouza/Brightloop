"use client";

import React from "react";
import Link from "next/link";
import { InvoiceStatus, PaymentMethod } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface PortalInvoiceDetailProps {
  invoice: {
    id: string;
    number: string;
    status: InvoiceStatus;
    isOverdue: boolean;
    isPartiallyPaid: boolean;
    createdAt: string;
    dueDate: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    subtotalPaise: number;
    discountPaise: number;
    taxPaise: number;
    totalPaise: number;
    paidPaise: number;
    duePaise: number;
    notes?: string | null;
    subscription: {
      id: string;
      number: string;
      planName: string;
      paymentTerms: string;
    };
    customer: {
      id: string;
      companyName: string;
      gstin?: string | null;
      gstState?: string | null;
      gstStateCode?: string | null;
      billingAddress?: string | null;
      phone?: string | null;
    };
    lines: Array<{
      id: string;
      description?: string | null;
      quantity: number;
      unitPricePaise: number;
      subtotalPaise: number;
      productName: string;
      variantName?: string | null;
    }>;
    taxes: Array<{
      id: string;
      taxName: string;
      rateBps: number;
      amountPaise: number;
    }>;
    payments: Array<{
      id: string;
      amountPaise: number;
      paymentMethod: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
      paidAt: string;
    }>;
  };
}

export default function PortalInvoiceDetailClient({
  invoice: inv,
}: PortalInvoiceDetailProps) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <Link
            href="/portal/invoices"
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Invoices
          </Link>
          <span>/</span>
          <span className="text-on-surface font-semibold">{inv.number}</span>
        </div>

        {/* Print / Download Button */}
        <Link
          href={`/portal/invoices/${inv.id}/print`}
          target="_blank"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-xs transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Print / PDF View
        </Link>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-on-surface">{inv.number}</h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            {inv.status === InvoiceStatus.PAID ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary-fixed-dim">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                Paid
              </span>
            ) : inv.isOverdue ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error-container text-error border border-error/30">
                <span className="w-1.5 h-1.5 rounded-full bg-error" />
                Overdue
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-fixed text-primary border border-primary-fixed-dim">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Confirmed
              </span>
            )}

            {inv.isPartiallyPaid && inv.status !== InvoiceStatus.PAID && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary-fixed text-secondary">
                Partially paid
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xs p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-xs">
          {/* Billed To */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
              Billed To
            </p>
            <h2 className="text-sm font-bold text-on-surface">
              {inv.customer.companyName}
            </h2>
            {inv.customer.gstin && (
              <div className="inline-flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono text-[10px] text-secondary font-semibold">
                  GSTIN
                </span>
                <span className="font-mono text-on-surface font-semibold">
                  {inv.customer.gstin}
                </span>
              </div>
            )}
            {inv.customer.billingAddress && (
              <p className="text-secondary">{inv.customer.billingAddress}</p>
            )}
          </div>

          {/* Linked Subscription */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
              Linked Subscription
            </p>
            <Link
              href={`/portal/subscriptions/${inv.subscription.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
            >
              <span>{inv.subscription.number}</span>
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </Link>
            <p className="text-secondary">{inv.subscription.planName}</p>
          </div>

          {/* Dates & Terms */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
              Dates & Terms
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-secondary block">Issued Date:</span>
                <span className="font-semibold text-on-surface">
                  {formatDate(inv.createdAt)}
                </span>
              </div>
              <div>
                <span className="text-secondary block">Due Date:</span>
                <span
                  className={`font-semibold ${
                    inv.isOverdue ? "text-error" : "text-on-surface"
                  }`}
                >
                  {formatDate(inv.dueDate)}
                </span>
              </div>
            </div>
            <p className="text-secondary">
              Terms: <span className="font-medium text-on-surface">{inv.subscription.paymentTerms}</span>
            </p>
          </div>

          {/* Place of Supply */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
              Place of Supply
            </p>
            <p className="font-bold text-on-surface">
              {inv.customer.gstState || "Maharashtra"} ({inv.customer.gstStateCode || "27"})
            </p>
            <span className="inline-block px-2 py-0.5 rounded bg-surface-container text-secondary text-[11px]">
              {inv.customer.gstStateCode === "27" || !inv.customer.gstStateCode
                ? "Intra-State (CGST + SGST)"
                : "Inter-State (IGST)"}
            </span>
          </div>
        </div>
      </div>

      {/* Invoice Lines Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
          <h2 className="text-sm font-bold text-on-surface">Invoice Line Items</h2>
          <span className="text-xs text-secondary">{inv.lines.length} Line Items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-container-low text-secondary border-b border-outline-variant">
                <th className="py-3 px-6">Description</th>
                <th className="py-3 px-6 text-center">Quantity</th>
                <th className="py-3 px-6 text-right">Unit Price</th>
                <th className="py-3 px-6 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {inv.lines.map((line) => (
                <tr key={line.id} className="hover:bg-surface-container-low">
                  <td className="py-3 px-6">
                    <span className="font-semibold text-on-surface">
                      {line.productName}
                    </span>
                    {line.variantName && (
                      <span className="block text-[11px] text-secondary">
                        {line.variantName}
                      </span>
                    )}
                    {line.description && (
                      <span className="block text-[11px] text-secondary italic">
                        {line.description}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-center text-on-surface font-medium">
                    {line.quantity}
                  </td>
                  <td className="py-3 px-6 text-right text-on-surface font-medium">
                    {formatCurrency(line.unitPricePaise)}
                  </td>
                  <td className="py-3 px-6 text-right font-semibold text-on-surface">
                    {formatCurrency(line.subtotalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary & Breakdown */}
      <div className="flex justify-end">
        <div className="w-full sm:w-80 bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-xs space-y-2 text-xs">
          <div className="flex justify-between text-secondary">
            <span>Subtotal</span>
            <span className="text-on-surface font-medium">
              {formatCurrency(inv.subtotalPaise)}
            </span>
          </div>

          {inv.discountPaise > 0 && (
            <div className="flex justify-between text-tertiary">
              <span>Applied Discount</span>
              <span>-{formatCurrency(inv.discountPaise)}</span>
            </div>
          )}

          {inv.taxes.map((t) => (
            <div key={t.id} className="flex justify-between text-secondary">
              <span>
                {t.taxName} ({(t.rateBps / 100).toFixed(0)}%)
              </span>
              <span className="text-on-surface font-medium">
                {formatCurrency(t.amountPaise)}
              </span>
            </div>
          ))}

          <div className="flex justify-between items-baseline pt-2 border-t border-surface-container font-bold text-on-surface">
            <span>Total Invoiced</span>
            <span className="text-base text-primary">
              {formatCurrency(inv.totalPaise)}
            </span>
          </div>

          <div className="flex justify-between text-secondary pt-1">
            <span>Total Paid</span>
            <span className="text-tertiary font-semibold">
              {formatCurrency(inv.paidPaise)}
            </span>
          </div>

          <div className="flex justify-between items-baseline pt-2 border-t border-outline-variant font-bold text-sm">
            <span>Balance Due</span>
            <span
              className={
                inv.duePaise === 0
                  ? "text-tertiary font-bold"
                  : inv.isOverdue
                  ? "text-error font-bold"
                  : "text-on-surface font-bold"
              }
            >
              {formatCurrency(inv.duePaise)}
            </span>
          </div>
        </div>
      </div>

      {/* Recorded Payment Remittances */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">
              payments
            </span>
            Payment Remittances
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Confirmed transactions and settlement receipts recorded against this invoice
          </p>
        </div>

        {inv.payments.length === 0 ? (
          <div className="p-8 text-center text-xs text-secondary">
            No payments have been recorded for this invoice yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-low text-secondary border-b border-outline-variant">
                  <th className="py-3 px-6">Payment Date</th>
                  <th className="py-3 px-6">Method</th>
                  <th className="py-3 px-6">Reference / UTR</th>
                  <th className="py-3 px-6">Notes</th>
                  <th className="py-3 px-6 text-right">Amount Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {inv.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-container-low">
                    <td className="py-3 px-6 text-on-surface">
                      {formatDate(p.paidAt)}
                    </td>
                    <td className="py-3 px-6 font-semibold text-on-surface">
                      {p.paymentMethod.replace(/_/g, " ")}
                    </td>
                    <td className="py-3 px-6 font-mono text-secondary">
                      {p.reference || "—"}
                    </td>
                    <td className="py-3 px-6 text-secondary">{p.notes || "—"}</td>
                    <td className="py-3 px-6 text-right font-bold text-tertiary">
                      {formatCurrency(p.amountPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
