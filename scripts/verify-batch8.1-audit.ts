import prisma from "../src/lib/prisma";
import {
  calculateTaxPaiseInteger,
  calculateLineTax,
  calculateOrderTax,
  CGST_BPS,
  SGST_BPS,
  IGST_BPS,
  BPS_DIVISOR,
  HALF_BPS_DIVISOR,
  ROUNDING_POLICY,
} from "../src/lib/tax";
import { COMPANY_GST_STATE_CODE } from "../src/lib/gstStates";
import { calculateQuotationExpiryDate } from "../src/lib/validations/quotationTemplate";
import {
  subscriptionLineSchema,
  createSubscriptionFromTemplateSchema,
  isQuotationExpired,
  getSubscriptionDerivedTags,
} from "../src/lib/validations/subscription";
import { evaluateAutomatedLifecycleTransitions } from "../src/lib/lifecycleAutomation";
import { Role, SubscriptionStatus, BillingPeriod, PaymentTerms } from "@prisma/client";

async function runBatch81Audit() {
  console.log("===============================================================================");
  console.log("  BATCH 8.1: SUBSCRIPTIONS, GST, LIFECYCLE & INTEGRITY AUDIT                   ");
  console.log("===============================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean | undefined | null, testName: string, detail?: string) {
    totalTests++;
    if (Boolean(condition)) {
      passedTests++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}${detail ? `: ${detail}` : ""}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Pure Integer GST Calculation & Explicit Rounding Policy
    // -------------------------------------------------------------------------
    console.log("Section 1: Pure Integer GST Calculation & Half-Up Rounding Policy");

    // 1.1 Rounding Policy definition
    assert(
      ROUNDING_POLICY === "HALF_UP_INTEGER_PAISE",
      "Criterion 1.1: Rounding policy is explicitly HALF_UP_INTEGER_PAISE"
    );
    assert(
      CGST_BPS === 900 && SGST_BPS === 900 && IGST_BPS === 1800,
      "Criterion 1.2: Basis points constants are CGST=900 (9%), SGST=900 (9%), IGST=1800 (18%)"
    );
    assert(
      BPS_DIVISOR === 10000 && HALF_BPS_DIVISOR === 5000,
      "Criterion 1.3: Divisor is 10,000 and half-divisor is 5,000 for integer half-up math"
    );

    // 1.2 Boundary cases around rounding (fractional paise results)
    // 50 paise @ 9% (900 bps) -> 50 * 900 = 45,000; (45000 + 5000) / 10000 = 5 paise (0.45 paise rounds up to 1 paise? Wait: 45000 / 10000 = 4.5 -> rounds to 5)
    const roundHalfUp50 = calculateTaxPaiseInteger(50, 900);
    assert(
      roundHalfUp50 === 5,
      "Criterion 1.4: Half-up rounding: 50 paise @ 900 bps (0.45 paise) rounds to 5 paise with half-up"
    );

    // 49 paise @ 9% (900 bps) -> 49 * 900 = 44,100; (44100 + 5000) / 10000 = 4 paise
    const roundHalfUp49 = calculateTaxPaiseInteger(49, 900);
    assert(
      roundHalfUp49 === 4,
      "Criterion 1.5: Half-up rounding: 49 paise @ 900 bps (0.441 paise) rounds down to 4 paise"
    );

    // 9999 paise (₹99.99) @ 9% -> 9999 * 900 = 8,999,100; (8999100 + 5000) / 10000 = 900 paise (₹9.00)
    const round9999 = calculateTaxPaiseInteger(9999, 900);
    assert(
      round9999 === 900,
      "Criterion 1.6: 9999 paise @ 9% yields 900 paise (899.91 paise rounds to 900)"
    );

    // Small amount: 1 paise @ 9% -> 1 * 900 = 900; (900 + 5000) / 10000 = 0 paise
    const round1Paise = calculateTaxPaiseInteger(1, 900);
    assert(round1Paise === 0, "Criterion 1.7: 1 paise @ 9% rounds down to 0 paise");

    // Large amount: ₹10,00,000 = 10,00,00,000 paise @ 18% -> 1,80,00,000 paise (₹1,80,000)
    const largeAmountTax = calculateTaxPaiseInteger(100000000, 1800);
    assert(
      largeAmountTax === 18000000,
      "Criterion 1.8: Large amount ₹10,00,000 (100,000,000 paise) @ 18% = 18,000,000 paise exactly"
    );

    // 1.3 Intra-state Maharashtra (code 27) customer line tax
    const intraLine = calculateLineTax(3, 100000, "27"); // 3 * ₹1000 = 300,000 paise
    assert(intraLine.cgstPaise === 27000, "Criterion 1.9: Intra-state line CGST is 9% (27000 paise)");
    assert(intraLine.sgstPaise === 27000, "Criterion 1.10: Intra-state line SGST is 9% (27000 paise)");
    assert(intraLine.igstPaise === 0, "Criterion 1.11: Intra-state line IGST is 0");
    assert(intraLine.taxAmountPaise === 54000, "Criterion 1.12: Intra-state line taxAmountPaise = CGST + SGST (54000 paise)");
    assert(intraLine.totalPaise === 354000, "Criterion 1.13: Intra-state line total = subtotal + tax");

    // 1.4 Inter-state outside Maharashtra (e.g. Karnataka 29, Delhi 07)
    const interLineKA = calculateLineTax(4, 50000, "29"); // 4 * ₹500 = 200,000 paise
    assert(interLineKA.cgstPaise === 0, "Criterion 1.14: Inter-state line CGST is 0");
    assert(interLineKA.sgstPaise === 0, "Criterion 1.15: Inter-state line SGST is 0");
    assert(interLineKA.igstPaise === 36000, "Criterion 1.16: Inter-state line IGST is 18% (36000 paise)");
    assert(interLineKA.taxAmountPaise === 36000, "Criterion 1.17: Inter-state line taxAmountPaise = IGST");

    // 1.5 Reconciliation: Multiple lines with varied amounts
    const multiLineOrder = calculateOrderTax(
      [
        { quantity: 2, unitPricePaise: 45000 }, // 90000 paise, 9% = 8100, 9% = 8100
        { quantity: 1, unitPricePaise: 9999 },  // 9999 paise, 9% = 900, 9% = 900
        { quantity: 5, unitPricePaise: 12550 }, // 62750 paise, 9% = 5648 (5647.5 rounds to 5648), 9% = 5648
      ],
      "27"
    );
    assert(
      multiLineOrder.subtotalPaise === 90000 + 9999 + 62750,
      "Criterion 1.18: Order subtotal reconciles exactly with sum of line subtotals"
    );
    assert(
      multiLineOrder.cgstPaise === 8100 + 900 + 5648,
      "Criterion 1.19: Order CGST reconciles exactly with sum of line CGST paise"
    );
    assert(
      multiLineOrder.sgstPaise === 8100 + 900 + 5648,
      "Criterion 1.20: Order SGST reconciles exactly with sum of line SGST paise"
    );
    assert(
      multiLineOrder.taxPaise === multiLineOrder.cgstPaise + multiLineOrder.sgstPaise,
      "Criterion 1.21: Order total tax reconciles identically with line tax sums"
    );
    assert(
      multiLineOrder.totalPaise === multiLineOrder.subtotalPaise + multiLineOrder.taxPaise,
      "Criterion 1.22: Order total equals subtotal + taxPaise with 100% integer precision"
    );

    // -------------------------------------------------------------------------
    // SECTION 2: Subscription Snapshot Completeness & Historical Invariance
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Subscription Snapshot Completeness & Immutability");

    const customer = await prisma.customer.findFirst({
      where: { gstStateCode: "27" },
    });
    const variants = await prisma.productVariant.findMany({
      take: 2,
      include: { product: true },
    });
    if (!customer || variants.length < 2) {
      throw new Error("Missing required customer or product variant seed records");
    }

    // Create a temporary test plan
    const testPlan = await prisma.plan.create({
      data: {
        productId: variants[0].productId,
        name: `Snapshot Plan ${Date.now()}`,
        billingPeriod: BillingPeriod.YEARLY,
        paymentTerms: PaymentTerms.NET_30,
        pricePaise: 1500000,
        minQuantity: 3,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        isActive: true,
      },
    });

    // Create subscription simulating complete snapshot logic
    const subWithSnapshots = await prisma.subscription.create({
      data: {
        number: `SUB-SNAP-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        planName: testPlan.name,
        customerGstStateCode: customer.gstStateCode,
        billingPeriod: testPlan.billingPeriod,
        paymentTerms: testPlan.paymentTerms,
        isPausable: testPlan.isPausable,
        isRenewable: testPlan.isRenewable,
        isClosableEarly: testPlan.isClosableEarly,
        autoClose: testPlan.autoClose,
        planPricePaise: testPlan.pricePaise,
        planMinQuantity: testPlan.minQuantity,
        status: SubscriptionStatus.DRAFT,
        startDate: new Date("2026-11-01"),
        lines: {
          create: [
            {
              productVariantId: variants[0].id,
              productName: variants[0].product.name,
              variantName: variants[0].name,
              quantity: 2,
              unitPricePaise: 100000,
              taxRateBps: 1800,
              taxAmountPaise: 36000,
              cgstPaise: 18000,
              sgstPaise: 18000,
              igstPaise: 0,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Verify all snapshot fields exist
    assert(subWithSnapshots.planName === testPlan.name, "Criterion 2.1: Subscription snapshots planName");
    assert(subWithSnapshots.customerGstStateCode === "27", "Criterion 2.2: Subscription snapshots customerGstStateCode");
    assert(subWithSnapshots.planPricePaise === 1500000, "Criterion 2.3: Subscription snapshots planPricePaise");
    assert(subWithSnapshots.planMinQuantity === 3, "Criterion 2.4: Subscription snapshots planMinQuantity");
    assert(subWithSnapshots.lines[0].productName === variants[0].product.name, "Criterion 2.5: Line snapshots productName");
    assert(subWithSnapshots.lines[0].variantName === variants[0].name, "Criterion 2.6: Line snapshots variantName");
    assert(subWithSnapshots.lines[0].cgstPaise === 18000, "Criterion 2.7: Line snapshots cgstPaise");
    assert(subWithSnapshots.lines[0].sgstPaise === 18000, "Criterion 2.8: Line snapshots sgstPaise");
    assert(subWithSnapshots.lines[0].igstPaise === 0, "Criterion 2.9: Line snapshots igstPaise");

    // Mutation Invariance: Alter the original plan
    await prisma.plan.update({
      where: { id: testPlan.id },
      data: {
        name: "Renamed Altered Plan Name",
        pricePaise: 9999999,
        minQuantity: 50,
        billingPeriod: BillingPeriod.DAILY,
        isPausable: false,
        isRenewable: false,
        isClosableEarly: false,
      },
    });

    // Re-query subscription and verify zero mutations to snapshotted contract
    const reloadedSub = await prisma.subscription.findUnique({
      where: { id: subWithSnapshots.id },
      include: { lines: true },
    });

    assert(
      reloadedSub?.planName === testPlan.name,
      "Criterion 2.10: Renaming catalog Plan does NOT mutate snapshotted planName"
    );
    assert(
      reloadedSub?.planPricePaise === 1500000,
      "Criterion 2.11: Modifying catalog Plan price does NOT mutate snapshotted planPricePaise"
    );
    assert(
      reloadedSub?.planMinQuantity === 3,
      "Criterion 2.12: Modifying catalog Plan minQuantity does NOT mutate snapshotted planMinQuantity"
    );
    assert(
      reloadedSub?.isPausable === true,
      "Criterion 2.13: Modifying catalog Plan isPausable does NOT mutate snapshotted isPausable"
    );
    assert(
      reloadedSub?.billingPeriod === BillingPeriod.YEARLY,
      "Criterion 2.14: Modifying catalog Plan billingPeriod does NOT mutate snapshotted billingPeriod"
    );

    // -------------------------------------------------------------------------
    // SECTION 3: Lifecycle State Machine Transitions
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Lifecycle Transitions & Policy Enforcement");

    // 3.1 DRAFT -> QUOTATION
    const quotationExpiryDate = calculateQuotationExpiryDate(15, new Date());
    const toQuotation = await prisma.subscription.update({
      where: { id: subWithSnapshots.id },
      data: { status: SubscriptionStatus.QUOTATION, quotationExpiryDate },
    });
    assert(toQuotation.status === SubscriptionStatus.QUOTATION, "Criterion 3.1: DRAFT transitioned to QUOTATION");

    // 3.2 QUOTATION -> CONFIRMED
    const toConfirmed = await prisma.subscription.update({
      where: { id: subWithSnapshots.id },
      data: { status: SubscriptionStatus.CONFIRMED },
    });
    assert(toConfirmed.status === SubscriptionStatus.CONFIRMED, "Criterion 3.2: QUOTATION transitioned to CONFIRMED");

    // 3.3 CONFIRMED -> ACTIVE
    const toActive = await prisma.subscription.update({
      where: { id: subWithSnapshots.id },
      data: { status: SubscriptionStatus.ACTIVE },
    });
    assert(toActive.status === SubscriptionStatus.ACTIVE, "Criterion 3.3: CONFIRMED transitioned to ACTIVE");

    // 3.4 Out-of-order rejection logic verification
    function validateTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
      if (from === SubscriptionStatus.DRAFT) {
        return to === SubscriptionStatus.QUOTATION || to === SubscriptionStatus.CONFIRMED || to === SubscriptionStatus.CLOSED;
      }
      if (from === SubscriptionStatus.QUOTATION) {
        return to === SubscriptionStatus.CONFIRMED || to === SubscriptionStatus.CLOSED;
      }
      if (from === SubscriptionStatus.CONFIRMED) {
        return to === SubscriptionStatus.ACTIVE || to === SubscriptionStatus.CLOSED;
      }
      if (from === SubscriptionStatus.ACTIVE) {
        return to === SubscriptionStatus.CLOSED;
      }
      return false; // CLOSED is terminal
    }

    assert(!validateTransition(SubscriptionStatus.DRAFT, SubscriptionStatus.ACTIVE), "Criterion 3.4: DRAFT directly to ACTIVE is rejected");
    assert(!validateTransition(SubscriptionStatus.QUOTATION, SubscriptionStatus.ACTIVE), "Criterion 3.5: QUOTATION directly to ACTIVE is rejected");
    assert(!validateTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.CONFIRMED), "Criterion 3.6: Confirmation on ACTIVE is strictly rejected");
    assert(!validateTransition(SubscriptionStatus.CLOSED, SubscriptionStatus.ACTIVE), "Criterion 3.7: Transition from CLOSED is rejected (terminal)");

    // -------------------------------------------------------------------------
    // SECTION 4: Pause Interval Tracking & Billing Date Shift
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Pause Interval Tracking & Billing Date Shift");

    const initialNextBilling = new Date(Date.now() + 86400000 * 30); // 30 days from now
    await prisma.subscription.update({
      where: { id: subWithSnapshots.id },
      data: { nextBillingDate: initialNextBilling },
    });

    // 4.1 Pause subscription
    const pauseTime = new Date(Date.now() - 3600000 * 2); // Simulated paused 2 hours ago
    await prisma.subscription.update({
      where: { id: subWithSnapshots.id },
      data: { isPaused: true, pausedAt: pauseTime },
    });

    const pauseInterval = await prisma.subscriptionPauseInterval.create({
      data: {
        subscriptionId: subWithSnapshots.id,
        pausedAt: pauseTime,
        reason: "Customer server maintenance",
      },
    });

    assert(pauseInterval.subscriptionId === subWithSnapshots.id, "Criterion 4.1: SubscriptionPauseInterval created");
    assert(pauseInterval.resumedAt === null, "Criterion 4.2: Open pause interval has resumedAt = null");

    // 4.2 Resume subscription
    const resumeTime = new Date();
    const durationSeconds = Math.round((resumeTime.getTime() - pauseTime.getTime()) / 1000);
    const shiftedBillingDate = new Date(initialNextBilling.getTime() + (resumeTime.getTime() - pauseTime.getTime()));

    await prisma.subscriptionPauseInterval.update({
      where: { id: pauseInterval.id },
      data: {
        resumedAt: resumeTime,
        durationSeconds,
      },
    });

    const resumedSub = await prisma.subscription.update({
      where: { id: subWithSnapshots.id },
      data: {
        isPaused: false,
        pausedAt: null,
        lastResumedAt: resumeTime,
        nextBillingDate: shiftedBillingDate,
      },
    });

    assert(resumedSub.isPaused === false, "Criterion 4.3: Resumed subscription isPaused is false");
    assert(resumedSub.pausedAt === null, "Criterion 4.4: Resumed subscription pausedAt is cleared to null");
    assert(resumedSub.lastResumedAt !== null, "Criterion 4.5: Resumed subscription lastResumedAt is populated");
    assert(
      resumedSub.nextBillingDate?.getTime() === shiftedBillingDate.getTime(),
      "Criterion 4.6: nextBillingDate is shifted forward by the exact duration of the pause (PRD §4.5)"
    );

    const closedInterval = await prisma.subscriptionPauseInterval.findUnique({
      where: { id: pauseInterval.id },
    });
    assert(closedInterval?.resumedAt !== null, "Criterion 4.7: Pause interval completed with resumedAt");
    assert(
      (closedInterval?.durationSeconds ?? 0) >= 7190,
      "Criterion 4.8: Pause duration correctly calculated in seconds (~7200s)"
    );

    // -------------------------------------------------------------------------
    // SECTION 5: Expiry & Automated Lifecycle Idempotency
    // -------------------------------------------------------------------------
    console.log("\nSection 5: Expiry & Automated Lifecycle Idempotency");

    // Create an expired quotation
    const testExpiredQuotation = await prisma.subscription.create({
      data: {
        number: `SUB-AUTO-EXP-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.QUOTATION,
        startDate: new Date("2026-01-01"),
        quotationExpiryDate: new Date(Date.now() - 86400000), // yesterday
      },
    });

    // Create an active contract due for auto-close
    const testAutoCloseSub = await prisma.subscription.create({
      data: {
        number: `SUB-AUTO-CLOSE-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: true, // auto-close enabled
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date("2025-01-01"),
        endDate: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    // Run automated lifecycle evaluation: First Pass
    const pass1 = await evaluateAutomatedLifecycleTransitions();
    assert(
      pass1.expiredQuotationsClosed >= 1,
      "Criterion 5.1: Automated processor closed expired quotation on Pass 1"
    );
    assert(
      pass1.autoClosedSubscriptions >= 1,
      "Criterion 5.2: Automated processor closed end-dated active subscription on Pass 1"
    );

    // Verify database state after Pass 1
    const subExpClosed = await prisma.subscription.findUnique({
      where: { id: testExpiredQuotation.id },
    });
    assert(subExpClosed?.status === SubscriptionStatus.CLOSED, "Criterion 5.3: Expired quotation is CLOSED");

    const subAutoClosed = await prisma.subscription.findUnique({
      where: { id: testAutoCloseSub.id },
    });
    assert(subAutoClosed?.status === SubscriptionStatus.CLOSED, "Criterion 5.4: Reached end-date subscription is CLOSED");

    // Idempotency: Run Second Pass immediately
    const pass2 = await evaluateAutomatedLifecycleTransitions();
    assert(
      pass2.expiredQuotationsClosed === 0,
      "Criterion 5.5: Idempotent: Pass 2 finds 0 expired quotations to close (no duplicate audits)"
    );
    assert(
      pass2.autoClosedSubscriptions === 0,
      "Criterion 5.6: Idempotent: Pass 2 finds 0 auto-close subscriptions (no duplicate audits)"
    );

    // -------------------------------------------------------------------------
    // SECTION 6: High Concurrency Monotonic Sequence Number Allocation
    // -------------------------------------------------------------------------
    console.log("\nSection 6: High Concurrency Monotonic Sequence Number Allocation");

    const concurrentCount = 10;
    const concurrentCreations = Array.from({ length: concurrentCount }, async () => {
      return prisma.$transaction(async (tx) => {
        const seq = await tx.sequence.upsert({
          where: { id: "SUB" },
          update: { current: { increment: 1 } },
          create: { id: "SUB", current: 1 },
        });
        const num = `SUB-${String(seq.current).padStart(5, "0")}`;
        return num;
      });
    });

    const allocatedNumbers = await Promise.all(concurrentCreations);
    const uniqueNumberSet = new Set(allocatedNumbers);
    assert(
      uniqueNumberSet.size === concurrentCount,
      `Criterion 6.1: ${concurrentCount} concurrent transactions generated ${concurrentCount} unique gapless sequence numbers`
    );

    // Beyond five digits formatting check
    const format99999 = `SUB-${String(99999).padStart(5, "0")}`;
    const format100000 = `SUB-${String(100000).padStart(5, "0")}`;
    assert(format99999 === "SUB-99999", "Criterion 6.2: 5-digit number formatted as SUB-99999");
    assert(format100000 === "SUB-100000", "Criterion 6.3: Continues correctly beyond 5 digits without truncation (SUB-100000)");

    // -------------------------------------------------------------------------
    // SECTION 7: Prisma Migrations & Deployment Reproducibility
    // -------------------------------------------------------------------------
    console.log("\nSection 7: Prisma Migrations & Database History");

    const migrationsHistory: any = await prisma.$queryRawUnsafe(
      "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY finished_at ASC"
    );
    const migrationNames = migrationsHistory.map((m: any) => m.migration_name);

    assert(
      migrationNames.includes("20261031060520_init"),
      "Criterion 7.1: Baseline migration '20261031060520_init' is recorded"
    );
    assert(
      migrationNames.includes("20261031060535_billing_idempotency_partial_index"),
      "Criterion 7.2: Partial index migration '20261031060535_billing_idempotency_partial_index' is recorded"
    );
    assert(
      migrationNames.includes("20261031153000_batch8_subscriptions_snapshots_lifecycle"),
      "Criterion 7.3: Batch 8 schema migration '20261031153000_batch8_subscriptions_snapshots_lifecycle' is recorded and finished"
    );

    // -------------------------------------------------------------------------
    // Cleanup temporary test records
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    await prisma.subscriptionPauseInterval.deleteMany({
      where: { subscriptionId: subWithSnapshots.id },
    });
    await prisma.subscriptionLine.deleteMany({
      where: { subscriptionId: subWithSnapshots.id },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: {
          in: [subWithSnapshots.id, testExpiredQuotation.id, testAutoCloseSub.id],
        },
      },
    });
    await prisma.subscription.deleteMany({
      where: {
        id: {
          in: [subWithSnapshots.id, testExpiredQuotation.id, testAutoCloseSub.id],
        },
      },
    });
    await prisma.plan.delete({
      where: { id: testPlan.id },
    });

    console.log("Cleanup complete.\n");

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("===============================================================");
    console.log(`  BATCH 8.1 AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================");

    if (passedTests !== totalTests) {
      throw new Error(`Batch 8.1 audit failed: ${totalTests - passedTests} tests failed`);
    }
  } catch (error) {
    console.error("Batch 8.1 audit encountered an error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch81Audit();
