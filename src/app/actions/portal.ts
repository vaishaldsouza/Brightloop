/// <reference path="../../types/next-auth.d.ts" />
"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role, SubscriptionStatus, Prisma, BillingPeriod } from "@prisma/client";
import { computeBillingPeriodSpan } from "@/lib/billingEngine";
import { revalidatePath } from "next/cache";

export interface PortalActionResult {
  success: boolean;
  error?: string;
  subscriptionId?: string;
}

/**
 * Resolves the authenticated customer record.
 * Rejects with an error if unauthenticated or if the user is a CUSTOMER role
 * without an associated Customer record.
 */
async function getAuthenticatedCustomer() {
  const session = await auth();
  if (!session?.user) {
    return { error: "Authentication required. Please sign in to access the customer portal." };
  }

  // If role is CUSTOMER, must have a customer profile
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { customer: true },
  });

  if (!user) {
    return { error: "User record not found." };
  }

  if (user.role === Role.CUSTOMER && !user.customer) {
    return { error: "No customer account linked with this user identity." };
  }

  return { session, user, customer: user.customer };
}

/**
 * Portal Self-Service: Pause Subscription
 * Only allowed if associated plan permits (isPausable === true) and contract is ACTIVE.
 */
export async function portalPauseSubscriptionAction(
  id: string,
  reason?: string
): Promise<PortalActionResult> {
  const authRes = await getAuthenticatedCustomer();
  if (authRes.error || !authRes.session) {
    return { success: false, error: authRes.error };
  }

  const { session, user, customer } = authRes;

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      customerId: true,
      status: true,
      isPaused: true,
      isPausable: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  // Enforce customer data isolation
  if (user.role === Role.CUSTOMER && sub.customerId !== customer?.id) {
    return { success: false, error: "Access denied: You do not own this subscription." };
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
      error: "Your subscription plan does not permit pausing. Please contact billing support.",
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

      await tx.subscriptionPauseInterval.create({
        data: {
          subscriptionId: id,
          pausedAt: now,
          reason: reason || "Self-service customer pause via portal",
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "portal.subscription.paused",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            pausedAt: now.toISOString(),
            reason: reason || null,
            actorRole: user.role,
          },
        },
      });
    });

    revalidatePath("/portal/subscriptions");
    revalidatePath(`/portal/subscriptions/${id}`);
    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Portal pause subscription error:", error);
    return {
      success: false,
      error: "An unexpected error occurred while pausing your subscription.",
    };
  }
}

/**
 * Portal Self-Service: Resume Subscription
 * Resumes an active paused subscription and shifts the next billing date.
 */
export async function portalResumeSubscriptionAction(
  id: string
): Promise<PortalActionResult> {
  const authRes = await getAuthenticatedCustomer();
  if (authRes.error || !authRes.session) {
    return { success: false, error: authRes.error };
  }

  const { session, user, customer } = authRes;

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      customerId: true,
      status: true,
      isPaused: true,
      pausedAt: true,
      nextBillingDate: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (user.role === Role.CUSTOMER && sub.customerId !== customer?.id) {
    return { success: false, error: "Access denied: You do not own this subscription." };
  }

  if (sub.status !== SubscriptionStatus.ACTIVE) {
    return {
      success: false,
      error: "Cannot resume: subscription is not active.",
    };
  }

  if (!sub.isPaused) {
    return {
      success: false,
      error: "Subscription is not currently paused.",
    };
  }

  try {
    const now = new Date();
    const pausedAtTime = sub.pausedAt ? new Date(sub.pausedAt).getTime() : now.getTime();
    const pauseDurationMs = Math.max(0, now.getTime() - pausedAtTime);

    let nextBillingDate = sub.nextBillingDate ? new Date(sub.nextBillingDate) : null;
    if (nextBillingDate && pauseDurationMs > 0) {
      nextBillingDate = new Date(nextBillingDate.getTime() + pauseDurationMs);
    }

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          isPaused: false,
          lastResumedAt: now,
          nextBillingDate,
        },
      });

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
          action: "portal.subscription.resumed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            resumedAt: now.toISOString(),
            pauseDurationMs,
            shiftedNextBillingDate: nextBillingDate?.toISOString() || null,
            actorRole: user.role,
          },
        },
      });
    });

    revalidatePath("/portal/subscriptions");
    revalidatePath(`/portal/subscriptions/${id}`);
    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Portal resume subscription error:", error);
    return {
      success: false,
      error: "An unexpected error occurred while resuming your subscription.",
    };
  }
}

/**
 * Portal Self-Service: Renew Subscription
 * Only allowed if plan configuration permits renewal (isRenewable === true).
 */
