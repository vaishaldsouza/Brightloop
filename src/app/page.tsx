import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    if (session.user.role === Role.CUSTOMER) {
      redirect("/portal/subscriptions");
    } else {
      redirect("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-surface px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm text-center">
        <div className="flex justify-center items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary">
            <span className="material-symbols-outlined text-2xl">all_inclusive</span>
          </div>
          <span className="text-headline-md font-bold text-on-surface tracking-tight">
            Brightloop
          </span>
        </div>

        <div>
          <h2 className="text-headline-lg font-bold text-on-surface">
            Subscription Management & Invoicing
          </h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Streamlined B2B recurring billing, GST-compliant invoicing, and self-service customer portal.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <Link
            href="/login"
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-semibold text-on-primary bg-primary hover:bg-primary-container transition-colors"
          >
            Sign In to Portal
          </Link>
          <Link
            href="/signup"
            className="w-full flex justify-center py-2.5 px-4 border border-outline-variant rounded-lg text-label-md font-semibold text-primary bg-surface-container-lowest hover:bg-surface-container-low transition-colors"
          >
            Create Customer Account
          </Link>
        </div>

        <div className="text-xs text-outline border-t border-outline-variant pt-4">
          Brightloop SaaS Platform &copy; 2026
        </div>
      </div>
    </div>
  );
}
