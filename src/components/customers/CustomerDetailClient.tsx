"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import TagBadge from "@/components/ui/TagBadge";
import MoneyText from "@/components/ui/MoneyText";
import DataTable, { Column } from "@/components/ui/DataTable";
import CustomerModal, { CustomerFormData } from "@/components/customers/CustomerModal";
import Modal from "@/components/ui/Modal";
import { COMPANY_GST_STATE_CODE } from "@/lib/gstStates";
import { deleteCustomerAction } from "@/app/actions/customers";

export interface DetailedSubscription {
  id: string;
  number: string;
  status: string;
  isPaused: boolean;
  billingPeriod: string;
  startDate: string;
  endDate: string | null;
  nextBillingDate: string | null;
  discountAmountPaise: number | null;
  plan: {
    id: string;
    name: string;
    billingPeriod: string;
    pricePaise: number;
  };
  recurringSubtotalPaise: number;
}

export interface DetailedInvoice {
  id: string;
  number: string;
  status: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  isOverdue: boolean;
  isPartiallyPaid: boolean;
  subscriptionNumber: string;
}

export interface DetailedPayment {
  id: string;
  amountPaise: number;
  paymentMethod: string;
  paidAt: string;
  reference: string | null;
  invoiceNumber: string;
}

export interface CustomerDetailData {
  id: string;
  companyName: string;
  gstin: string | null;
  gstState: string | null;
  gstStateCode: string | null;
  phone: string | null;
  billingAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  metrics: {
    activeSubscriptions: number;
    totalSubscriptions: number;
    totalInvoicedPaise: number;
    totalOutstandingPaise: number;
  };
  subscriptions: DetailedSubscription[];
  invoices: DetailedInvoice[];
  payments: DetailedPayment[];
}

interface CustomerDetailClientProps {
  customer: CustomerDetailData;
  isAdmin: boolean;
}

