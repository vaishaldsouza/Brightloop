"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.resetUrl) {
        setResetUrl(data.resetUrl);
      }
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface font-body-md antialiased">
      <header className="bg-surface-container-lowest border-b border-outline-variant shadow-sm docked full-width top-0 sticky z-50">
        <div className="w-full px-6 lg:px-8 h-16 flex items-center justify-between mx-auto max-w-7xl">
          <Link href="/" className="text-headline-md text-primary font-bold tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">all_inclusive</span>
            <span>Brightloop</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-body-md text-on-surface hover:text-primary px-3 py-1.5 transition-colors">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="bg-primary-container text-on-primary hover:bg-primary px-4 py-2 rounded-lg text-body-md font-medium transition-colors shadow-sm"
            >
              Create Account
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center px-4 py-8 lg:py-12">
        <div className="w-full max-w-6xl bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-[640px]">
          {/* Left Side: Indigo Brand Panel */}
          <section className="lg:w-5/12 bg-primary-container text-on-primary p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            ></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-container-lowest/15 backdrop-blur flex items-center justify-center border border-white/20">
                  <span className="material-symbols-outlined text-on-primary">all_inclusive</span>
                </div>
                <span className="text-headline-lg tracking-tight font-bold text-on-primary">Brightloop</span>
              </div>
              <div className="mt-12 space-y-4">
                <h2 className="text-headline-xl text-white font-bold leading-tight">
                  Security-First Account Recovery
                </h2>
                <p className="text-on-primary-container text-body-md leading-relaxed">
                  Reset links are time-limited and cryptographically validated to safeguard your organization&apos;s subscription ledger.
                </p>
              </div>
            </div>
            <div className="relative z-10 pt-8 border-t border-white/15 text-on-primary-container text-label-sm">
              SOC-2 Type II Certified &bull; 256-Bit Financial Encryption
            </div>
          </section>

          {/* Right Side: Reset Form / Confirmation */}
          <section className="lg:w-7/12 p-8 lg:p-12 flex flex-col justify-center bg-surface-container-lowest">
            <div className="w-full max-w-xl mx-auto space-y-8">
              {!submitted ? (
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                      <span className="material-symbols-outlined text-primary text-[15px]">lock_reset</span>
                      Account Recovery
                    </div>
                    <h1 className="text-headline-xl font-bold text-on-background tracking-tight">
                      Reset your password
                    </h1>
                    <p className="text-body-md text-on-surface-variant">
                      Enter your verified work email address and we will send you a secure password reset link.
                    </p>
                  </div>

                  <form className="space-y-4" onSubmit={handleSubmit}>
                    <div className="space-y-1.5">
                      <label className="block text-label-md text-on-surface font-medium" htmlFor="email">
                        Work Email Address
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                          <span className="material-symbols-outlined text-[20px]">mail</span>
                        </div>
                        <input
                          id="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="rajesh@brightloop.in"
                          className="block w-full h-[38px] pl-10 pr-3.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-1 space-y-4">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-[38px] px-4 bg-primary-container hover:bg-primary active:bg-primary text-on-primary rounded-lg text-body-md font-medium transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {loading ? <span>Sending Link...</span> : <span>Send reset link</span>}
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </button>

                      <div className="flex items-center justify-between text-body-sm pt-1">
                        <Link
                          href="/login"
                          className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                          <span>Back to log in</span>
                        </Link>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="rounded-xl border border-tertiary-fixed-dim/40 bg-surface-container-low p-6 shadow-sm space-y-4 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-tertiary"></div>
                  <div className="flex items-start gap-3.5 pl-1">
                    <div className="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center shrink-0 text-on-tertiary-fixed-variant">
                      <span className="material-symbols-outlined text-2xl">mark_email_read</span>
                    </div>
                    <div className="space-y-2 flex-1">
                      <h3 className="text-title-sm text-on-surface font-semibold">
                        Check your inbox
                      </h3>
                      <p className="text-body-sm text-on-surface-variant">
                        If an account exists for <strong className="text-on-surface">{email}</strong>, we have dispatched a password recovery link valid for 60 minutes.
                      </p>

                      {resetUrl && (
                        <div className="mt-4 p-3 rounded-lg bg-surface border border-outline-variant text-xs">
                          <p className="font-semibold text-primary mb-1">Local Development Link:</p>
                          <Link href={resetUrl} className="text-primary hover:underline break-all">
                            {resetUrl}
                          </Link>
                        </div>
                      )}

                      <div className="pt-2">
                        <Link
                          href="/login"
                          className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium text-body-sm"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                          <span>Return to login</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
