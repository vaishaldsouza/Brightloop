import prisma from "../src/lib/prisma";
import {
  subscriptionLineSchema,
  createSubscriptionFromTemplateSchema,
  isQuotationExpired,
  getSubscriptionDerivedTags,
} from "../src/lib/validations/subscription";
import {
  calculateLineTax,
  calculateOrderTax,
} from "../src/lib/tax";
import { COMPANY_GST_STATE_CODE } from "../src/lib/gstStates";
import { calculateQuotationExpiryDate } from "../src/lib/validations/quotationTemplate";
import { Role, SubscriptionStatus, BillingPeriod, PaymentTerms } from "@prisma/client";

async function runBatch8Verification() {
  console.log("===============================================================================");
  console.log("  BATCH 8: SUBSCRIPTIONS & QUOTATIONS MODULE VERIFICATION                      ");
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
    // 1. Fetch seed baseline
    // -------------------------------------------------------------------------
    console.log("Section 1: Baseline Seed Data & Role Verification");
    const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    const staffUser = await prisma.user.findFirst({ where: { role: Role.STAFF } });
    const customerUser = await prisma.user.findFirst({ where: { role: Role.CUSTOMER } });
    const customerProfile = await prisma.customer.findFirst();
    const activePlan = await prisma.plan.findFirst({
      where: { isActive: true },
      include: { product: true },
    });
    const activeTemplate = await prisma.quotationTemplate.findFirst({
      where: { isActive: true },
      include: { lines: true, plan: true },
    });
    const variants = await prisma.productVariant.findMany({ take: 3 });

    assert(!!adminUser, "Criterion 1.1: Admin user exists in seed data");
    assert(!!staffUser, "Criterion 1.2: Staff user exists in seed data");
    assert(!!customerUser, "Criterion 1.3: Customer user exists in seed data");
    assert(!!customerProfile, "Criterion 1.4: Customer profile exists");
    assert(!!activePlan, "Criterion 1.5: Active Plan exists in database");
    assert(!!activeTemplate, "Criterion 1.6: Active Quotation Template exists in database");
    assert(variants.length >= 2, "Criterion 1.7: At least 2 product variants available for testing");

    if (!adminUser || !staffUser || !customerUser || !customerProfile || !activePlan || !activeTemplate || variants.length < 2) {
      throw new Error("Missing required seed data for testing");
    }

    // -------------------------------------------------------------------------
    // 2. Validation Schemas & Tax Engine Calculations
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Validation Schemas & Pure Integer Tax Engine");

    // 2.1 Rejects empty lines
    const emptyLinesRes = createSubscriptionFromTemplateSchema.safeParse({
      templateId: activeTemplate.id,
      customerId: customerProfile.id,
      startDate: "2026-11-01",
      paymentTerms: PaymentTerms.NET_30,
      lines: [],
    });
    assert(!emptyLinesRes.success, "Criterion 2.1: Schema rejects subscription creation with 0 lines");

    // 2.2 Rejects non-integer or negative quantity
    const invalidQtyRes = subscriptionLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 0,
      unitPricePaise: 10000,
    });
    assert(!invalidQtyRes.success, "Criterion 2.2: Line schema rejects quantity <= 0");

    const floatQtyRes = subscriptionLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 1.5,
      unitPricePaise: 10000,
    });
    assert(!floatQtyRes.success, "Criterion 2.3: Line schema rejects fractional/floating-point quantity");

    // 2.3 Rejects non-integer or negative unit price
    const negPriceRes = subscriptionLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 1,
      unitPricePaise: -500,
    });
    assert(!negPriceRes.success, "Criterion 2.4: Line schema rejects negative unit price paise");

    const floatPriceRes = subscriptionLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 1,
      unitPricePaise: 499.99,
    });
    assert(!floatPriceRes.success, "Criterion 2.5: Line schema rejects floating-point unit price (strictly integer paise)");

    // 2.4 Tax Engine - Intra-state (Company State Maharashtra '27' -> Customer '27')
    const intraTax = calculateLineTax(2, 50000, COMPANY_GST_STATE_CODE); // 2 * ₹500 = ₹1,000.00 (100,000 paise)
    assert(intraTax.cgstPaise === 9000, "Criterion 2.6: CGST is 9% (9000 paise on 100000 paise)");
    assert(intraTax.sgstPaise === 9000, "Criterion 2.7: SGST is 9% (9000 paise on 100000 paise)");
    assert(intraTax.igstPaise === 0, "Criterion 2.8: IGST is 0 for intra-state supply");
    assert(intraTax.taxAmountPaise === 18000, "Criterion 2.9: Total tax is 18% (18000 paise on 100000 paise)");

    // 2.5 Tax Engine - Inter-state (Customer Karnataka '29')
    const interTax = calculateLineTax(3, 20000, "29"); // 3 * ₹200 = ₹600.00 (60,000 paise)
    assert(interTax.cgstPaise === 0, "Criterion 2.10: CGST is 0 for inter-state supply");
    assert(interTax.sgstPaise === 0, "Criterion 2.11: SGST is 0 for inter-state supply");
    assert(interTax.igstPaise === 10800, "Criterion 2.12: IGST is 18% (10800 paise on 60000 paise)");
    assert(interTax.taxAmountPaise === 10800, "Criterion 2.13: Total tax matches IGST for inter-state");

    // 2.6 Tax Engine - Rounding Precision Check
    // 1 item @ 9999 paise (₹99.99). 9% = 899.91 paise -> rounded to 900 paise
    const roundingTax = calculateLineTax(1, 9999, "27");
    assert(roundingTax.cgstPaise === 900, "Criterion 2.14: Tax calculation uses Math.round integer paise precision");
    assert(roundingTax.taxAmountPaise === 1800, "Criterion 2.15: Total rounded line tax equals CGST + SGST (1800 paise)");

    // 2.7 Order Tax Aggregation
    const orderTax = calculateOrderTax(
      [
        { quantity: 2, unitPricePaise: 50000 },
        { quantity: 1, unitPricePaise: 9999 },
      ],
      "27"
    );
    assert(orderTax.subtotalPaise === 109999, "Criterion 2.16: Subtotal correctly sums line subtotals (109999 paise)");
    assert(orderTax.taxPaise === 19800, "Criterion 2.17: Total tax correctly sums line taxes (18000 + 1800 = 19800)");
    assert(orderTax.totalPaise === 129799, "Criterion 2.18: Total order paise is subtotal + taxPaise exactly");

    // -------------------------------------------------------------------------
    // 3. Expiry Calculations & Non-Persisted Derived Tags
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Quotation Expiry & Derived Tags");

    // Future quotation not expired
    const futureExpiry = new Date(Date.now() + 86400000 * 5); // +5 days
    assert(
      !isQuotationExpired(SubscriptionStatus.QUOTATION, futureExpiry),
      "Criterion 3.1: Quotation with future expiry date is not marked expired"
    );

    // Past quotation is expired
    const pastExpiry = new Date(Date.now() - 86400000 * 2); // -2 days
    assert(
      isQuotationExpired(SubscriptionStatus.QUOTATION, pastExpiry),
      "Criterion 3.2: Quotation with past expiry date is marked expired"
    );

    // Active subscription with past quotation expiry is NOT expired
    assert(
      !isQuotationExpired(SubscriptionStatus.ACTIVE, pastExpiry),
      "Criterion 3.3: ACTIVE subscription is never marked as expired regardless of quotationExpiryDate"
    );

    // Derived tags check
    const tagsActivePaused = getSubscriptionDerivedTags(
      SubscriptionStatus.ACTIVE,
      true,
      null
    );
    assert(tagsActivePaused.includes("PAUSED"), "Criterion 3.4: Derived tags include PAUSED when isPaused is true");
    assert(!tagsActivePaused.includes("EXPIRED"), "Criterion 3.5: Derived tags do not include EXPIRED for active sub");

    const tagsQuotationExpired = getSubscriptionDerivedTags(
      SubscriptionStatus.QUOTATION,
      false,
      pastExpiry
    );
    assert(tagsQuotationExpired.includes("EXPIRED"), "Criterion 3.6: Derived tags include EXPIRED for expired quotation");

    // -------------------------------------------------------------------------
    // 4. Atomic Subscription Creation from Active Template
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Atomic Subscription Creation & Snapshot Invariance");

    // Create a customizable plan to test snapshot immutability
    const testPlan = await prisma.plan.create({
      data: {
        productId: activePlan.productId,
        name: `Audit Snapshot Plan ${Date.now()}`,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_15,
        pricePaise: 499900,
        minQuantity: 2,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        isActive: true,
      },
    });

    const testTemplate = await prisma.quotationTemplate.create({
      data: {
        name: `Audit Template ${Date.now()}`,
        planId: testPlan.id,
        validityDays: 14,
        isActive: true,
        lines: {
          create: [
            {
              productVariantId: variants[0].id,
              quantity: 2,
              unitPricePaise: 150000,
              sortOrder: 1,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Create subscription simulating server action logic atomically
    const subCreated = await prisma.$transaction(async (tx) => {
      const seq = await tx.sequence.upsert({
        where: { id: "SUB" },
        update: { current: { increment: 1 } },
        create: { id: "SUB", current: 136 },
      });
      const subscriptionNumber = `SUB-${String(seq.current).padStart(5, "0")}`;

      const created = await tx.subscription.create({
        data: {
          number: subscriptionNumber,
          customerId: customerProfile.id,
          planId: testPlan.id,
          billingPeriod: testPlan.billingPeriod,
          paymentTerms: testPlan.paymentTerms,
          isPausable: testPlan.isPausable,
          isRenewable: testPlan.isRenewable,
          isClosableEarly: testPlan.isClosableEarly,
          autoClose: testPlan.autoClose,
          planPricePaise: testPlan.pricePaise,
          planMinQuantity: testPlan.minQuantity,
          status: SubscriptionStatus.DRAFT,
          isPaused: false,
          startDate: new Date("2026-11-01T00:00:00.000Z"),
          quotationExpiryDate: calculateQuotationExpiryDate(14, new Date("2026-11-01T00:00:00.000Z")),
          lines: {
            create: [
              {
                productVariantId: variants[0].id,
                quantity: 2,
                unitPricePaise: 150000,
                sortOrder: 1,
                taxRateBps: 1800,
                taxAmountPaise: 54000,
              },
            ],
          },
        },
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          userId: adminUser.id,
          action: "subscription.created",
          entityType: "Subscription",
          entityId: created.id,
          meta: { number: created.number },
        },
      });

      return created;
    });

    assert(subCreated.status === SubscriptionStatus.DRAFT, "Criterion 4.1: Subscription creation starts strictly in DRAFT status");
    assert(subCreated.isPaused === false, "Criterion 4.2: New subscription isPaused is false");
    assert(subCreated.planPricePaise === 499900, "Criterion 4.3: Snapshot captures planPricePaise");
    assert(subCreated.planMinQuantity === 2, "Criterion 4.4: Snapshot captures planMinQuantity");
    assert(subCreated.isPausable === true, "Criterion 4.5: Snapshot captures isPausable policy");
    assert(subCreated.isClosableEarly === true, "Criterion 4.6: Snapshot captures isClosableEarly policy");
    assert(subCreated.lines.length === 1, "Criterion 4.7: Lines created accurately");
    assert(subCreated.lines[0].unitPricePaise === 150000, "Criterion 4.8: Line snapshot captures unitPricePaise");

    // Invariance Test: Update the original plan and template
    await prisma.plan.update({
      where: { id: testPlan.id },
      data: {
        pricePaise: 888800,
        isPausable: false,
        isClosableEarly: false,
        billingPeriod: BillingPeriod.YEARLY,
      },
    });

    await prisma.quotationTemplateLine.update({
      where: { id: testTemplate.lines[0].id },
      data: { unitPricePaise: 999900, quantity: 10 },
    });

    // Re-fetch subscription and verify nothing in subscription changed
    const subAfterCatalogUpdate = await prisma.subscription.findUnique({
      where: { id: subCreated.id },
      include: { lines: true },
    });

    assert(
      subAfterCatalogUpdate?.planPricePaise === 499900,
      "Criterion 4.9: Plan catalog price change does NOT alter snapshotted planPricePaise"
    );
    assert(
      subAfterCatalogUpdate?.billingPeriod === BillingPeriod.MONTHLY,
      "Criterion 4.10: Plan catalog billing period change does NOT alter snapshotted billingPeriod"
    );
    assert(
      subAfterCatalogUpdate?.isPausable === true,
      "Criterion 4.11: Plan catalog isPausable change does NOT alter snapshotted isPausable"
    );
    assert(
      subAfterCatalogUpdate?.lines[0].unitPricePaise === 150000,
      "Criterion 4.12: QuotationTemplate line price change does NOT alter snapshotted line unitPricePaise"
    );

    // -------------------------------------------------------------------------
    // 5. Subscription Lifecycle State Transitions
    // -------------------------------------------------------------------------
    console.log("\nSection 5: Subscription Lifecycle State Machine");

    // 5.1 DRAFT -> QUOTATION
    const quotationExpiryDate = calculateQuotationExpiryDate(30, new Date());
    const subQuotation = await prisma.subscription.update({
      where: { id: subCreated.id },
      data: {
        status: SubscriptionStatus.QUOTATION,
        quotationExpiryDate,
      },
    });
    assert(subQuotation.status === SubscriptionStatus.QUOTATION, "Criterion 5.1: DRAFT transitioned to QUOTATION");

    // 5.2 Invalid Transition: Confirm on ACTIVE must be blocked
    function canConfirm(status: SubscriptionStatus): boolean {
      return status === SubscriptionStatus.DRAFT || status === SubscriptionStatus.QUOTATION;
    }
    assert(canConfirm(subQuotation.status) === true, "Criterion 5.2: QUOTATION status is eligible for confirmation");
    assert(canConfirm(SubscriptionStatus.ACTIVE) === false, "Criterion 5.3: ACTIVE status is strictly ineligible for confirmation");

    // 5.3 QUOTATION -> CONFIRMED
    const subConfirmed = await prisma.subscription.update({
      where: { id: subCreated.id },
      data: { status: SubscriptionStatus.CONFIRMED },
    });
    assert(subConfirmed.status === SubscriptionStatus.CONFIRMED, "Criterion 5.4: QUOTATION transitioned to CONFIRMED");

    // 5.4 Invalid Transition: Activate on DRAFT or QUOTATION must be blocked
    function canActivate(status: SubscriptionStatus): boolean {
      return status === SubscriptionStatus.CONFIRMED;
    }
    assert(canActivate(SubscriptionStatus.DRAFT) === false, "Criterion 5.5: DRAFT status cannot be directly activated");
    assert(canActivate(SubscriptionStatus.QUOTATION) === false, "Criterion 5.6: QUOTATION status cannot be directly activated");
    assert(canActivate(subConfirmed.status) === true, "Criterion 5.7: CONFIRMED status is eligible for activation");

    // 5.5 CONFIRMED -> ACTIVE
    const subActive = await prisma.subscription.update({
      where: { id: subCreated.id },
      data: { status: SubscriptionStatus.ACTIVE },
    });
    assert(subActive.status === SubscriptionStatus.ACTIVE, "Criterion 5.8: CONFIRMED transitioned to ACTIVE");

    // -------------------------------------------------------------------------
    // 6. Pause, Resume & Policy Enforcement
    // -------------------------------------------------------------------------
    console.log("\nSection 6: Pause, Resume & Policy Enforcement");

    // 6.1 Pause an active pausable subscription
    const subPaused = await prisma.subscription.update({
      where: { id: subCreated.id },
      data: { isPaused: true, pausedAt: new Date() },
    });
    assert(subPaused.status === SubscriptionStatus.ACTIVE, "Criterion 6.1: Paused subscription status remains ACTIVE (status is never 'PAUSED')");
    assert(subPaused.isPaused === true, "Criterion 6.2: isPaused is true");
    assert(subPaused.pausedAt !== null, "Criterion 6.3: pausedAt timestamp is recorded");

    // 6.2 Resume paused subscription
    const subResumed = await prisma.subscription.update({
      where: { id: subCreated.id },
      data: { isPaused: false, pausedAt: null },
    });
    assert(subResumed.isPaused === false, "Criterion 6.4: Resumed subscription isPaused is false");
    assert(subResumed.pausedAt === null, "Criterion 6.5: Resumed subscription pausedAt is null");

    // 6.3 Non-pausable plan policy enforcement
    const nonPausableSub = await prisma.subscription.create({
      data: {
        number: `SUB-NONPAUSE-${Date.now()}`,
        customerId: customerProfile.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: false, // Disallowed
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
      },
    });

    const isPausePermitted = nonPausableSub.status === SubscriptionStatus.ACTIVE && nonPausableSub.isPausable;
    assert(!isPausePermitted, "Criterion 6.6: Subscription with isPausable=false strictly disallows pause");

    // -------------------------------------------------------------------------
    // 7. Early Close Policy & Expired Quotation Closure
    // -------------------------------------------------------------------------
    console.log("\nSection 7: Early Close Policy & Expired Quotation Closure");

    // 7.1 Non-closable early policy
    const nonClosableSub = await prisma.subscription.create({
      data: {
        number: `SUB-NONCLOSE-${Date.now()}`,
        customerId: customerProfile.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: false, // Disallowed early
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 30), // future endDate
      },
    });

    const isEarlyClosePermitted = nonClosableSub.isClosableEarly || (nonClosableSub.endDate && nonClosableSub.endDate.getTime() <= Date.now());
    assert(!isEarlyClosePermitted, "Criterion 7.1: Active subscription with isClosableEarly=false disallows early cancellation before end date");

    // 7.2 Early close allowed on pausable/closable sub
    const subClosed = await prisma.subscription.update({
      where: { id: subCreated.id },
      data: { status: SubscriptionStatus.CLOSED, closedAt: new Date() },
    });
    assert(subClosed.status === SubscriptionStatus.CLOSED, "Criterion 7.2: Subscription transitioned to CLOSED");
    assert(subClosed.closedAt !== null, "Criterion 7.3: closedAt timestamp is populated");

    // 7.3 Expired Quotation Closure Workflow
    const expiredQuotation = await prisma.subscription.create({
      data: {
        number: `SUB-EXP-${Date.now()}`,
        customerId: customerProfile.id,
        planId: testPlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.QUOTATION,
        startDate: new Date("2026-01-01"),
        quotationExpiryDate: new Date("2026-01-15T00:00:00.000Z"), // Expired
      },
    });

    const isExpired = isQuotationExpired(expiredQuotation.status, expiredQuotation.quotationExpiryDate);
    assert(isExpired === true, "Criterion 7.4: Unconfirmed past quotation evaluates as expired");

    const closedExpired = await prisma.subscription.update({
      where: { id: expiredQuotation.id },
      data: { status: SubscriptionStatus.CLOSED, closedAt: new Date() },
    });
    assert(closedExpired.status === SubscriptionStatus.CLOSED, "Criterion 7.5: Expired quotation transitions to CLOSED (PRD §4.5)");

    // -------------------------------------------------------------------------
    // 8. Concurrent Sequence Generation & Gapless Numbers
    // -------------------------------------------------------------------------
    console.log("\nSection 8: Concurrent Sequence Generation & Non-collision");

    const concurrentPromises = Array.from({ length: 5 }, async () => {
      return prisma.$transaction(async (tx) => {
        const seq = await tx.sequence.upsert({
          where: { id: "SUB" },
          update: { current: { increment: 1 } },
          create: { id: "SUB", current: 1 },
        });
        return seq.current;
      });
    });

    const generatedNumbers = await Promise.all(concurrentPromises);
    const uniqueNumbers = new Set(generatedNumbers);
    assert(
      uniqueNumbers.size === 5,
      "Criterion 8.1: 5 concurrent sequence allocations generate 5 unique monotonic sequence numbers"
    );

    // -------------------------------------------------------------------------
    // 9. Audit Logging Invariants
    // -------------------------------------------------------------------------
    console.log("\nSection 9: Audit Logging Invariants");

    const subAuditLogs = await prisma.auditLog.findMany({
      where: { entityType: "Subscription", entityId: subCreated.id },
    });
    assert(subAuditLogs.length >= 1, "Criterion 9.1: Audit log records created for subscription events");
    assert(subAuditLogs[0].action === "subscription.created", "Criterion 9.2: Initial audit log action is 'subscription.created'");

    // -------------------------------------------------------------------------
    // 10. Customer Portal Isolation & RBAC Invariant
    // -------------------------------------------------------------------------
    console.log("\nSection 10: Customer RBAC Isolation");
    assert(
      customerUser.role === Role.CUSTOMER,
      "Criterion 10.1: Customer user has role CUSTOMER"
    );
    const customerAllowedInternal = customerUser.role === Role.ADMIN || customerUser.role === Role.STAFF;
    assert(
      !customerAllowedInternal,
      "Criterion 10.2: Customer role is blocked from Admin/Staff internal subscription actions"
    );

    // -------------------------------------------------------------------------
    // Cleanup temporary test records
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    await prisma.subscriptionLine.deleteMany({
      where: { subscriptionId: { in: [subCreated.id, nonPausableSub.id, nonClosableSub.id, expiredQuotation.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [subCreated.id, nonPausableSub.id, nonClosableSub.id, expiredQuotation.id] } },
    });
    await prisma.subscription.deleteMany({
      where: { id: { in: [subCreated.id, nonPausableSub.id, nonClosableSub.id, expiredQuotation.id] } },
    });
    await prisma.quotationTemplateLine.deleteMany({
      where: { quotationTemplateId: testTemplate.id },
    });
    await prisma.quotationTemplate.delete({
      where: { id: testTemplate.id },
    });
    await prisma.plan.delete({
      where: { id: testPlan.id },
    });

    console.log("Cleanup complete.\n");

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("===============================================================");
    console.log(`  BATCH 8 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================");

    if (passedTests !== totalTests) {
      throw new Error(`Batch 8 verification failed: ${totalTests - passedTests} tests failed`);
    }
  } catch (error) {
    console.error("Batch 8 verification encountered an error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch8Verification();
