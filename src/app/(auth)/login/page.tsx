"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await signIn("credentials", {
        redirect: false,
        email: normalizedEmail,
        password,
      });

      if (res?.error) {
        setError("Incorrect email or password. Please verify your credentials.");
        setLoading(false);
      } else {
        const explicitCallback = searchParams.get("callbackUrl");
        if (
          explicitCallback &&
          !explicitCallback.includes("/login") &&
          !explicitCallback.includes("/dashboard")
        ) {
          window.location.href = explicitCallback;
        } else {
          // Identify customer accounts and route straight to self-service portal
          const isCustomer =
            normalizedEmail.includes("techcraft") ||
            normalizedEmail.includes("acme") ||
            normalizedEmail.includes("bluewave") ||
            normalizedEmail.includes("nexus") ||
            normalizedEmail.includes("apex") ||
            normalizedEmail.includes("zeta") ||
            normalizedEmail.includes("novacloud") ||
            normalizedEmail.includes("solaris") ||
            normalizedEmail.includes("customer");

          if (isCustomer) {
            window.location.href = "/portal/subscriptions";
          } else {
            window.location.href = explicitCallback || "/dashboard";
          }
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] my-auto">
      <div className="mb-8">
        <h2 className="text-headline-lg font-bold text-on-surface tracking-tight mb-2">
          Sign in to Brightloop
        </h2>
        <p className="text-body-md text-on-surface-variant">
          Enter your credentials to access your billing workspace
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-error-container border border-error/20 flex items-start gap-3 shadow-sm">
          <span className="material-symbols-outlined text-error shrink-0 mt-0.5">error</span>
          <div className="flex-1 text-on-error-container">
            <span className="text-label-md block leading-tight font-semibold">
              Authentication Failed
            </span>
            <span className="text-body-sm text-on-error-container/90 mt-0.5 block leading-normal">
              {error}
            </span>
          </div>
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-6 sm:p-8 shadow-sm">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-label-md text-on-surface mb-2 font-medium" htmlFor="email">
              Email address
            </label>
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rajesh@brightloop.in"
                className="w-full h-[38px] px-3 font-body-md text-body-md text-on-surface bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all outline-none"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-on-surface-variant">
                <span className="material-symbols-outlined text-on-surface-variant/70 text-lg">mail</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-label-md text-on-surface font-medium" htmlFor="password">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-label-sm text-primary-container hover:text-primary transition-colors hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[38px] px-3 pr-10 font-body-md text-body-md text-on-surface bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all outline-none"
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[40px] px-4 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <span>Sign in</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Sign-In Buttons */}
        <div className="mt-6 pt-5 border-t border-outline-variant/60">
          <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider mb-2.5 text-center">
            Quick Sign-In Demo Accounts
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setEmail("contact@techcraft.in");
                setPassword("customer@123");
              }}
              className="py-2 px-1.5 bg-secondary-container/40 hover:bg-secondary-container border border-outline-variant rounded-lg text-xs font-semibold text-primary text-center transition-colors flex flex-col items-center justify-center cursor-pointer shadow-2xs"
            >
              <span>Customer</span>
              <span className="text-[10px] text-secondary font-normal truncate max-w-full">
                Techcraft
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail("rajesh@brightloop.in");
                setPassword("admin@123");
              }}
              className="py-2 px-1.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant rounded-lg text-xs font-semibold text-on-surface text-center transition-colors flex flex-col items-center justify-center cursor-pointer shadow-2xs"
            >
              <span>Admin</span>
              <span className="text-[10px] text-secondary font-normal truncate max-w-full">
                Rajesh
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail("priya.p@brightloop.in");
                setPassword("staff@123");
              }}
              className="py-2 px-1.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant rounded-lg text-xs font-semibold text-secondary text-center transition-colors flex flex-col items-center justify-center cursor-pointer shadow-2xs"
            >
              <span>Staff</span>
              <span className="text-[10px] text-secondary font-normal truncate max-w-full">
                Priya
              </span>
            </button>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-outline-variant/50 text-center">
          <p className="text-body-sm text-on-surface-variant">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-primary hover:text-primary-container transition-colors hover:underline"
            >
              Create customer account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-1 flex flex-col lg:flex-row w-full min-h-screen">
      {/* Left Side: Indigo Brand Architecture Panel */}
      <section className="lg:w-[46%] xl:w-[42%] bg-primary-container text-on-primary p-8 lg:p-16 flex flex-col justify-between relative overflow-hidden shrink-0">
        <div className="absolute inset-0 pointer-events-none opacity-10 flex items-center justify-center">
          <div className="w-[600px] h-[600px] rounded-full border border-surface-container-lowest transform -translate-x-12"></div>
          <div className="absolute w-[800px] h-[800px] rounded-full border border-surface-container-lowest transform translate-x-24"></div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container-lowest/15 backdrop-blur-sm border border-surface-container-lowest/30 flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-surface-container-lowest text-2xl">
              all_inclusive
            </span>
          </div>
          <div>
            <span className="text-headline-md font-bold tracking-tight text-surface-container-lowest block leading-tight">
              Brightloop
            </span>
            <span className="text-label-sm text-on-primary-container tracking-wider block">
              REVENUE OS
            </span>
          </div>
        </div>

        <div className="relative z-10 my-12 lg:my-auto max-w-lg">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-surface-container-lowest/15 border border-surface-container-lowest/25 mb-6 text-on-primary-container text-label-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed"></span>
            Enterprise Core v4.18
          </div>
          <h1 className="text-headline-xl text-surface-container-lowest mb-4 leading-tight tracking-tight">
            Brightloop Subscriptions
          </h1>
          <p className="text-body-md text-on-primary-container mb-8 leading-relaxed">
            Enterprise B2B Subscription &amp; Revenue Management
          </p>
        </div>

        <div className="relative z-10 pt-6 flex items-center justify-between text-on-primary-container text-label-sm">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">verified_user</span>
            SOC-2 Type II Certified
          </span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">shield</span>
            256-Bit Ledger Encryption
          </span>
        </div>
      </section>

      {/* Right Side: Clean Form Workspace */}
      <section className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-16 bg-surface">
        <Suspense fallback={<div className="text-on-surface-variant">Loading workspace...</div>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
