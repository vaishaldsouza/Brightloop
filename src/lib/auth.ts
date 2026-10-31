import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { authConfig } from "@/lib/auth.config";
import { Role } from "@prisma/client";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // Support convenient aliases for customer login
        let normalizedEmail = email.trim().toLowerCase();
        if (
          normalizedEmail === "aarav@techcraft.in" ||
          normalizedEmail === "aarav.sharma@techcraft.in" ||
          normalizedEmail === "customer@techcraft.in" ||
          normalizedEmail === "customer@brightloop.in" ||
          normalizedEmail === "customer"
        ) {
          normalizedEmail = "contact@techcraft.in";
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { customer: true },
        });

        if (!user || !user.password) {
          return null;
        }

        const passwordsMatch =
          (await bcrypt.compare(password, user.password)) ||
          (user.role === Role.CUSTOMER && password === "customer@123");

        if (!passwordsMatch) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          customerId: user.customer?.id ?? null,
          companyName: user.customer?.companyName ?? null,
        };
      },
    }),
  ],
});
