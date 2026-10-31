"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import MoneyText from "@/components/ui/MoneyText";
import { SubscriptionStatus, Role } from "@prisma/client";
import {
  confirmSubscriptionAction,
  activateSubscriptionAction,
  pauseSubscriptionAction,
  resumeSubscriptionAction,
  closeSubscriptionAction,
  closeExpiredQuotationAction,
  convertToQuotationAction,
  renewSubscriptionAction,
} from "@/app/actions/subscriptions";
import { isQuotationExpired, getSubscriptionDerivedTags } from "@/lib/validations/subscription";
import { calculateOrderTax } from "@/lib/tax";
import { isIntraState } from "@/lib/gstStates";

export interface SubscriptionDetailData {
  id: string;
  number: string;
  customerId: string;
  planId: string;
  billingPeriod: string;
  paymentTerms: string;
  isPausable: boolean;
  isRenewable: boolean;
  isClosableEarly: boolean;
  autoClose: boolean;
  status: SubscriptionStatus;
  isPaused: boolean;
  pausedAt: string | null;
  startDate: string;
  endDate: string | null;
  nextBillingDate: string | null;
  quotationExpiryDate: string | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    companyName: string;
    gstin: string | null;
    gstState: string | null;
    gstStateCode: string | null;
    billingAddress: string | null;
    phone: string | null;
  };
  plan: {
    id: string;
    name: string;
    billingPeriod: string;
    pricePaise: number;
  };
  lines: Array<{
    id: string;
    productVariantId: string;
    description: string | null;
    quantity: number;
    unitPricePaise: number;
    sortOrder: number;
    taxRateBps: number | null;
    taxAmountPaise: number | null;
    productVariant: {
      id: string;
      name: string;
      product: {
        id: string;
        name: string;
      };
    };
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    user: {
      name: string | null;
      email: string;
      role: Role;
    } | null;
    meta: any;
  }>;
}

interface SubscriptionDetailClientProps {
  subscription: SubscriptionDetailData;
  isAdmin: boolean;
  isStaff: boolean;
}

