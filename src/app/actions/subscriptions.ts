/// <reference path="../../types/next-auth.d.ts" />
"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role, SubscriptionStatus, Prisma, BillingPeriod } from "@prisma/client";
import {
  createSubscriptionFromTemplateSchema,
  CreateSubscriptionFromTemplateInput,
  isQuotationExpired,
} from "@/lib/validations/subscription";
import { calculateOrderTax, calculateLineTax } from "@/lib/tax";
import { calculateQuotationExpiryDate } from "@/lib/validations/quotationTemplate";
import { revalidatePath } from "next/cache";

export interface SubscriptionActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  subscriptionId?: string;
  subscriptionNumber?: string;
}

/**
 * Creates a new subscription in DRAFT status prefilled from an active quotation template.
 * Allowed for ADMIN and STAFF roles (PRD §3).
 * Generates an atomic sequence number (SUB-XXXXX) and snapshots all line prices, plan settings, and tax rates.
 */
export async function createSubscriptionFromTemplateAction(
  data: CreateSubscriptionFromTemplateInput
): Promise<SubscriptionActionResult> {
  const session = await auth();

  // 1. RBAC Check: Only Admin and Staff can create subscriptions
  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can create subscriptions and quotations.",
    };
  }

  // 2. Validate form input
  const validation = createSubscriptionFromTemplateSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Please correct the errors in the subscription form.",
      fieldErrors,
    };
  }

  const { templateId, customerId, startDate, paymentTerms, notes, lines } =
    validation.data;

  try {
    // 3. Verify Customer exists and fetch GST jurisdiction
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        companyName: true,
        gstStateCode: true,
        gstState: true,
      },
    });

    if (!customer) {
      return {
        success: false,
        error: "The selected customer does not exist in the database.",
        fieldErrors: { customerId: "Selected customer does not exist" },
      };
    }

    // 4. Verify Quotation Template exists and is ACTIVE
    const template = await prisma.quotationTemplate.findUnique({
      where: { id: templateId },
      include: {
        plan: true,
      },
    });

    if (!template) {
      return {
        success: false,
        error: "The selected quotation template does not exist.",
        fieldErrors: { templateId: "Selected template does not exist" },
      };
    }

    if (!template.isActive) {
      return {
        success: false,
        error:
          "The selected quotation template is inactive/archived and cannot be used to generate new subscriptions.",
        fieldErrors: { templateId: "Selected template is inactive" },
      };
    }

    const plan = template.plan;

    // 5. Verify all selected product variants exist
    const variantIds = lines.map((l) => l.productVariantId);
    const existingVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, name: true },
    });

    if (existingVariants.length !== variantIds.length) {
      return {
        success: false,
        error: "One or more product variants in the order lines do not exist.",
        fieldErrors: { lines: "One or more variants do not exist" },
      };
    }

    // 6. Compute quotation expiry date using template validityDays
    const parsedStartDate = new Date(startDate);
    const quotationExpiryDate = calculateQuotationExpiryDate(
      template.validityDays,
      parsedStartDate
    );

    // 7. Calculate next billing date estimate based on plan billing period
    const nextBillingDate = new Date(parsedStartDate);
    if (plan.billingPeriod === BillingPeriod.DAILY) {
      nextBillingDate.setDate(nextBillingDate.getDate() + 1);
    } else if (plan.billingPeriod === BillingPeriod.WEEKLY) {
      nextBillingDate.setDate(nextBillingDate.getDate() + 7);
    } else if (plan.billingPeriod === BillingPeriod.MONTHLY) {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    } else if (plan.billingPeriod === BillingPeriod.YEARLY) {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    }

    // 8. Atomic Database Transaction: Sequence Counter, Subscription, Lines, and AuditLog
    const result = await prisma.$transaction(async (tx) => {
      // 8a. Atomically increment sequence counter for SUB
      const seq = await tx.sequence.upsert({
        where: { id: "SUB" },
        update: { current: { increment: 1 } },
        create: { id: "SUB", current: 136 },
      });
      const subscriptionNumber = `SUB-${String(seq.current).padStart(5, "0")}`;

      // 8b. Create Subscription record with snapshotted plan configurations and DRAFT status
      const newSubscription = await tx.subscription.create({
        data: {
          number: subscriptionNumber,
          customerId: customer.id,
          planId: plan.id,
          // Snapshot plan flags and configuration at creation time
          billingPeriod: plan.billingPeriod,
          paymentTerms,
          isPausable: plan.isPausable,
          isRenewable: plan.isRenewable,
          isClosableEarly: plan.isClosableEarly,
          autoClose: plan.autoClose,
          planPricePaise: plan.pricePaise,
          planMinQuantity: plan.minQuantity,
          // Status: strictly DRAFT per PRD (do not auto-confirm or activate)
          status: SubscriptionStatus.DRAFT,
          isPaused: false,
          startDate: parsedStartDate,
          nextBillingDate,
          quotationExpiryDate,
          notes: notes || null,
          lines: {
            create: lines.map((line, idx) => {
              const lineTax = calculateLineTax(
                line.quantity,
                line.unitPricePaise,
                customer.gstStateCode
              );
              return {
                productVariantId: line.productVariantId,
                description: line.description || null,
                quantity: line.quantity,
                unitPricePaise: line.unitPricePaise,
                sortOrder: line.sortOrder ?? idx + 1,
                taxRateBps: lineTax.rateBps,
                taxAmountPaise: lineTax.taxAmountPaise,
              };
            }),
          },
        },
        include: {
          lines: true,
        },
      });

      // 8c. Record creation in AuditLog
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.created",
          entityType: "Subscription",
          entityId: newSubscription.id,
          meta: {
            number: newSubscription.number,
            templateId,
            customerId: customer.id,
            status: SubscriptionStatus.DRAFT,
            linesCount: lines.length,
          },
        },
      });

      return newSubscription;
    });

    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");

    return {
      success: true,
      subscriptionId: result.id,
      subscriptionNumber: result.number,
    };
  } catch (error) {
    console.error("Failed to create subscription from template:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while creating the subscription.",
    };
  }
}

