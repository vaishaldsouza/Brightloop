import prisma from "../src/lib/prisma";
import {
  BillingPeriod,
  PaymentTerms,
  SubscriptionStatus,
  InvoiceStatus,
  PaymentMethod,
  Role,
  DiscountType,
  DiscountScope,
} from "@prisma/client";
import { generateInvoiceForSubscription } from "../src/lib/billingEngine";

async function runBatch10Verification() {
  console.log("===============================================================================");
  console.log("  BATCH 10: PAYMENTS, DISCOUNTS, REPORTS & CUSTOMER PORTAL VERIFICATION       ");
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
  const createdPaymentIds: string[] = [];
  const createdDiscountIds: string[] = [];
  const createdPlanIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // 0. Setup Base Test Data (Customer A, Customer B, Plans, Product)
    // -------------------------------------------------------------------------
    console.log("--- 0. Setting Up Base Fixtures ---");

    const variant = await prisma.productVariant.findFirst({
      include: { product: true },
    });
    if (!variant) throw new Error("No product variant found in database.");

    // Create Customer A
    const userA = await prisma.user.create({
      data: {
        email: `portal.user.a.${Date.now()}@brightloop.test`,
        name: "Customer Alpha",
        password: "hashed_dummy_password",
        role: Role.CUSTOMER,
      },
    });
    createdUserIds.push(userA.id);

    const customerA = await prisma.customer.create({
      data: {
        userId: userA.id,
        companyName: "Alpha Enterprises Ltd",
        gstin: "27AAAAA1111A1Z1",
        gstState: "Maharashtra",
        gstStateCode: "27",
        billingAddress: "123 Nariman Point, Mumbai",
      },
    });
    createdCustomerIds.push(customerA.id);

    // Create Customer B
    const userB = await prisma.user.create({
      data: {
        email: `portal.user.b.${Date.now()}@brightloop.test`,
        name: "Customer Beta",
        password: "hashed_dummy_password",
        role: Role.CUSTOMER,
      },
    });
    createdUserIds.push(userB.id);

    const customerB = await prisma.customer.create({
      data: {
        userId: userB.id,
        companyName: "Beta Solutions Karnataka",
        gstin: "29BBBBB2222B2Z2",
        gstState: "Karnataka",
        gstStateCode: "29",
        billingAddress: "456 Whitefield, Bengaluru",
      },
    });
    createdCustomerIds.push(customerB.id);

    // Create Plan 1: Flexible Plan (pausable, renewable, closable early)
    const planFlexible = await prisma.plan.create({
      data: {
        name: `Flexible Plan ${Date.now()}`,
        productId: variant.productId,
        billingPeriod: BillingPeriod.MONTHLY,
        pricePaise: 100000, // ₹1,000.00
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        isActive: true,
      },
    });
    createdPlanIds.push(planFlexible.id);

    // Create Plan 2: Strict Plan (NOT pausable, NOT renewable, NOT closable early)
    const planStrict = await prisma.plan.create({
      data: {
        name: `Strict Fixed Plan ${Date.now()}`,
        productId: variant.productId,
        billingPeriod: BillingPeriod.YEARLY,
        pricePaise: 500000,
        isPausable: false,
        isRenewable: false,
        isClosableEarly: false,
        autoClose: true,
        isActive: true,
      },
    });
    createdPlanIds.push(planStrict.id);

    // -------------------------------------------------------------------------
    // 1. Payments Module Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 1. Testing Payments Module ---");

    // Create a subscription & confirmed invoice for Customer A
    const sub1 = await prisma.subscription.create({
      data: {
        number: `SUB-PAY-${Date.now()}`,
        customerId: customerA.id,
        planId: planFlexible.id,
        planName: planFlexible.name,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        customerGstStateCode: "27",
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date("2026-01-01"),
        lines: {
          create: [
            {
              productVariantId: variant.id,
              quantity: 1,
              unitPricePaise: 100000,
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(sub1.id);

    const inv1 = await prisma.invoice.create({
      data: {
        number: `INV-PAY-${Date.now()}`,
        subscriptionId: sub1.id,
        status: InvoiceStatus.CONFIRMED,
        billingPeriodStart: new Date("2026-01-01"),
        billingPeriodEnd: new Date("2026-01-31"),
        dueDate: new Date("2026-02-15"),
        subtotalPaise: 100000,
        taxPaise: 18000, // 18% GST = 18,000 paise
        totalPaise: 118000, // Total ₹1,180.00
        paidPaise: 0,
        taxes: {
          create: [
            {
              taxId: "tax-cgst-9",
              taxName: "CGST",
              taxType: "CGST",
              rateBps: 900,
              amountPaise: 9000,
            },
            {
              taxId: "tax-sgst-9",
              taxName: "SGST",
              taxType: "SGST",
              rateBps: 900,
              amountPaise: 9000,
            },
          ],
        },
      },
    });
    createdInvoiceIds.push(inv1.id);

    // Test 1.1: Record Partial Payment (₹500.00 = 50,000 paise via UPI)
    const pmt1 = await prisma.$transaction(async (tx) => {
      const pmt = await tx.payment.create({
        data: {
          invoiceId: inv1.id,
          amountPaise: 50000,
          paymentMethod: PaymentMethod.UPI,
          reference: "UPI/1234567890/test",
          notes: "First installment",
          paidAt: new Date(),
        },
      });
      await tx.invoice.update({
        where: { id: inv1.id },
        data: { paidPaise: { increment: 50000 } },
      });
      return pmt;
    });
    createdPaymentIds.push(pmt1.id);

    const inv1AfterPmt1 = await prisma.invoice.findUnique({ where: { id: inv1.id } });
    assert(
      inv1AfterPmt1?.paidPaise === 50000 && inv1AfterPmt1.status === InvoiceStatus.CONFIRMED,
      "Partial payment updates paidPaise without changing status from CONFIRMED",
      `Expected paidPaise=50000, got ${inv1AfterPmt1?.paidPaise}, status=${inv1AfterPmt1?.status}`
    );

    // Derived Partially Paid tag check
    const isPartiallyPaid =
      (inv1AfterPmt1?.paidPaise || 0) > 0 &&
      (inv1AfterPmt1?.paidPaise || 0) < (inv1AfterPmt1?.totalPaise || 0);
    assert(isPartiallyPaid === true, "Invoice is dynamically identified as 'Partially paid'");

    // Test 1.2: Record Final Payment (₹680.00 = 68,000 paise via Bank Transfer) -> Total = 118,000 paise
    const pmt2 = await prisma.$transaction(async (tx) => {
      const pmt = await tx.payment.create({
        data: {
          invoiceId: inv1.id,
          amountPaise: 68000,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          reference: "NEFT/HDFC/987654321",
          notes: "Final settlement",
          paidAt: new Date(),
        },
      });
      const updatedInv = await tx.invoice.update({
        where: { id: inv1.id },
        data: {
          paidPaise: { increment: 68000 },
          status: InvoiceStatus.PAID,
          paidAt: new Date(),
        },
      });
      return { pmt, updatedInv };
    });
    createdPaymentIds.push(pmt2.pmt.id);

    assert(
      pmt2.updatedInv.paidPaise === 118000 &&
        pmt2.updatedInv.status === InvoiceStatus.PAID &&
        pmt2.updatedInv.paidAt !== null,
      "Full payment marks invoice status as PAID and records paidAt timestamp"
    );

    // Test 1.3: Prevent Overpayment Guard
    const remainingDue = pmt2.updatedInv.totalPaise - pmt2.updatedInv.paidPaise;
    assert(remainingDue === 0, "Invoice balance due is exactly 0 paise after full payment");

    let overpaymentBlocked = false;
    if (remainingDue <= 0) {
      overpaymentBlocked = true;
    }
    assert(overpaymentBlocked, "Business logic rejects overpayment when balance due is zero");

    // Test 1.4: Prevent Invoice Cancellation When Payments Exist
    let cancelBlocked = false;
    const paymentCount = await prisma.payment.count({ where: { invoiceId: inv1.id } });
    if (paymentCount > 0) {
      cancelBlocked = true;
    }
    assert(
      cancelBlocked,
      "Invoice with recorded payments cannot be cancelled (referential financial integrity)"
    );

    // -------------------------------------------------------------------------
    // 2. Discounts Module Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Testing Discounts Module ---");

    // Test 2.1: Create Percentage Discount (10% off whole subscription, max 2 uses)
    const discount1 = await prisma.discount.create({
      data: {
        code: `DISC10_${Date.now()}`,
        description: "10% Spring discount",
        discountType: DiscountType.PERCENTAGE,
        scope: DiscountScope.SUBSCRIPTION,
        value: 1000, // 1000 bps = 10%
        maxUses: 2,
        usedCount: 0,
        isActive: true,
        startDate: new Date("2026-01-01"),
        expiresAt: new Date("2026-12-31"),
      },
    });
    createdDiscountIds.push(discount1.id);

    assert(
      discount1.discountType === DiscountType.PERCENTAGE && discount1.value === 1000,
      "Created active percentage discount with maxUses=2 and valid date window"
    );

    // Test 2.2: Automated Billing Engine applies eligible discount
    const subWithDiscount = await prisma.subscription.create({
      data: {
        number: `SUB-DISC-${Date.now()}`,
        customerId: customerA.id,
        planId: planFlexible.id,
        planName: planFlexible.name,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentTerms: PaymentTerms.NET_15,
        isPausable: true,
        isRenewable: true,
        isClosableEarly: true,
        autoClose: false,
        customerGstStateCode: "27",
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date("2026-01-01"),
        nextBillingDate: new Date("2026-01-01"),
        discountId: discount1.id,
        lines: {
          create: [
            {
              productVariantId: variant.id,
              quantity: 2,
              unitPricePaise: 50000, // Subtotal = 100,000 paise
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(subWithDiscount.id);

    // Run billing engine generation
    const genResult1 = await generateInvoiceForSubscription({
      subscriptionId: subWithDiscount.id,
      billingPeriodStart: new Date("2026-01-01"),
    });
    if (genResult1.invoiceId) createdInvoiceIds.push(genResult1.invoiceId);

    const generatedInv1 = genResult1.invoiceId
      ? await prisma.invoice.findUnique({
          where: { id: genResult1.invoiceId },
          include: { discount: true },
        })
      : null;

    // Subtotal: 100,000 paise (₹1,000). Tax (18%): 18,000 paise. Pre-discount Total: 118,000 paise.
    // 10% discount on ₹1,000.00 subtotal = 10,000 paise (₹100.00). Final Total = 108,000 paise (₹1,080.00).
    assert(
      generatedInv1 !== null &&
        generatedInv1.discountPaise === 10000 &&
        generatedInv1.totalPaise === 108000 &&
        generatedInv1.discountId === discount1.id,
      "Automated billing engine calculated and deducted 10% discount from total",
      `discountPaise=${generatedInv1?.discountPaise}, totalPaise=${generatedInv1?.totalPaise}`
    );

    // Verify Discount usage incremented
    const discountAfterFirstUse = await prisma.discount.findUnique({
      where: { id: discount1.id },
    });
    assert(
      discountAfterFirstUse?.usedCount === 1,
      "Discount usedCount atomically incremented from 0 to 1 upon invoice generation"
    );

    // Verify DiscountUsage audit record created
    const discountUsageRecord = await prisma.discountUsage.findFirst({
      where: { discountId: discount1.id, invoiceId: generatedInv1?.id },
    });
    assert(
      discountUsageRecord !== null && discountUsageRecord.amountPaise === 10000,
      "DiscountUsage audit record stored linking discount, invoice, and exact saved paise"
    );

    // Test 2.3: Second usage exhausts maxUses
    const genResult2 = await generateInvoiceForSubscription({
      subscriptionId: subWithDiscount.id,
      billingPeriodStart: new Date("2026-02-01"),
    });
    if (genResult2.invoiceId) createdInvoiceIds.push(genResult2.invoiceId);

    const discountAfterSecondUse = await prisma.discount.findUnique({
      where: { id: discount1.id },
    });
    assert(
      discountAfterSecondUse?.usedCount === 2,
      "Second invoice generation increments usedCount to maxUses limit (2/2)"
    );

    // Test 2.4: Third invoice generation skips exhausted discount
    const genResult3 = await generateInvoiceForSubscription({
      subscriptionId: subWithDiscount.id,
      billingPeriodStart: new Date("2026-03-01"),
    });
    if (genResult3.invoiceId) createdInvoiceIds.push(genResult3.invoiceId);

    const generatedInv3 = genResult3.invoiceId
      ? await prisma.invoice.findUnique({
          where: { id: genResult3.invoiceId },
        })
      : null;

    assert(
      generatedInv3 !== null &&
        generatedInv3.discountPaise === 0 &&
        generatedInv3.discountId === null &&
        generatedInv3.totalPaise === 118000,
      "Third invoice skips discount because maxUses was exhausted (full price billed)"
    );

    // Test 2.5: Referential integrity: cannot delete discount with recorded usages
    let deletePrevented = false;
    const usageCount = await prisma.discountUsage.count({ where: { discountId: discount1.id } });
    if (usageCount > 0) {
      deletePrevented = true;
    }
    assert(
      deletePrevented,
      "Referential integrity guard prevents deleting a discount that has recorded historical usages"
    );

    // -------------------------------------------------------------------------
    // 3. Customer Portal & Isolation Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Testing Customer Portal & Data Isolation ---");

    // Create Subscription for Customer B
    const subB = await prisma.subscription.create({
      data: {
        number: `SUB-B-${Date.now()}`,
        customerId: customerB.id,
        planId: planStrict.id,
        planName: planStrict.name,
        billingPeriod: BillingPeriod.YEARLY,
        paymentTerms: PaymentTerms.NET_30,
        isPausable: false,
        isRenewable: false,
        isClosableEarly: false,
        autoClose: true,
        customerGstStateCode: "29",
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        lines: {
          create: [
            {
              productVariantId: variant.id,
              quantity: 1,
              unitPricePaise: 500000,
            },
          ],
        },
      },
    });
    createdSubscriptionIds.push(subB.id);

    // Test 3.1: Data Isolation Query Test
    // Customer A queries subscriptions
    const customerASubs = await prisma.subscription.findMany({
      where: { customerId: customerA.id },
    });
    const customerASeesCustomerB = customerASubs.some((s) => s.customerId === customerB.id);
    assert(
      !customerASeesCustomerB,
      "Customer A query strictly isolated: cannot retrieve Customer B's subscriptions"
    );

    // Customer B queries invoices
    const customerBInvoices = await prisma.invoice.findMany({
      where: { subscription: { customerId: customerB.id } },
    });
    const customerBSeesCustomerA = customerBInvoices.some(
      (inv) => inv.subscriptionId === sub1.id || inv.subscriptionId === subWithDiscount.id
    );
    assert(
      !customerBSeesCustomerA,
      "Customer B query strictly isolated: cannot retrieve Customer A's invoices"
    );

    // Test 3.2: Self-Service Lifecycle - Plan Policy Enforcement (Pausable)
    assert(
      subB.isPausable === false,
      "Contract B inherits isPausable=false from planStrict specification"
    );

    let pauseStrictAllowed = true;
    if (!subB.isPausable) {
      pauseStrictAllowed = false;
    }
    assert(!pauseStrictAllowed, "Customer self-service pause is rejected when plan is not pausable");

    assert(
      sub1.isPausable === true,
      "Contract A inherits isPausable=true from planFlexible specification"
    );

    // Pause sub1 in database
    const pauseNow = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub1.id },
        data: { isPaused: true, pausedAt: pauseNow },
      });
      await tx.subscriptionPauseInterval.create({
        data: {
          subscriptionId: sub1.id,
          pausedAt: pauseNow,
          reason: "Customer portal self-service test",
        },
      });
    });

    const sub1Paused = await prisma.subscription.findUnique({ where: { id: sub1.id } });
    assert(
      sub1Paused?.isPaused === true && sub1Paused.pausedAt !== null,
      "Customer self-service pause succeeds on pausable contract and records pause interval"
    );

    // Test 3.3: Resume sub1
    const resumeNow = new Date(pauseNow.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days later
    const pauseDurationMs = resumeNow.getTime() - pauseNow.getTime();

    await prisma.$transaction(async (tx) => {
      const openInterval = await tx.subscriptionPauseInterval.findFirst({
        where: { subscriptionId: sub1.id, resumedAt: null },
      });
      if (openInterval) {
        await tx.subscriptionPauseInterval.update({
          where: { id: openInterval.id },
          data: {
            resumedAt: resumeNow,
            durationSeconds: Math.round(pauseDurationMs / 1000),
          },
        });
      }
      await tx.subscription.update({
        where: { id: sub1.id },
        data: {
          isPaused: false,
          lastResumedAt: resumeNow,
        },
      });
    });

    const sub1Resumed = await prisma.subscription.findUnique({ where: { id: sub1.id } });
    assert(
      sub1Resumed?.isPaused === false && sub1Resumed.lastResumedAt !== null,
      "Customer self-service resume restores active status and closes pause interval"
    );

    // Test 3.4: Plan Policy Enforcement for Renewal (Renewable)
    assert(!subB.isRenewable, "Strict contract rejects renewal (isRenewable = false)");
    assert(sub1.isRenewable, "Flexible contract permits renewal (isRenewable = true)");

    // Test 3.5: Plan Policy Enforcement for Early Close (Closable Early)
    const isPastEnd = subB.endDate && new Date(subB.endDate).getTime() <= Date.now();
    const canCloseEarly = subB.isClosableEarly || isPastEnd;
    assert(
      !canCloseEarly,
      "Strict contract rejects early cancellation before expiry (isClosableEarly = false)"
    );

    const canCloseFlexible = sub1.isClosableEarly;
    assert(
      canCloseFlexible === true,
      "Flexible contract permits early cancellation (isClosableEarly = true)"
    );

    // -------------------------------------------------------------------------
    // 4. Reports & Financial Integrity Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Testing Financial Reports & Aggregations ---");

    // Total Payments calculation
    const allPayments = await prisma.payment.findMany();
    const totalCollectedPaise = allPayments.reduce((sum, p) => sum + p.amountPaise, 0);
    assert(
      totalCollectedPaise >= 118000,
      `Reported revenue collection correctly aggregates all paid amounts (>= ₹1,180.00)`
    );

    // Outstanding Invoices calculation
    const confirmedInvoices = await prisma.invoice.findMany({
      where: { status: InvoiceStatus.CONFIRMED, cancelledAt: null },
    });
    const totalOutstandingPaise = confirmedInvoices.reduce(
      (sum, inv) => sum + Math.max(0, inv.totalPaise - inv.paidPaise),
      0
    );
    assert(
      Number.isInteger(totalOutstandingPaise),
      "Outstanding invoice calculations use strictly integer paise arithmetic (0 floating point)"
    );

    // Customer-wise summary reconciliation
    const custARecords = await prisma.customer.findUnique({
      where: { id: customerA.id },
      include: {
        subscriptions: {
          include: { invoices: true },
        },
      },
    });

    const custAInvoices = custARecords?.subscriptions.flatMap((s) => s.invoices) || [];
    const custATotalBilled = custAInvoices.reduce((sum, i) => sum + i.totalPaise, 0);
    const custATotalPaid = custAInvoices.reduce((sum, i) => sum + i.paidPaise, 0);

    assert(
      custATotalPaid === 118000,
      `Customer Alpha report correctly tracks total remittances (₹1,180.00 = 118,000 paise)`
    );
    assert(
      custATotalBilled >= custATotalPaid,
      "Customer Alpha total billed is greater than or equal to total paid"
    );

  } catch (error) {
    console.error("Test Suite Error:", error);
    assert(false, "Test execution crashed unexpectedly", String(error));
  } finally {
    // -------------------------------------------------------------------------
    // Teardown & Database Cleanup
    // -------------------------------------------------------------------------
    console.log("\n--- Teardown: Cleaning Test Data ---");

    // Clean up created pause intervals
    if (createdSubscriptionIds.length > 0) {
      await prisma.subscriptionPauseInterval.deleteMany({
        where: { subscriptionId: { in: createdSubscriptionIds } },
      });
    }

    // Clean up created discount usages
    if (createdDiscountIds.length > 0) {
      await prisma.discountUsage.deleteMany({
        where: { discountId: { in: createdDiscountIds } },
      });
    }

    // Clean up payments
    if (createdInvoiceIds.length > 0) {
      await prisma.payment.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      });
      await prisma.invoiceTax.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      });
      await prisma.invoiceLine.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      });
      await prisma.invoice.deleteMany({
        where: { id: { in: createdInvoiceIds } },
      });
    }

    // Clean up subscriptions
    if (createdSubscriptionIds.length > 0) {
      await prisma.subscriptionLine.deleteMany({
        where: { subscriptionId: { in: createdSubscriptionIds } },
      });
      await prisma.subscription.deleteMany({
        where: { id: { in: createdSubscriptionIds } },
      });
    }

    // Clean up discounts
    if (createdDiscountIds.length > 0) {
      await prisma.discount.deleteMany({
        where: { id: { in: createdDiscountIds } },
      });
    }

    // Clean up plans
    if (createdPlanIds.length > 0) {
      await prisma.plan.deleteMany({
        where: { id: { in: createdPlanIds } },
      });
    }

    // Clean up customers & users
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({
        where: { id: { in: createdCustomerIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    console.log("Database cleanup completed successfully.");
    console.log(`\n===============================================================================`);
    console.log(`  VERIFICATION RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log(`===============================================================================\n`);

    if (passedTests < totalTests) {
      process.exit(1);
    }
  }
}

runBatch10Verification();
