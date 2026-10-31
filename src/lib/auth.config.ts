import type { NextAuthConfig } from "next-auth";
import { Role } from "@prisma/client";

export const authConfig: NextAuthConfig = {
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "brightloop-super-secret-jwt-key-2026-production-grade",
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [], // Added in auth.ts (Node runtime)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.customerId = (user as { customerId?: string | null }).customerId;
        token.companyName = (user as { companyName?: string | null }).companyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.customerId = token.customerId as string | null | undefined;
        session.user.companyName = token.companyName as string | null | undefined;
      }
      return session;
    },
  },
};