export default function CustomerDetailClient({
  customer,
  isAdmin,
}: CustomerDetailClientProps) {
  const router = useRouter();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isIntra = customer.gstStateCode === COMPANY_GST_STATE_CODE;

  const editFormData: CustomerFormData = {
    id: customer.id,
    companyName: customer.companyName,
    contactName: customer.user.name,
    email: customer.user.email,
    phone: customer.phone,
    gstState: customer.gstState || "Maharashtra",
    gstStateCode: customer.gstStateCode || "27",
    gstin: customer.gstin,
    billingAddress: customer.billingAddress,
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteCustomerAction(customer.id);
      if (res.success) {
        setIsDeleteModalOpen(false);
        router.push("/customers");
      } else {
        setDeleteError(res.error || "Failed to delete customer.");
      }
    } catch {
      setDeleteError("An unexpected error occurred while deleting customer.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Subscriptions Table Columns
  const subscriptionColumns: Column<DetailedSubscription>[] = [
    {
      header: "Subscription #",
      accessor: (s) => (
        <span className="font-mono text-body-sm font-semibold text-primary">
          {s.number}
        </span>
      ),
    },
    {
      header: "Plan Name",
      accessor: (s) => (
        <div>
          <span className="font-medium text-on-surface">{s.plan.name}</span>
          <span className="text-xs text-secondary block lowercase">
            {s.billingPeriod} billing
          </span>
        </div>
      ),
    },
    {
      header: "Recurring Subtotal",
      align: "right",
      accessor: (s) => (
        <MoneyText
          amountPaise={s.recurringSubtotalPaise}
          className="font-medium text-on-surface"
        />
      ),
    },
    {
      header: "Status",
      accessor: (s) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={s.status} />
          {s.isPaused && <TagBadge tag="PAUSED" />}
        </div>
      ),
    },
    {
      header: "Next Billing Date",
      accessor: (s) => (
        <span className="text-body-sm text-secondary">
          {s.nextBillingDate
            ? new Date(s.nextBillingDate).toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </span>
      ),
    },
  ];

  // Invoices Table Columns
  const invoiceColumns: Column<DetailedInvoice>[] = [
    {
      header: "Invoice #",
      accessor: (i) => (
        <span className="font-mono text-body-sm font-semibold text-primary">
          {i.number}
        </span>
      ),
    },
    {
      header: "Due Date",
      accessor: (i) => (
        <span className="text-body-sm text-secondary">
          {new Date(i.dueDate).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      header: "Total",
      align: "right",
      accessor: (i) => (
        <MoneyText amountPaise={i.totalPaise} className="font-medium text-on-surface" />
      ),
    },
    {
      header: "Paid",
      align: "right",
      accessor: (i) => (
        <MoneyText amountPaise={i.paidPaise} className="text-emerald-700 font-medium" />
      ),
    },
    {
      header: "Outstanding",
      align: "right",
      accessor: (i) => (
        <MoneyText
          amountPaise={i.balancePaise}
          className={`font-semibold ${
            i.balancePaise > 0 ? "text-rose-600" : "text-slate-400"
          }`}
        />
      ),
    },
    {
      header: "Status & Tags",
      accessor: (i) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={i.status} />
          {i.isOverdue && <TagBadge tag="OVERDUE" />}
          {i.isPartiallyPaid && <TagBadge tag="PARTIALLY_PAID" />}
        </div>
      ),
    },
  ];

  // Payments Table Columns
  const paymentColumns: Column<DetailedPayment>[] = [
    {
      header: "Payment ID / Ref",
      accessor: (p) => (
        <span className="font-mono text-xs font-semibold text-on-surface">
          {p.reference || p.id.slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      header: "Date",
      accessor: (p) => (
        <span className="text-body-sm text-secondary">
          {new Date(p.paidAt).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      header: "Method",
      accessor: (p) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
          {p.paymentMethod.replace("_", " ")}
        </span>
      ),
    },
    {
      header: "Invoice",
      accessor: (p) => (
        <span className="font-mono text-xs font-medium text-primary">
          {p.invoiceNumber}
        </span>
      ),
    },
    {
      header: "Amount",
      align: "right",
      accessor: (p) => (
        <MoneyText
          amountPaise={p.amountPaise}
          className="font-semibold text-emerald-700"
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={customer.companyName}
        subtitle="Customer Account Profile, GST Tax Jurisdiction, and Billing History"
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: customer.companyName },
        ]}
        statusBadge={
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
              isIntra
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-purple-50 text-purple-700 border border-purple-200"
            }`}
          >
            {isIntra ? "Intra-State (MH 27)" : "Inter-State"}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-body-md font-body-md font-semibold hover:bg-primary-container shadow-xs transition"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              <span>Edit Customer</span>
            </button>
            {isAdmin && customer.subscriptions.length === 0 && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 text-body-md font-body-md font-semibold transition"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                <span>Delete</span>
              </button>
            )}
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Subscriptions */}
        <div className="bg-surface-container-lowest border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-secondary mb-2">
            <span className="text-body-sm font-medium">Active Subscriptions</span>
            <span className="material-symbols-outlined text-primary text-[20px]">
              autorenew
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-currency-metric text-headline-xl font-bold text-on-surface">
              {customer.metrics.activeSubscriptions}
            </span>
            <span className="text-body-sm text-secondary">
              of {customer.metrics.totalSubscriptions} total
            </span>
          </div>
        </div>

        {/* Total Invoiced */}
        <div className="bg-surface-container-lowest border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-secondary mb-2">
            <span className="text-body-sm font-medium">Total Invoiced</span>
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">
              receipt_long
            </span>
          </div>
          <div>
            <MoneyText
              amountPaise={customer.metrics.totalInvoicedPaise}
              className="font-currency-metric text-headline-xl font-bold text-on-surface"
            />
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-surface-container-lowest border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-secondary mb-2">
            <span className="text-body-sm font-medium">Outstanding Balance</span>
            <span className="material-symbols-outlined text-rose-600 text-[20px]">
              pending_actions
            </span>
          </div>
          <div>
            <MoneyText
              amountPaise={customer.metrics.totalOutstandingPaise}
              className={`font-currency-metric text-headline-xl font-bold ${
                customer.metrics.totalOutstandingPaise > 0
                  ? "text-rose-600"
                  : "text-emerald-700"
              }`}
            />
          </div>
        </div>
      </div>

      {/* Customer Profile & Tax Information Card */}
      <div className="bg-surface-container-lowest border border-[#CBD5E1] rounded-xl p-6 shadow-xs space-y-6">
        <div className="border-b border-[#F1F5F9] pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">
              badge
            </span>
            <h2 className="font-headline-sm text-title-md font-bold text-on-surface">
              Account Profile & Tax Jurisdiction
            </h2>
          </div>
          <span className="text-xs text-secondary">
            Registered on{" "}
            {new Date(customer.createdAt).toLocaleDateString("en-IN", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Contact Person
            </div>
            <div className="text-body-md font-semibold text-on-surface mt-1">
              {customer.user.name}
            </div>
            <div className="text-body-sm text-secondary font-mono mt-0.5">
              {customer.user.email}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Phone Number
            </div>
            <div className="text-body-md font-medium text-on-surface mt-1">
              {customer.phone || <span className="text-slate-400 italic">Not provided</span>}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              GST Registration (GSTIN)
            </div>
            <div className="mt-1">
              {customer.gstin ? (
                <span className="font-mono text-body-sm font-semibold px-2 py-1 bg-surface-container-high rounded text-on-surface border border-[#E2E8F0]">
                  {customer.gstin}
                </span>
              ) : (
                <span className="text-body-sm text-slate-400 italic">
                  Unregistered (Consumer / B2C)
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              State & GST Code
            </div>
            <div className="text-body-md font-medium text-on-surface mt-1">
              {customer.gstState || "Unknown"} (Code: {customer.gstStateCode || "—"})
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Applicable Tax Regime
            </div>
            <div className="text-body-md font-medium text-on-surface mt-1 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isIntra ? "bg-blue-600" : "bg-purple-600"
                }`}
              />
              <span>
                {isIntra
                  ? "Intra-State: CGST (9%) + SGST (9%)"
                  : "Inter-State: IGST (18%)"}
              </span>
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Billing Address
            </div>
            <div className="text-body-sm text-on-surface mt-1 whitespace-pre-line bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-lg">
              {customer.billingAddress || (
                <span className="text-slate-400 italic">No billing address recorded</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              autorenew
            </span>
            <h3 className="font-title-md text-title-md font-bold text-on-surface">
              Subscriptions ({customer.subscriptions.length})
            </h3>
          </div>
        </div>
        <DataTable
          columns={subscriptionColumns}
          data={customer.subscriptions}
          keyExtractor={(s) => s.id}
          emptyIcon="autorenew"
          emptyMessage="No subscription contracts found for this customer."
        />
      </div>

      {/* Invoices Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              receipt_long
            </span>
            <h3 className="font-title-md text-title-md font-bold text-on-surface">
              Invoices ({customer.invoices.length})
            </h3>
          </div>
        </div>
        <DataTable
          columns={invoiceColumns}
          data={customer.invoices}
          keyExtractor={(i) => i.id}
          emptyIcon="receipt_long"
          emptyMessage="No invoices generated for this customer."
        />
      </div>

      {/* Payments Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              payments
            </span>
            <h3 className="font-title-md text-title-md font-bold text-on-surface">
              Payments ({customer.payments.length})
            </h3>
          </div>
        </div>
        <DataTable
          columns={paymentColumns}
          data={customer.payments}
          keyExtractor={(p) => p.id}
          emptyIcon="payments"
          emptyMessage="No payment transactions recorded for this customer."
        />
      </div>

      {/* Edit Customer Modal */}
      <CustomerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        initialData={editFormData}
        onSuccess={() => {
          setIsEditModalOpen(false);
          router.refresh();
        }}
      />

      {/* Delete Confirmation Modal (Admin only) */}
      {isAdmin && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Customer Account"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-body-md font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-body-md font-semibold hover:bg-rose-700 transition disabled:opacity-50"
              >
                {isDeleting && (
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                )}
                <span>Confirm Delete</span>
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {deleteError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-body-sm">
                {deleteError}
              </div>
            )}
            <p className="text-body-md text-on-surface">
              Are you sure you want to permanently delete the customer account for{" "}
              <strong>{customer.companyName}</strong>?
            </p>
            <p className="text-body-sm text-secondary">
              This action cannot be undone. All linked login credentials will also be removed.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
