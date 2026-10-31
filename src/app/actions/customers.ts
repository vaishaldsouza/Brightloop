/// <reference path="../../types/next-auth.d.ts" />
"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { customerSchema, CustomerFormValues } from "@/lib/validations/customer";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  customerId?: string;
  onboardingToken?: string;
}

export async function createCustomerAction(
  data: CustomerFormValues
): Promise<ActionResult> {
  const session = await auth();

  // Server-side authorization: Admin and Staff only
  if (!session?.user || (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators and Staff can register customers.",
    };
  }

  // Schema validation
  const validation = customerSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.errors.forEach((err) => {
      const field = err.path[0] as string;
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Please correct the highlighted errors.",
      fieldErrors,
    };
  }

  const {
    companyName,
    contactName,
    email,
    phone,
    gstState,
    gstStateCode,
    gstin,
    billingAddress,
  } = validation.data;

  // Cross-field rule: If GSTIN provided, first 2 digits must match gstStateCode (PRD §4.7)
  if (gstin && gstin.slice(0, 2) !== gstStateCode) {
    return {
      success: false,
      error: `GSTIN state code prefix (${gstin.slice(0, 2)}) must match the selected state code (${gstStateCode}).`,
      fieldErrors: {
        gstin: `Prefix '${gstin.slice(0, 2)}' does not match state code '${gstStateCode}'.`,
      },
    };
  }

  // Check email uniqueness
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    return {
      success: false,
      error: `An account with email '${email}' already exists in the system.`,
      fieldErrors: {
        email: "This email address is already in use.",
      },
    };
  }

  try {
    const defaultPasswordHash = await bcrypt.hash("Customer@123", 12);
    const onboardingToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours valid for initial setup

    const newCustomer = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: contactName,
          email,
          password: defaultPasswordHash,
          role: Role.CUSTOMER,
        },
      });

      // Generate initial onboarding password-reset token for immediate account setup
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          token: onboardingToken,
          expiresAt: tokenExpiry,
        },
      });

      const customer = await tx.customer.create({
        data: {
          userId: user.id,
          companyName,
          phone,
          gstState,
          gstStateCode,
          gstin,
          billingAddress,
        },
      });

      return customer;
    });

    revalidatePath("/customers");
    revalidatePath("/dashboard");

    return {
      success: true,
      customerId: newCustomer.id,
      onboardingToken,
    };
  } catch (err: unknown) {
    console.error("Error creating customer:", err);
    return {
      success: false,
      error: "Failed to create customer due to a database error. Please try again.",
    };
  }
}

export async function updateCustomerAction(
  id: string,
  data: CustomerFormValues
): Promise<ActionResult> {
  const session = await auth();

  // Server-side authorization
  if (!session?.user || (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators and Staff can modify customer profiles.",
    };
  }

  // Schema validation
  const validation = customerSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.errors.forEach((err) => {
      const field = err.path[0] as string;
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Please correct the highlighted errors.",
      fieldErrors,
    };
  }

  const {
    companyName,
    contactName,
    email,
    phone,
    gstState,
    gstStateCode,
    gstin,
    billingAddress,
  } = validation.data;

  // Cross-field validation: GSTIN prefix check
  if (gstin && gstin.slice(0, 2) !== gstStateCode) {
    return {
      success: false,
      error: `GSTIN state code prefix (${gstin.slice(0, 2)}) must match state code (${gstStateCode}).`,
      fieldErrors: {
        gstin: `Prefix '${gstin.slice(0, 2)}' does not match state code '${gstStateCode}'.`,
      },
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!customer) {
    return {
      success: false,
      error: "Customer not found.",
    };
  }

  // If email changed, check uniqueness
  if (customer.user.email !== email) {
    const existing = await prisma.user.findUnique({
      where: { email },
    });
    if (existing && existing.id !== customer.userId) {
      return {
        success: false,
        error: `Email '${email}' is already in use by another user account.`,
        fieldErrors: {
          email: "This email address is already registered.",
        },
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: customer.userId },
        data: {
          name: contactName,
          email,
        },
      });

      await tx.customer.update({
        where: { id },
        data: {
          companyName,
          phone,
          gstState,
          gstStateCode,
          gstin,
          billingAddress,
        },
      });
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    revalidatePath("/dashboard");

    return {
      success: true,
      customerId: id,
    };
  } catch (err: unknown) {
    console.error("Error updating customer:", err);
    return {
      success: false,
      error: "Database error while updating customer profile. Please try again.",
    };
  }
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  const session = await auth();

  // Server-side authorization: Admin only
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators can permanently remove customer accounts.",
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      subscriptions: {
        select: {
          id: true,
          status: true,
          invoices: {
            select: {
              id: true,
              payments: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return {
      success: false,
      error: "Customer account not found.",
    };
  }

  // Referential integrity check: Cannot delete customer with subscriptions, invoices, or payments
  const totalSubs = customer.subscriptions.length;
  const totalInvoices = customer.subscriptions.flatMap((s) => s.invoices).length;
  const totalPayments = customer.subscriptions
    .flatMap((s) => s.invoices)
    .flatMap((i) => i.payments).length;

  if (totalSubs > 0 || totalInvoices > 0 || totalPayments > 0) {
    return {
      success: false,
      error: `Cannot delete customer: ${totalSubs} subscription(s), ${totalInvoices} invoice(s), and ${totalPayments} payment record(s) exist. Financial and contract history must be permanently preserved.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.customer.delete({ where: { id } });
      await tx.user.delete({ where: { id: customer.userId } });
    });

    revalidatePath("/customers");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: unknown) {
    console.error("Error deleting customer:", err);
    return {
      success: false,
      error: "Failed to delete customer record.",
    };
  }
}
