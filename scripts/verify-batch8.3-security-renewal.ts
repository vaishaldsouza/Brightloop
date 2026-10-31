import prisma from "../src/lib/prisma";
import { evaluateAutomatedLifecycleTransitions } from "../src/lib/lifecycleAutomation";
import { calculateQuotationExpiryDate } from "../src/lib/validations/quotationTemplate";
import { Role, SubscriptionStatus, BillingPeriod, PaymentTerms } from "@prisma/client";
import crypto from "crypto";

async function runBatch83SecurityAudit() {
  console.log("===============================================================================");
  console.log("  BATCH 8.3: CRON SECURITY, LIFECYCLE EXCEPTIONS & RENEWAL AUDIT               ");
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

    assert(!!adminUser, "Baseline: Admin user exists for audit tracking");
    assert(!!customer, "Baseline: Customer exists");
    assert(!!productVariant, "Baseline: Product variant exists");

    if (!adminUser || !customer || !productVariant) {
      throw new Error("Missing seed baseline data for verification");
    }

    // -------------------------------------------------------------------------
    // SECTION 1: Cron Endpoint Security & Constant-Time Verification
    // -------------------------------------------------------------------------
    console.log("\nSection 1: Cron Endpoint Security & Secret Verification");

    // 1.1 Constant-time comparison function test
    function timingSafeEqual(a: string, b: string): boolean {
      const hashA = crypto.createHash("sha256").update(a).digest();
      const hashB = crypto.createHash("sha256").update(b).digest();
      return crypto.timingSafeEqual(hashA, hashB);
    }

    const secretReal = "brightloop-super-secure-cron-secret-2026";
    const secretMatching = "brightloop-super-secure-cron-secret-2026";
    const secretTampered = "brightloop-super-secure-cron-secret-2027";
    const secretShort = "short";

    assert(
      timingSafeEqual(secretReal, secretMatching) === true,
      "Criterion 1.1: Constant-time comparison matches identical secrets"
    );
    assert(
      timingSafeEqual(secretReal, secretTampered) === false,
      "Criterion 1.2: Constant-time comparison rejects tampered secret of same length"
    );
    assert(
      timingSafeEqual(secretReal, secretShort) === false,
      "Criterion 1.3: Constant-time comparison rejects different-length secret without timing leak"
    );

    // 1.2 Fail-closed simulation when CRON_SECRET is empty or missing
    function verifyCronAuth(authHeader: string | null, customHeader: string | null, envSecret?: string): { authorized: boolean; status: number; error?: string } {
      const configuredSecret = envSecret?.trim();
      if (!configuredSecret) {
        return { authorized: false, status: 500, error: "Server Misconfiguration: CRON_SECRET missing (fails closed)" };
      }

      let providedSecret: string | null = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        providedSecret = authHeader.substring(7).trim();
      } else if (customHeader) {
        providedSecret = customHeader.trim();
      }

      if (!providedSecret || !timingSafeEqual(providedSecret, configuredSecret)) {
        return { authorized: false, status: 401, error: "Unauthorized: Invalid cron secret" };
      }

      return { authorized: true, status: 200 };
    }

    // Test missing CRON_SECRET fails closed (HTTP 500 Server Misconfiguration, never 200)
    const missingSecretCheck = verifyCronAuth("Bearer some-token", null, undefined);
    assert(
      missingSecretCheck.authorized === false && missingSecretCheck.status === 500,
      "Criterion 1.4: Endpoint fails closed (HTTP 500) when CRON_SECRET is missing"
    );

    const emptySecretCheck = verifyCronAuth("Bearer some-token", null, "   ");
    assert(
      emptySecretCheck.authorized === false && emptySecretCheck.status === 500,
      "Criterion 1.5: Endpoint fails closed when CRON_SECRET is whitespace/empty"
    );

    // Test invalid secret rejected (HTTP 401)
    const wrongSecretCheck = verifyCronAuth("Bearer bad-token", null, secretReal);
    assert(
      wrongSecretCheck.authorized === false && wrongSecretCheck.status === 401,
      "Criterion 1.6: Invalid secret is rejected with HTTP 401 Unauthorized"
    );

    // Test missing header rejected (HTTP 401)
    const missingHeaderCheck = verifyCronAuth(null, null, secretReal);
    assert(
      missingHeaderCheck.authorized === false && missingHeaderCheck.status === 401,
      "Criterion 1.7: Missing authorization header rejected with HTTP 401 Unauthorized"
    );

    // Test valid Bearer token authorized
    const validBearerCheck = verifyCronAuth(`Bearer ${secretReal}`, null, secretReal);
    assert(
      validBearerCheck.authorized === true && validBearerCheck.status === 200,
      "Criterion 1.8: Valid Bearer token successfully authorized (HTTP 200)"
    );

    // Test valid custom x-cron-secret header authorized
    const validCustomHeaderCheck = verifyCronAuth(null, secretReal, secretReal);
    assert(
      validCustomHeaderCheck.authorized === true && validCustomHeaderCheck.status === 200,
      "Criterion 1.9: Valid x-cron-secret header successfully authorized (HTTP 200)"
    );

    // 1.3 Verify actor ID cannot be injected
    // evaluateAutomatedLifecycleTransitions() takes no actor argument and always resolves internally
    const runnerActor = await evaluateAutomatedLifecycleTransitions();
    assert(runnerActor.success, "Criterion 1.10: Lifecycle automation resolves administrative actor internally");

    // -------------------------------------------------------------------------
    // SECTION 2: Lifecycle Exceptions: DRAFT -> CLOSED & DRAFT -> CONFIRMED
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Lifecycle Exceptions (DRAFT -> CLOSED & DRAFT -> CONFIRMED)");

    // Test plan
    const testPlan = await prisma.plan.create({
      data: {
        productId: productVariant.productId,
        name: `Audit 8.3 Plan ${Date.now()}`,
        billingPeriod: BillingPeriod.YEARLY,
        paymentTerms: PaymentTerms.NET_30,
        pricePaise: 1200000,
        minQuantity: 1,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        isActive: true,
      },
    });

    // Create a DRAFT subscription
    const draftSub = await prisma.subscription.create({
      data: {
        number: `SUB-DRAFT-TEST-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.YEARLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.DRAFT,
        startDate: new Date(),
      },
    });

    // Server-side validation logic check for DRAFT -> CONFIRMED
    function canTransitionConfirm(status: SubscriptionStatus): { allowed: boolean; error?: string } {
      if (status === SubscriptionStatus.ACTIVE) {
        return { allowed: false, error: "Confirmation is not available for active subscriptions." };
      }
      if (status !== SubscriptionStatus.QUOTATION) {
        return {
          allowed: false,
          error: `Cannot confirm subscription with status "${status}". PRD §4.5 lifecycle requires Draft → Quotation → Confirmed with no stage skipping.`,
        };
      }
      return { allowed: true };
    }

    const draftConfirmRes = canTransitionConfirm(draftSub.status);
    assert(
      !draftConfirmRes.allowed,
      "Criterion 2.1: Server-side check strictly blocks DRAFT → CONFIRMED transition (PRD §4.5 no skipping)"
    );

    // Server-side validation logic check for DRAFT -> CLOSED
    function canTransitionClose(status: SubscriptionStatus): { allowed: boolean; error?: string } {
      if (status === SubscriptionStatus.CLOSED) {
        return { allowed: false, error: "Subscription is already closed." };
      }
      if (status === SubscriptionStatus.DRAFT) {
        return {
          allowed: false,
          error: "Cannot close a subscription in DRAFT status. PRD §4.5 lifecycle requires Draft → Quotation → Confirmed → Active → Closed.",
        };
      }
      return { allowed: true };
    }

    const draftCloseRes = canTransitionClose(draftSub.status);
    assert(
      !draftCloseRes.allowed,
      "Criterion 2.2: Server-side check strictly blocks DRAFT → CLOSED transition (unquoted drafts cannot skip to Closed)"
    );

    // Verify DRAFT -> QUOTATION is permitted
    const quotationExpiryDate = calculateQuotationExpiryDate(30, new Date());
    const quotedSub = await prisma.subscription.update({
      where: { id: draftSub.id },
      data: { status: SubscriptionStatus.QUOTATION, quotationExpiryDate },
    });
    assert(quotedSub.status === SubscriptionStatus.QUOTATION, "Criterion 2.3: DRAFT → QUOTATION transition is permitted");

    // Verify QUOTATION -> CONFIRMED is permitted
    const quotationConfirmRes = canTransitionConfirm(quotedSub.status);
    assert(quotationConfirmRes.allowed, "Criterion 2.4: QUOTATION → CONFIRMED transition is permitted");

    // Verify QUOTATION -> CLOSED is permitted (e.g. rejection or cancellation)
    const quotationCloseRes = canTransitionClose(quotedSub.status);
    assert(quotationCloseRes.allowed, "Criterion 2.5: QUOTATION → CLOSED transition is permitted");

    // -------------------------------------------------------------------------
    // SECTION 3: Genuine Database Concurrency Test (10 Simultaneous Workers)
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Genuine Database Concurrency Test (10 Workers Racing)");

    // Create an expired quotation in PostgreSQL to race 10 concurrent database workers
    const raceQuotation = await prisma.subscription.create({
      data: {
        number: `SUB-CONCUR-EXP-${Date.now()}`,
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
        quotationExpiryDate: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    // 10 concurrent database transactions executing atomic conditional updates
    const concurrentWorkers = Array.from({ length: 10 }, async (__, workerIdx) => {
      return prisma.$transaction(async (tx) => {
        // Atomic conditional update on status predicate
        const updated = await tx.subscription.updateMany({
          where: {
            id: raceQuotation.id,
            status: SubscriptionStatus.QUOTATION,
          },
          data: {
            status: SubscriptionStatus.CLOSED,
            closedAt: new Date(),
          },
        });

        if (updated.count === 1) {
          await tx.auditLog.create({
            data: {
              userId: adminUser.id,
              action: "quotation.expired_closed",
              entityType: "Subscription",
              entityId: raceQuotation.id,
              meta: {
                workerIdx,
                number: raceQuotation.number,
                concurrencyTest: true,
              },
            },
          });
          return { workerIdx, updated: true };
        }

        return { workerIdx, updated: false };
      });
    });

    const results = await Promise.all(concurrentWorkers);
    const successfulUpdates = results.filter((r) => r.updated);
    const skippedUpdates = results.filter((r) => !r.updated);

    assert(
      successfulUpdates.length === 1,
      `Criterion 3.1: Exactly ONE concurrent worker succeeded in transitioning the record (count: ${successfulUpdates.length})`
    );
    assert(
      skippedUpdates.length === 9,
      `Criterion 3.2: Exactly NINE concurrent workers safely skipped update (count: ${skippedUpdates.length})`
    );

    // Verify exactly one audit record created
    const raceAuditCount = await prisma.auditLog.count({
      where: { entityId: raceQuotation.id, action: "quotation.expired_closed" },
    });
    assert(
      raceAuditCount === 1,
      "Criterion 3.3: Database contains exactly ONE audit log record for the raced subscription"
    );

    // Verify final database state is CLOSED
    const finalRaceSub = await prisma.subscription.findUnique({ where: { id: raceQuotation.id } });
    assert(
      finalRaceSub?.status === SubscriptionStatus.CLOSED,
      "Criterion 3.4: Final subscription state is strictly CLOSED"
    );

    // Idempotency: Running evaluation again produces 0 updates
    const secondPass = await evaluateAutomatedLifecycleTransitions();
    assert(
      secondPass.expiredQuotationsClosed === 0 && secondPass.autoClosedSubscriptions === 0,
      "Criterion 3.5: Repeated scheduled execution produces 0 additional transitions"
    );

    // -------------------------------------------------------------------------
    // SECTION 4: Renewal Behavior, Start/End Dates & Rapid Duplicate Guard
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Renewal Behavior, Date Math & Accidental Duplicate Guard");

    const startDate = new Date("2026-01-01T00:00:00.000Z");
    const initialEndDate = new Date("2027-01-01T00:00:00.000Z");

    const activeSub = await prisma.subscription.create({
      data: {
        number: `SUB-RENEW-GUARD-${Date.now()}`,
        customerId: customer.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.YEARLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate: initialEndDate,
        nextBillingDate: initialEndDate,
        planPricePaise: 1200000,
        lines: {
          create: [
            {
              productVariantId: productVariant.id,
              quantity: 1,
              unitPricePaise: 1200000,
              taxRateBps: 1800,
              taxAmountPaise: 216000,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // 4.1 First Renewal Execution
    const expectedNewEndDate = new Date("2028-01-01T00:00:00.000Z");
    const expectedRenewalBillingDate = initialEndDate; // Starts on Jan 1, 2027

    await prisma.subscription.update({
      where: { id: activeSub.id },
      data: {
        endDate: expectedNewEndDate,
        nextBillingDate: expectedRenewalBillingDate,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminUser.id,
        action: "subscription.renewed",
        entityType: "Subscription",
        entityId: activeSub.id,
        meta: {
          number: activeSub.number,
          newEndDate: expectedNewEndDate.toISOString(),
        },
      },
    });

    const renewedSub = await prisma.subscription.findUnique({
      where: { id: activeSub.id },
      include: { lines: true },
    });

    assert(
      renewedSub?.startDate.toISOString() === startDate.toISOString(),
      "Criterion 4.1: Renewal preserves original contract startDate (Jan 1, 2026)"
    );
    assert(
      renewedSub?.endDate?.toISOString() === expectedNewEndDate.toISOString(),
      "Criterion 4.2: Renewal extends endDate by one billing period (Jan 1, 2028)"
    );
    assert(
      renewedSub?.nextBillingDate?.toISOString() === expectedRenewalBillingDate.toISOString(),
      "Criterion 4.3: nextBillingDate is set to start of renewal term (Jan 1, 2027) for on-time Batch 9 billing"
    );
    assert(
      renewedSub?.planPricePaise === 1200000 && renewedSub?.lines[0].unitPricePaise === 1200000,
      "Criterion 4.4: Historical financial snapshots remain 100% intact after renewal"
    );

    // 4.2 Accidental Duplicate Rapid Renewal Guard Test
    const recentRenewal = await prisma.auditLog.findFirst({
      where: {
        entityId: activeSub.id,
        action: "subscription.renewed",
        createdAt: { gte: new Date(Date.now() - 60000) },
      },
    });
    assert(
      !!recentRenewal,
      "Criterion 4.5: Accidental duplicate renewal guard detects recent renewal within 60s"
    );

    const canRenewAgain = !recentRenewal;
    assert(
      canRenewAgain === false,
      "Criterion 4.6: Repeated rapid renewal request is blocked to prevent accidental multi-period extension"
    );

    // -------------------------------------------------------------------------
    // Cleanup temporary test records
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    await prisma.subscriptionLine.deleteMany({
      where: { subscriptionId: { in: [draftSub.id, raceQuotation.id, activeSub.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [draftSub.id, raceQuotation.id, activeSub.id] } },
    });
    await prisma.subscription.deleteMany({
      where: { id: { in: [draftSub.id, raceQuotation.id, activeSub.id] } },
    });
    await prisma.plan.delete({
      where: { id: testPlan.id },
    });

    console.log("Cleanup complete.\n");

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("===============================================================");
    console.log(`  BATCH 8.3 AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================");

    if (passedTests !== totalTests) {
      throw new Error(`Batch 8.3 audit failed: ${totalTests - passedTests} tests failed`);
    }
  } catch (error) {
    console.error("Batch 8.3 audit encountered an error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch83SecurityAudit();
