import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const role = req.auth?.user?.role as Role | undefined;

  const pathname = nextUrl.pathname;

  // 1. Allow public authentication and static routes
  const isAuthRoute =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/api/auth");

  const isStaticRoute =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.includes(".");

  if (isStaticRoute) {
    return NextResponse.next();
  }

  // 2. Unauthenticated user trying to access protected routes
  if (!isLoggedIn && !isAuthRoute) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Logged-in user visiting auth/landing pages -> redirect to appropriate home
  if (isLoggedIn && isAuthRoute && !pathname.startsWith("/api/auth")) {
    if (role === Role.CUSTOMER) {
      return NextResponse.redirect(new URL("/portal/subscriptions", nextUrl.origin));
    }
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
  }

  // 4. Role-Based Access Control (RBAC) enforcement
  if (isLoggedIn) {
    // CUSTOMER role cannot access internal admin/staff pages
    const isInternalRoute =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/subscriptions") ||
      pathname.startsWith("/invoices") ||
      pathname.startsWith("/payments") ||
      pathname.startsWith("/reports") ||
      pathname.startsWith("/products") ||
      pathname.startsWith("/plans") ||
      pathname.startsWith("/quotation-templates") ||
      pathname.startsWith("/customers") ||
      pathname.startsWith("/discounts") ||
      pathname.startsWith("/taxes") ||
      pathname.startsWith("/staff");

    if (role === Role.CUSTOMER && isInternalRoute) {
      return NextResponse.redirect(new URL("/portal/subscriptions", nextUrl.origin));
    }

    // Customer Portal routes: Internal staff/admins trying to access /portal without being customer
    if ((role === Role.ADMIN || role === Role.STAFF) && pathname === "/portal") {
      return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
    }

    // STAFF cannot access ADMIN-only configuration routes
    const isAdminOnlyRoute =
      pathname.startsWith("/discounts") ||
      pathname.startsWith("/taxes") ||
      pathname.startsWith("/staff");

    if (role === Role.STAFF && isAdminOnlyRoute) {
      return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
