"use client";

import React, { useState } from "react";
import Link from "next/link";
import { SubscriptionStatus, BillingPeriod, InvoiceStatus } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  portalPauseSubscriptionAction,
  portalResumeSubscriptionAction,
  portalRenewSubscriptionAction,
  portalCloseSubscriptionAction,
} from "@/app/actions/portal";

export interface PortalSubscriptionDetailProps {
  subscription: {
    id: string;
    number: string;
    planName: string;
    billingPeriod: BillingPeriod;
    paymentTerms: string;
    customerGstState: string;
    customerGstStateCode: string;
    customerCompanyName: string;
    status: SubscriptionStatus;
    isPaused: boolean;
    isPausable: boolean;
    isRenewable: boolean;
    isClosableEarly: boolean;
    startDate: string;
    endDate?: string | null;
    nextBillingDate?: string | null;
    closedAt?: string | null;
    subtotalPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
    lines: Array<{
      id: string;
      productName: string;
      variantName?: string | null;
      description?: string | null;
      quantity: number;
      unitPricePaise: number;
      subtotalPaise: number;
      taxRatePercent: number;
    }>;
    invoices: Array<{
      id: string;
      number: string;
      createdAt: string;
      dueDate: string;
      totalPaise: number;
      paidPaise: number;
      status: InvoiceStatus;
      isOverdue: boolean;
    }>;
  };
}