export async function portalRenewSubscriptionAction(
  id: string
): Promise<PortalActionResult> {
  const authRes = await getAuthenticatedCustomer();
  if (authRes.error || !authRes.session) {
    return { success: false, error: authRes.error };
  }

  const { session, user, customer } = authRes;

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      customerId: true,
      status: true,
      isRenewable: true,
      billingPeriod: true,
      startDate: true,
      endDate: true,
      nextBillingDate: true,
      updatedAt: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (user.role === Role.CUSTOMER && sub.customerId !== customer?.id) {
    return { success: false, error: "Access denied: You do not own this subscription." };
  }

  if (!sub.isRenewable) {
    return {
      success: false,
      error: "Your subscription plan does not support automatic or self-service renewal.",
    };
  }

  if (sub.status !== SubscriptionStatus.ACTIVE) {
    return {
      success: false,
      error: `Only ACTIVE contracts can be renewed. Current status is ${sub.status}.`,
    };
  }

  // Duplicate renewal guard
  const recentRenewal = await prisma.auditLog.findFirst({
    where: {
      entityType: "Subscription",
      entityId: id,
      action: { in: ["subscription.renewed", "portal.subscription.renewed"] },
      createdAt: { gte: new Date(Date.now() - 60 * 1000) },
    },
  });

  if (recentRenewal) {
    return {
      success: false,
      error: "This subscription was already renewed recently. Accidental duplicate renewal prevented.",
    };
  }

  try {
    const baseDate = sub.endDate ? new Date(sub.endDate) : new Date();
    const { end: newEndDate } = computeBillingPeriodSpan(baseDate, sub.billingPeriod);
    const renewalBillingDate = baseDate;

    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.subscription.updateMany({
        where: {
          id,
          updatedAt: sub.updatedAt,
        },
        data: {
          endDate: newEndDate,
          nextBillingDate: renewalBillingDate,
        },
      });

      if (updateResult.count === 0) {
        throw new Error(
          "Concurrent renewal conflict detected. Subscription was modified by another request."
        );
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "portal.subscription.renewed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            oldEndDate: sub.endDate?.toISOString() || null,
            newEndDate: newEndDate.toISOString(),
            renewalBillingDate: renewalBillingDate.toISOString(),
            actorRole: user.role,
          },
        },
      });
    });

    revalidatePath("/portal/subscriptions");
    revalidatePath(`/portal/subscriptions/${id}`);
    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Portal renew subscription error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while renewing your subscription.",
    };
  }
}

/**
 * Portal Self-Service: Close Subscription
 * Allowed if isClosableEarly === true, or if contract has reached/passed its end date.
 */
export async function portalCloseSubscriptionAction(
  id: string,
  reason?: string
): Promise<PortalActionResult> {
  const authRes = await getAuthenticatedCustomer();
  if (authRes.error || !authRes.session) {
    return { success: false, error: authRes.error };
  }

  const { session, user, customer } = authRes;

  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      customerId: true,
      status: true,
      isClosableEarly: true,
      endDate: true,
    },
  });

  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (user.role === Role.CUSTOMER && sub.customerId !== customer?.id) {
    return { success: false, error: "Access denied: You do not own this subscription." };
  }

  if (sub.status === SubscriptionStatus.CLOSED) {
    return { success: false, error: "Subscription is already closed." };
  }

  if (sub.status !== SubscriptionStatus.ACTIVE) {
    return {
      success: false,
      error: "Only active subscriptions can be cancelled.",
    };
  }

  const isPastEnd = sub.endDate && new Date(sub.endDate).getTime() <= Date.now();
  if (!sub.isClosableEarly && !isPastEnd) {
    return {
      success: false,
      error:
        "Your contract terms do not allow early cancellation before the term end date. Please contact your account representative.",
    };
  }

  try {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.CLOSED,
          closedAt: now,
          nextBillingDate: null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "portal.subscription.closed",
          entityType: "Subscription",
          entityId: id,
          meta: {
            number: sub.number,
            closedAt: now.toISOString(),
            reason: reason || "Self-service cancellation via customer portal",
            actorRole: user.role,
          },
        },
      });
    });

    revalidatePath("/portal/subscriptions");
    revalidatePath(`/portal/subscriptions/${id}`);
    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);

    return { success: true, subscriptionId: id };
  } catch (error) {
    console.error("Portal close subscription error:", error);
    return {
      success: false,
      error: "An unexpected error occurred while closing your subscription.",
    };
  }
}

/**
 * Portal Self-Service: Update Customer Account Details
 */
export async function portalUpdateAccountAction(data: {
  companyName: string;
  billingAddress?: string;
  phone?: string;
  gstin?: string;
}): Promise<PortalActionResult> {
  const authRes = await getAuthenticatedCustomer();
  if (authRes.error || !authRes.session) {
    return { success: false, error: authRes.error };
  }

  const { session, user, customer } = authRes;

  if (!customer) {
    return { success: false, error: "No customer account profile found to update." };
  }

  if (!data.companyName?.trim()) {
    return { success: false, error: "Company name is required." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          companyName: data.companyName.trim(),
          billingAddress: data.billingAddress?.trim() || null,
          phone: data.phone?.trim() || null,
          gstin: data.gstin?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "portal.customer.updated",
          entityType: "Customer",
          entityId: customer.id,
          meta: {
            updatedFields: Object.keys(data),
            actorRole: user.role,
          },
        },
      });
    });

    revalidatePath("/portal/account");
    revalidatePath("/customers");
    revalidatePath(`/customers/${customer.id}`);

    return { success: true };
  } catch (error) {
    console.error("Portal update account error:", error);
    return {
      success: false,
      error: "An error occurred while updating your account details.",
    };
  }
}
