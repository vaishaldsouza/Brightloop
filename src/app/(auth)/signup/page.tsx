"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function SignupPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    email: "",
    gstin: "",
    password: "",
    confirmPassword: "",
    termsAccepted: true,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live password validation checklist
  const passwordChecks = useMemo(() => {
    const pwd = formData.password;
    return {
      length: pwd.length >= 8,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(pwd),
    };
  }, [formData.password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!formData.termsAccepted) {
      setError("Please accept the terms to proceed");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          companyName: formData.companyName.trim(),
          email: formData.email.trim().toLowerCase(),
          gstin: formData.gstin.trim() || undefined,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create account");
        setLoading(false);
        return;
      }

      // Automatically sign in the user
      const loginRes = await signIn("credentials", {
        redirect: false,
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      if (loginRes?.error) {
        router.push("/login?message=Account created. Please log in.");
      } else {
        router.push("/portal/subscriptions");
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected network error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface font-body-md antialiased">
      {/* Minimal Brand Header */}
      <header className="w-full bg-surface-container-lowest border-b border-outline-variant/30 sticky top-0 z-50 shadow-sm">
        <div className="w-full px-6 lg:px-8 h-16 flex items-center justify-between mx-auto max-w-7xl">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary shadow-sm">
              <span className="material-symbols-outlined text-[20px]">all_inclusive</span>
            </div>
            <span className="text-headline-md text-primary font-bold tracking-tight">
              Brightloop
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-body-sm text-on-surface-variant hidden sm:inline">
                Already registered?
              </span>
              <Link
                href="/login"
                className="text-body-sm font-semibold text-primary-container hover:text-primary transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Split Workspace */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="w-full max-w-6xl bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[680px]">
          {/* Brand Panel (Left Side: Solid Indigo #4F46E5) */}
          <section className="lg:col-span-5 bg-primary-container text-on-primary p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            ></div>

            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-container-lowest/15 backdrop-blur border border-white/20 flex items-center justify-center text-on-primary shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">all_inclusive</span>
                </div>
                <div>
                  <span className="text-title-sm font-semibold tracking-tight text-white block">
                    Brightloop Subscriptions
                  </span>
                  <span className="text-label-sm text-on-primary-container tracking-wider uppercase">
                    B2B Financial Engine
                  </span>
                </div>
              </div>

              <div className="pt-4">
                <h1 className="text-headline-xl text-white tracking-tight leading-snug">
                  Automated B2B Billing &amp; Revenue Ops for Indian Enterprises
                </h1>
                <p className="mt-3 text-body-md text-on-primary-container leading-relaxed">
                  Consolidate subscription lifecycles, complex recurring contracts, automated e-invoicing, and reconciliation in one mission-critical workspace.
                </p>
              </div>
            </div>

            <div className="relative z-10 pt-10 mt-auto border-t border-white/15 space-y-4">
              <p className="text-label-sm uppercase tracking-wider text-on-primary-container font-semibold">
                Institutional Trust &amp; Compliance
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3 border border-white/10 backdrop-blur-sm">
                  <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-white">verified_user</span>
                  </div>
                  <div>
                    <p className="text-body-sm font-semibold text-white leading-tight">SOC-2 Type II Certified</p>
                    <p className="text-label-sm text-on-primary-container">Audited data integrity &amp; access controls</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3 border border-white/10 backdrop-blur-sm">
                  <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-white">receipt_long</span>
                  </div>
                  <div>
                    <p className="text-body-sm font-semibold text-white leading-tight">GST &amp; E-Invoice Ready</p>
                    <p className="text-label-sm text-on-primary-container">Built-in HSN/SAC logic &amp; real-time IRN generation</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3 border border-white/10 backdrop-blur-sm">
                  <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-white">lock</span>
                  </div>
                  <div>
                    <p className="text-body-sm font-semibold text-white leading-tight">256-Bit Financial Encryption</p>
                    <p className="text-label-sm text-on-primary-container">End-to-end tokenized vaulting &amp; ledger guarantees</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Form Area (Right Side) */}
          <section className="lg:col-span-7 bg-surface-container-lowest p-8 sm:p-10 lg:p-12 flex flex-col justify-center">
            <div className="max-w-md w-full mx-auto space-y-6">
              <div>
                <h2 className="text-headline-lg text-on-surface font-semibold tracking-tight">
                  Create your customer account
                </h2>
                <p className="mt-1 text-body-md text-on-surface-variant">
                  Start managing recurring contracts and GST compliant billing
                </p>
              </div>

              <div className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-3.5 flex items-start gap-3">
                <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0 mt-0.5">
                  info
                </span>
                <div className="text-body-sm text-on-surface-variant">
                  <span className="font-semibold text-on-surface">New accounts are registered as customers.</span> Admin or Staff privileges are designated by internal workspace administrators.
                </div>
              </div>

              {error && (
                <div className="p-3.5 rounded-lg bg-error-container border border-error/20 flex items-start gap-3 shadow-sm">
                  <span className="material-symbols-outlined text-error shrink-0 mt-0.5">error</span>
                  <div className="flex-1 text-on-error-container">
                    <span className="text-label-md block leading-tight font-semibold">Registration Notice</span>
                    <span className="text-body-sm text-on-error-container/90 mt-0.5 block leading-normal">{error}</span>
                  </div>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="name">
                      Contact Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Jane Doe"
                      className="w-full h-[38px] px-3 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant/80 text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="company">
                      Company Name
                    </label>
                    <input
                      id="company"
                      type="text"
                      required
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="Acme Corp"
                      className="w-full h-[38px] px-3 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant/80 text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="email">
                    Work Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px]">mail</span>
                    </div>
                    <input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="finance@acme.com"
                      className="w-full h-[38px] pl-10 pr-3 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant/80 text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="gstin">
                    GSTIN <span className="text-xs text-outline font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px]">receipt</span>
                    </div>
                    <input
                      id="gstin"
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                      placeholder="27AADCT1234A1Z5"
                      maxLength={15}
                      className="w-full h-[38px] pl-10 pr-3 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant/80 text-on-surface uppercase focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px]">lock</span>
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Enter strong password"
                      className="w-full h-[38px] pl-10 pr-10 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant/80 text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface focus:outline-none"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {showPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>

                  {/* Password Checklist */}
                  <div className="mt-2.5 p-3 rounded-lg bg-surface border border-outline-variant/30 space-y-1.5">
                    <p className="text-label-sm text-on-surface-variant font-medium mb-1">Password requirements:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div className={`flex items-center gap-1.5 ${passwordChecks.length ? "text-tertiary" : "text-outline"}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {passwordChecks.length ? "check_circle" : "radio_button_unchecked"}
                        </span>
                        <span className="text-label-sm">8 or more characters</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordChecks.upper ? "text-tertiary" : "text-outline"}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {passwordChecks.upper ? "check_circle" : "radio_button_unchecked"}
                        </span>
                        <span className="text-label-sm">One uppercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordChecks.lower ? "text-tertiary" : "text-outline"}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {passwordChecks.lower ? "check_circle" : "radio_button_unchecked"}
                        </span>
                        <span className="text-label-sm">One lowercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordChecks.special ? "text-tertiary" : "text-outline"}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {passwordChecks.special ? "check_circle" : "radio_button_unchecked"}
                        </span>
                        <span className="text-label-sm">One special character</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                    </div>
                    <input
                      id="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Re-enter password"
                      className="w-full h-[38px] pl-10 pr-10 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant/80 text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
                    />
                    {formData.confirmPassword && formData.password === formData.confirmPassword && (
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-tertiary">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-1 flex items-start gap-2">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={formData.termsAccepted}
                    onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-outline-variant/80 text-primary-container focus:ring-primary-container/20 cursor-pointer"
                  />
                  <label htmlFor="terms" className="text-body-sm text-on-surface-variant leading-tight cursor-pointer">
                    I agree to the Terms of Service, Privacy Policy, and consent to receipt of GST invoice notifications.
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[40px] px-4 rounded-lg bg-primary-container hover:bg-primary active:bg-primary-container text-on-primary font-medium text-body-md transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <span>Creating Account...</span>
                    ) : (
                      <>
                        <span>Create account</span>
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="pt-2 text-center border-t border-outline-variant/30">
                <p className="text-body-md text-on-surface-variant">
                  Already have an account?{" "}
                  <Link href="/login" className="font-semibold text-primary-container hover:text-primary hover:underline">
                    Sign In
                  </Link>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
