"use client";

import { useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordChecks = useMemo(() => {
    return {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Reset token is missing or invalid. Please request a new link.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!passwordChecks.length || !passwordChecks.upper || !passwordChecks.lower || !passwordChecks.special) {
      setError("Please ensure your password meets all complexity requirements.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reset password.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login?message=Password updated successfully. Please log in.");
      }, 2000);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div>
        <h2 className="text-headline-lg font-bold text-on-surface tracking-tight">
          Create New Password
        </h2>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Enter and confirm your new secure credential below.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-error-container border border-error/20 flex items-start gap-3 shadow-sm">
          <span className="material-symbols-outlined text-error shrink-0 mt-0.5">error</span>
          <div className="flex-1 text-on-error-container">
            <span className="text-label-md block leading-tight font-semibold">Error</span>
            <span className="text-body-sm text-on-error-container/90 mt-0.5 block leading-normal">{error}</span>
          </div>
        </div>
      )}

      {success ? (
        <div className="p-4 rounded-lg bg-surface-container-low border border-tertiary-fixed text-center space-y-3">
          <span className="material-symbols-outlined text-tertiary text-3xl">check_circle</span>
          <p className="text-body-md font-semibold text-on-surface">
            Password updated successfully!
          </p>
          <p className="text-body-sm text-on-surface-variant">
            Redirecting to login...
          </p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="password">
              New Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full h-[38px] px-3 pr-10 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface focus:outline-none"
              >
                <span className="material-symbols-outlined text-lg">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>

            <div className="mt-2.5 p-3 rounded-lg bg-surface border border-outline-variant/30 space-y-1.5">
              <p className="text-label-sm text-on-surface-variant font-medium mb-1">Password requirements:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div className={`flex items-center gap-1.5 ${passwordChecks.length ? "text-tertiary" : "text-outline"}`}>
                  <span className="material-symbols-outlined text-[16px]">
                    {passwordChecks.length ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <span className="text-label-sm">8+ characters</span>
                </div>
                <div className={`flex items-center gap-1.5 ${passwordChecks.upper ? "text-tertiary" : "text-outline"}`}>
                  <span className="material-symbols-outlined text-[16px]">
                    {passwordChecks.upper ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <span className="text-label-sm">One uppercase</span>
                </div>
                <div className={`flex items-center gap-1.5 ${passwordChecks.lower ? "text-tertiary" : "text-outline"}`}>
                  <span className="material-symbols-outlined text-[16px]">
                    {passwordChecks.lower ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <span className="text-label-sm">One lowercase</span>
                </div>
                <div className={`flex items-center gap-1.5 ${passwordChecks.special ? "text-tertiary" : "text-outline"}`}>
                  <span className="material-symbols-outlined text-[16px]">
                    {passwordChecks.special ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <span className="text-label-sm">One special char</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-label-md text-on-surface font-medium mb-1.5" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full h-[38px] px-3 text-body-md rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none transition-colors"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[40px] px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-medium text-body-md transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <span>Updating Password...</span> : <span>Save New Password</span>}
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </form>
      )}

      <div className="pt-4 text-center">
        <Link href="/login" className="text-body-sm text-primary hover:underline font-medium">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 min-h-screen bg-background text-on-surface">
      {/* Left Column: Brand Panel */}
      <div className="lg:col-span-4 bg-primary-container text-on-primary flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shadow-sm">
            <span className="material-symbols-outlined text-2xl">all_inclusive</span>
          </div>
          <div>
            <span className="text-headline-md font-bold tracking-tight text-on-primary block leading-none">
              Brightloop
            </span>
            <span className="text-label-sm tracking-wider text-on-primary-container uppercase mt-0.5 block">
              Subscriptions
            </span>
          </div>
        </div>

        <div className="relative z-10 my-16 space-y-6">
          <h1 className="text-headline-xl text-on-primary font-bold leading-snug">
            Deterministic billing and unified recurring revenue control.
          </h1>
          <p className="text-body-md text-on-primary-container max-w-sm">
            Bank-grade encryption, zero-latency invoice settlement, and SOC-2 Type II audit compliance for enterprise billing.
          </p>
        </div>

        <div className="relative z-10 pt-6 border-t border-on-primary/20 flex flex-col gap-2 text-on-primary-container text-label-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">verified_user</span>
            <span>End-to-End Cryptographic Credentialing</span>
          </div>
        </div>
      </div>

      {/* Right Column: Reset Form */}
      <div className="lg:col-span-8 flex items-center justify-center p-6 sm:p-12 lg:p-24 bg-surface-container-lowest">
        <Suspense fallback={<div className="text-on-surface-variant">Loading recovery form...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
