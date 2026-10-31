import prisma from "@/lib/prisma";
import { SubscriptionStatus, Role } from "@prisma/client";

export interface LifecycleAutomationResult {
  success: boolean;
  timestamp: string;
  expiredQuotationsClosed: number;
  autoClosedSubscriptions: number;
  errors?: string[];
}

/**
 * Core idempotent automated lifecycle processing engine.
 * PRD §4.3 & §4.5 & §10:
 * 1. Closes expired unconfirmed quotations.
 * 2. Auto-closes active subscriptions reaching their end date when autoClose === true.
 *
 * Uses conditional atomic updates (`updateMany` with exact status predicates)
 * to guarantee that concurrent executions cannot create duplicate transitions or duplicate audit entries.
 */
export async function evaluateAutomatedLifecycleTransitions(actorUserId?: string): Promise<LifecycleAutomationResult> {
  const now = new Date();
  let expiredQuotationsClosed = 0;
  let autoClosedSubscriptions = 0;
  const errors: string[] = [];

  // Resolve a valid administrative actor ID for foreign-key-compliant audit logging
  let resolvedActorId = actorUserId;
  if (!resolvedActorId) {
    const admin = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
      select: { id: true },
    });
    resolvedActorId = admin?.id;
  }

  if (!resolvedActorId) {
    const err = "No valid administrative user found for audit logging in lifecycle automation.";
    console.error(err);
    return {
      success: false,
      timestamp: now.toISOString(),
      expiredQuotationsClosed: 0,
      autoClosedSubscriptions: 0,
      errors: [err],
    };
  }

  // -------------------------------------------------------------------------
  // 1. Expired quotations (PRD §4.5)
  // -------------------------------------------------------------------------
  const expiredQuotations = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.QUOTATION,
      quotationExpiryDate: { lt: now },
    },
    select: { id: true, number: true, quotationExpiryDate: true },
  });

  for (const q of expiredQuotations) {
    try {
      await prisma.$transaction(async (tx) => {
        // Atomic conditional update: only updates if status is still strictly QUOTATION
        const updated = await tx.subscription.updateMany({
          where: {
            id: q.id,
            status: SubscriptionStatus.QUOTATION,
          },
          data: {
            status: SubscriptionStatus.CLOSED,
            closedAt: now,
          },
        });

        // Exactly one concurrent worker will receive count === 1
        if (updated.count === 1) {
          await tx.auditLog.create({
            data: {
              userId: resolvedActorId!,
              action: "quotation.expired_closed",
              entityType: "Subscription",
              entityId: q.id,
              meta: {
                number: q.number,
                expiredAt: q.quotationExpiryDate?.toISOString(),
                automated: true,
                scheduler: "lifecycleAutomation",
              },
            },
          });
          expiredQuotationsClosed++;
        }
      });
    } catch (err) {
      const msg = `Automated expiry closure failed for ${q.number}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Auto-close subscriptions at end date (PRD §4.3)
  // -------------------------------------------------------------------------
  const dueToAutoClose = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      autoClose: true,
      endDate: { not: null, lte: now },
    },
    select: { id: true, number: true, endDate: true },
  });

  for (const sub of dueToAutoClose) {
    try {
      await prisma.$transaction(async (tx) => {
        // Atomic conditional update: only updates if status is still strictly ACTIVE with autoClose
        const updated = await tx.subscription.updateMany({
          where: {
            id: sub.id,
            status: SubscriptionStatus.ACTIVE,
            autoClose: true,
          },
          data: {
            status: SubscriptionStatus.CLOSED,
            closedAt: now,
          },
        });

        // Exactly one concurrent worker will receive count === 1
        if (updated.count === 1) {
          await tx.auditLog.create({
            data: {
              userId: resolvedActorId!,
              action: "subscription.auto_closed",
              entityType: "Subscription",
              entityId: sub.id,
              meta: {
                number: sub.number,
                endDate: sub.endDate?.toISOString(),
                automated: true,
                scheduler: "lifecycleAutomation",
              },
            },
          });
          autoClosedSubscriptions++;
        }
      });
    } catch (err) {
      const msg = `Automated auto-close failed for ${sub.number}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  return {
    success: errors.length === 0,
    timestamp: now.toISOString(),
    expiredQuotationsClosed,
    autoClosedSubscriptions,
    errors: errors.length > 0 ? errors : undefined,
  };
}
