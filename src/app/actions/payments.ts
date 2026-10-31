"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role, InvoiceStatus, PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { recordPaymentSchema, RecordPaymentInput } from "@/lib/validations/payment";

export interface PaymentActionResult {
  success: boolean;
  paymentId?: string;
  invoiceId?: string;
  isFullyPaid?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface InvoicePaymentContext {
  id: string;
  number: string;
  customerName: string;
  customerGstin?: string | null;
  status: InvoiceStatus;
  cancelledAt: Date | null;
  totalPaise: number;
  paidPaise: number;
  amountDuePaise: number;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
  isOverdue: boolean;
}

/**
 * Fetches lightweight context for an invoice to populate the Record Payment modal.
 */
export async function getInvoicePaymentContextAction(
  invoiceId: string
): Promise<{ success: boolean; data?: InvoicePaymentContext; error?: string }> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can view invoice payment context.",
    };
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: {
          include: {
            customer: true,
          },
        },
      },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found." };
    }

    const amountDuePaise = Math.max(0, invoice.totalPaise - invoice.paidPaise);
    const now = new Date();
    const isOverdue =
      invoice.status === InvoiceStatus.CONFIRMED &&
      invoice.dueDate < now &&
      amountDuePaise > 0;
    const isPartiallyPaid =
      invoice.paidPaise > 0 && invoice.paidPaise < invoice.totalPaise;
    const isFullyPaid = invoice.status === InvoiceStatus.PAID || amountDuePaise === 0;

    return {
      success: true,
      data: {
        id: invoice.id,
        number: invoice.number,
        customerName: invoice.subscription.customer.companyName,
        customerGstin: invoice.subscription.customer.gstin,
        status: invoice.status,
        cancelledAt: invoice.cancelledAt,
        totalPaise: invoice.totalPaise,
        paidPaise: invoice.paidPaise,
        amountDuePaise,
        isFullyPaid,
        isPartiallyPaid,
        isOverdue,
      },
    };
  } catch (error) {
    console.error("Failed to fetch invoice payment context:", error);
    return {
      success: false,
      error: "An internal error occurred while fetching invoice details.",
    };
  }
}

/**
 * Records a payment against a confirmed invoice (PRD §4.9).
 *
 * Requirements:
 * - Admin and Staff only (Customer strictly blocked).
 * - Invoice must not be cancelled.
 * - Invoice must not be DRAFT (must be CONFIRMED or already partially PAID).
 * - Partial and multiple payments supported.
 * - Automatically transitions invoice status to PAID when total received >= invoice.totalPaise.
 * - Concurrency safe inside database transaction.
 * - Atomic audit log entry.
 */
export async function recordPaymentAction(
  input: RecordPaymentInput
): Promise<PaymentActionResult> {
  const session = await auth();

  // 1. RBAC Check: Only Admin and Staff
  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can record payments.",
    };
  }

  // 2. Validate input schema
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Validation failed. Please check form inputs.",
      fieldErrors,
    };
  }

  const { invoiceId, amountPaise, paymentMethod, paidAt, reference, notes } =
    parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 3. Fetch invoice with lock-equivalent consistency check
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          number: true,
          status: true,
          cancelledAt: true,
          totalPaise: true,
          paidPaise: true,
          paidAt: true,
        },
      });

      if (!invoice) {
        throw new Error("Invoice not found.");
      }

      if (invoice.cancelledAt) {
        throw new Error("Cannot record payment on a cancelled invoice.");
      }

      if (invoice.status === InvoiceStatus.DRAFT) {
        throw new Error(
          "Cannot record payment on a DRAFT invoice. The invoice must be confirmed before recording payments."
        );
      }

      const remainingDuePaise = Math.max(0, invoice.totalPaise - invoice.paidPaise);

      if (amountPaise <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }

      if (amountPaise > remainingDuePaise) {
        throw new Error(
          `Payment amount cannot exceed the remaining balance due.`
        );
      }

      // 4. Create Payment record
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amountPaise,
          paymentMethod,
          paidAt,
          reference: reference || null,
          notes: notes || null,
        },
      });

      // 5. Aggregate all payments for this invoice to guarantee exact reconciliation
      const paymentAggregation = await tx.payment.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amountPaise: true },
      });

      const totalPaidPaise = paymentAggregation._sum.amountPaise || 0;
      const isFullyPaid = totalPaidPaise >= invoice.totalPaise;

      // 6. Update invoice paidPaise and status atomically
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidPaise: totalPaidPaise,
          status: isFullyPaid ? InvoiceStatus.PAID : invoice.status,
          paidAt: isFullyPaid ? paidAt : invoice.paidAt,
        },
      });

      // 7. Record Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "payment.recorded",
          entityType: "Payment",
          entityId: payment.id,
          meta: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            amountPaise,
            paymentMethod,
            reference: reference || null,
            totalPaidPaise,
            isFullyPaid,
            paidAt: paidAt.toISOString(),
          },
        },
      });

      return {
        paymentId: payment.id,
        invoiceId: invoice.id,
        isFullyPaid,
      };
    });

    // 8. Revalidate paths
    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/portal/invoices");
    revalidatePath(`/portal/invoices/${input.invoiceId}`);

    return {
      success: true,
      paymentId: result.paymentId,
      invoiceId: result.invoiceId,
      isFullyPaid: result.isFullyPaid,
    };
  } catch (error) {
    console.error("Failed to record payment:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while recording the payment.",
    };
  }
}
