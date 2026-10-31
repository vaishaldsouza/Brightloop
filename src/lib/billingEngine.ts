import prisma from "@/lib/prisma";
import {
  BillingPeriod,
  PaymentTerms,
  SubscriptionStatus,
  InvoiceStatus,
  TaxType,
  Role,
  Prisma,
} from "@prisma/client";
import { calculateOrderTax, calculateLineTax } from "@/lib/tax";

export interface BillingPeriodSpan {
  start: Date;
  end: Date;
  nextBillingDate: Date;
}

export interface BillingJobResult {
  success: boolean;
  timestamp: string;
  invoicesGenerated: number;
  subscriptionsProcessed: number;
  generatedInvoiceNumbers: string[];
  errors?: string[];
}

/**
 * Calendar-safe date manipulation functions.
 * Properly accounts for month boundaries (e.g. Jan 31 -> Feb 28/29)
 * and leap years without JavaScript 32-day overflow quirks.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number, anchorDay?: number): Date {
  const result = new Date(date);
  const targetDay = anchorDay ?? result.getDate();
  result.setDate(1); // Set to 1st to prevent rollover when advancing month
  result.setMonth(result.getMonth() + months);

  // Calculate max days in target month
  const maxDays = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, maxDays));
  return result;
}

export function addYears(date: Date, years: number, anchorDay?: number): Date {
  const result = new Date(date);
  const targetDay = anchorDay ?? result.getDate();
  const targetMonth = result.getMonth();
  result.setDate(1); // Set to 1st to prevent rollover when changing year
  result.setFullYear(result.getFullYear() + years);
  result.setMonth(targetMonth);

  // Handle Feb 29 in leap years -> Feb 28 in non-leap years or anchor day
  const maxDays = new Date(result.getFullYear(), targetMonth + 1, 0).getDate();
  result.setDate(Math.min(targetDay, maxDays));
  return result;
}

/**
 * Calculates billing period start, end, and the next billing period start date
 * according to the PRD §4.3 and §4.5 specifications.
 *
 * Rules:
 * - DAILY: 1 full day (start = D, end = D, next = D + 1 day)
 * - WEEKLY: 7 full days (start = D, end = D + 6 days, next = D + 7 days)
 * - MONTHLY: 1 calendar month (start = D, end = D + 1 month - 1 day, next = D + 1 month)
 * - YEARLY: 1 calendar year (start = D, end = D + 1 year - 1 day, next = D + 1 year)
 */
export function computeBillingPeriodSpan(
  periodStart: Date,
  billingPeriod: BillingPeriod,
  anchorDay?: number
): BillingPeriodSpan {
  const start = new Date(periodStart);
  let nextBillingDate: Date;
  let end: Date;

  switch (billingPeriod) {
    case BillingPeriod.DAILY:
      nextBillingDate = addDays(start, 1);
      end = new Date(start); // ends same day
      break;

    case BillingPeriod.WEEKLY:
      nextBillingDate = addDays(start, 7);
      end = addDays(start, 6);
      break;

    case BillingPeriod.MONTHLY:
      nextBillingDate = addMonths(start, 1, anchorDay);
      end = addDays(nextBillingDate, -1);
      break;

    case BillingPeriod.YEARLY:
      nextBillingDate = addYears(start, 1, anchorDay);
      end = addDays(nextBillingDate, -1);
      break;

    default:
      throw new Error(`Unsupported billing period: ${billingPeriod}`);
  }

  return { start, end, nextBillingDate };
}

/**
 * Computes invoice due date from invoice issue date and customer payment terms (PRD §4.5).
 * - DUE_ON_RECEIPT: invoiceDate (+0 days)
 * - NET_15: invoiceDate + 15 days
 * - NET_30: invoiceDate + 30 days
 */
export function calculateDueDate(
  invoiceDate: Date,
  paymentTerms: PaymentTerms
): Date {
  const date = new Date(invoiceDate);
  switch (paymentTerms) {
    case PaymentTerms.DUE_ON_RECEIPT:
      return date;
    case PaymentTerms.NET_15:
      return addDays(date, 15);
    case PaymentTerms.NET_30:
      return addDays(date, 30);
    default:
      return addDays(date, 30);
  }
}

