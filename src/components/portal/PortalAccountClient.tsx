"use client";

import React, { useState } from "react";
import { portalUpdateAccountAction } from "@/app/actions/portal";

interface PortalAccountClientProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  customer: {
    id: string;
    companyName: string;
    gstin?: string | null;
    gstState?: string | null;
    gstStateCode?: string | null;
    billingAddress?: string | null;
    phone?: string | null;
  } | null;
}

export default function PortalAccountClient({
  user,
  customer,
}: PortalAccountClientProps) {
  const [companyName, setCompanyName] = useState(customer?.companyName || "");
  const [gstin, setGstin] = useState(customer?.gstin || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [billingAddress, setBillingAddress] = useState(
    customer?.billingAddress || ""
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setMessage({ type: "error", text: "Company name cannot be empty." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await portalUpdateAccountAction({
        companyName,
        gstin,
        phone,
        billingAddress,
      });

      if (res.success) {
        setMessage({
          type: "success",
          text: "Organization profile updated successfully.",
        });
      } else {
        setMessage({
          type: "error",
          text: res.error || "Failed to update profile.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "An unexpected network error occurred.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-outline-variant">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider text-primary font-semibold">
              Portal Configuration
            </span>
            {customer && (
              <>
                <span className="text-secondary">&bull;</span>
                <span className="text-xs text-secondary font-medium">
                  {customer.companyName}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface">
            Account Settings
          </h1>
          <p className="text-sm text-secondary mt-1">
            Manage your organization profile, billing address, and tax credentials.
          </p>
        </div>

        {/* Security Badge */}
        <div className="inline-flex items-center bg-surface-container-lowest border border-outline-variant rounded-xl p-3 shadow-xs gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[18px]">shield</span>
          </div>
          <div className="text-xs">
            <p className="text-secondary font-medium">Portal Security</p>
            <p className="font-semibold text-tertiary flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Active & Protected
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            message.type === "success"
              ? "bg-tertiary-fixed/30 border-tertiary text-on-tertiary-fixed-variant"
              : "bg-error-container/40 border-error text-error"
          }`}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="font-bold underline text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile Info */}
        <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-container">
            <span className="material-symbols-outlined text-primary text-[20px]">
              badge
            </span>
            <h2 className="text-sm font-bold text-on-surface">
              User Identity & Contact
            </h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              User Name
            </label>
            <input
              type="text"
              value={user.name}
              disabled
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface cursor-not-allowed"
            />
            <p className="text-[11px] text-secondary mt-1">
              Primary login profile name.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              Work Email
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface cursor-not-allowed"
            />
            <p className="text-[11px] text-secondary mt-1">
              Primary email used for billing notifications and authentication.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              suppressHydrationWarning
              className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-xs text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>
        </div>

        {/* Organization & Billing Entity */}
        <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-container">
            <span className="material-symbols-outlined text-primary text-[20px]">
              apartment
            </span>
            <h2 className="text-sm font-bold text-on-surface">
              Company & Tax Profile
            </h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              Company Legal Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Tech Solutions Pvt Ltd"
              suppressHydrationWarning
              className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-xs text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              GSTIN (Goods and Services Tax ID)
            </label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 27AAAAA0000A1Z5"
              className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-xs text-on-surface font-mono uppercase focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              Place of Supply / State
            </label>
            <input
              type="text"
              value={`${customer?.gstState || "Maharashtra"} (Code: ${
                customer?.gstStateCode || "27"
              })`}
              disabled
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface cursor-not-allowed"
            />
            <p className="text-[11px] text-secondary mt-1">
              Determines whether CGST + SGST (Intra-state) or IGST (Inter-state) applies.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              Billing Address
            </label>
            <textarea
              rows={3}
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              placeholder="Official billing address printed on tax invoices..."
              className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-xs text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-xs transition-colors disabled:opacity-50"
            >
              {saving ? "Saving Changes..." : "Save Account Settings"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
