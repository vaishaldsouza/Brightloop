"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import MoneyText from "@/components/ui/MoneyText";
import { InvoiceStatus, PaymentMethod } from "@prisma/client";
import {
  confirmInvoiceAction,
  cancelInvoiceAction,
  sendInvoiceAction,
} from "@/app/actions/invoices";

export interface InvoiceDetailProps {
  invoice: {
    id: string;
    number: string;
    status: InvoiceStatus;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    dueDate: string;
    createdAt: string;
    subtotalPaise: number;
    discountPaise: number;
    taxPaise: number;
    totalPaise: number;
    paidPaise: number;
    notes: string | null;
    sentAt: string | null;
    paidAt: string | null;
    cancelledAt: string | null;
    duePaise: number;
    isOverdue: boolean;
    isPartiallyPaid: boolean;
    isCancelled: boolean;
    subscription: {
      id: string;
      number: string;
      billingPeriod: string;
      paymentTerms: string;
      planName: string;
      customerGstStateCode: string | null;
      customer: {
        id: string;
        companyName: string;
        contactName: string | null;
        billingEmail: string;
        phone: string | null;
        gstin: string | null;
        gstStateCode: string | null;
        billingAddress: string | null;
      };
    };
    lines: Array<{
      id: string;
      description: string | null;
      quantity: number;
      unitPricePaise: number;
      subtotalPaise: number;
      productVariant: {
        id: string;
        variantName: string;
        product: {
          name: string;
        };
      };
    }>;
    taxes: Array<{
      id: string;
      taxName: string;
      taxType: string;
      rateBps: number;
      amountPaise: number;
    }>;
    payments: Array<{
      id: string;
      amountPaise: number;
      paymentMethod: PaymentMethod;
      paidAt: string;
      reference: string | null;
      notes: string | null;
    }>;
    auditLogs: Array<{
      id: string;
      action: string;
      createdAt: string;
      user: {
        name: string | null;
        email: string;
      } | null;
      meta: any;
    }>;
  };
  isAdmin: boolean;
  isStaff: boolean;
}