/**
 * Generates an invoice for an active subscription for a specific billing period.
 *
 * Security & Idempotency:
 * - Enforces PostgreSQL partial unique index `(subscriptionId, billingPeriodStart) WHERE cancelledAt IS NULL`.
 * - If an active invoice already exists: returns `{ created: false, reason: "ALREADY_BILLED" }` without duplicating.
 * - If a cancelled invoice exists: only bills if `allowRebillCancelled === true` (explicit administrative action).
 * - Allocates monotonic gapless invoice number `INV-XXXXX` from `Sequence`.
 * - Snapshots lines, unit prices, and GST breakdown.
 * - Records an audit log record for traceability.
 */
export async function generateInvoiceForSubscription(params: {
  subscriptionId: string;
  billingPeriodStart: Date;
  allowRebillCancelled?: boolean;
  actorUserId?: string;
}): Promise<{
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  reason?: string;
  error?: string;
}> {
  const { subscriptionId, billingPeriodStart, allowRebillCancelled = false } = params;

  // Resolve actor user ID if not provided (default to administrative user)
  let actorId = params.actorUserId;
  if (!actorId) {
    const admin = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
      select: { id: true },
    });
    actorId = admin?.id;
  }

  // Pre-fetch tax rates from database
  const [cgstTax, sgstTax, igstTax] = await Promise.all([
    prisma.tax.findFirst({ where: { taxType: TaxType.CGST } }),
    prisma.tax.findFirst({ where: { taxType: TaxType.SGST } }),
    prisma.tax.findFirst({ where: { taxType: TaxType.IGST } }),
  ]);

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch subscription with lines
    const sub = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        lines: {
          include: {
            productVariant: {
              include: { product: true },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!sub) {
      return { success: false, error: "Subscription not found." };
    }

    if (sub.status !== SubscriptionStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot generate invoice for subscription in "${sub.status}" status. Only ACTIVE subscriptions are billable.`,
      };
    }

    if (sub.isPaused) {
      return {
        success: false,
        error: "Cannot generate invoice for paused subscription. Paused contracts skip billing.",
      };
    }

    // 2. Check existing invoices for this subscription and period
    const existingInvoices = await tx.invoice.findMany({
      where: {
        subscriptionId: sub.id,
        billingPeriodStart,
      },
      select: { id: true, number: true, cancelledAt: true },
    });

    const activeInvoice = existingInvoices.find((inv) => !inv.cancelledAt);
    if (activeInvoice) {
      return {
        success: false,
        invoiceId: activeInvoice.id,
        invoiceNumber: activeInvoice.number,
        reason: "ALREADY_BILLED",
      };
    }

    const cancelledInvoice = existingInvoices.find((inv) => !!inv.cancelledAt);
    if (cancelledInvoice && !allowRebillCancelled) {
      return {
        success: false,
        reason: "PERIOD_CANCELLED",
        error: "Billing period was previously cancelled. Requires explicit administrative re-billing action.",
      };
    }

    // 3. Compute billing span and due date
    const anchorDay = sub.startDate ? new Date(sub.startDate).getDate() : undefined;
    const span = computeBillingPeriodSpan(billingPeriodStart, sub.billingPeriod, anchorDay);
    const now = new Date();
    const dueDate = calculateDueDate(now, sub.paymentTerms);

    // 4. Calculate pure integer line items and taxes (PRD §4.6, §4.7)
    const lineInputs = sub.lines.map((l) => ({
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
    }));

    // Evaluate eligible discounts (PRD §4.8)
    let appliedDiscount: { id: string; code: string; discountPaise: number } | null = null;
    let discountPaise = 0;

    if (sub.discountId) {
      const discount = await tx.discount.findUnique({
        where: { id: sub.discountId },
      });

      if (discount && discount.isActive) {
        const isWithinDates =
          (!discount.startDate || discount.startDate <= now) &&
          (!discount.expiresAt || discount.expiresAt >= now);
        const hasRemainingUses =
          discount.maxUses === null || discount.usedCount < discount.maxUses;
        const totalQty = sub.lines.reduce((acc, l) => acc + l.quantity, 0);
        const meetsMinQty = totalQty >= discount.minQuantity;

        const baseSubtotal = lineInputs.reduce(
          (acc, l) => acc + l.quantity * l.unitPricePaise,
          0
        );
        const meetsMinPurchase =
          !discount.minPurchasePaise || baseSubtotal >= discount.minPurchasePaise;

        if (isWithinDates && hasRemainingUses && meetsMinQty && meetsMinPurchase) {
          if (discount.discountType === "PERCENTAGE") {
            discountPaise = Math.round((baseSubtotal * discount.value) / 10000);
          } else {
            discountPaise = Math.min(discount.value, baseSubtotal);
          }

          // Atomically enforce usage limit under concurrency
          const usageCondition: Prisma.DiscountWhereInput[] = [{ maxUses: null }];
          if (discount.maxUses !== null && discount.maxUses !== undefined) {
            usageCondition.push({ usedCount: { lt: discount.maxUses } });
          }

          const updateResult = await tx.discount.updateMany({
            where: {
              id: discount.id,
              isActive: true,
              OR: usageCondition,
            },
            data: {
              usedCount: { increment: 1 },
            },
          });

          if (updateResult.count === 1) {
            appliedDiscount = {
              id: discount.id,
              code: discount.code,
              discountPaise,
            };
          } else {
            discountPaise = 0;
          }
        }
      }
    }

    const taxCalculation = calculateOrderTax(lineInputs, sub.customerGstStateCode);
    const finalTotalPaise = Math.max(0, taxCalculation.totalPaise - discountPaise);

    // 5. Monotonic invoice number allocation (INV-XXXXX)
    const seq = await tx.sequence.upsert({
      where: { id: "INV" },
      update: { current: { increment: 1 } },
      create: { id: "INV", current: 459 },
    });
    const invoiceNumber = `INV-${String(seq.current).padStart(5, "0")}`;

    // 6. Create the Invoice in DRAFT status (PRD §4.6)
    const invoice = await tx.invoice.create({
      data: {
        number: invoiceNumber,
        subscriptionId: sub.id,
        status: InvoiceStatus.DRAFT,
        billingPeriodStart: span.start,
        billingPeriodEnd: span.end,
        dueDate,
        subtotalPaise: taxCalculation.subtotalPaise,
        discountId: appliedDiscount?.id || null,
        discountPaise,
        taxPaise: taxCalculation.taxPaise,
        totalPaise: finalTotalPaise,
        paidPaise: 0,
        lines: {
          create: sub.lines.map((sl, idx) => ({
            productVariantId: sl.productVariantId,
            description: sl.description || sl.variantName || "Subscription Service Item",
            quantity: sl.quantity,
            unitPricePaise: sl.unitPricePaise,
            subtotalPaise: sl.quantity * sl.unitPricePaise,
            sortOrder: sl.sortOrder ?? idx + 1,
          })),
        },
      },
    });

    // 7. Snapshot Invoice Taxes
    if (taxCalculation.isIntraState) {
      if (cgstTax) {
        await tx.invoiceTax.create({
          data: {
            invoiceId: invoice.id,
            taxId: cgstTax.id,
            taxName: "CGST 9%",
            taxType: TaxType.CGST,
            rateBps: 900,
            amountPaise: taxCalculation.cgstPaise,
          },
        });
      }
      if (sgstTax) {
        await tx.invoiceTax.create({
          data: {
            invoiceId: invoice.id,
            taxId: sgstTax.id,
            taxName: "SGST 9%",
            taxType: TaxType.SGST,
            rateBps: 900,
            amountPaise: taxCalculation.sgstPaise,
          },
        });
      }
    } else {
      if (igstTax) {
        await tx.invoiceTax.create({
          data: {
            invoiceId: invoice.id,
            taxId: igstTax.id,
            taxName: "IGST 18%",
            taxType: TaxType.IGST,
            rateBps: 1800,
            amountPaise: taxCalculation.igstPaise,
          },
        });
      }
    }

    // 7.1 Record Discount Usage if discount applied (PRD §4.8)
    if (appliedDiscount) {
      await tx.discountUsage.upsert({
        where: {
          discountId_subscriptionId: {
            discountId: appliedDiscount.id,
            subscriptionId: sub.id,
          },
        },
        create: {
          discountId: appliedDiscount.id,
          subscriptionId: sub.id,
          invoiceId: invoice.id,
          amountPaise: appliedDiscount.discountPaise,
        },
        update: {
          invoiceId: invoice.id,
          amountPaise: appliedDiscount.discountPaise,
          usedAt: new Date(),
        },
      });
    }

    // 8. Advance subscription nextBillingDate to next span, ONLY if it moves forward
    // (Prevent re-billing of historical cancelled invoices from rewinding nextBillingDate)
    if (!sub.nextBillingDate || span.nextBillingDate > new Date(sub.nextBillingDate)) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          nextBillingDate: span.nextBillingDate,
        },
      });
    }

    // 9. Record audit log
    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: allowRebillCancelled ? "invoice.rebilled" : "invoice.generated",
          entityType: "Invoice",
          entityId: invoice.id,
          meta: {
            invoiceNumber,
            subscriptionNumber: sub.number,
            billingPeriodStart: span.start.toISOString(),
            billingPeriodEnd: span.end.toISOString(),
            dueDate: dueDate.toISOString(),
            totalPaise: invoice.totalPaise,
            rebilled: allowRebillCancelled,
          },
        },
      });
    }

    return {
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
    };
  });
}

/**
 * Scheduled automated billing engine.
 * PRD §4.6, §7:
 * - Scans all ACTIVE, non-paused subscriptions due for billing (`nextBillingDate <= now`).
 * - Catches up missed runs period-by-period.
 * - Enforces idempotency via the partial unique index.
 * - Safe against concurrent workers (transactional with atomic sequence counters).
 */
export async function evaluateAutomatedBilling(options?: {
  actorUserId?: string;
  maxCatchupPerSubscription?: number;
}): Promise<BillingJobResult> {
  const now = new Date();
  const maxCatchup = options?.maxCatchupPerSubscription ?? 24; // Safety limit per subscription
  let invoicesGenerated = 0;
  let subscriptionsProcessed = 0;
  const generatedInvoiceNumbers: string[] = [];
  const errors: string[] = [];

  // 1. Resolve administrative actor
  let resolvedActorId = options?.actorUserId;
  if (!resolvedActorId) {
    const admin = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
      select: { id: true },
    });
    resolvedActorId = admin?.id;
  }

  // 2. Select eligible active subscriptions due for billing
  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      isPaused: false,
      OR: [
        { nextBillingDate: { lte: now } },
        { nextBillingDate: null, startDate: { lte: now } },
      ],
    },
    select: {
      id: true,
      number: true,
      startDate: true,
      endDate: true,
      nextBillingDate: true,
      billingPeriod: true,
    },
  });

  subscriptionsProcessed = dueSubscriptions.length;

  // 3. Process each due subscription
  for (const sub of dueSubscriptions) {
    const anchorDay = sub.startDate ? new Date(sub.startDate).getDate() : undefined;
    let currentBillingStart = sub.nextBillingDate ? new Date(sub.nextBillingDate) : new Date(sub.startDate);
    let iterations = 0;

    while (currentBillingStart <= now && iterations < maxCatchup) {
      iterations++;

      // If subscription has a finite contract endDate, do not bill beyond endDate
      if (sub.endDate && currentBillingStart >= new Date(sub.endDate)) {
        break;
      }

      try {
        const result = await generateInvoiceForSubscription({
          subscriptionId: sub.id,
          billingPeriodStart: currentBillingStart,
          allowRebillCancelled: false,
          actorUserId: resolvedActorId,
        });

        if (result.success && result.invoiceNumber) {
          invoicesGenerated++;
          generatedInvoiceNumbers.push(result.invoiceNumber);

          // Advance currentBillingStart to next period for catch-up loop
          const span = computeBillingPeriodSpan(currentBillingStart, sub.billingPeriod, anchorDay);
          currentBillingStart = span.nextBillingDate;
        } else if (result.reason === "ALREADY_BILLED" || result.reason === "PERIOD_CANCELLED") {
          // Advance currentBillingStart to next period to continue catch-up
          const span = computeBillingPeriodSpan(currentBillingStart, sub.billingPeriod, anchorDay);
          currentBillingStart = span.nextBillingDate;

          // Sync database subscription nextBillingDate if it lagged behind
          if (!sub.nextBillingDate || span.nextBillingDate > new Date(sub.nextBillingDate)) {
            await prisma.subscription.update({
              where: { id: sub.id },
              data: { nextBillingDate: span.nextBillingDate },
            });
          }
        } else {
          // Error or unhandled condition
          if (result.error) {
            errors.push(`Subscription ${sub.number}: ${result.error}`);
          }
          break;
        }
      } catch (err) {
        const msg = `Failed automated billing for ${sub.number} at ${currentBillingStart.toISOString()}: ${
          err instanceof Error ? err.message : String(err)
        }`;
        console.error(msg);
        errors.push(msg);
        break;
      }
    }
  }

  return {
    success: errors.length === 0,
    timestamp: now.toISOString(),
    invoicesGenerated,
    subscriptionsProcessed,
    generatedInvoiceNumbers,
    errors: errors.length > 0 ? errors : undefined,
  };
}
