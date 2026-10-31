import prisma from "@/lib/prisma";
import { SubscriptionStatus, Role } from "@prisma/client";

/**
 * Core idempotent automated lifecycle processing engine.
 * PRD §4.3 & §4.5 & §10:
 * 1. Closes expired unconfirmed quotations.
 * 2. Auto-closes active subscriptions reaching their end date when autoClose === true.
 */
export async function evaluateAutomatedLifecycleTransitions(actorUserId?: string): Promise<{
  expiredQuotationsClosed: number;
  autoClosedSubscriptions: number;
}> {
  const now = new Date();
  let expiredQuotationsClosed = 0;
  let autoClosedSubscriptions = 0;

  // Resolve an administrative actor ID for audit logging if not passed
  let resolvedActorId = actorUserId;
  if (!resolvedActorId) {
    const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN }, select: { id: true } });
    resolvedActorId = admin?.id || "system";
  }

  // 1. Expired quotations (PRD §4.5)
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
        const curr = await tx.subscription.findUnique({
          where: { id: q.id },
          select: { status: true },
        });
        if (curr?.status === SubscriptionStatus.QUOTATION) {
          await tx.subscription.update({
            where: { id: q.id },
            data: {
              status: SubscriptionStatus.CLOSED,
              closedAt: now,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: resolvedActorId,
              action: "quotation.expired_closed",
              entityType: "Subscription",
              entityId: q.id,
              meta: {
                number: q.number,
                expiredAt: q.quotationExpiryDate?.toISOString(),
                automated: true,
              },
            },
          });
          expiredQuotationsClosed++;
        }
      });
    } catch (err) {
      console.error(`Automated expiry closure failed for ${q.number}:`, err);
    }
  }

  // 2. Auto-close subscriptions at end date (PRD §4.3)
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
        const curr = await tx.subscription.findUnique({
          where: { id: sub.id },
          select: { status: true },
        });
        if (curr?.status === SubscriptionStatus.ACTIVE) {
          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: SubscriptionStatus.CLOSED,
              closedAt: now,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: resolvedActorId,
              action: "subscription.auto_closed",
              entityType: "Subscription",
              entityId: sub.id,
              meta: {
                number: sub.number,
                endDate: sub.endDate?.toISOString(),
                automated: true,
              },
            },
          });
          autoClosedSubscriptions++;
        }
      });
    } catch (err) {
      console.error(`Automated auto-close failed for ${sub.number}:`, err);
    }
  }

  return { expiredQuotationsClosed, autoClosedSubscriptions };
}