export default function PortalSubscriptionDetailClient({
  subscription: sub,
}: PortalSubscriptionDetailProps) {
  const [loadingAction, setLoadingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    type: "pause" | "resume" | "renew" | "close";
  } | null>(null);
  const [reason, setReason] = useState("");

  const handleAction = async () => {
    if (!confirmModal) return;
    setLoadingAction(true);
    setActionError(null);

    try {
      let res;
      if (confirmModal.type === "pause") {
        res = await portalPauseSubscriptionAction(sub.id, reason);
      } else if (confirmModal.type === "resume") {
        res = await portalResumeSubscriptionAction(sub.id);
      } else if (confirmModal.type === "renew") {
        res = await portalRenewSubscriptionAction(sub.id);
      } else if (confirmModal.type === "close") {
        res = await portalCloseSubscriptionAction(sub.id, reason);
      }

      if (res && !res.success) {
        setActionError(res.error || "Action failed.");
      } else {
        setConfirmModal(null);
        setReason("");
      }
    } catch (err) {
      setActionError("An unexpected error occurred.");
    } finally {
      setLoadingAction(false);
    }
  };

  const steps: SubscriptionStatus[] = [
    SubscriptionStatus.DRAFT,
    SubscriptionStatus.QUOTATION,
    SubscriptionStatus.CONFIRMED,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CLOSED,
  ];

  const currentStepIndex = steps.indexOf(sub.status);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <Link
            href="/portal/subscriptions"
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Subscriptions
          </Link>
          <span>/</span>
          <span className="text-on-surface font-semibold">{sub.number}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {sub.status === SubscriptionStatus.ACTIVE && sub.isPausable && (
            sub.isPaused ? (
              <button
                type="button"
                onClick={() => setConfirmModal({ type: "resume" })}
                disabled={loadingAction}
                className="px-4 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-semibold hover:bg-tertiary-container transition-colors disabled:opacity-50"
              >
                Resume Contract
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmModal({ type: "pause" })}
                disabled={loadingAction}
                className="px-4 py-2 rounded-lg border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-secondary transition-colors disabled:opacity-50"
              >
                Pause Contract
              </button>
            )
          )}

          {sub.status === SubscriptionStatus.ACTIVE && sub.isRenewable && (
            <button
              type="button"
              onClick={() => setConfirmModal({ type: "renew" })}
              disabled={loadingAction}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-50"
            >
              Renew Contract
            </button>
          )}

          {sub.status === SubscriptionStatus.ACTIVE && sub.isClosableEarly && (
            <button
              type="button"
              onClick={() => setConfirmModal({ type: "close" })}
              disabled={loadingAction}
              className="px-4 py-2 rounded-lg border border-error/40 text-error hover:bg-error-container/30 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel Contract
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-error-container/40 border border-error rounded-xl text-error text-xs flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="font-bold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Banner */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-surface-container">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-on-surface">{sub.number}</h1>
              {sub.status === SubscriptionStatus.ACTIVE ? (
                sub.isPaused ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary-fixed text-secondary border border-outline-variant">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                    Paused
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary-fixed-dim">
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                    Active
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container text-secondary">
                  {sub.status}
                </span>
              )}
            </div>
            <p className="text-sm text-secondary mt-1">
              Plan: <span className="font-semibold text-on-surface">{sub.planName}</span>
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="pt-6">
          <p className="text-xs uppercase tracking-wider font-semibold text-secondary mb-4">
            Lifecycle Progress
          </p>
          <div className="grid grid-cols-5 gap-2 relative">
            {steps.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div key={step} className="flex flex-col items-center text-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isPast
                        ? "bg-primary-container text-on-primary"
                        : isCurrent
                        ? "bg-primary text-on-primary ring-4 ring-primary-fixed"
                        : "bg-surface-container-high text-secondary border border-outline-variant"
                    }`}
                  >
                    {isPast ? (
                      <span className="material-symbols-outlined text-[16px]">
                        check
                      </span>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium capitalize ${
                      isCurrent
                        ? "text-primary font-bold"
                        : isPast
                        ? "text-on-surface"
                        : "text-secondary"
                    }`}
                  >
                    {step.toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contract Specifications */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-on-surface pb-3 mb-4 border-b border-surface-container flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-base">
            description
          </span>
          Contract Specifications & Terms
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
          <div>
            <span className="block text-secondary mb-1">Customer Name</span>
            <span className="font-semibold text-on-surface">{sub.customerCompanyName}</span>
          </div>
          <div>
            <span className="block text-secondary mb-1">Contract Start Date</span>
            <span className="text-on-surface">{formatDate(sub.startDate)}</span>
          </div>
          <div>
            <span className="block text-secondary mb-1">Term Expiry Date</span>
            <span className="text-on-surface">
              {sub.endDate ? formatDate(sub.endDate) : "Ongoing / Open-ended"}
            </span>
          </div>
          <div>
            <span className="block text-secondary mb-1">Payment Terms</span>
            <span className="text-on-surface">{sub.paymentTerms}</span>
          </div>
          <div>
            <span className="block text-secondary mb-1">Billing Cadence</span>
            <span className="text-on-surface font-semibold">{sub.billingPeriod}</span>
          </div>
          <div>
            <span className="block text-secondary mb-1">Place of Supply</span>
            <span className="text-on-surface">
              {sub.customerGstState} ({sub.customerGstStateCode})
            </span>
          </div>
        </div>
      </section>

      {/* Order Lines */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">
              receipt_long
            </span>
            Subscribed Line Items
          </h2>
          <span className="text-xs text-secondary">{sub.lines.length} Line Items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-container-low text-secondary border-b border-outline-variant">
                <th className="py-3 px-6">Product / Service</th>
                <th className="py-3 px-6 text-center">Quantity</th>
                <th className="py-3 px-6 text-right">Unit Price</th>
                <th className="py-3 px-6 text-center">Tax Rate</th>
                <th className="py-3 px-6 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {sub.lines.map((line) => (
                <tr key={line.id} className="hover:bg-surface-container-low">
                  <td className="py-3 px-6">
                    <span className="font-semibold text-on-surface">
                      {line.productName}
                    </span>
                    {line.variantName && (
                      <span className="block text-secondary text-[11px]">
                        {line.variantName}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-center text-on-surface">
                    {line.quantity}
                  </td>
                  <td className="py-3 px-6 text-right text-on-surface">
                    {formatCurrency(line.unitPricePaise)}
                  </td>
                  <td className="py-3 px-6 text-center text-secondary">
                    {line.taxRatePercent}%
                  </td>
                  <td className="py-3 px-6 text-right font-semibold text-on-surface">
                    {formatCurrency(line.subtotalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals Summary */}
      <div className="flex justify-end">
        <div className="w-full sm:w-80 bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-2 text-xs">
          <div className="flex justify-between text-secondary">
            <span>Subtotal</span>
            <span className="text-on-surface font-medium">
              {formatCurrency(sub.subtotalPaise)}
            </span>
          </div>
          {sub.cgstPaise > 0 && (
            <div className="flex justify-between text-secondary">
              <span>CGST (9%)</span>
              <span className="text-on-surface">{formatCurrency(sub.cgstPaise)}</span>
            </div>
          )}
          {sub.sgstPaise > 0 && (
            <div className="flex justify-between text-secondary">
              <span>SGST (9%)</span>
              <span className="text-on-surface">{formatCurrency(sub.sgstPaise)}</span>
            </div>
          )}
          {sub.igstPaise > 0 && (
            <div className="flex justify-between text-secondary">
              <span>IGST (18%)</span>
              <span className="text-on-surface">{formatCurrency(sub.igstPaise)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-3 border-t border-outline-variant text-sm font-bold text-on-surface">
            <span>Recurring Total</span>
            <span className="text-primary text-base font-bold">
              {formatCurrency(sub.totalPaise)}
            </span>
          </div>
        </div>
      </div>

      {/* Invoices Generated Under This Subscription */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">
              history
            </span>
            Invoices for this Subscription
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Historical billing statements and tax compliance invoices under {sub.number}
          </p>
        </div>
        {sub.invoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-secondary">
            No invoices have been billed for this subscription yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-low text-secondary border-b border-outline-variant">
                  <th className="py-3 px-6">Invoice No.</th>
                  <th className="py-3 px-6">Issued Date</th>
                  <th className="py-3 px-6">Due Date</th>
                  <th className="py-3 px-6 text-right">Amount</th>
                  <th className="py-3 px-6 text-center">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {sub.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-container-low">
                    <td className="py-3 px-6 font-semibold text-primary">
                      <Link
                        href={`/portal/invoices/${inv.id}`}
                        className="hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="py-3 px-6 text-on-surface">
                      {formatDate(inv.createdAt)}
                    </td>
                    <td className="py-3 px-6 text-on-surface">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="py-3 px-6 text-right font-semibold text-on-surface">
                      {formatCurrency(inv.totalPaise)}
                    </td>
                    <td className="py-3 px-6 text-center">
                      {inv.status === InvoiceStatus.PAID ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-tertiary-fixed text-on-tertiary-fixed-variant">
                          Paid
                        </span>
                      ) : inv.isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-error-container text-error">
                          Overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary-fixed text-primary">
                          {inv.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-right">
                      <Link
                        href={`/portal/invoices/${inv.id}/print`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-semibold"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          print
                        </span>
                        Print PDF
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-on-surface">
              {confirmModal.type === "pause" && "Pause this subscription?"}
              {confirmModal.type === "resume" && "Resume this subscription?"}
              {confirmModal.type === "renew" && "Renew this subscription?"}
              {confirmModal.type === "close" && "Cancel this subscription?"}
            </h3>
            <p className="text-xs text-secondary mt-2">
              {confirmModal.type === "pause" &&
                "Pausing halts billing until you resume. The next invoice date will be postponed."}
              {confirmModal.type === "resume" &&
                "Resuming restores active status and moves your next billing date forward."}
              {confirmModal.type === "renew" &&
                "Renews your contract for an additional period according to your plan terms."}
              {confirmModal.type === "close" &&
                "Cancelling early will close your active subscription immediately."}
            </p>

            {(confirmModal.type === "pause" || confirmModal.type === "close") && (
              <div className="mt-4">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional reason for request..."
                  className="w-full px-3 py-2 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(null);
                  setReason("");
                }}
                className="px-4 py-2 text-xs font-semibold text-secondary hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAction}
                disabled={loadingAction}
                className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm text-white ${
                  confirmModal.type === "close"
                    ? "bg-error hover:bg-error/90"
                    : "bg-primary-container hover:bg-primary"
                }`}
              >
                {loadingAction ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
