"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import { INDIAN_GST_STATES, COMPANY_GST_STATE_CODE } from "@/lib/gstStates";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/actions/customers";

export interface CustomerFormData {
  id?: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  gstState: string;
  gstStateCode: string;
  gstin?: string | null;
  billingAddress?: string | null;
}

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: CustomerFormData | null;
  onSuccess?: (customerId?: string) => void;
}

export function CustomerModal({
  isOpen,
  onClose,
  initialData,
  onSuccess,
}: CustomerModalProps) {
  const isEdit = !!initialData?.id;

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gstState, setGstState] = useState("Maharashtra");
  const [gstStateCode, setGstStateCode] = useState("27");
  const [gstin, setGstin] = useState("");
  const [billingAddress, setBillingAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setCompanyName(initialData.companyName || "");
      setContactName(initialData.contactName || "");
      setEmail(initialData.email || "");
      setPhone(initialData.phone || "");
      setGstState(initialData.gstState || "Maharashtra");
      setGstStateCode(initialData.gstStateCode || "27");
      setGstin(initialData.gstin || "");
      setBillingAddress(initialData.billingAddress || "");
    } else {
      setCompanyName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setGstState("Maharashtra");
      setGstStateCode("27");
      setGstin("");
      setBillingAddress("");
    }
    setErrorMsg(null);
    setFieldErrors({});
  }, [initialData, isOpen]);

  const handleStateChange = (stateName: string) => {
    setGstState(stateName);
    const found = INDIAN_GST_STATES.find((s) => s.name === stateName);
    if (found) {
      setGstStateCode(found.code);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setFieldErrors({});

    const payload = {
      companyName,
      contactName,
      email,
      phone: phone.trim() || null,
      gstState,
      gstStateCode,
      gstin: gstin.trim().toUpperCase() || null,
      billingAddress: billingAddress.trim() || null,
    };

    try {
      const res = isEdit && initialData?.id
        ? await updateCustomerAction(initialData.id, payload)
        : await createCustomerAction(payload);

      if (res.success) {
        onClose();
        if (onSuccess) {
          onSuccess(res.customerId);
        }
      } else {
        setErrorMsg(res.error || "Operation failed.");
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
      }
    } catch (err: unknown) {
      setErrorMsg("An unexpected system error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isIntra = gstStateCode === COMPANY_GST_STATE_CODE;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Customer Account" : "Register New Customer"}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-body-md font-body-md font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="customer-modal-form"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-body-md font-body-md font-semibold hover:bg-primary-container transition disabled:opacity-50"
          >
            {loading && (
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
            )}
            <span>{isEdit ? "Save Changes" : "Create Customer"}</span>
          </button>
        </div>
      }
    >
      <form id="customer-modal-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-body-sm flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-rose-600 mt-0.5">
              error
            </span>
            <div>{errorMsg}</div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Company Name */}
          <div className="space-y-1 md:col-span-2">
            <label className="block text-body-sm font-semibold text-slate-700">
              Company Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Reliance Digital Infra Ltd"
              className={`w-full px-3 py-2 bg-[#F8FAFC] border rounded-lg text-body-md text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition ${
                fieldErrors.companyName ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1] focus:border-primary"
              }`}
            />
            {fieldErrors.companyName && (
              <p className="text-xs text-rose-600">{fieldErrors.companyName}</p>
            )}
          </div>

          {/* Contact Person Name */}
          <div className="space-y-1">
            <label className="block text-body-sm font-semibold text-slate-700">
              Contact Person <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Arun Verma"
              className={`w-full px-3 py-2 bg-[#F8FAFC] border rounded-lg text-body-md text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition ${
                fieldErrors.contactName ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1] focus:border-primary"
              }`}
            />
            {fieldErrors.contactName && (
              <p className="text-xs text-rose-600">{fieldErrors.contactName}</p>
            )}
          </div>

          {/* Email Address */}
          <div className="space-y-1">
            <label className="block text-body-sm font-semibold text-slate-700">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. billing@reliancedigital.in"
              className={`w-full px-3 py-2 bg-[#F8FAFC] border rounded-lg text-body-md text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition ${
                fieldErrors.email ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1] focus:border-primary"
              }`}
            />
            {fieldErrors.email && (
              <p className="text-xs text-rose-600">{fieldErrors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <label className="block text-body-sm font-semibold text-slate-700">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98200 12345"
              className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
            />
          </div>

          {/* State / Jurisdiction */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-body-sm font-semibold text-slate-700">
                State Jurisdiction <span className="text-rose-500">*</span>
              </label>
              <span
                className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                  isIntra ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                }`}
              >
                {isIntra ? "Intra-State (CGST + SGST)" : "Inter-State (IGST)"}
              </span>
            </div>
            <select
              value={gstState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
            >
              {INDIAN_GST_STATES.map((state) => (
                <option key={state.code} value={state.name}>
                  {state.name} ({state.code})
                </option>
              ))}
            </select>
          </div>

          {/* GSTIN */}
          <div className="space-y-1 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="block text-body-sm font-semibold text-slate-700">
                GSTIN (Optional)
              </label>
              <span className="text-xs text-secondary font-mono">
                State Code: <strong className="text-primary font-bold">{gstStateCode}</strong>
              </span>
            </div>
            <input
              type="text"
              maxLength={15}
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder={`e.g. ${gstStateCode}AADCT1234A1Z5`}
              className={`w-full px-3 py-2 font-mono text-body-md bg-[#F8FAFC] border rounded-lg text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition uppercase ${
                fieldErrors.gstin ? "border-rose-400 bg-rose-50/20" : "border-[#CBD5E1] focus:border-primary"
              }`}
            />
            {fieldErrors.gstin && (
              <p className="text-xs text-rose-600">{fieldErrors.gstin}</p>
            )}
            <p className="text-[11px] text-slate-400">
              15-character alphanumeric GST identification number. First 2 digits must match selected state code.
            </p>
          </div>

          {/* Billing Address */}
          <div className="space-y-1 md:col-span-2">
            <label className="block text-body-sm font-semibold text-slate-700">
              Billing Address
            </label>
            <textarea
              rows={2}
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              placeholder="e.g. Tower B, 14th Floor, Maker Maxity, BKC, Mumbai 400051"
              className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-body-md text-on-surface focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition resize-none"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default CustomerModal;