/**
 * Transitions a subscription/quotation from DRAFT to QUOTATION with an expiry date.
 */
export async function convertToQuotationAction(
  id: string,
  validityDays: number = 30
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can manage quotations.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, startDate: true },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (sub.status !== SubscriptionStatus.DRAFT) {
    return {
      success: false,
      error: `Cannot convert subscription to Quotation from status "${sub.status}". Only DRAFT subscriptions can become quotations.`,
    };
  }

  const quotationExpiryDate = calculateQuotationExpiryDate(
    validityDays,
    new Date(sub.startDate)
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.QUOTATION,
          quotationExpiryDate,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.converted_to_quotation",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            fromStatus: SubscriptionStatus.DRAFT,
            toStatus: SubscriptionStatus.QUOTATION,
            validityDays,
            quotationExpiryDate: quotationExpiryDate.toISOString(),
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to convert subscription to quotation:", error);
    return {
      success: false,
      error: "Failed to convert subscription to quotation.",
    };
  }
}

/**
 * Confirms a subscription/quotation (Transitions DRAFT or QUOTATION to CONFIRMED).
 * Strictly unavailable for ACTIVE subscriptions (PRD §4.5).
 */
export async function confirmSubscriptionAction(
  id: string
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can confirm subscriptions.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      quotationExpiryDate: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (sub.status === SubscriptionStatus.ACTIVE) {
    return {
      success: false,
      error: "Confirmation is not available for active subscriptions.",
    };
  }

  if (
    sub.status !== SubscriptionStatus.DRAFT &&
    sub.status !== SubscriptionStatus.QUOTATION
  ) {
    return {
      success: false,
      error: `Cannot confirm subscription with status "${sub.status}". Only DRAFT or QUOTATION can be confirmed.`,
    };
  }

  // If quotation is expired, prevent confirmation
  if (
    sub.status === SubscriptionStatus.QUOTATION &&
    isQuotationExpired(sub.status, sub.quotationExpiryDate)
  ) {
    return {
      success: false,
      error:
        "This quotation has expired and cannot be confirmed. Expired quotations must be closed.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.CONFIRMED,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.confirmed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            fromStatus: sub.status,
            toStatus: SubscriptionStatus.CONFIRMED,
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to confirm subscription:", error);
    return {
      success: false,
      error: "An error occurred while confirming the subscription.",
    };
  }
}

/**
 * Activates a subscription (Transitions CONFIRMED to ACTIVE).
 */
export async function activateSubscriptionAction(
  id: string
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can activate subscriptions.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: { id: true, number: true, status: true },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (sub.status !== SubscriptionStatus.CONFIRMED) {
    return {
      success: false,
      error: `Cannot activate subscription with status "${sub.status}". Only CONFIRMED subscriptions can be activated.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.ACTIVE,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.activated",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            fromStatus: SubscriptionStatus.CONFIRMED,
            toStatus: SubscriptionStatus.ACTIVE,
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to activate subscription:", error);
    return {
      success: false,
      error: "An error occurred while activating the subscription.",
    };
  }
}

/**
 * Toggles subscription pause state (isPaused = true).
 * Allowed only if associated plan allows pausing (isPausable === true) and status is ACTIVE.
 */
export async function pauseSubscriptionAction(
  id: string,
  reason?: string
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can pause subscriptions.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      isPaused: true,
      isPausable: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (sub.status !== SubscriptionStatus.ACTIVE) {
    return {
      success: false,
      error: "Only ACTIVE subscriptions can be paused.",
    };
  }

  if (!sub.isPausable) {
    return {
      success: false,
      error: "Plan configuration does not permit manual pause for this subscription.",
    };
  }

  if (sub.isPaused) {
    return {
      success: false,
      error: "Subscription is already paused.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          isPaused: true,
          pausedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.paused",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            reason: reason || null,
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to pause subscription:", error);
    return {
      success: false,
      error: "An error occurred while pausing the subscription.",
    };
  }
}

/**
 * Resumes a paused subscription (isPaused = false).
 */
export async function resumeSubscriptionAction(
  id: string
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can resume subscriptions.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: { id: true, number: true, isPaused: true },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (!sub.isPaused) {
    return {
      success: false,
      error: "Subscription is not currently paused.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          isPaused: false,
          pausedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.resumed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to resume subscription:", error);
    return {
      success: false,
      error: "An error occurred while resuming the subscription.",
    };
  }
}

/**
 * Closes a subscription (status -> CLOSED).
 * If status is ACTIVE, closing early is permitted only if isClosableEarly === true.
 */
export async function closeSubscriptionAction(
  id: string,
  reason?: string
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can close subscriptions.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      isClosableEarly: true,
      endDate: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (sub.status === SubscriptionStatus.CLOSED) {
    return {
      success: false,
      error: "Subscription is already closed.",
    };
  }

  // Early close check for ACTIVE contracts
  if (sub.status === SubscriptionStatus.ACTIVE) {
    const isPastEnd = sub.endDate && new Date(sub.endDate).getTime() <= Date.now();
    if (!sub.isClosableEarly && !isPastEnd) {
      return {
        success: false,
        error:
          "Plan configuration does not permit early contract cancellation for this subscription.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.CLOSED,
          closedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.closed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            fromStatus: sub.status,
            toStatus: SubscriptionStatus.CLOSED,
            reason: reason || null,
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to close subscription:", error);
    return {
      success: false,
      error: "An error occurred while closing the subscription.",
    };
  }
}

/**
 * Automatically transitions an expired unconfirmed quotation to CLOSED (PRD §4.5).
 */
export async function closeExpiredQuotationAction(
  id: string
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can process expired quotations.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      quotationExpiryDate: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Quotation not found." };
  }

  if (sub.status !== SubscriptionStatus.QUOTATION) {
    return {
      success: false,
      error: "Only quotations can be transitioned via expired quotation flow.",
    };
  }

  if (!isQuotationExpired(sub.status, sub.quotationExpiryDate)) {
    return {
      success: false,
      error: "Quotation has not yet reached its expiration date.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.CLOSED,
          closedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "quotation.expired_closed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            fromStatus: SubscriptionStatus.QUOTATION,
            toStatus: SubscriptionStatus.CLOSED,
            expiredAt: sub.quotationExpiryDate?.toISOString(),
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to close expired quotation:", error);
    return {
      success: false,
      error: "An error occurred while closing the expired quotation.",
    };
  }
}
