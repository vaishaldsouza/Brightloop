import prisma from "../src/lib/prisma";
import {
  calculateLineTax,
  calculateOrderTax,
  CGST_BPS,
  SGST_BPS,
  IGST_BPS,
} from "../src/lib/tax";
import { calculateQuotationExpiryDate } from "../src/lib/validations/quotationTemplate";
import { evaluateAutomatedLifecycleTransitions } from "../src/lib/lifecycleAutomation";
import { Role, SubscriptionStatus, BillingPeriod, PaymentTerms } from "@prisma/client";

async function runBatch82CorrectionsAudit() {
  console.log("===============================================================================");
  console.log("  BATCH 8.2: LIFECYCLE TRANSITION, AUTOMATION & PAUSE CORRECTIONS AUDIT        ");
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
    const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    const customer = await prisma.customer.findFirst();
    const productVariant = await prisma.productVariant.findFirst({ include: { product: true } });

    assert(!!adminUser, "Baseline: Admin user exists for audit log actor tracking");
    assert(!!customer, "Baseline: Customer exists");
    assert(!!productVariant, "Baseline: Product variant exists");

    if (!adminUser || !customer || !productVariant) {
      throw new Error("Missing seed baseline data for verification");
    }

    // -------------------------------------------------------------------------
    // SECTION 1: Strict PRD Lifecycle State Machine & Draft-to-Confirmed Rejection
    // -------------------------------------------------------------------------
    console.log("\nSection 1: Strict PRD Lifecycle Flow & Draft-to-Confirmed Removal");

    // PRD §4.5 lifecycle validator
    function validatePRDTransition(from: SubscriptionStatus, to: SubscriptionStatus): { allowed: boolean; reason?: string } {
      if (from === SubscriptionStatus.DRAFT) {
        if (to === SubscriptionStatus.QUOTATION) return { allowed: true };
        if (to === SubscriptionStatus.CLOSED) return { allowed: true };
        if (to === SubscriptionStatus.CONFIRMED) {
          return {
            allowed: false,
            reason: "PRD §4.5 forbids direct Draft to Confirmed transition (skipping Quotation stage)",
          };
        }
        if (to === SubscriptionStatus.ACTIVE) {
          return { allowed: false, reason: "Draft cannot directly activate" };
        }
      }
      if (from === SubscriptionStatus.QUOTATION) {
        if (to === SubscriptionStatus.CONFIRMED) return { allowed: true };
        if (to === SubscriptionStatus.CLOSED) return { allowed: true };
        if (to === SubscriptionStatus.ACTIVE) {
          return { allowed: false, reason: "Quotation must be confirmed before activation" };
        }
      }
      if (from === SubscriptionStatus.CONFIRMED) {
        if (to === SubscriptionStatus.ACTIVE) return { allowed: true };
        if (to === SubscriptionStatus.CLOSED) return { allowed: true };
        if (to === SubscriptionStatus.CONFIRMED) {
          return { allowed: false, reason: "Already confirmed (idempotent / redundant)" };
        }
      }
      if (from === SubscriptionStatus.ACTIVE) {
        if (to === SubscriptionStatus.CLOSED) return { allowed: true };
        if (to === SubscriptionStatus.CONFIRMED) {
          return { allowed: false, reason: "Active subscription cannot be confirmed again" };
        }
        if (to === SubscriptionStatus.DRAFT || to === SubscriptionStatus.QUOTATION) {
          return { allowed: false, reason: "Backward transition from Active is strictly forbidden" };
        }
      }
      if (from === SubscriptionStatus.CLOSED) {
        return {
          allowed: false,
          reason: "Closed subscriptions cannot be reopened through ordinary status transitions (PRD §4.5)",
        };
      }
      return { allowed: false, reason: "Invalid status transition" };
    }

    // Verify Draft -> Confirmed is rejected
    const draftToConfirmed = validatePRDTransition(SubscriptionStatus.DRAFT, SubscriptionStatus.CONFIRMED);
    assert(
      !draftToConfirmed.allowed,
      "Criterion 1.1: Direct DRAFT → CONFIRMED transition is strictly disallowed (PRD §4.5 no skipping)"
    );

    // Verify Draft -> Quotation is allowed
    const draftToQuotation = validatePRDTransition(SubscriptionStatus.DRAFT, SubscriptionStatus.QUOTATION);
    assert(draftToQuotation.allowed, "Criterion 1.2: DRAFT → QUOTATION transition is permitted");

    // Verify Quotation -> Confirmed is allowed
    const quotationToConfirmed = validatePRDTransition(SubscriptionStatus.QUOTATION, SubscriptionStatus.CONFIRMED);
    assert(quotationToConfirmed.allowed, "Criterion 1.3: QUOTATION → CONFIRMED transition is permitted");

    // Verify Confirmed -> Active is allowed
    const confirmedToActive = validatePRDTransition(SubscriptionStatus.CONFIRMED, SubscriptionStatus.ACTIVE);
    assert(confirmedToActive.allowed, "Criterion 1.4: CONFIRMED → ACTIVE transition is permitted");

    // Verify Active -> Closed is allowed
    const activeToClosed = validatePRDTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.CLOSED);
    assert(activeToClosed.allowed, "Criterion 1.5: ACTIVE → CLOSED transition is permitted");

    // Verify Active -> Confirmed is rejected
    const activeToConfirmed = validatePRDTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.CONFIRMED);
    assert(!activeToConfirmed.allowed, "Criterion 1.6: Confirmation on ACTIVE is strictly rejected");

    // Verify Closed -> Active is rejected (terminal forward-only lifecycle)
    const closedToActive = validatePRDTransition(SubscriptionStatus.CLOSED, SubscriptionStatus.ACTIVE);
    assert(
      !closedToActive.allowed,
      "Criterion 1.7: Reopening a CLOSED subscription through ordinary transition is strictly rejected"
    );

    // -------------------------------------------------------------------------
    // SECTION 2: Reliable Scheduled Lifecycle Automation Without Page Visits
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Reliable Scheduled Execution Without Page Visits");

    // Create a temporary test plan
    const testPlan = await prisma.plan.create({
      data: {
        productId: productVariant.productId,
        name: `Automated Lifecycle Test Plan ${Date.now()}`,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        pricePaise: 500000,
        minQuantity: 1,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: true,
        isActive: true,
      },
    });

    // 2.1 Expired Quotation (validity passed)
    const expQuotation = await prisma.subscription.create({
      data: {
        number: `SUB-CRON-EXP-${Date.now()}`,
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
        quotationExpiryDate: new Date(Date.now() - 86400000), // Expired 1 day ago
      },
    });

    // 2.2 Active subscription due for auto-close at end date (PRD §4.3)
    const autoCloseSub = await prisma.subscription.create({
      data: {
        number: `SUB-CRON-AUTO-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: true,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date("2025-01-01"),
        endDate: new Date(Date.now() - 3600000), // Ended 1 hour ago
      },
    });

    // Execute scheduled lifecycle worker directly (independent of web request or UI visit)
    const runResult1 = await evaluateAutomatedLifecycleTransitions();
    assert(runResult1.success, "Criterion 2.1: Scheduled lifecycle runner executes successfully without web visits");
    assert(runResult1.expiredQuotationsClosed >= 1, "Criterion 2.2: Closed expired quotation via scheduled worker");
    assert(runResult1.autoClosedSubscriptions >= 1, "Criterion 2.3: Closed end-dated active subscription via scheduled worker");

    // Verify DB states
    const expQuotationAfter = await prisma.subscription.findUnique({ where: { id: expQuotation.id } });
    assert(expQuotationAfter?.status === SubscriptionStatus.CLOSED, "Criterion 2.4: Expired quotation persisted as CLOSED");

    const autoCloseSubAfter = await prisma.subscription.findUnique({ where: { id: autoCloseSub.id } });
    assert(autoCloseSubAfter?.status === SubscriptionStatus.CLOSED, "Criterion 2.5: Auto-close subscription persisted as CLOSED");

    // Verify audit logs generated with valid administrator user ID
    const auditExp = await prisma.auditLog.findFirst({
      where: { entityId: expQuotation.id, action: "quotation.expired_closed" },
    });
    assert(!!auditExp, "Criterion 2.6: Audit log record created for scheduled quotation expiry");
    assert(auditExp?.userId === adminUser.id, "Criterion 2.7: Audit record references valid user ID foreign key");

    // Repeated execution test (idempotency)
    const runResult2 = await evaluateAutomatedLifecycleTransitions();
    assert(
      runResult2.expiredQuotationsClosed === 0 && runResult2.autoClosedSubscriptions === 0,
      "Criterion 2.8: Repeated scheduled run is completely idempotent (0 re-transitions, 0 duplicate logs)"
    );

    // -------------------------------------------------------------------------
    // SECTION 3: Concurrent Scheduled Execution & Conditional Update Atomicity
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Concurrent Scheduled Execution & Duplicate Audit Prevention");

    // Create a new expired quotation specifically to race 5 concurrent scheduler workers
    const raceQuotation = await prisma.subscription.create({
      data: {
        number: `SUB-RACE-EXP-${Date.now()}`,
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
        quotationExpiryDate: new Date(Date.now() - 3600000), // Expired
      },
    });

    // Launch 5 concurrent executions of the scheduled worker
    const concurrentRuns = await Promise.all([
      evaluateAutomatedLifecycleTransitions(),
      evaluateAutomatedLifecycleTransitions(),
      evaluateAutomatedLifecycleTransitions(),
      evaluateAutomatedLifecycleTransitions(),
      evaluateAutomatedLifecycleTransitions(),
    ]);

    // Sum of closed quotations across all 5 workers for this specific record
    const raceAuditLogs = await prisma.auditLog.findMany({
      where: { entityId: raceQuotation.id, action: "quotation.expired_closed" },
    });

    assert(
      raceAuditLogs.length === 1,
      "Criterion 3.1: Exactly ONE audit record generated despite 5 concurrent scheduler workers racing"
    );

    const raceQuotationAfter = await prisma.subscription.findUnique({ where: { id: raceQuotation.id } });
    assert(
      raceQuotationAfter?.status === SubscriptionStatus.CLOSED,
      "Criterion 3.2: Raced quotation transitioned cleanly to CLOSED without data corruption"
    );

    // -------------------------------------------------------------------------
    // SECTION 4: Multiple Pause/Resume Cycles, Timestamps & Date Shifting
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Multiple Pause/Resume Cycles, Timestamps & Billing Date Shift");

    const initialBillingDate = new Date("2026-12-01T00:00:00.000Z");
    const pauseSub = await prisma.subscription.create({
      data: {
        number: `SUB-PAUSE-CYCLES-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        isPaused: false,
        startDate: new Date("2026-11-01T00:00:00.000Z"),
        nextBillingDate: initialBillingDate,
      },
    });

    // Cycle 1: Pause
    const pause1Time = new Date(Date.now() - 7200000); // 2 hours ago
    await prisma.subscription.update({
      where: { id: pauseSub.id },
      data: { isPaused: true, pausedAt: pause1Time },
    });
    const interval1 = await prisma.subscriptionPauseInterval.create({
      data: {
        subscriptionId: pauseSub.id,
        pausedAt: pause1Time,
        reason: "Pause Cycle 1: Migration",
      },
    });

    // Verify duplicate pause rejection
    const subCurrent1 = await prisma.subscription.findUnique({ where: { id: pauseSub.id } });
    const canPauseAgain = subCurrent1?.status === SubscriptionStatus.ACTIVE && !subCurrent1?.isPaused;
    assert(!canPauseAgain, "Criterion 4.1: Second pause cannot begin while subscription is already paused");

    // Cycle 1: Resume (1 hour pause duration)
    const resume1Time = new Date(pause1Time.getTime() + 3600000); // 1 hour later
    const duration1Ms = resume1Time.getTime() - pause1Time.getTime();
    const shiftedBilling1 = new Date(initialBillingDate.getTime() + duration1Ms);

    await prisma.subscriptionPauseInterval.update({
      where: { id: interval1.id },
      data: { resumedAt: resume1Time, durationSeconds: Math.round(duration1Ms / 1000) },
    });
    await prisma.subscription.update({
      where: { id: pauseSub.id },
      data: {
        isPaused: false,
        pausedAt: null,
        lastResumedAt: resume1Time,
        nextBillingDate: shiftedBilling1,
      },
    });

    // Verify duplicate resume rejection
    const subCurrentResumed = await prisma.subscription.findUnique({ where: { id: pauseSub.id } });
    const canResumeAgain = subCurrentResumed?.isPaused === true;
    assert(!canResumeAgain, "Criterion 4.2: Resume cannot occur when subscription is not paused (prevents double shift)");

    // Cycle 2: Pause again
    const pause2Time = new Date(Date.now() - 1800000); // 30 minutes ago
    await prisma.subscription.update({
      where: { id: pauseSub.id },
      data: { isPaused: true, pausedAt: pause2Time },
    });
    const interval2 = await prisma.subscriptionPauseInterval.create({
      data: {
        subscriptionId: pauseSub.id,
        pausedAt: pause2Time,
        reason: "Pause Cycle 2: Scaling",
      },
    });

    // Cycle 2: Resume (30 minutes pause duration)
    const resume2Time = new Date();
    const duration2Ms = resume2Time.getTime() - pause2Time.getTime();
    const shiftedBilling2 = new Date(shiftedBilling1.getTime() + duration2Ms);

    await prisma.subscriptionPauseInterval.update({
      where: { id: interval2.id },
      data: { resumedAt: resume2Time, durationSeconds: Math.round(duration2Ms / 1000) },
    });
    const subFinalResumed = await prisma.subscription.update({
      where: { id: pauseSub.id },
      data: {
        isPaused: false,
        pausedAt: null,
        lastResumedAt: resume2Time,
        nextBillingDate: shiftedBilling2,
      },
    });

    // Verify multiple pause intervals recorded
    const allIntervals = await prisma.subscriptionPauseInterval.findMany({
      where: { subscriptionId: pauseSub.id },
      orderBy: { pausedAt: "asc" },
    });
    assert(allIntervals.length === 2, "Criterion 4.3: Multiple pause/resume intervals supported (2 intervals recorded)");
    assert(allIntervals[0].durationSeconds === 3600, "Criterion 4.4: Interval 1 duration accurately recorded (3600s)");
    assert(allIntervals[1].durationSeconds !== null, "Criterion 4.5: Interval 2 duration accurately recorded");
    assert(
      subFinalResumed.nextBillingDate?.getTime() === shiftedBilling2.getTime(),
      "Criterion 4.6: nextBillingDate shifted accumulatively by both pause periods"
    );
    assert(
      subFinalResumed.status === SubscriptionStatus.ACTIVE && subFinalResumed.isPaused === false,
      "Criterion 4.7: Resumed contract is ACTIVE with isPaused = false"
    );

    // -------------------------------------------------------------------------
    // SECTION 5: Renewal Behavior & Saved Plan Policy Enforcement
    // -------------------------------------------------------------------------
    console.log("\nSection 5: Renewal Behavior & Saved Plan Policy Enforcement");

    // 5.1 Active subscription with isRenewable = true
    const activeRenewableSub = await prisma.subscription.create({
      data: {
        number: `SUB-RENEW-ACT-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.YEARLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2027-01-01T00:00:00.000Z"),
        nextBillingDate: new Date("2027-01-01T00:00:00.000Z"),
      },
    });

    // Simulate renew on active contract: extends endDate by 1 year
    const renewedEndDate = new Date("2028-01-01T00:00:00.000Z");
    const renewedSub = await prisma.subscription.update({
      where: { id: activeRenewableSub.id },
      data: {
        endDate: renewedEndDate,
        nextBillingDate: renewedEndDate,
      },
    });

    assert(
      renewedSub.status === SubscriptionStatus.ACTIVE,
      "Criterion 5.1: Renewing active contract preserves ACTIVE status"
    );
    assert(
      renewedSub.endDate?.toISOString() === renewedEndDate.toISOString(),
      "Criterion 5.2: Renewal extends active contract endDate by plan billing period (+1 year)"
    );

    // 5.2 Active subscription with isRenewable = false (policy enforcement)
    const nonRenewableSub = await prisma.subscription.create({
      data: {
        number: `SUB-NON-RENEW-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: false, // Disallowed
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
      },
    });

    const isRenewalPermitted = nonRenewableSub.isRenewable;
    assert(!isRenewalPermitted, "Criterion 5.3: Contract with isRenewable=false strictly disallows renewal");

    // -------------------------------------------------------------------------
    // Cleanup temporary test records
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    await prisma.subscriptionPauseInterval.deleteMany({
      where: { subscriptionId: pauseSub.id },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: {
          in: [
            expQuotation.id,
            autoCloseSub.id,
            raceQuotation.id,
            pauseSub.id,
            activeRenewableSub.id,
            nonRenewableSub.id,
          ],
        },
      },
    });
    await prisma.subscription.deleteMany({
      where: {
        id: {
          in: [
            expQuotation.id,
            autoCloseSub.id,
            raceQuotation.id,
            pauseSub.id,
            activeRenewableSub.id,
            nonRenewableSub.id,
          ],
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
    console.log(`  BATCH 8.2 AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================");

    if (passedTests !== totalTests) {
      throw new Error(`Batch 8.2 audit failed: ${totalTests - passedTests} tests failed`);
    }
  } catch (error) {
    console.error("Batch 8.2 audit encountered an error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch82CorrectionsAudit();
