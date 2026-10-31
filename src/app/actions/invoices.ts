"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role, InvoiceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  generateInvoiceForSubscription,
  evaluateAutomatedBilling,
} from "@/lib/billingEngine";

export interface InvoiceActionResult {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  error?: string;
}

/**
 * Transitions an invoice from DRAFT to CONFIRMED.
 * Permitted for ADMIN and STAFF roles (PRD §3).
 * Stored status flow: Draft → Confirmed → Paid (PRD §4.6).
 */
export async function confirmInvoiceAction(id: string): Promise<InvoiceActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can confirm invoices.",
    };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, cancelledAt: true },
  });

  if (!invoice) {
    return { success: false, error: "Invoice not found." };
  }

  if (invoice.cancelledAt) {
    return { success: false, error: "Cannot confirm a cancelled invoice." };
  }

  if (invoice.status !== InvoiceStatus.DRAFT) {
    return {
      success: false,
      error: `Cannot confirm invoice with status "${invoice.status}". Only DRAFT invoices can be confirmed.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.CONFIRMED,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "invoice.confirmed",
          entityType: "Invoice",
          entityId: id,
          meta: {
            number: invoice.number,
            fromStatus: InvoiceStatus.DRAFT,
            toStatus: InvoiceStatus.CONFIRMED,
          },
        },
      });
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/dashboard");

    return { success: true, invoiceId: id, invoiceNumber: invoice.number };
  } catch (error) {
    console.error("Failed to confirm invoice:", error);
    return {
      success: false,
      error: "An internal error occurred while confirming the invoice.",
    };
  }
}

/**
 * Cancels an invoice by setting cancelledAt timestamp (PRD §4.6, §7).
 * Rule: Cancellation is strictly forbidden if any payment has been recorded (paidPaise > 0 or payments exist).
 * Rule: Cancelled is NOT a status enum; it sets cancelledAt and frees the partial unique index.
 */
export async function cancelInvoiceAction(
  id: string,
  reason?: string
): Promise<InvoiceActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can cancel invoices.",
    };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      payments: { select: { id: true, amountPaise: true } },
    },
  });

  if (!invoice) {
    return { success: false, error: "Invoice not found." };
  }

  if (invoice.cancelledAt) {
    return { success: false, error: "Invoice is already cancelled." };
  }

  // PRD §4.6: "cancel (allowed only while the invoice has zero payments)"
  if (invoice.paidPaise > 0 || invoice.payments.length > 0) {
    return {
      success: false,
      error: "Cannot cancel an invoice with recorded payments. PRD §4.6 strictly forbids cancellation after payments are made.",
    };
  }

  try {
    const cancelledAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          cancelledAt,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "invoice.cancelled",
          entityType: "Invoice",
          entityId: id,
          meta: {
            number: invoice.number,
            reason: reason || null,
            cancelledAt: cancelledAt.toISOString(),
          },
        },
      });
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/dashboard");

    return { success: true, invoiceId: id, invoiceNumber: invoice.number };
  } catch (error) {
    console.error("Failed to cancel invoice:", error);
    return {
      success: false,
      error: "An internal error occurred while cancelling the invoice.",
    };
  }
}

/**
 * Sends the invoice email to customer billing contact.
 * Enforces strict configuration boundary: never falsely reports success when unconfigured.
 */
export async function sendInvoiceAction(id: string): Promise<InvoiceActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can send invoices.",
    };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          customer: {
            include: { user: true },
          },
        },
      },
    },
  });

  if (!invoice) {
    return { success: false, error: "Invoice not found." };
  }

  if (invoice.cancelledAt) {
    return { success: false, error: "Cannot send a cancelled invoice." };
  }

  // Check email transport configuration
  const isEmailConfigured = Boolean(
    process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER)
  );

  if (!isEmailConfigured) {
    // PRD §4.6 requirement: Provide clear configuration boundary; do not falsely report success
    return {
      success: false,
      error: "Email delivery service is unconfigured in this environment. Provide RESEND_API_KEY or SMTP credentials to enable invoice email delivery.",
    };
  }

  try {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { sentAt: now },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "invoice.sent",
          entityType: "Invoice",
          entityId: id,
          meta: {
            number: invoice.number,
            recipient: invoice.subscription.customer.user.email,
            sentAt: now.toISOString(),
          },
        },
      });
    });

    revalidatePath(`/invoices/${id}`);
    return { success: true, invoiceId: id, invoiceNumber: invoice.number };
  } catch (error) {
    console.error("Failed to record invoice sending:", error);
    return {
      success: false,
      error: "Failed to deliver invoice email.",
    };
  }
}

/**
 * Explicit administrative re-billing action for a cancelled billing period.
 * PRD §4.6, §7: "re-billing the period requires an explicit admin action."
 */
export async function rebillCancelledPeriodAction(
  subscriptionId: string,
  billingPeriodStartIso: string
): Promise<InvoiceActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can trigger re-billing.",
    };
  }

  try {
    const periodStart = new Date(billingPeriodStartIso);
    if (isNaN(periodStart.getTime())) {
      return { success: false, error: "Invalid billing period start date." };
    }

    const result = await generateInvoiceForSubscription({
      subscriptionId,
      billingPeriodStart: periodStart,
      allowRebillCancelled: true,
      actorUserId: session.user.id,
    });

    if (!result.success) {
      return { success: false, error: result.error || "Failed to re-bill period." };
    }

    revalidatePath("/invoices");
    revalidatePath(`/subscriptions/${subscriptionId}`);
    revalidatePath("/dashboard");

    return {
      success: true,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
    };
  } catch (error) {
    console.error("Failed to re-bill cancelled period:", error);
    return {
      success: false,
      error: "An internal error occurred while re-billing the period.",
    };
  }
}

/**
 * Triggers automated billing job run from the UI.
 * Allowed for ADMIN and STAFF roles.
 */
export async function runAutomatedBillingAction(): Promise<{
  success: boolean;
  invoicesGenerated: number;
  subscriptionsProcessed: number;
  error?: string;
}> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      invoicesGenerated: 0,
      subscriptionsProcessed: 0,
      error: "Unauthorized: Only Staff and Administrators can trigger automated billing.",
    };
  }

  try {
    const result = await evaluateAutomatedBilling({
      actorUserId: session.user.id,
    });

    revalidatePath("/invoices");
    revalidatePath("/dashboard");

    return {
      success: result.success,
      invoicesGenerated: result.invoicesGenerated,
      subscriptionsProcessed: result.subscriptionsProcessed,
      error: result.errors?.join("; "),
    };
  } catch (error) {
    console.error("Manual automated billing run failed:", error);
    return {
      success: false,
      invoicesGenerated: 0,
      subscriptionsProcessed: 0,
      error: "An internal error occurred while running automated billing.",
    };
  }
}