export default function SubscriptionDetailClient({
  subscription,
  isAdmin,
  isStaff,
}: SubscriptionDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const sub = subscription;
  const isExpired = isQuotationExpired(sub.status, sub.quotationExpiryDate);
  const derivedTags = getSubscriptionDerivedTags(
    sub.status,
    sub.isPaused,
    sub.quotationExpiryDate
  );

  const isIntra = isIntraState(sub.customer.gstStateCode);

  const taxCalculation = calculateOrderTax(
    sub.lines.map((l) => ({
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
    })),
    sub.customer.gstStateCode
  );

  async function handleAction(
    actionFn: () => Promise<{ success: boolean; error?: string }>
  ) {
    setActionError(null);
    try {
      const res = await actionFn();
      if (!res.success) {
        setActionError(res.error || "Action failed");
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err) {
      console.error(err);
      setActionError("A network error occurred while executing the action.");
    }
  }

  // Stepper stages
  const STAGES: SubscriptionStatus[] = [
    SubscriptionStatus.DRAFT,
    SubscriptionStatus.QUOTATION,
    SubscriptionStatus.CONFIRMED,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CLOSED,
  ];

  const currentStageIndex = STAGES.indexOf(sub.status);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <PageHeader
        title={sub.number}
        subtitle={`${sub.customer.companyName} • Plan: ${sub.plan.name} • Created on ${new Date(
          sub.createdAt
        ).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}`}
        breadcrumbs={[
          { label: "Subscriptions", href: "/subscriptions" },
          { label: sub.number },
        ]}
        actions={
          <div className="flex items-center flex-wrap gap-2.5">
            <Link
              href="/subscriptions"
              className="px-3.5 py-2 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface rounded-lg text-label-md font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>
              <span>All Subscriptions</span>
            </Link>

            {/* DRAFT ACTIONS */}
            {sub.status === SubscriptionStatus.DRAFT && (isAdmin || isStaff) && (
              <>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    handleAction(() => convertToQuotationAction(sub.id, 30))
                  }
                  className="bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface font-label-md px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    send
                  </span>
                  <span>Issue Quotation</span>
                </button>
              </>
            )}

            {/* QUOTATION ACTIONS */}
            {sub.status === SubscriptionStatus.QUOTATION && (isAdmin || isStaff) && (
              <>
                {!isExpired ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(() => confirmSubscriptionAction(sub.id))
                    }
                    className="bg-primary-container hover:bg-primary text-on-primary font-label-md px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      check_circle
                    </span>
                    <span>Confirm Quotation</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(() => closeExpiredQuotationAction(sub.id))
                    }
                    className="bg-rose-600 hover:bg-rose-700 text-white font-label-md px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      event_busy
                    </span>
                    <span>Close Expired Quotation</span>
                  </button>
                )}
              </>
            )}

            {/* CONFIRMED ACTIONS */}
            {sub.status === SubscriptionStatus.CONFIRMED && (isAdmin || isStaff) && (
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  handleAction(() => activateSubscriptionAction(sub.id))
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-label-md px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  play_arrow
                </span>
                <span>Activate Subscription</span>
              </button>
            )}

            {/* ACTIVE ACTIONS: Pause / Resume / Close */}
            {sub.status === SubscriptionStatus.ACTIVE && (isAdmin || isStaff) && (
              <>
                {sub.isPaused ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(() => resumeSubscriptionAction(sub.id))
                    }
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-label-md px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      play_circle
                    </span>
                    <span>Resume Subscription</span>
                  </button>
                ) : sub.isPausable ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(() => pauseSubscriptionAction(sub.id))
                    }
                    className="bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface font-label-md px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      pause
                    </span>
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Plan tier does not permit manual pause"
                    className="bg-surface-container-low border border-outline-variant/40 text-outline cursor-not-allowed font-label-md px-3 py-2 rounded-lg flex items-center gap-1.5 opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      lock
                    </span>
                    <span>Pause (Locked)</span>
                  </button>
                )}

                {/* Close early */}
                {sub.isClosableEarly ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to terminate this active contract early?"
                        )
                      ) {
                        handleAction(() => closeSubscriptionAction(sub.id));
                      }
                    }}
                    className="bg-surface-container-lowest border border-rose-300 text-rose-700 hover:bg-rose-50 font-label-md px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      cancel
                    </span>
                    <span>Close Early</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Plan tier does not permit early contract cancellation"
                    className="bg-surface-container-low border border-outline-variant/40 text-outline cursor-not-allowed font-label-md px-3 py-2 rounded-lg flex items-center gap-1.5 opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      lock
                    </span>
                    <span>Close (Locked)</span>
                  </button>
                )}

                {/* Renew */}
                {sub.isRenewable && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Renew subscription for the next billing cycle?"
                        )
                      ) {
                        handleAction(() => renewSubscriptionAction(sub.id));
                      }
                    }}
                    className="bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface font-label-md px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      autorenew
                    </span>
                    <span>Renew</span>
                  </button>
                )}
              </>
            )}

            {/* DRAFT / QUOTATION GENERAL CLOSE */}
            {(sub.status === SubscriptionStatus.DRAFT ||
              sub.status === SubscriptionStatus.QUOTATION) &&
              (isAdmin || isStaff) && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to close this draft quotation?"
                      )
                    ) {
                      handleAction(() => closeSubscriptionAction(sub.id));
                    }
                  }}
                  className="bg-surface-container-lowest border border-outline-variant text-secondary hover:text-error hover:bg-error-container/20 font-label-md px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    close
                  </span>
                  <span>Close</span>
                </button>
              )}
          </div>
        }
      />

      {actionError && (
        <div className="p-4 bg-error-container/40 border border-error/30 rounded-xl text-error text-body-sm flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
            error
          </span>
          <span>{actionError}</span>
        </div>
      )}

      {/* HORIZONTAL STATUS STEPPER CARD */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 p-5 shadow-xs">
        <div className="grid grid-cols-5 relative">
          {STAGES.map((stage, idx) => {
            const isCompleted = currentStageIndex > idx;
            const isCurrent = currentStageIndex === idx;

            let circleClass = "bg-surface-container text-secondary border border-outline-variant";
            if (isCompleted) circleClass = "bg-emerald-600 text-white shadow-xs";
            if (isCurrent) {
              if (stage === SubscriptionStatus.CLOSED) {
                circleClass = "bg-rose-600 text-white ring-4 ring-rose-100 shadow-xs";
              } else {
                circleClass = "bg-primary-container text-white ring-4 ring-primary-container/20 shadow-xs";
              }
            }

            return (
              <div
                key={stage}
                className="flex flex-col items-center text-center relative z-10"
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center mb-1.5 ${circleClass}`}
                >
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-[18px]">
                      check
                    </span>
                  ) : isCurrent ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>
                <span
                  className={`font-label-md text-xs ${
                    isCurrent ? "font-bold text-primary-container" : "text-on-surface"
                  }`}
                >
                  {stage}
                </span>
                <span className="text-[10px] text-secondary">
                  {isCurrent ? "Current Stage" : isCompleted ? "Completed" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2-COLUMN OPERATIONAL BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Specifications & Order Lines (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Contract Specifications Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/40 flex items-center justify-between bg-surface-bright">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">
                  article
                </span>
                <h2 className="font-title-sm text-on-surface font-semibold">
                  Contract & Billing Specifications
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={sub.status} />
                {derivedTags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-body-sm">
              <div className="flex flex-col">
                <span className="text-xs text-secondary">Customer Entity</span>
                <span className="font-semibold text-on-surface mt-0.5">
                  {sub.customer.companyName}
                </span>
                <span className="font-mono text-xs text-secondary">
                  {sub.customer.gstin ? `GSTIN: ${sub.customer.gstin}` : "Unregistered"}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-secondary">Subscription Plan</span>
                <span className="font-semibold text-on-surface mt-0.5">
                  {sub.plan.name}
                </span>
                <span className="text-xs text-secondary font-mono uppercase">
                  {sub.billingPeriod} • Terms: {sub.paymentTerms}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-secondary">Contract Start Date</span>
                <span className="font-mono text-on-surface mt-0.5">
                  {new Date(sub.startDate).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-secondary">
                  {sub.status === SubscriptionStatus.QUOTATION
                    ? "Quotation Validity Expiry"
                    : "Contract Expiry Date"}
                </span>
                <span className="font-mono text-on-surface mt-0.5">
                  {sub.quotationExpiryDate || sub.endDate ? (
                    new Date(
                      sub.quotationExpiryDate || sub.endDate!
                    ).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  ) : (
                    "Continuous / Auto-renewing"
                  )}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-secondary">Next Billing Cadence</span>
                <span className="font-mono text-on-surface mt-0.5">
                  {sub.nextBillingDate
                    ? new Date(sub.nextBillingDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-secondary">Tax Regime Applied</span>
                <span className="text-on-surface font-medium mt-0.5">
                  {isIntra
                    ? "Intra-State GST (CGST 9% + SGST 9%)"
                    : "Inter-State GST (IGST 18%)"}
                </span>
              </div>
            </div>
          </div>

          {/* Snapshotted Plan Policies Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-xs p-6 space-y-3">
            <h3 className="font-title-sm text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">
                policy
              </span>
              Snapshotted Plan Lifecycle Policies
            </h3>
            <p className="text-xs text-secondary">
              These policies were permanently snapshotted at contract creation time. Future plan catalog changes do not alter these contract terms.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="p-3 rounded-lg bg-surface-container-low/60 border border-outline-variant/50 space-y-1">
                <span className="text-secondary block">Manual Pause</span>
                <span className={`font-semibold ${sub.isPausable ? "text-emerald-700" : "text-secondary"}`}>
                  {sub.isPausable ? "Permitted" : "Forbidden"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low/60 border border-outline-variant/50 space-y-1">
                <span className="text-secondary block">Early Close</span>
                <span className={`font-semibold ${sub.isClosableEarly ? "text-emerald-700" : "text-secondary"}`}>
                  {sub.isClosableEarly ? "Permitted" : "Forbidden"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low/60 border border-outline-variant/50 space-y-1">
                <span className="text-secondary block">Renewal</span>
                <span className={`font-semibold ${sub.isRenewable ? "text-emerald-700" : "text-secondary"}`}>
                  {sub.isRenewable ? "Permitted" : "Forbidden"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low/60 border border-outline-variant/50 space-y-1">
                <span className="text-secondary block">Auto-Close at End</span>
                <span className={`font-semibold ${sub.autoClose ? "text-emerald-700" : "text-secondary"}`}>
                  {sub.autoClose ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          {/* Order Lines Table Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/40 flex items-center justify-between bg-surface-bright">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">
                  format_list_bulleted
                </span>
                <h2 className="font-title-sm text-on-surface font-semibold">
                  Itemized Order Lines ({sub.lines.length} items)
                </h2>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-body-sm">
                <thead>
                  <tr className="bg-surface-container-low/70 border-b border-outline-variant/40 text-secondary uppercase font-label-sm">
                    <th className="py-3 px-5">Product & Variant</th>
                    <th className="py-3 px-3 text-center w-20">Qty</th>
                    <th className="py-3 px-4 text-right w-36">Unit Price</th>
                    <th className="py-3 px-4 text-center w-28">Taxes</th>
                    <th className="py-3 px-5 text-right w-40">Line Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {sub.lines.map((l) => {
                    const lineSubtotal = l.quantity * l.unitPricePaise;
                    return (
                      <tr
                        key={l.id}
                        className="hover:bg-surface-container-low/30 transition-colors h-14"
                      >
                        <td className="py-3 px-5">
                          <div className="font-semibold text-on-surface">
                            {l.productVariant.product.name}
                          </div>
                          <div className="text-xs text-secondary flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">
                              Variant: {l.productVariant.name}
                            </span>
                            {l.description && <span>• {l.description}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-medium font-mono">
                          {l.quantity}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <MoneyText amountPaise={l.unitPricePaise} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-container text-secondary">
                            {isIntra ? "GST 18% (C+S)" : "IGST 18%"}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right font-semibold text-on-surface font-currency-table">
                          <MoneyText amountPaise={lineSubtotal} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Financial Calculation Totals Panel */}
            <div className="border-t border-outline-variant/60 bg-surface-bright p-6">
              <div className="w-full md:w-80 ml-auto space-y-2 text-body-sm">
                <div className="flex justify-between items-center text-secondary">
                  <span>Gross Subtotal:</span>
                  <MoneyText
                    amountPaise={taxCalculation.subtotalPaise}
                    className="text-on-surface font-medium"
                  />
                </div>

                {taxCalculation.breakdown.map((t) => (
                  <div
                    key={t.taxName}
                    className="flex justify-between items-center text-secondary"
                  >
                    <span>
                      {t.taxName} ({t.ratePercent}):
                    </span>
                    <MoneyText
                      amountPaise={t.amountPaise}
                      className="text-on-surface font-medium"
                    />
                  </div>
                ))}

                <div className="flex justify-between items-baseline pt-3 border-t-2 border-outline-variant/80 font-bold">
                  <div>
                    <div className="font-label-md text-on-surface uppercase">
                      Total Contract Value:
                    </div>
                    <div className="text-[11px] text-secondary font-normal">
                      Includes all applicable GST
                    </div>
                  </div>
                  <MoneyText
                    amountPaise={taxCalculation.totalPaise}
                    className="text-headline-md text-primary-container"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Customer Card & Activity Timeline (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Customer Overview Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-xs p-5 space-y-3">
            <h3 className="font-title-sm text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">
                domain
              </span>
              Customer Entity
            </h3>
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-on-surface text-body-sm">
                {sub.customer.companyName}
              </div>
              <div className="text-secondary font-mono">
                GSTIN: {sub.customer.gstin || "Unregistered"}
              </div>
              {sub.customer.billingAddress && (
                <div className="text-secondary pt-1 whitespace-pre-line">
                  {sub.customer.billingAddress}
                </div>
              )}
            </div>
          </div>

          {/* Activity Timeline Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">
                  history
                </span>
                <h3 className="font-title-sm text-on-surface font-semibold">
                  Lifecycle Audit History
                </h3>
              </div>
              <span className="text-[11px] text-secondary">
                {sub.auditLogs.length} events
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {sub.auditLogs.length === 0 ? (
                <p className="text-secondary">No lifecycle events recorded yet.</p>
              ) : (
                sub.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2.5 pb-2 border-b border-outline-variant/30 last:border-0"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-on-surface">
                        {log.action}
                      </div>
                      <div className="text-[11px] text-secondary">
                        By {log.user?.email || "System"} •{" "}
                        {new Date(log.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
