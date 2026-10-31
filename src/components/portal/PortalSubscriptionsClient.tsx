"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { SubscriptionStatus, BillingPeriod } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  portalPauseSubscriptionAction,
  portalResumeSubscriptionAction,
  portalRenewSubscriptionAction,
  portalCloseSubscriptionAction,
} from "@/app/actions/portal";

export interface PortalSubscriptionItem {
  id: string;
  number: string;
  planName: string;
  billingPeriod: BillingPeriod;
  status: SubscriptionStatus;
  isPaused: boolean;
  isPausable: boolean;
  isRenewable: boolean;
  isClosableEarly: boolean;
  startDate: string;
  endDate?: string | null;
  nextBillingDate?: string | null;
  quotationExpiryDate?: string | null;
  totalPaise: number;
  itemCount: number;
}

interface PortalSubscriptionsClientProps {
  subscriptions: PortalSubscriptionItem[];
}

type FilterStatus = "ALL" | "ACTIVE" | "QUOTATION" | "CONFIRMED" | "CLOSED";

export default function PortalSubscriptionsClient({
  subscriptions,
}: PortalSubscriptionsClientProps) {
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    type: "pause" | "resume" | "renew" | "close";
    subId: string;
    subNumber: string;
  } | null>(null);
  const [modalReason, setModalReason] = useState("");

  const counts = useMemo(() => {
    return {
      all: subscriptions.length,
      active: subscriptions.filter((s) => s.status === SubscriptionStatus.ACTIVE).length,
      quotation: subscriptions.filter((s) => s.status === SubscriptionStatus.QUOTATION).length,
      confirmed: subscriptions.filter((s) => s.status === SubscriptionStatus.CONFIRMED).length,
      closed: subscriptions.filter((s) => s.status === SubscriptionStatus.CLOSED).length,
    };
  }, [subscriptions]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      if (filter === "ACTIVE" && sub.status !== SubscriptionStatus.ACTIVE) return false;
      if (filter === "QUOTATION" && sub.status !== SubscriptionStatus.QUOTATION) return false;
      if (filter === "CONFIRMED" && sub.status !== SubscriptionStatus.CONFIRMED) return false;
      if (filter === "CLOSED" && sub.status !== SubscriptionStatus.CLOSED) return false;

      if (search) {
        const q = search.toLowerCase();
        return (
          sub.number.toLowerCase().includes(q) ||
          sub.planName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [subscriptions, filter, search]);

  const handleExecuteAction = async () => {
    if (!confirmModal) return;
    const { type, subId } = confirmModal;
    setLoadingAction(subId);
    setActionError(null);

    try {
      let res;
      if (type === "pause") {
        res = await portalPauseSubscriptionAction(subId, modalReason);
      } else if (type === "resume") {
        res = await portalResumeSubscriptionAction(subId);
      } else if (type === "renew") {
        res = await portalRenewSubscriptionAction(subId);
      } else if (type === "close") {
        res = await portalCloseSubscriptionAction(subId, modalReason);
      }

      if (res && !res.success) {
        setActionError(res.error || "Action failed. Please try again.");
      } else {
        setConfirmModal(null);
        setModalReason("");
      }
    } catch (err) {
      setActionError("An unexpected network error occurred.");
    } finally {
      setLoadingAction(null);
    }
  };

  const getStatusBadge = (sub: PortalSubscriptionItem) => {
    if (sub.status === SubscriptionStatus.ACTIVE) {
      if (sub.isPaused) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary-fixed text-secondary border border-outline-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            Paused
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary-fixed-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
          Active
        </span>
      );
    }
    if (sub.status === SubscriptionStatus.CONFIRMED) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-fixed text-primary border border-primary-fixed-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Confirmed
        </span>
      );
    }
    if (sub.status === SubscriptionStatus.QUOTATION) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary-container text-on-secondary-container">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          Quotation
        </span>
      );
    }
    if (sub.status === SubscriptionStatus.CLOSED) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-outline" />
          Closed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container-high text-secondary">
        Draft
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-outline-variant">
        <div>
          <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
            My Subscriptions
          </h1>
          <p className="font-body-md text-sm text-secondary mt-1">
            View and manage your active subscriptions, renewal cycles, and contracted services.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-error-container/40 border border-error rounded-xl flex items-center justify-between text-error text-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-error font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
            <span className="material-symbols-outlined text-[18px]">search</span>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by subscription number or plan..."
            className="block w-full pl-9 pr-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface-container-low rounded-lg border border-outline-variant overflow-x-auto">
          {(
            [
              { key: "ALL", label: `All (${counts.all})` },
              { key: "ACTIVE", label: `Active (${counts.active})` },
              { key: "QUOTATION", label: `Quotation (${counts.quotation})` },
              { key: "CONFIRMED", label: `Confirmed (${counts.confirmed})` },
              { key: "CLOSED", label: `Closed (${counts.closed})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                filter === tab.key
                  ? "bg-surface-container-lowest text-primary shadow-xs"
                  : "text-secondary hover:text-on-surface"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Subscriptions */}
      {filteredSubscriptions.length === 0 ? (
        <div className="text-center py-16 bg-surface-container-lowest border border-outline-variant rounded-xl">
          <span className="material-symbols-outlined text-4xl text-secondary mb-2">
            autorenew
          </span>
          <h3 className="font-title-sm text-base font-semibold text-on-surface">
            No subscriptions found
          </h3>
          <p className="text-xs text-secondary mt-1">
            {search
              ? "No subscriptions match your query."
              : "You do not have any subscriptions matching this status."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {filteredSubscriptions.map((sub) => {
            const isLoading = loadingAction === sub.id;

            return (
              <article
                key={sub.id}
                className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col justify-between hover:border-outline transition-all duration-200"
              >
                <div>
                  {/* Card Header & Badge */}
                  <div className="flex items-start justify-between gap-2 border-b border-surface-container pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
                          Contract
                        </span>
                        <span className="text-xs font-semibold text-primary px-2 py-0.5 rounded bg-surface-container">
                          {sub.number}
                        </span>
                      </div>
                      <h2 className="font-headline-md text-lg text-on-surface mt-1.5 font-bold">
                        {sub.planName}
                      </h2>
                    </div>
                    {getStatusBadge(sub)}
                  </div>

                  {/* Specifications & Cadence */}
                  <div className="py-4 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-secondary">
                      <span>Billing Cadence:</span>
                      <span className="font-semibold text-on-surface">
                        {sub.billingPeriod}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-secondary">
                      <span>Contract Start:</span>
                      <span className="text-on-surface">{formatDate(sub.startDate)}</span>
                    </div>

                    {sub.nextBillingDate && (
                      <div className="flex justify-between items-center text-secondary">
                        <span>Next Billing:</span>
                        <span className="font-semibold text-primary">
                          {formatDate(sub.nextBillingDate)}
                        </span>
                      </div>
                    )}

                    {sub.endDate && (
                      <div className="flex justify-between items-center text-secondary">
                        <span>Term Expiry:</span>
                        <span className="text-on-surface">{formatDate(sub.endDate)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-surface-container">
                      <span className="text-secondary font-medium">
                        Recurring Amount:
                      </span>
                      <span className="text-base font-bold text-on-surface">
                        {formatCurrency(sub.totalPaise)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="pt-4 border-t border-surface-container flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/portal/subscriptions/${sub.id}`}
                      className="flex-1 text-center py-2 px-3 rounded-lg border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-on-surface transition-colors"
                    >
                      View Details
                    </Link>

                    {/* Self-service pause/resume */}
                    {sub.status === SubscriptionStatus.ACTIVE && sub.isPausable && (
                      sub.isPaused ? (
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() =>
                            setConfirmModal({
                              type: "resume",
                              subId: sub.id,
                              subNumber: sub.number,
                            })
                          }
                          className="py-2 px-3 rounded-lg bg-tertiary text-on-tertiary text-xs font-semibold hover:bg-tertiary-container transition-colors disabled:opacity-50"
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() =>
                            setConfirmModal({
                              type: "pause",
                              subId: sub.id,
                              subNumber: sub.number,
                            })
                          }
                          className="py-2 px-3 rounded-lg border border-outline-variant hover:bg-surface-container-low text-xs font-semibold text-secondary transition-colors disabled:opacity-50"
                        >
                          Pause
                        </button>
                      )
                    )}

                    {/* Self-service renew */}
                    {sub.status === SubscriptionStatus.ACTIVE && sub.isRenewable && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() =>
                          setConfirmModal({
                            type: "renew",
                            subId: sub.id,
                            subNumber: sub.number,
                          })
                        }
                        className="py-2 px-3 rounded-lg bg-primary-container text-on-primary text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-50"
                      >
                        Renew
                      </button>
                    )}
                  </div>

                  {/* Self-service early close if allowed */}
                  {sub.status === SubscriptionStatus.ACTIVE && sub.isClosableEarly && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setConfirmModal({
                          type: "close",
                          subId: sub.id,
                          subNumber: sub.number,
                        })
                      }
                      className="w-full text-center py-1.5 text-xs text-error hover:underline transition-colors disabled:opacity-50"
                    >
                      Cancel Subscription
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-on-surface">
              {confirmModal.type === "pause" && `Pause ${confirmModal.subNumber}?`}
              {confirmModal.type === "resume" && `Resume ${confirmModal.subNumber}?`}
              {confirmModal.type === "renew" && `Renew ${confirmModal.subNumber}?`}
              {confirmModal.type === "close" && `Cancel ${confirmModal.subNumber}?`}
            </h3>

            <p className="text-sm text-secondary mt-2">
              {confirmModal.type === "pause" &&
                "Pausing your subscription temporarily stops recurring billing and service intervals. You can resume at any time."}
              {confirmModal.type === "resume" &&
                "Resuming your subscription re-activates recurring billing, shifting your next invoice date by the paused period."}
              {confirmModal.type === "renew" &&
                "Renewing extends your current contract for another full billing period based on your plan terms."}
              {confirmModal.type === "close" &&
                "Are you sure you want to cancel this contract early? Once closed, your subscription cannot be reopened."}
            </p>

            {(confirmModal.type === "pause" || confirmModal.type === "close") && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-secondary mb-1">
                  Reason or note (optional):
                </label>
                <input
                  type="text"
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="e.g. Temporary project hiatus"
                  className="w-full px-3 py-2 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(null);
                  setModalReason("");
                }}
                className="px-4 py-2 text-xs font-semibold text-secondary hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={loadingAction !== null}
                className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm text-white ${
                  confirmModal.type === "close"
                    ? "bg-error hover:bg-error/90"
                    : confirmModal.type === "pause"
                    ? "bg-secondary hover:bg-secondary/90"
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
