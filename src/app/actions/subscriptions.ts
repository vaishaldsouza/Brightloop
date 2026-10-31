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
import { computeBillingPeriodSpan } from "@/lib/billingEngine";
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

    // 5. Verify all selected product variants exist and fetch product names
    const variantIds = lines.map((l) => l.productVariantId);
    const existingVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (existingVariants.length !== variantIds.length) {
      return {
        success: false,
        error: "One or more product variants in the order lines do not exist.",
        fieldErrors: { lines: "One or more variants do not exist" },
      };
    }

    const variantMap = new Map(existingVariants.map((v) => [v.id, v]));

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
          // Snapshot plan flags, name, and configuration at creation time
          planName: plan.name,
          customerGstStateCode: customer.gstStateCode || "27",
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
              const variant = variantMap.get(line.productVariantId);
              const lineTax = calculateLineTax(
                line.quantity,
                line.unitPricePaise,
                customer.gstStateCode
              );
              return {
                productVariantId: line.productVariantId,
                productName: variant?.product?.name || null,
                variantName: variant?.name || null,
                description: line.description || null,
                quantity: line.quantity,
                unitPricePaise: line.unitPricePaise,
                sortOrder: line.sortOrder ?? idx + 1,
                taxRateBps: lineTax.rateBps,
                taxAmountPaise: lineTax.taxAmountPaise,
                cgstPaise: lineTax.cgstPaise,
                sgstPaise: lineTax.sgstPaise,
                igstPaise: lineTax.igstPaise,
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

  // PRD §4.5: Status flow is strictly Draft → Quotation → Confirmed → Active → Closed (no stage skipping)
  if (sub.status !== SubscriptionStatus.QUOTATION) {
    return {
      success: false,
      error: `Cannot confirm subscription with status "${sub.status}". PRD §4.5 lifecycle requires Draft → Quotation → Confirmed with no stage skipping. Direct Draft to Confirmed transition is prohibited.`,
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
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          isPaused: true,
          pausedAt: now,
        },
      });

      // Track individual pause interval for precise billing shift in Batch 9
      await tx.subscriptionPauseInterval.create({
        data: {
          subscriptionId: id,
          pausedAt: now,
          reason: reason || null,
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
            pausedAt: now.toISOString(),
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
 * Shifting the nextBillingDate forward by the exact duration of the pause (PRD §4.5).
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
    select: {
      id: true,
      number: true,
      status: true,
      isPaused: true,
      pausedAt: true,
      nextBillingDate: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (sub.status !== SubscriptionStatus.ACTIVE) {
    return {
      success: false,
      error: `Cannot resume subscription with status "${sub.status}". Only ACTIVE paused subscriptions can be resumed.`,
    };
  }

  if (!sub.isPaused) {
    return {
      success: false,
      error: "Subscription is not currently paused.",
    };
  }

  const now = new Date();
  const pauseDurationMs = sub.pausedAt
    ? Math.max(0, now.getTime() - new Date(sub.pausedAt).getTime())
    : 0;

  // Shift nextBillingDate forward by the exact pause duration (PRD §4.5)
  const nextBillingDate = sub.nextBillingDate
    ? new Date(new Date(sub.nextBillingDate).getTime() + pauseDurationMs)
    : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          isPaused: false,
          pausedAt: null,
          lastResumedAt: now,
          nextBillingDate,
        },
      });

      // Complete open pause interval
      const openInterval = await tx.subscriptionPauseInterval.findFirst({
        where: {
          subscriptionId: id,
          resumedAt: null,
        },
        orderBy: { pausedAt: "desc" },
      });

      if (openInterval) {
        await tx.subscriptionPauseInterval.update({
          where: { id: openInterval.id },
          data: {
            resumedAt: now,
            durationSeconds: Math.round(pauseDurationMs / 1000),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.resumed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            pauseDurationMs,
            durationSeconds: Math.round(pauseDurationMs / 1000),
            shiftedNextBillingDate: nextBillingDate?.toISOString() || null,
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

  // PRD §4.5: Forward-only lifecycle Draft → Quotation → Confirmed → Active → Closed (no stage skipping).
  // Unquoted drafts cannot skip directly to Closed.
  if (sub.status === SubscriptionStatus.DRAFT) {
    return {
      success: false,
      error: "Cannot close a subscription in DRAFT status. PRD §4.5 lifecycle requires Draft → Quotation → Confirmed → Active → Closed. Unquoted drafts cannot skip directly to Closed.",
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

/**
 * Renews a subscription (PRD §4.3, §4.5).
 * Allowed only if associated plan policy allows renewal (isRenewable === true).
 */
export async function renewSubscriptionAction(
  id: string
): Promise<SubscriptionActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can renew subscriptions.",
    };
  }

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      isRenewable: true,
      billingPeriod: true,
      startDate: true,
      endDate: true,
      nextBillingDate: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (!sub.isRenewable) {
    return {
      success: false,
      error: "Plan configuration does not permit renewal for this contract.",
    };
  }

  // Closed subscriptions cannot be reopened through ordinary status transitions (PRD §4.5 forward-only lifecycle)
  if (sub.status !== SubscriptionStatus.ACTIVE) {
    return {
      success: false,
      error: `Cannot renew subscription with status "${sub.status}". Only ACTIVE contracts can be renewed. Closed contracts cannot be reopened through ordinary status transitions (PRD §4.5).`,
    };
  }

  // Accidental duplicate renewal guard: reject if renewed within the last 60 seconds
  const recentRenewal = await prisma.auditLog.findFirst({
    where: {
      entityId: id,
      action: "subscription.renewed",
      createdAt: { gte: new Date(Date.now() - 60000) },
    },
  });
  if (recentRenewal) {
    return {
      success: false,
      error: "This subscription was already renewed recently. Accidental duplicate renewal prevented.",
    };
  }

  const now = new Date();
  const baseDate = sub.endDate && new Date(sub.endDate) > now ? new Date(sub.endDate) : now;
  const anchorDay = sub.startDate ? new Date(sub.startDate).getDate() : undefined;
  const span = computeBillingPeriodSpan(baseDate, sub.billingPeriod, anchorDay);
  const newEndDate = span.nextBillingDate;

  // Invoicing for the renewal cycle begins at the start of the renewal term (baseDate)
  const renewalBillingDate = baseDate;

  try {
    await prisma.$transaction(async (tx) => {
      // Optimistic concurrency locking: ensure endDate has not been modified concurrently
      const updateResult = await tx.subscription.updateMany({
        where: {
          id,
          status: SubscriptionStatus.ACTIVE,
          endDate: sub.endDate,
        },
        data: {
          endDate: newEndDate,
          nextBillingDate: renewalBillingDate,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(
          "Concurrent renewal conflict detected. Subscription was modified by another request."
        );
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "subscription.renewed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            status: sub.status,
            previousEndDate: sub.endDate?.toISOString() || null,
            newEndDate: newEndDate.toISOString(),
          },
        },
      });
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    revalidatePath("/dashboard");

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Failed to renew subscription:", error);
    return {
      success: false,
      error: "An error occurred while renewing the subscription.",
    };
  }
}

import { evaluateAutomatedLifecycleTransitions } from "@/lib/lifecycleAutomation";

export { evaluateAutomatedLifecycleTransitions };

/**
 * Explicit server action to trigger automated lifecycle processing.
 */
export async function processAutomatedSubscriptionLifecycleAction(): Promise<{
  success: boolean;
  expiredQuotationsClosed: number;
  autoClosedSubscriptions: number;
  error?: string;
}> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      expiredQuotationsClosed: 0,
      autoClosedSubscriptions: 0,
      error: "Unauthorized: Only Staff and Administrators can run lifecycle automation.",
    };
  }

  try {
    const results = await evaluateAutomatedLifecycleTransitions();
    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");
    return results;
  } catch (error) {
    console.error("Lifecycle automation failed:", error);
    return {
      success: false,
      expiredQuotationsClosed: 0,
      autoClosedSubscriptions: 0,
      error: "An error occurred while processing lifecycle automation.",
    };
  }
}
