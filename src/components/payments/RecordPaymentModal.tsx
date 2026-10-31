"use client";

import React, { useState, useEffect } from "react";
import { PaymentMethod } from "@prisma/client";
import {
  recordPaymentAction,
  getInvoicePaymentContextAction,
  InvoicePaymentContext,
} from "@/app/actions/payments";
import { formatCurrency } from "@/lib/utils";

interface RecordPaymentModalProps {
  invoiceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (paymentId: string) => void;
  initialContext?: InvoicePaymentContext;
}

export default function RecordPaymentModal({
  invoiceId,
  isOpen,
  onClose,
  onSuccess,
  initialContext,
}: RecordPaymentModalProps) {
  const [context, setContext] = useState<InvoicePaymentContext | null>(
    initialContext || null
  );
  const [loadingContext, setLoadingContext] = useState(!initialContext);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
  const [amountRupees, setAmountRupees] = useState("");
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }

    if (initialContext) {
      setContext(initialContext);
      setAmountRupees((initialContext.amountDuePaise / 100).toFixed(2));
      setLoadingContext(false);
      return;
    }

    setLoadingContext(true);
    getInvoicePaymentContextAction(invoiceId)
      .then((res) => {
        if (res.success && res.data) {
          setContext(res.data);
          setAmountRupees((res.data.amountDuePaise / 100).toFixed(2));
        } else {
          setError(res.error || "Failed to load invoice context.");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error loading invoice details.");
      })
      .finally(() => {
        setLoadingContext(false);
      });
  }, [isOpen, invoiceId, initialContext]);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountRupees) || 0;
  const paymentAmountPaise = Math.round(numericAmount * 100);
  const currentDuePaise = context ? context.amountDuePaise : 0;
  const remainingPaise = Math.max(0, currentDuePaise - paymentAmountPaise);
  const isExactOrOver = paymentAmountPaise >= currentDuePaise && currentDuePaise > 0;

  const handleFillBalance = () => {
    if (context) {
      setAmountRupees((context.amountDuePaise / 100).toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (paymentAmountPaise <= 0) {
      setError("Please enter a payment amount greater than zero.");
      return;
    }

    if (paymentAmountPaise > currentDuePaise) {
      setError(
        `Payment amount (₹${numericAmount.toFixed(2)}) cannot exceed remaining balance (₹${(
          currentDuePaise / 100
        ).toFixed(2)}).`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await recordPaymentAction({
        invoiceId,
        amountPaise: paymentAmountPaise,
        paymentMethod: method,
        paidAt: new Date(paidDate),
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (res.success && res.paymentId) {
        onSuccess?.(res.paymentId);
        onClose();
      } else {
        setError(res.error || "Failed to record payment.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-all duration-200">
      <div className="w-full max-w-xl bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant flex items-start justify-between bg-surface-container-lowest">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">
              Record Payment
            </h2>
            <p className="font-body-sm text-body-sm text-secondary mt-0.5">
              Log a payment transaction against an outstanding customer invoice.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-secondary hover:text-on-surface hover:bg-surface-container-low p-1.5 rounded-lg transition-colors duration-150 -mr-1"
            type="button"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(85vh-130px)] space-y-5">
          {error && (
            <div className="p-3.5 rounded-lg bg-error-container text-on-error-container text-body-sm flex items-start gap-2">
              <span className="material-symbols-outlined text-base shrink-0 mt-0.5">
                error
              </span>
              <span>{error}</span>
            </div>
          )}

          {loadingContext ? (
            <div className="py-12 flex flex-col items-center justify-center text-secondary gap-2">
              <span className="material-symbols-outlined animate-spin text-3xl">
                progress_activity
              </span>
              <p className="text-body-sm">Loading invoice ledger...</p>
            </div>
          ) : context ? (
            <>
              {/* Context Summary Box */}
              <div className="bg-surface-container-low border border-secondary-container rounded-lg p-4">
                <div className="flex items-center justify-between pb-3 border-b border-secondary-container/60">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-headline-md">
                      receipt_long
                    </span>
                    <div>
                      <span className="font-title-sm text-title-sm font-semibold text-on-surface">
                        {context.number}
                      </span>
                      <span className="text-secondary mx-1.5">•</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
                        {context.customerName}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-label-sm font-label-sm font-semibold ${
                      context.isOverdue
                        ? "bg-error-container text-on-error-container"
                        : context.isPartiallyPaid
                        ? "bg-surface-container text-primary"
                        : "bg-surface-container text-secondary"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        context.isOverdue
                          ? "bg-error"
                          : context.isPartiallyPaid
                          ? "bg-primary"
                          : "bg-secondary"
                      }`}
                    />
                    {context.isOverdue
                      ? "Overdue"
                      : context.isPartiallyPaid
                      ? "Partially Paid"
                      : context.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3 text-left">
                  <div>
                    <div className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">
                      Invoice Total
                    </div>
                    <div className="font-currency-table text-currency-table text-on-surface mt-0.5 font-medium">
                      {formatCurrency(context.totalPaise)}
                    </div>
                  </div>
                  <div>
                    <div className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">
                      Already Paid
                    </div>
                    <div className="font-currency-table text-currency-table text-tertiary-container mt-0.5 font-medium">
                      {formatCurrency(context.paidPaise)}
                    </div>
                  </div>
                  <div className="border-l border-secondary-container/80 pl-3">
                    <div className="font-label-sm text-label-sm text-primary-container font-semibold uppercase tracking-wider">
                      Amount Due
                    </div>
                    <div className="font-title-sm text-title-sm font-bold text-primary mt-0.5">
                      {formatCurrency(context.amountDuePaise)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form */}
              <form id="record-payment-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Field 1: Invoice Reference */}
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                    Linked Invoice Reference
                  </label>
                  <div className="relative flex items-center">
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3.5 py-2 text-body-md font-body-md text-secondary cursor-not-allowed select-all pr-24"
                      disabled
                      readOnly
                      type="text"
                      value={`${context.number} — ${context.customerName}`}
                    />
                    <span className="absolute right-2.5 px-2 py-0.5 rounded bg-surface-container-highest text-secondary text-label-sm font-label-sm">
                      Locked
                    </span>
                  </div>
                </div>

                {/* Field 2: Payment Method */}
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1.5">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {/* Bank Transfer */}
                    <button
                      type="button"
                      onClick={() => setMethod(PaymentMethod.BANK_TRANSFER)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border transition-all duration-150 ${
                        method === PaymentMethod.BANK_TRANSFER
                          ? "border-2 border-primary-container bg-surface-container-low shadow-sm text-primary-container font-semibold"
                          : "border-outline-variant hover:bg-surface-container-low text-secondary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-body-md">
                        account_balance
                      </span>
                      <span className="font-label-md text-label-md">Bank</span>
                    </button>

                    {/* Card */}
                    <button
                      type="button"
                      onClick={() => setMethod(PaymentMethod.CARD)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border transition-all duration-150 ${
                        method === PaymentMethod.CARD
                          ? "border-2 border-primary-container bg-surface-container-low shadow-sm text-primary-container font-semibold"
                          : "border-outline-variant hover:bg-surface-container-low text-secondary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-body-md">
                        credit_card
                      </span>
                      <span className="font-label-md text-label-md">Card</span>
                    </button>

                    {/* UPI */}
                    <button
                      type="button"
                      onClick={() => setMethod(PaymentMethod.UPI)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border transition-all duration-150 ${
                        method === PaymentMethod.UPI
                          ? "border-2 border-primary-container bg-surface-container-low shadow-sm text-primary-container font-semibold"
                          : "border-outline-variant hover:bg-surface-container-low text-secondary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-body-md">
                        qr_code_2
                      </span>
                      <span className="font-label-md text-label-md">UPI</span>
                    </button>

                    {/* Cash */}
                    <button
                      type="button"
                      onClick={() => setMethod(PaymentMethod.CASH)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border transition-all duration-150 ${
                        method === PaymentMethod.CASH
                          ? "border-2 border-primary-container bg-surface-container-low shadow-sm text-primary-container font-semibold"
                          : "border-outline-variant hover:bg-surface-container-low text-secondary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-body-md">
                        payments
                      </span>
                      <span className="font-label-md text-label-md">Cash</span>
                    </button>
                  </div>
                </div>

                {/* Field 3 & 4: Amount & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="payment-amount"
                        className="font-label-md text-label-md text-on-surface"
                      >
                        Amount Received (₹)
                      </label>
                      <button
                        type="button"
                        onClick={handleFillBalance}
                        className="text-primary-container hover:underline font-label-sm text-label-sm font-semibold"
                      >
                        Fill Balance
                      </button>
                    </div>
                    <div className="relative flex rounded-lg shadow-sm">
                      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-outline-variant bg-surface-container-low text-secondary font-label-md text-label-md">
                        ₹
                      </span>
                      <input
                        id="payment-amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={(currentDuePaise / 100).toFixed(2)}
                        required
                        value={amountRupees}
                        onChange={(e) => setAmountRupees(e.target.value)}
                        className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-lg border border-outline-variant text-on-surface font-title-sm text-title-sm font-semibold focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                      />
                    </div>
                    <p className="font-label-sm text-label-sm text-secondary mt-1">
                      Full or partial payment allowed.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="payment-date"
                      className="block font-label-md text-label-md text-on-surface mb-1.5"
                    >
                      Payment Date
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="payment-date"
                        type="date"
                        required
                        value={paidDate}
                        onChange={(e) => setPaidDate(e.target.value)}
                        className="w-full border border-outline-variant rounded-lg px-3 py-2 text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
                      />
                    </div>
                    <p className="font-label-sm text-label-sm text-secondary mt-1">
                      Transaction realization date.
                    </p>
                  </div>
                </div>

                {/* Field 5: Reference / Transaction ID */}
                <div>
                  <label
                    htmlFor="reference-id"
                    className="block font-label-md text-label-md text-on-surface mb-1.5"
                  >
                    Reference / Transaction ID
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3 text-secondary text-body-md">
                      tag
                    </span>
                    <input
                      id="reference-id"
                      type="text"
                      placeholder="UTR / Cheque / Transaction No. (e.g. CMS981726451)"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-lg text-body-md font-body-md text-on-surface placeholder-secondary focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Field 6: Note */}
                <div>
                  <label
                    htmlFor="payment-remarks"
                    className="block font-label-md text-label-md text-on-surface mb-1.5"
                  >
                    Note (Transaction Reference / Remarks)
                  </label>
                  <textarea
                    id="payment-remarks"
                    rows={2}
                    placeholder="Optional internal remarks about this receipt..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 text-body-md font-body-md text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none resize-none"
                  />
                </div>

                {/* Real-time Balance Calculation preview card */}
                <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-body-sm font-body-sm">
                    <span className="text-secondary">Amount Due before payment</span>
                    <span className="font-currency-table text-currency-table text-on-surface font-medium">
                      {formatCurrency(currentDuePaise)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-body-sm font-body-sm">
                    <span className="text-secondary">Payment being recorded</span>
                    <span className="font-currency-table text-currency-table text-primary-container font-semibold">
                      - {formatCurrency(paymentAmountPaise)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-outline-variant flex items-center justify-between">
                    <div>
                      <span className="font-title-sm text-title-sm font-semibold text-on-surface">
                        Remaining balance
                      </span>
                      {isExactOrOver && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="material-symbols-outlined text-tertiary-container text-body-sm">
                            check_circle
                          </span>
                          <span className="font-label-sm text-label-sm text-tertiary-container font-semibold">
                            Invoice will be marked as Fully Paid
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className={`font-headline-md text-headline-md font-bold ${
                        remainingPaise === 0
                          ? "text-tertiary-container"
                          : "text-primary"
                      }`}
                    >
                      {formatCurrency(remainingPaise)}
                    </span>
                  </div>
                </div>
              </form>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            type="button"
            className="px-4 py-2 bg-surface-container-lowest border border-outline-variant hover:bg-surface text-on-surface font-body-md text-body-md font-medium rounded-lg transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            form="record-payment-form"
            type="submit"
            disabled={submitting || loadingContext || !context}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-container hover:bg-primary text-on-primary font-body-md text-body-md font-medium rounded-lg shadow-sm transition-all duration-150 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined animate-spin text-base">
                  progress_activity
                </span>
                <span>Recording...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">check</span>
                <span>
                  {isExactOrOver
                    ? "Record Payment & Mark Paid"
                    : "Record Partial Payment"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