export default function InvoiceDetailClient({
  invoice,
  isAdmin,
  isStaff,
}: InvoiceDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isIntraState =
    (invoice.subscription.customerGstStateCode ||
      invoice.subscription.customer.gstStateCode ||
      "27") === "27";

  const handleConfirm = async () => {
    if (!window.confirm(`Confirm invoice ${invoice.number}? This will lock the invoice lines and allow payment recording.`)) {
      return;
    }
    setActionMessage(null);
    try {
      const res = await confirmInvoiceAction(invoice.id);
      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Invoice ${invoice.number} confirmed successfully.`,
        });
        router.refresh();
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to confirm invoice.",
        });
      }
    } catch {
      setActionMessage({
        type: "error",
        text: "An unexpected error occurred while confirming invoice.",
      });
    }
  };

  const handleCancel = async () => {
    if (invoice.paidPaise > 0 || invoice.payments.length > 0) {
      alert("Cannot cancel an invoice with recorded payments (PRD §4.6).");
      return;
    }

    const reason = window.prompt("Please enter a reason for cancelling this invoice (optional):");
    if (reason === null) return; // user cancelled prompt

    setActionMessage(null);
    try {
      const res = await cancelInvoiceAction(invoice.id, reason);
      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Invoice ${invoice.number} has been cancelled.`,
        });
        router.refresh();
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to cancel invoice.",
        });
      }
    } catch {
      setActionMessage({
        type: "error",
        text: "An unexpected error occurred while cancelling invoice.",
      });
    }
  };

  const handleSendEmail = async () => {
    setActionMessage(null);
    try {
      const res = await sendInvoiceAction(invoice.id);
      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Invoice email successfully dispatched to ${invoice.subscription.customer.billingEmail}.`,
        });
        router.refresh();
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to send invoice email.",
        });
      }
    } catch {
      setActionMessage({
        type: "error",
        text: "An unexpected error occurred while sending invoice email.",
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0 print:space-y-4">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-label-md text-xs text-secondary print:hidden">
        <Link href="/dashboard" className="hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-[16px]">home</span>
          <span>Home</span>
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <Link href="/invoices" className="hover:text-primary transition-colors">
          Invoices
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-on-surface font-semibold">{invoice.number}</span>
      </nav>

      {/* Invoice Header & Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-outline-variant print:border-b-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-headline-xl text-3xl font-bold text-on-surface tracking-tight">
              {invoice.number}
            </h1>
            <StatusBadge status={invoice.status} />
            {invoice.isOverdue && <TagBadge tag="OVERDUE" />}
            {invoice.isPartiallyPaid && <TagBadge tag="PARTIALLY_PAID" />}
            {invoice.isCancelled && <TagBadge tag="CANCELLED" />}
          </div>
          <p className="text-sm text-secondary mt-1">
            Customer: <span className="font-medium text-on-surface">{invoice.subscription.customer.companyName}</span> •{" "}
            {isIntraState
              ? "Intra-state transaction (Maharashtra - CGST + SGST)"
              : "Inter-state transaction (IGST)"}
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {/* Confirm Button */}
          {invoice.status === InvoiceStatus.DRAFT && !invoice.isCancelled && (isAdmin || isStaff) && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              <span>Confirm Invoice</span>
            </button>
          )}

          {invoice.status !== InvoiceStatus.DRAFT && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-secondary font-medium text-sm opacity-70">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              <span>{invoice.status === InvoiceStatus.PAID ? "Fully Paid" : "Confirmed"}</span>
            </div>
          )}

          {/* Send Email Button */}
          {!invoice.isCancelled && (isAdmin || isStaff) && (
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-medium text-sm hover:bg-surface-container-low transition-colors shadow-sm disabled:opacity-60"
              title="Deliver invoice to customer email"
            >
              <span className="material-symbols-outlined text-[18px]">mail</span>
              <span>Send Invoice</span>
            </button>
          )}

          {/* Print / PDF Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-medium text-sm hover:bg-surface-container-low transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Print / PDF</span>
          </button>

          {/* Cancel Button */}
          {!invoice.isCancelled && (isAdmin || isStaff) && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending || invoice.paidPaise > 0 || invoice.payments.length > 0}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${
                invoice.paidPaise > 0 || invoice.payments.length > 0
                  ? "border-outline-variant bg-surface-container-low text-secondary opacity-50 cursor-not-allowed"
                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
              title={
                invoice.paidPaise > 0 || invoice.payments.length > 0
                  ? "Cannot cancel invoice with recorded payments"
                  : "Cancel this invoice"
              }
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between print:hidden ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">
              {actionMessage.type === "success" ? "check_circle" : "error"}
            </span>
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-secondary hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Cancelled Notice Banner */}
      {invoice.isCancelled && (
        <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 flex items-center gap-3 text-slate-800">
          <span className="material-symbols-outlined text-slate-500 text-[24px]">cancel</span>
          <div>
            <div className="font-semibold text-sm">This invoice was cancelled</div>
            <div className="text-xs text-secondary">
              Cancelled on {new Date(invoice.cancelledAt!).toLocaleString("en-IN")}.
              It is excluded from revenue, outstanding amounts, and dashboard KPIs.
            </div>
          </div>
        </div>
      )}

      {/* SPECIFICATION CARD (Bento 2-Column Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Customer & Contract Specification */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant bg-surface-bright flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">domain</span>
                <h2 className="font-title-sm text-sm font-bold text-on-surface">
                  Customer & Contract Specification
                </h2>
              </div>
              <Link
                href={`/customers/${invoice.subscription.customer.id}`}
                className="inline-flex items-center gap-1.5 text-primary text-xs font-semibold hover:underline"
              >
                <span>View Customer Profile</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </Link>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Billing Party Details */}
              <div className="space-y-3">
                <div className="text-secondary text-xs uppercase font-semibold tracking-wider">
                  Billing Party
                </div>
                <div className="text-lg font-bold text-on-surface">
                  {invoice.subscription.customer.companyName}
                </div>
                <div className="space-y-1.5 text-xs text-secondary">
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface">GSTIN:</span>
                    <span className="font-mono bg-surface-container-low px-2 py-0.5 rounded text-on-surface font-semibold">
                      {invoice.subscription.customer.gstin || "Unregistered"}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-on-surface">Place of Supply:</span> State Code{" "}
                    {invoice.subscription.customerGstStateCode || invoice.subscription.customer.gstStateCode || "27"} (
                    {isIntraState ? "Maharashtra" : "Other State"})
                  </p>
                  <p>
                    <span className="font-semibold text-on-surface">Transaction Type:</span>{" "}
                    {isIntraState ? "Intra-state (CGST 9% + SGST 9%)" : "Inter-state (IGST 18%)"}
                  </p>
                  <p>
                    <span className="font-semibold text-on-surface">Billing Address:</span>{" "}
                    {invoice.subscription.customer.billingAddress || "No registered address provided"}
                  </p>
                  <p>
                    <span className="font-semibold text-on-surface">Billing Contact:</span>{" "}
                    {invoice.subscription.customer.contactName || "Accounts Team"} (
                    {invoice.subscription.customer.billingEmail})
                  </p>
                </div>
              </div>

              {/* Subscription & Terms Details */}
              <div className="space-y-3 md:border-l md:border-outline-variant md:pl-6">
                <div className="text-secondary text-xs uppercase font-semibold tracking-wider">
                  Subscription & Billing Terms
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-outline-variant/60">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container">autorenew</span>
                    <div>
                      <div className="text-[11px] text-secondary">Linked Contract</div>
                      <div className="text-sm font-bold text-on-surface font-mono">
                        {invoice.subscription.number}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/subscriptions/${invoice.subscription.id}`}
                    className="px-2.5 py-1 text-primary hover:bg-surface-container-lowest rounded border border-primary/20 text-xs font-semibold transition-colors flex items-center gap-1"
                  >
                    <span>Inspect</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                  <div>
                    <span className="text-secondary block font-medium">Billing Period</span>
                    <span className="font-mono text-on-surface font-semibold">
                      {new Date(invoice.billingPeriodStart).toLocaleDateString("en-IN")} –{" "}
                      {new Date(invoice.billingPeriodEnd).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block font-medium">Invoice Date</span>
                    <span className="font-mono text-on-surface font-semibold">
                      {new Date(invoice.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block font-medium">Due Date</span>
                    <span className={`font-mono font-semibold ${invoice.isOverdue ? "text-rose-600 font-bold" : "text-on-surface"}`}>
                      {new Date(invoice.dueDate).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block font-medium">Payment Terms</span>
                    <span className="text-on-surface font-semibold">
                      {invoice.subscription.paymentTerms.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Billable Line Items Table */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
              <h2 className="font-title-sm text-sm font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">list_alt</span>
                <span>Billable Line Items</span>
              </h2>
              <span className="text-xs text-secondary font-mono">{invoice.lines.length} lines</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low text-xs text-secondary font-semibold border-b border-outline-variant">
                  <tr>
                    <th className="py-3 px-6">Description / Item</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-6 text-right">Unit Price</th>
                    <th className="py-3 px-6 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60">
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-surface-container-low/40">
                      <td className="py-3 px-6">
                        <div className="font-semibold text-on-surface">
                          {line.description || line.productVariant.variantName}
                        </div>
                        <div className="text-xs text-secondary">
                          Product: {line.productVariant.product.name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-on-surface">
                        {line.quantity}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <MoneyText paise={line.unitPricePaise} className="font-mono text-xs text-on-surface" />
                      </td>
                      <td className="py-3 px-6 text-right">
                        <MoneyText paise={line.subtotalPaise} className="font-mono font-semibold text-xs text-on-surface" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment History Ledger Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
              <h2 className="font-title-sm text-sm font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">payments</span>
                <span>Payment History Ledger</span>
              </h2>
              <span className="text-xs font-mono text-secondary">
                {invoice.payments.length} payment(s) recorded
              </span>
            </div>

            {invoice.payments.length === 0 ? (
              <div className="p-8 text-center text-secondary text-sm">
                <span className="material-symbols-outlined text-3xl text-secondary/40 block mb-1">
                  receipt_long
                </span>
                No payments recorded against this invoice yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container-low text-xs text-secondary font-semibold border-b border-outline-variant">
                    <tr>
                      <th className="py-3 px-6">Date</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-6 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/60">
                    {invoice.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-6 font-mono text-xs text-on-surface">
                          {new Date(p.paidAt).toLocaleDateString("en-IN")}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-on-surface">
                          {p.paymentMethod.replace("_", " ")}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-secondary">
                          {p.reference || "—"}
                        </td>
                        <td className="py-3 px-6 text-right font-mono font-semibold text-emerald-700">
                          <MoneyText paise={p.amountPaise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Financial Summary & Audit Trail */}
        <div className="lg:col-span-4 space-y-6">
          {/* Financial Breakdown Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-6 space-y-4">
            <h3 className="font-title-sm text-sm font-bold text-on-surface border-b border-outline-variant pb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-container">account_balance_wallet</span>
              <span>Financial Ledger Summary</span>
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between text-secondary">
                <span>Subtotal (Excl. Tax)</span>
                <MoneyText paise={invoice.subtotalPaise} className="font-mono text-on-surface" />
              </div>

              {invoice.discountPaise > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Discount</span>
                  <span>-₹{(invoice.discountPaise / 100).toFixed(2)}</span>
                </div>
              )}

              {/* Itemized Taxes */}
              <div className="border-t border-outline-variant/60 pt-3 space-y-2">
                <div className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Applicable GST Breakdown
                </div>
                {invoice.taxes.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-secondary">
                    <span>
                      {t.taxName} ({t.rateBps / 100}%)
                    </span>
                    <MoneyText paise={t.amountPaise} className="font-mono text-on-surface" />
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs font-medium text-secondary pt-1">
                  <span>Total Tax Amount</span>
                  <MoneyText paise={invoice.taxPaise} className="font-mono text-on-surface" />
                </div>
              </div>

              {/* Total Amount */}
              <div className="border-t-2 border-outline-variant pt-3 flex items-center justify-between text-base font-bold text-on-surface">
                <span>Total Invoiced</span>
                <MoneyText paise={invoice.totalPaise} className="text-primary text-lg" />
              </div>

              {/* Payments & Outstanding */}
              <div className="border-t border-outline-variant/60 pt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>Total Paid to Date</span>
                  <MoneyText paise={invoice.paidPaise} className="font-mono text-emerald-700 font-semibold" />
                </div>
                <div className="flex items-center justify-between text-sm font-bold pt-1">
                  <span className={invoice.duePaise > 0 ? "text-amber-900" : "text-emerald-700"}>
                    Outstanding Balance
                  </span>
                  <MoneyText
                    paise={invoice.duePaise}
                    className={`text-base font-bold ${
                      invoice.duePaise > 0 ? "text-amber-800" : "text-emerald-700"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Audit Trail Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-6 space-y-4">
            <h3 className="font-title-sm text-sm font-bold text-on-surface border-b border-outline-variant pb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">history</span>
              <span>Invoice Audit Trail</span>
            </h3>

            {invoice.auditLogs.length === 0 ? (
              <div className="text-xs text-secondary">No audit logs recorded for this invoice yet.</div>
            ) : (
              <div className="space-y-3">
                {invoice.auditLogs.map((log) => (
                  <div key={log.id} className="text-xs border-l-2 border-primary/40 pl-3 py-1 space-y-0.5">
                    <div className="font-semibold text-on-surface flex items-center justify-between">
                      <span>{log.action}</span>
                      <span className="text-[10px] text-secondary font-mono">
                        {new Date(log.createdAt).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    <div className="text-secondary text-[11px]">
                      By: {log.user?.name || log.user?.email || "System Automation"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
