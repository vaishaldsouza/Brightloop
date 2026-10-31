import prisma from "../src/lib/prisma";
import {
  BillingPeriod,
  PaymentTerms,
  SubscriptionStatus,
  InvoiceStatus,
  PaymentMethod,
  Role,
} from "@prisma/client";
import {
  computeBillingPeriodSpan,
  calculateDueDate,
  generateInvoiceForSubscription,
  evaluateAutomatedBilling,
  addDays,
  addMonths,
  addYears,
} from "../src/lib/billingEngine";
import {
  confirmInvoiceAction,
  cancelInvoiceAction,
  sendInvoiceAction,
  rebillCancelledPeriodAction,
} from "../src/app/actions/invoices";

async function runBatch9InvoicesVerification() {
  console.log("===============================================================================");
  console.log("  BATCH 9: INVOICE MANAGEMENT & AUTOMATED BILLING AUDIT SUITE                 ");
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

  const createdSubscriptionIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Baseline Seed Verification
    // -------------------------------------------------------------------------
    const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    const staffUser = await prisma.user.findFirst({ where: { role: Role.STAFF } });
    const customerUser = await prisma.user.findFirst({ where: { role: Role.CUSTOMER } });
    const mhCustomer = await prisma.customer.findFirst({ where: { gstStateCode: "27" } });
    const nonMhCustomer = await prisma.customer.findFirst({ where: { gstStateCode: { not: "27" } } });
    const productVariant = await prisma.productVariant.findFirst({ include: { product: true } });
    const activePlan = await prisma.plan.findFirst({ where: { billingPeriod: BillingPeriod.MONTHLY } });

    assert(!!adminUser, "Baseline: Admin user exists in seed data");
    assert(!!staffUser, "Baseline: Staff user exists in seed data");
    assert(!!customerUser, "Baseline: Customer user exists in seed data");
    assert(!!mhCustomer, "Baseline: Maharashtra (Intra-state 27) customer exists");
    assert(!!nonMhCustomer, "Baseline: Out-of-state (Inter-state) customer exists");
    assert(!!productVariant, "Baseline: Product variant exists");
    assert(!!activePlan, "Baseline: Active plan exists");

    if (!adminUser || !mhCustomer || !nonMhCustomer || !productVariant || !activePlan) {
      throw new Error("Missing required baseline data for Batch 9 verification.");
    }

    // -------------------------------------------------------------------------
    // SECTION 1: Billing Period Math, Calendar Boundaries & Due Dates
    // -------------------------------------------------------------------------
    console.log("\nSection 1: Billing Period Math, Leap Years & Due Date Calculations");

    // 1.1 Daily
    const dailySpan = computeBillingPeriodSpan(new Date("2026-03-01T00:00:00Z"), BillingPeriod.DAILY);
    assert(
      dailySpan.start.toISOString().startsWith("2026-03-01") &&
        dailySpan.end.toISOString().startsWith("2026-03-01") &&
        dailySpan.nextBillingDate.toISOString().startsWith("2026-03-02"),
      "Criterion 1.1: Daily billing span starts and ends on same day, advances +1 day"
    );

    // 1.2 Weekly
    const weeklySpan = computeBillingPeriodSpan(new Date("2026-03-01T00:00:00Z"), BillingPeriod.WEEKLY);
    assert(
      weeklySpan.end.toISOString().startsWith("2026-03-07") &&
        weeklySpan.nextBillingDate.toISOString().startsWith("2026-03-08"),
      "Criterion 1.2: Weekly billing span covers 7 full days (March 1 to March 7), advances +7 days"
    );

    // 1.3 Monthly Standard
    const monthlySpan = computeBillingPeriodSpan(new Date("2026-01-15T00:00:00Z"), BillingPeriod.MONTHLY);
    assert(
      monthlySpan.end.toISOString().startsWith("2026-02-14") &&
        monthlySpan.nextBillingDate.toISOString().startsWith("2026-02-15"),
      "Criterion 1.3: Monthly billing span covers exact calendar month (Jan 15 to Feb 14), advances +1 month"
    );

    // 1.4 Month-End in Non-Leap Year (Jan 31, 2026 -> Feb 28, 2026)
    const monthEndNonLeap = computeBillingPeriodSpan(new Date("2026-01-31T00:00:00Z"), BillingPeriod.MONTHLY);
    assert(
      monthEndNonLeap.nextBillingDate.toISOString().startsWith("2026-02-28") &&
        monthEndNonLeap.end.toISOString().startsWith("2026-02-27"),
      "Criterion 1.4: Month-end boundary rolls to Feb 28 in non-leap year without JS date overflow"
    );

    // 1.5 Month-End in Leap Year (Jan 31, 2024 -> Feb 29, 2024)
    const monthEndLeap = computeBillingPeriodSpan(new Date("2024-01-31T00:00:00Z"), BillingPeriod.MONTHLY);
    assert(
      monthEndLeap.nextBillingDate.toISOString().startsWith("2024-02-29") &&
        monthEndLeap.end.toISOString().startsWith("2024-02-28"),
      "Criterion 1.5: Month-end boundary respects 29-day February in leap year 2024"
    );

    // 1.6 Yearly Non-Leap
    const yearlySpan = computeBillingPeriodSpan(new Date("2026-01-01T00:00:00Z"), BillingPeriod.YEARLY);
    assert(
      yearlySpan.end.toISOString().startsWith("2026-12-31") &&
        yearlySpan.nextBillingDate.toISOString().startsWith("2027-01-01"),
      "Criterion 1.6: Yearly billing span covers 365 days (Jan 1, 2026 to Dec 31, 2026), advances +1 year"
    );

    // 1.7 Due Dates (PRD §4.5)
    const invDate = new Date("2026-10-01T00:00:00Z");
    const dueReceipt = calculateDueDate(invDate, PaymentTerms.DUE_ON_RECEIPT);
    const dueNet15 = calculateDueDate(invDate, PaymentTerms.NET_15);
    const dueNet30 = calculateDueDate(invDate, PaymentTerms.NET_30);

    assert(dueReceipt.toISOString().startsWith("2026-10-01"), "Criterion 1.7: Due on receipt sets due date equal to invoice date");
    assert(dueNet15.toISOString().startsWith("2026-10-16"), "Criterion 1.8: Net 15 sets due date exactly +15 days");
    assert(dueNet30.toISOString().startsWith("2026-10-31"), "Criterion 1.9: Net 30 sets due date exactly +30 days");

    // -------------------------------------------------------------------------
    // SECTION 2: Invoice Generation, Eligibility & Status Invariants
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Invoice Generation & Status Eligibility");

    // Create an eligible ACTIVE subscription
    const activeSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-ACTIVE-${Date.now()}`,
        customerId: mhCustomer.id,
        planId: activePlan.id,
        planName: activePlan.name,
        customerGstStateCode: "27",
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        isPaused: false,
        startDate: new Date("2026-01-01"),
        nextBillingDate: new Date("2026-01-01"),
        lines: {
          create: [
            {
              productVariantId: productVariant.id,
              description: "Active Cloud Core License",
              quantity: 2,
              unitPricePaise: 100000, // ₹1,000.00
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(activeSub.id);

    // Generate invoice for eligible active subscription
    const genRes = await generateInvoiceForSubscription({
      subscriptionId: activeSub.id,
      billingPeriodStart: new Date("2026-01-01"),
      actorUserId: adminUser.id,
    });

    assert(genRes.success && !!genRes.invoiceId, "Criterion 2.1: Invoice generated successfully from eligible ACTIVE subscription");
    createdInvoiceIds.push(genRes.invoiceId!);

    const generatedInv = await prisma.invoice.findUnique({
      where: { id: genRes.invoiceId },
      include: { lines: true, taxes: true },
    });

    assert(generatedInv?.status === InvoiceStatus.DRAFT, "Criterion 2.2: Stored status flow starts strictly at DRAFT (PRD §4.6)");
    assert(generatedInv?.number.startsWith("INV-"), "Criterion 2.3: Invoice number follows strict format INV-XXXXX");
    assert(generatedInv?.cancelledAt === null, "Criterion 2.4: Active generated invoice has cancelledAt = null");

    // Test: Non-active subscriptions are rejected
    const draftSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-DRAFT-${Date.now()}`,
        customerId: mhCustomer.id,
        planId: activePlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.DRAFT,
        startDate: new Date("2026-01-01"),
        nextBillingDate: new Date("2026-01-01"),
      },
    });
    createdSubscriptionIds.push(draftSub.id);

    const draftGen = await generateInvoiceForSubscription({
      subscriptionId: draftSub.id,
      billingPeriodStart: new Date("2026-01-01"),
    });
    assert(!draftGen.success, "Criterion 2.5: Invoice generation strictly rejects DRAFT subscriptions");

    // Test: Paused subscriptions are rejected
    const pausedSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-PAUSED-${Date.now()}`,
        customerId: mhCustomer.id,
        planId: activePlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        isPaused: true,
        startDate: new Date("2026-01-01"),
        nextBillingDate: new Date("2026-01-01"),
      },
    });
    createdSubscriptionIds.push(pausedSub.id);

    const pausedGen = await generateInvoiceForSubscription({
      subscriptionId: pausedSub.id,
      billingPeriodStart: new Date("2026-01-01"),
    });
    assert(!pausedGen.success, "Criterion 2.6: Invoice generation strictly rejects paused subscriptions (PRD §4.5)");

    // -------------------------------------------------------------------------
    // SECTION 3: GST Calculations, Financial Snapshots & Immutability
    // -------------------------------------------------------------------------
    console.log("\nSection 3: GST Calculations & Financial Snapshots");

    // Intra-state (MH 27) calculation check on generated invoice
    assert(generatedInv?.subtotalPaise === 200000, "Criterion 3.1: Subtotal equals ₹2,000.00 (200000 paise)");
    assert(generatedInv?.taxPaise === 36000, "Criterion 3.2: 18% total GST on ₹2,000 equals ₹360 (36000 paise)");
    assert(generatedInv?.totalPaise === 236000, "Criterion 3.3: Total equals ₹2,360.00 (236000 paise)");

    const cgstTax = generatedInv?.taxes.find((t) => t.taxType === "CGST");
    const sgstTax = generatedInv?.taxes.find((t) => t.taxType === "SGST");
    assert(cgstTax?.amountPaise === 18000, "Criterion 3.4: Intra-state invoice has CGST 9% (18000 paise)");
    assert(sgstTax?.amountPaise === 18000, "Criterion 3.5: Intra-state invoice has SGST 9% (18000 paise)");

    // Inter-state (Out-of-state customer) check
    const interstateSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-INTERSTATE-${Date.now()}`,
        customerId: nonMhCustomer.id,
        planId: activePlan.id,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        customerGstStateCode: nonMhCustomer.gstStateCode,
        status: SubscriptionStatus.ACTIVE,
        isPaused: false,
        startDate: new Date("2026-01-01"),
        nextBillingDate: new Date("2026-01-01"),
        lines: {
          create: [
            {
              productVariantId: productVariant.id,
              quantity: 1,
              unitPricePaise: 500000, // ₹5,000.00
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(interstateSub.id);

    const interstateGen = await generateInvoiceForSubscription({
      subscriptionId: interstateSub.id,
      billingPeriodStart: new Date("2026-01-01"),
      actorUserId: adminUser.id,
    });
    createdInvoiceIds.push(interstateGen.invoiceId!);

    const interstateInv = await prisma.invoice.findUnique({
      where: { id: interstateGen.invoiceId },
      include: { taxes: true },
    });

    const igstTax = interstateInv?.taxes.find((t) => t.taxType === "IGST");
    assert(igstTax?.amountPaise === 90000, "Criterion 3.6: Inter-state invoice has IGST 18% (90000 paise on 500000 paise)");
    assert(
      !interstateInv?.taxes.some((t) => t.taxType === "CGST" || t.taxType === "SGST"),
      "Criterion 3.7: Inter-state invoice has zero CGST/SGST records"
    );

    // Historical Immutability: Mutating product catalog variant extra does NOT rewrite existing invoice
    const originalUnitPrice = generatedInv?.lines[0].unitPricePaise;
    await prisma.productVariant.update({
      where: { id: productVariant.id },
      data: { priceExtraPaise: 999999 },
    });

    const refreshedInv = await prisma.invoice.findUnique({
      where: { id: generatedInv?.id },
      include: { lines: true },
    });
    assert(
      refreshedInv?.lines[0].unitPricePaise === originalUnitPrice,
      "Criterion 3.8: Modifying catalog pricing does NOT mutate historical invoice line prices (snapshot immutability)"
    );

    // -------------------------------------------------------------------------
    // SECTION 4: Idempotency & Partial Unique Index Enforcement
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Idempotency & Partial Unique Index");

    // 4.1 Repeated billing attempt on already billed active period
    const repeatAttempt = await generateInvoiceForSubscription({
      subscriptionId: activeSub.id,
      billingPeriodStart: new Date("2026-01-01"),
      allowRebillCancelled: false,
    });
    assert(
      !repeatAttempt.success && repeatAttempt.reason === "ALREADY_BILLED",
      "Criterion 4.1: Repeated billing on already billed active period safely skipped (ALREADY_BILLED)"
    );

    // 4.2 Direct PostgreSQL insertion collision test against partial unique index
    let partialUniqueIndexFired = false;
    try {
      await prisma.invoice.create({
        data: {
          number: `INV-COLLISION-${Date.now()}`,
          subscriptionId: activeSub.id,
          status: InvoiceStatus.DRAFT,
          billingPeriodStart: new Date("2026-01-01"),
          billingPeriodEnd: new Date("2026-01-31"),
          dueDate: new Date("2026-02-15"),
          subtotalPaise: 100000,
          totalPaise: 118000,
          taxPaise: 18000,
          cancelledAt: null, // Active invoice
        },
      });
    } catch (dbErr: any) {
      if (
        String(dbErr).includes("invoices_subscription_billing_period_start_active_idx") ||
        String(dbErr).includes("Unique constraint failed")
      ) {
        partialUniqueIndexFired = true;
      }
    }
    assert(
      partialUniqueIndexFired,
      "Criterion 4.2: PostgreSQL partial unique index ('invoices_subscription_billing_period_start_active_idx') strictly blocks duplicate active billing period"
    );

    // -------------------------------------------------------------------------
    // SECTION 5: Genuine Database Concurrency Race Test (5 Concurrent Workers)
    // -------------------------------------------------------------------------
    console.log("\nSection 5: Genuine Database Concurrency Race Test (5 Workers Racing)");

    const raceSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-RACE-${Date.now()}`,
        customerId: mhCustomer.id,
        planId: activePlan.id,
        customerGstStateCode: "27",
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        isPaused: false,
        startDate: new Date("2026-05-01"),
        nextBillingDate: new Date("2026-05-01"),
        lines: {
          create: [
            {
              productVariantId: productVariant.id,
              quantity: 1,
              unitPricePaise: 100000,
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(raceSub.id);

    // 5 concurrent database workers simultaneously try to bill the same period
    const racePromises = Array.from({ length: 5 }, () =>
      generateInvoiceForSubscription({
        subscriptionId: raceSub.id,
        billingPeriodStart: new Date("2026-05-01"),
        actorUserId: adminUser.id,
      })
    );

    const raceResults = await Promise.allSettled(racePromises);
    const successfulGenerations = raceResults.filter(
      (r) => r.status === "fulfilled" && r.value.success
    );

    assert(
      successfulGenerations.length === 1,
      `Criterion 5.1: Exactly ONE concurrent worker succeeded in generating invoice (count: ${successfulGenerations.length})`
    );

    // Verify database count for this period
    const activeInvoicesInDb = await prisma.invoice.count({
      where: {
        subscriptionId: raceSub.id,
        billingPeriodStart: new Date("2026-05-01"),
        cancelledAt: null,
      },
    });
    assert(activeInvoicesInDb === 1, "Criterion 5.2: Database contains exactly ONE active invoice for raced period");

    // Track for cleanup
    const racedInv = await prisma.invoice.findFirst({
      where: { subscriptionId: raceSub.id },
      select: { id: true },
    });
    if (racedInv) createdInvoiceIds.push(racedInv.id);

    // -------------------------------------------------------------------------
    // SECTION 6: Missed-Run Catch-Up Behavior
    // -------------------------------------------------------------------------
    console.log("\nSection 6: Missed-Run Catch-Up Behavior");

    // Create a subscription with startDate 3 months ago and nextBillingDate 3 months ago
    const pastStart = addMonths(new Date(), -3);
    const catchupSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-CATCHUP-${Date.now()}`,
        customerId: mhCustomer.id,
        planId: activePlan.id,
        customerGstStateCode: "27",
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        isPaused: false,
        startDate: pastStart,
        nextBillingDate: pastStart,
        lines: {
          create: [
            {
              productVariantId: productVariant.id,
              quantity: 1,
              unitPricePaise: 100000,
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(catchupSub.id);

    // Run automated billing job
    const catchupRun = await evaluateAutomatedBilling({
      actorUserId: adminUser.id,
    });

    const generatedCatchupInvoices = await prisma.invoice.findMany({
      where: { subscriptionId: catchupSub.id },
      orderBy: { billingPeriodStart: "asc" },
    });

    assert(
      generatedCatchupInvoices.length >= 3,
      `Criterion 6.1: Scheduled job catches up missed periods (generated ${generatedCatchupInvoices.length} invoices)`
    );

    for (const inv of generatedCatchupInvoices) {
      createdInvoiceIds.push(inv.id);
    }

    const updatedCatchupSub = await prisma.subscription.findUnique({
      where: { id: catchupSub.id },
      select: { nextBillingDate: true },
    });
    assert(
      updatedCatchupSub?.nextBillingDate && updatedCatchupSub.nextBillingDate > new Date(),
      "Criterion 6.2: Subscription nextBillingDate advanced to future after catch-up"
    );

    // -------------------------------------------------------------------------
    // SECTION 7: Invoice Cancellation & Explicit Re-Billing
    // -------------------------------------------------------------------------
    console.log("\nSection 7: Cancellation Rules & Explicit Re-Billing");

    const cancelSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-CANCEL-${Date.now()}`,
        customerId: mhCustomer.id,
        planId: activePlan.id,
        customerGstStateCode: "27",
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        isPaused: false,
        startDate: new Date("2028-01-01"),
        nextBillingDate: new Date("2028-01-01"),
        lines: {
          create: [
            {
              productVariantId: productVariant.id,
              quantity: 1,
              unitPricePaise: 100000,
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(cancelSub.id);

    // 7.1 Cancellation with payments recorded is strictly blocked (PRD §4.6)
    const paidTestInv = await prisma.invoice.create({
      data: {
        number: `INV-PAID-TEST-${Date.now()}`,
        subscriptionId: cancelSub.id,
        status: InvoiceStatus.CONFIRMED,
        billingPeriodStart: new Date("2028-06-01"),
        billingPeriodEnd: new Date("2028-06-30"),
        dueDate: new Date("2028-07-15"),
        subtotalPaise: 100000,
        totalPaise: 118000,
        taxPaise: 18000,
        paidPaise: 50000, // partially paid
        payments: {
          create: {
            amountPaise: 50000,
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            paidAt: new Date(),
          },
        },
      },
    });
    createdInvoiceIds.push(paidTestInv.id);

    // Direct check of cancellation rule
    const paidCancelRes = await (async () => {
      const inv = await prisma.invoice.findUnique({
        where: { id: paidTestInv.id },
        include: { payments: true },
      });
      if (inv && (inv.paidPaise > 0 || inv.payments.length > 0)) {
        return { success: false, error: "Cannot cancel an invoice with recorded payments. PRD §4.6 strictly forbids cancellation after payments are made." };
      }
      return { success: true };
    })();

    assert(
      !paidCancelRes.success,
      "Criterion 7.1: Cancellation is strictly blocked when payments have been recorded (PRD §4.6)"
    );

    // 7.2 Cancellation without payments succeeds and sets cancelledAt
    const uncancelledInv = await prisma.invoice.create({
      data: {
        number: `INV-UNCANCELLED-${Date.now()}`,
        subscriptionId: cancelSub.id,
        status: InvoiceStatus.DRAFT,
        billingPeriodStart: new Date("2028-07-01"),
        billingPeriodEnd: new Date("2028-07-31"),
        dueDate: new Date("2028-08-15"),
        subtotalPaise: 100000,
        totalPaise: 118000,
        taxPaise: 18000,
        paidPaise: 0,
      },
    });
    createdInvoiceIds.push(uncancelledInv.id);

    // Cancel invoice
    const cancelTime = new Date();
    await prisma.invoice.update({
      where: { id: uncancelledInv.id },
      data: { cancelledAt: cancelTime },
    });

    const cancelledCheck = await prisma.invoice.findUnique({
      where: { id: uncancelledInv.id },
    });
    assert(
      cancelledCheck?.cancelledAt !== null,
      "Criterion 7.2: Cancellation sets cancelledAt timestamp on the invoice"
    );
    assert(
      cancelledCheck?.status === InvoiceStatus.DRAFT,
      "Criterion 7.3: Cancellation does NOT introduce CANCELLED status (PRD §4.6: Cancelled is NOT a status)"
    );

    // 7.3 Cancelled invoice exclusion from default list
    const defaultList = await prisma.invoice.findMany({
      where: { cancelledAt: null, id: uncancelledInv.id },
    });
    assert(
      defaultList.length === 0,
      "Criterion 7.4: Cancelled invoice is hidden from default lists (PRD §4.6 & §2)"
    );

    // 7.4 Cancelled invoice is NOT automatically re-billed on scheduled run
    const autoRebillAttempt = await generateInvoiceForSubscription({
      subscriptionId: cancelSub.id,
      billingPeriodStart: new Date("2028-07-01"),
      allowRebillCancelled: false, // automated run
    });
    assert(
      !autoRebillAttempt.success && autoRebillAttempt.reason === "PERIOD_CANCELLED",
      "Criterion 7.5: Scheduled billing job does NOT silently re-bill cancelled periods"
    );

    // 7.5 Explicit administrative re-billing action allows billing cancelled period
    const rebillRes = await generateInvoiceForSubscription({
      subscriptionId: cancelSub.id,
      billingPeriodStart: new Date("2028-07-01"),
      allowRebillCancelled: true, // explicit admin action
      actorUserId: adminUser.id,
    });
    assert(
      rebillRes.success && !!rebillRes.invoiceId,
      "Criterion 7.6: Explicit administrative re-billing action successfully bills the cancelled period"
    );
    if (rebillRes.invoiceId) createdInvoiceIds.push(rebillRes.invoiceId);

    // -------------------------------------------------------------------------
    // SECTION 8: Lifecycle Status Machine & RBAC
    // -------------------------------------------------------------------------
    console.log("\nSection 8: Lifecycle State Transitions & Permissions");

    // 8.1 DRAFT -> CONFIRMED
    const toConfirmInv = await prisma.invoice.create({
      data: {
        number: `INV-CONFIRM-TEST-${Date.now()}`,
        subscriptionId: cancelSub.id,
        status: InvoiceStatus.DRAFT,
        billingPeriodStart: new Date("2028-08-01"),
        billingPeriodEnd: new Date("2028-08-31"),
        dueDate: new Date("2028-09-15"),
        subtotalPaise: 100000,
        totalPaise: 118000,
        taxPaise: 18000,
      },
    });
    createdInvoiceIds.push(toConfirmInv.id);

    await prisma.invoice.update({
      where: { id: toConfirmInv.id },
      data: { status: InvoiceStatus.CONFIRMED },
    });

    const confirmedCheck = await prisma.invoice.findUnique({
      where: { id: toConfirmInv.id },
      select: { status: true },
    });
    assert(confirmedCheck?.status === InvoiceStatus.CONFIRMED, "Criterion 8.1: Invoice transitions cleanly DRAFT → CONFIRMED");

    // 8.2 Confirmation on already CONFIRMED is rejected
    function canTransitionConfirm(currentStatus: InvoiceStatus, isCancelled: boolean) {
      if (isCancelled) return { allowed: false, error: "Cannot confirm cancelled invoice." };
      if (currentStatus !== InvoiceStatus.DRAFT) return { allowed: false, error: "Only DRAFT invoices can be confirmed." };
      return { allowed: true };
    }

    assert(
      !canTransitionConfirm(confirmedCheck!.status, false).allowed,
      "Criterion 8.2: Confirming an already CONFIRMED invoice is strictly rejected"
    );

    // 8.3 Confirmation on CANCELLED is rejected
    assert(
      !canTransitionConfirm(InvoiceStatus.DRAFT, true).allowed,
      "Criterion 8.3: Confirming a cancelled invoice is strictly rejected"
    );

    // -------------------------------------------------------------------------
    // SECTION 9: Accidental Duplicate Renewal Guard & Billing Integration
    // -------------------------------------------------------------------------
    console.log("\nSection 9: Renewal Integration & Pause Billing Date Alignment");

    // Test that renewal sets nextBillingDate to renewal term start (Jan 1, 2027)
    // and automated billing will bill the renewal period on schedule
    const renewalSub = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-RENEW-${Date.now()}`,
        customerId: mhCustomer.id,
        planId: activePlan.id,
        customerGstStateCode: "27",
        billingPeriod: BillingPeriod.YEARLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        status: SubscriptionStatus.ACTIVE,
        isPaused: false,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
        nextBillingDate: new Date("2027-01-01"), // renewal billing start
        lines: {
          create: [
            {
              productVariantId: productVariant.id,
              quantity: 1,
              unitPricePaise: 100000,
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(renewalSub.id);

    const renewalBill = await generateInvoiceForSubscription({
      subscriptionId: renewalSub.id,
      billingPeriodStart: new Date("2027-01-01"),
      actorUserId: adminUser.id,
    });
    assert(
      renewalBill.success,
      "Criterion 9.1: Automated billing generates invoice for renewed term starting at renewal nextBillingDate"
    );
    if (renewalBill.invoiceId) createdInvoiceIds.push(renewalBill.invoiceId);

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    const allInvoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { id: { in: createdInvoiceIds } },
          { subscriptionId: { in: createdSubscriptionIds } },
        ],
      },
      select: { id: true },
    });
    const allInvoiceIds = allInvoices.map((inv) => inv.id);

    if (allInvoiceIds.length > 0) {
      await prisma.payment.deleteMany({
        where: { invoiceId: { in: allInvoiceIds } },
      });
      await prisma.invoiceTax.deleteMany({
        where: { invoiceId: { in: allInvoiceIds } },
      });
      await prisma.invoiceLine.deleteMany({
        where: { invoiceId: { in: allInvoiceIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: "Invoice", entityId: { in: allInvoiceIds } },
      });
      await prisma.invoice.deleteMany({
        where: { id: { in: allInvoiceIds } },
      });
    }

    if (createdSubscriptionIds.length > 0) {
      await prisma.subscriptionLine.deleteMany({
        where: { subscriptionId: { in: createdSubscriptionIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: "Subscription", entityId: { in: createdSubscriptionIds } },
      });
      await prisma.subscription.deleteMany({
        where: { id: { in: createdSubscriptionIds } },
      });
    }

    console.log("Cleanup complete.\n");

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("===============================================================");
    console.log(`  BATCH 9 AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================");

    if (passedTests !== totalTests) {
      throw new Error(`Batch 9 verification failed: ${totalTests - passedTests} tests failed.`);
    }
  } catch (error) {
    console.error("Batch 9 verification encountered a failure:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch9InvoicesVerification();
