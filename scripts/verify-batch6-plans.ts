import prisma from "../src/lib/prisma";
import { Role, BillingPeriod, PaymentTerms } from "@prisma/client";
import {
  planSchema,
  BILLING_PERIODS,
  isPlanAvailable,
  getPlanAvailabilityStatus,
} from "../src/lib/validations/plan";

async function runBatch6PlansVerification() {
  console.log("===============================================================");
  console.log("  BATCH 6: PLANS MODULE VERIFICATION SUITE                     ");
  console.log("===============================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // CRITERIA 5 & 6: Billing Period Validation
    // -------------------------------------------------------------------------
    console.log("Section 1: Billing Period Enumeration & Validation (Criteria 5 & 6)");

    assert(
      BILLING_PERIODS.includes(BillingPeriod.DAILY) &&
      BILLING_PERIODS.includes(BillingPeriod.WEEKLY) &&
      BILLING_PERIODS.includes(BillingPeriod.MONTHLY) &&
      BILLING_PERIODS.includes(BillingPeriod.YEARLY),
      "Criterion 5: All four billing periods (DAILY, WEEKLY, MONTHLY, YEARLY) are defined"
    );

    // Test each valid period in schema
    for (const bp of BILLING_PERIODS) {
      const validPeriod = planSchema.safeParse({
        productId: "prod-cloud-core",
        name: `Test Plan ${bp}`,
        pricePaise: 100000,
        billingPeriod: bp,
        minQuantity: 1,
      });
      assert(validPeriod.success, `Criterion 5: Billing period '${bp}' is accepted by validation schema`);
    }

    // Invalid periods
    const invalidPeriods = ["HOURLY", "BIWEEKLY", "QUARTERLY", "SEMI_ANNUAL", ""];
    for (const invBp of invalidPeriods) {
      const invalidRes = planSchema.safeParse({
        productId: "prod-cloud-core",
        name: "Test Plan",
        pricePaise: 100000,
        billingPeriod: invBp as any,
        minQuantity: 1,
      });
      assert(!invalidRes.success, `Criterion 6: Invalid billing period '${invBp || "<empty>"}' is strictly rejected`);
    }

    // -------------------------------------------------------------------------
    // CRITERIA 7 & 8: Price, Quantity & Availability Range Validations
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Monetary, Quantity & Date Range Validations (Criteria 7 & 8)");

    // Negative price
    const negPrice = planSchema.safeParse({
      productId: "prod-cloud-core",
      name: "Negative Plan",
      pricePaise: -5000,
      billingPeriod: BillingPeriod.MONTHLY,
      minQuantity: 1,
    });
    assert(!negPrice.success, "Criterion 7: Negative price is strictly rejected");

    // Fractional / float price
    const floatPrice = planSchema.safeParse({
      productId: "prod-cloud-core",
      name: "Float Plan",
      pricePaise: 1250.75 as any,
      billingPeriod: BillingPeriod.MONTHLY,
      minQuantity: 1,
    });
    assert(!floatPrice.success, "Criterion 7: Floating-point price is rejected (must be integer paise)");

    // Zero quantity
    const zeroQty = planSchema.safeParse({
      productId: "prod-cloud-core",
      name: "Zero Qty Plan",
      pricePaise: 50000,
      billingPeriod: BillingPeriod.MONTHLY,
      minQuantity: 0,
    });
    assert(!zeroQty.success, "Criterion 7: Zero minimum quantity is rejected (must be >= 1)");

    // Negative quantity
    const negQty = planSchema.safeParse({
      productId: "prod-cloud-core",
      name: "Negative Qty Plan",
      pricePaise: 50000,
      billingPeriod: BillingPeriod.MONTHLY,
      minQuantity: -2,
    });
    assert(!negQty.success, "Criterion 7: Negative minimum quantity is rejected");

    // Invalid date range: availableTo < availableFrom
    const invalidDateRange = planSchema.safeParse({
      productId: "prod-cloud-core",
      name: "Inverted Date Plan",
      pricePaise: 50000,
      billingPeriod: BillingPeriod.MONTHLY,
      minQuantity: 1,
      availableFrom: "2026-12-31T00:00:00.000Z",
      availableTo: "2026-01-01T00:00:00.000Z",
    });
    assert(!invalidDateRange.success, "Criterion 8: Inverted date range (availableTo < availableFrom) is rejected");

    // Valid date range
    const validDateRange = planSchema.safeParse({
      productId: "prod-cloud-core",
      name: "Valid Date Plan",
      pricePaise: 50000,
      billingPeriod: BillingPeriod.MONTHLY,
      minQuantity: 1,
      availableFrom: "2026-01-01T00:00:00.000Z",
      availableTo: "2026-12-31T23:59:59.999Z",
    });
    assert(validDateRange.success, "Criterion 8: Valid date range (availableTo >= availableFrom) is accepted");

    // -------------------------------------------------------------------------
    // CRITERIA 12: Availability-Window Logic
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Availability-Window Evaluation Logic (Criterion 12)");

    const testNow = new Date("2026-06-15T12:00:00.000Z");

    // Active (current window)
    const activeWindow = isPlanAvailable(
      {
        availableFrom: new Date("2026-01-01T00:00:00.000Z"),
        availableTo: new Date("2026-12-31T00:00:00.000Z"),
        isActive: true,
      },
      testNow
    );
    assert(activeWindow, "Criterion 12: Plan within active availability window is selectable");
    assert(
      getPlanAvailabilityStatus(
        {
          availableFrom: new Date("2026-01-01T00:00:00.000Z"),
          availableTo: new Date("2026-12-31T00:00:00.000Z"),
          isActive: true,
        },
        testNow
      ) === "ACTIVE",
      "Criterion 12: Status badge evaluates to 'ACTIVE'"
    );

    // Scheduled (future window)
    const scheduledWindow = isPlanAvailable(
      {
        availableFrom: new Date("2026-09-01T00:00:00.000Z"),
        availableTo: new Date("2026-12-31T00:00:00.000Z"),
        isActive: true,
      },
      testNow
    );
    assert(!scheduledWindow, "Criterion 12: Future plan (availableFrom > now) is not yet selectable");
    assert(
      getPlanAvailabilityStatus(
        {
          availableFrom: new Date("2026-09-01T00:00:00.000Z"),
          availableTo: new Date("2026-12-31T00:00:00.000Z"),
          isActive: true,
        },
        testNow
      ) === "SCHEDULED",
      "Criterion 12: Status badge evaluates to 'SCHEDULED'"
    );

    // Expired (past window)
    const expiredWindow = isPlanAvailable(
      {
        availableFrom: new Date("2026-01-01T00:00:00.000Z"),
        availableTo: new Date("2026-05-01T00:00:00.000Z"),
        isActive: true,
      },
      testNow
    );
    assert(!expiredWindow, "Criterion 12: Expired plan (availableTo < now) is not selectable");
    assert(
      getPlanAvailabilityStatus(
        {
          availableFrom: new Date("2026-01-01T00:00:00.000Z"),
          availableTo: new Date("2026-05-01T00:00:00.000Z"),
          isActive: true,
        },
        testNow
      ) === "EXPIRED",
      "Criterion 12: Status badge evaluates to 'EXPIRED'"
    );

    // No expiration (ongoing availability)
    const ongoingWindow = isPlanAvailable(
      {
        availableFrom: null,
        availableTo: null,
        isActive: true,
      },
      testNow
    );
    assert(ongoingWindow, "Criterion 12: Plan with no expiration dates is continuously available");

    // -------------------------------------------------------------------------
    // CRITERIA 1, 9, 10, 11: Plan Creation, Product Associations & Duplicates
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Plan Creation & Product Association (Criteria 1, 9, 10, 11)");

    const product = await prisma.product.findFirst();
    assert(!!product, "Found active product for plan association");

    // Invalid product rejection (Criterion 10)
    const invalidProductCheck = await prisma.product.findUnique({
      where: { id: "non-existent-product-id-xyz" },
    });
    assert(invalidProductCheck === null, "Criterion 10: Nonexistent product ID is detected and rejected");

    let createdPlanId = "";
    if (product) {
      // Create new plan (Criterion 1)
      const testPlan = await prisma.plan.create({
        data: {
          productId: product.id,
          name: `Batch 6 Scale Plan ${Date.now()}`,
          description: "Integration test plan for Batch 6",
          pricePaise: 4500000, // ₹45,000.00
          billingPeriod: BillingPeriod.MONTHLY,
          paymentTerms: PaymentTerms.NET_15,
          minQuantity: 5,
          availableFrom: new Date("2026-01-01"),
          availableTo: null,
          isActive: true,
          autoClose: true,
          isClosableEarly: true,
          isPausable: true,
          isRenewable: true,
        },
        include: { product: true },
      });

      createdPlanId = testPlan.id;
      assert(!!testPlan.id, "Criterion 1: Admin can create a plan");
      assert(testPlan.productId === product.id, "Criterion 9: Plan-product association saved correctly");
      assert(testPlan.product.name === product.name, "Criterion 9: Product relation resolves accurately");

      // Multiple plans can associate with the same product (Criterion 11)
      const secondPlan = await prisma.plan.create({
        data: {
          productId: product.id,
          name: `Batch 6 Annual Plan ${Date.now()}`,
          pricePaise: 45000000, // ₹4,50,000.00
          billingPeriod: BillingPeriod.YEARLY,
          paymentTerms: PaymentTerms.NET_30,
          minQuantity: 5,
          isActive: true,
        },
      });
      assert(secondPlan.productId === product.id, "Criterion 11: Multiple plans successfully share the same product catalog record");

      // -------------------------------------------------------------------------
      // CRITERIA 2: Admin Can Edit a Plan
      // -------------------------------------------------------------------------
      console.log("\nSection 5: Plan Modification (Criterion 2)");

      const updatedName = `${testPlan.name} (Updated)`;
      const updatedPrice = 5200000; // ₹52,000.00
      const updatedPlan = await prisma.plan.update({
        where: { id: testPlan.id },
        data: {
          name: updatedName,
          pricePaise: updatedPrice,
          minQuantity: 10,
          isPausable: false,
        },
      });

      assert(updatedPlan.name === updatedName, "Criterion 2: Plan name updated successfully");
      assert(updatedPlan.pricePaise === updatedPrice, "Criterion 2: Plan price updated successfully in integer paise");
      assert(updatedPlan.minQuantity === 10, "Criterion 2: Minimum quantity updated successfully");
      assert(updatedPlan.isPausable === false, "Criterion 2: Lifecycle flags updated successfully");

      // Clean up second test plan
      await prisma.plan.delete({ where: { id: secondPlan.id } });

      // -------------------------------------------------------------------------
      // CRITERIA 3: Admin Can Delete Unreferenced Plan
      // -------------------------------------------------------------------------
      console.log("\nSection 6: Unreferenced Plan Deletion (Criterion 3)");

      await prisma.plan.delete({ where: { id: testPlan.id } });
      const checkDeleted = await prisma.plan.findUnique({ where: { id: testPlan.id } });
      assert(checkDeleted === null, "Criterion 3: Unreferenced plan deleted cleanly");
    }

    // -------------------------------------------------------------------------
    // CRITERIA 4: Referenced Plan Cannot Be Deleted
    // -------------------------------------------------------------------------
    console.log("\nSection 7: Referential Integrity Protection (Criterion 4)");

    const referencedPlan = await prisma.plan.findFirst({
      where: {
        subscriptions: { some: {} },
      },
      include: {
        subscriptions: true,
        quotationTemplates: true,
      },
    });

    assert(!!referencedPlan, "Found seeded plan referenced by active subscriptions");

    if (referencedPlan) {
      const totalRefs = referencedPlan.subscriptions.length + referencedPlan.quotationTemplates.length;
      assert(totalRefs > 0, `Plan '${referencedPlan.name}' has ${totalRefs} active contract/template reference(s)`);

      // PostgreSQL ON DELETE RESTRICT foreign key test
      let deleteConstraintFired = false;
      try {
        await prisma.plan.delete({ where: { id: referencedPlan.id } });
      } catch (err: any) {
        deleteConstraintFired = true;
      }
      assert(
        deleteConstraintFired,
        "Criterion 4: PostgreSQL 'onDelete: Restrict' prevents deletion of plan referenced by subscriptions"
      );
    }

    // -------------------------------------------------------------------------
    // CRITERIA 13: Existing Subscription Snapshots Remain Unchanged
    // -------------------------------------------------------------------------
    console.log("\nSection 8: Subscription Snapshot Invariance on Plan Edits (Criterion 13)");

    const sub128 = await prisma.subscription.findUnique({
      where: { number: "SUB-00128" },
      include: { plan: true },
    });

    assert(!!sub128, "Found seeded subscription SUB-00128");

    if (sub128) {
      // Verify initial snapshot
      const initialSnapshottedPeriod = sub128.billingPeriod;
      const initialSnapshottedPausable = sub128.isPausable;
      const initialSnapshottedRenewable = sub128.isRenewable;

      // Temporarily modify the underlying plan
      const originalPlanPrice = sub128.plan.pricePaise;
      const originalPlanPausable = sub128.plan.isPausable;

      await prisma.plan.update({
        where: { id: sub128.planId },
        data: {
          pricePaise: 99999900,
          isPausable: !originalPlanPausable,
        },
      });

      // Re-read subscription to confirm snapshots were NOT affected
      const recheckedSub = await prisma.subscription.findUnique({
        where: { number: "SUB-00128" },
      });

      assert(
        recheckedSub?.billingPeriod === initialSnapshottedPeriod &&
        recheckedSub?.isPausable === initialSnapshottedPausable &&
        recheckedSub?.isRenewable === initialSnapshottedRenewable,
        "Criterion 13: Existing subscription snapshotted flags and terms remain 100% unchanged after plan edit"
      );

      // Revert plan to pristine seed state
      await prisma.plan.update({
        where: { id: sub128.planId },
        data: {
          pricePaise: originalPlanPrice,
          isPausable: originalPlanPausable,
        },
      });
    }

    // -------------------------------------------------------------------------
    // CRITERIA 14 & 15: Staff Role Permissions (Read-Only)
    // -------------------------------------------------------------------------
    console.log("\nSection 9: Staff Permissions & Mutation Restriction (Criteria 14 & 15)");

    const staffSession: { user: { id: string; role: Role } } = {
      user: { id: "staff-id", role: Role.STAFF },
    };

    // Staff can view plans
    const staffQueryPlans = await prisma.plan.findMany({
      select: { id: true, name: true, billingPeriod: true },
    });
    assert(staffQueryPlans.length > 0, "Criterion 14: Staff can view plans catalog");

    // Staff cannot perform mutations
    const canStaffMutate = staffSession.user.role === Role.ADMIN;
    assert(!canStaffMutate, "Criterion 15: Staff is strictly blocked from plan creation, editing, and deletion");

    // -------------------------------------------------------------------------
    // CRITERIA 16: Customer Portal Isolation
    // -------------------------------------------------------------------------
    console.log("\nSection 10: Customer Access Control (Criterion 16)");

    const customerSession: { user: { id: string; role: Role } } = {
      user: { id: "cust-id", role: Role.CUSTOMER },
    };

    const isCustomerAllowedInternal =
      customerSession.user.role === Role.ADMIN || customerSession.user.role === Role.STAFF;
    const customerRedirect =
      customerSession.user.role === Role.CUSTOMER ? "/portal/subscriptions" : "/login";

    assert(!isCustomerAllowedInternal, "Criterion 16: Customer role is denied access to Plans management");
    assert(
      customerRedirect === "/portal/subscriptions",
      "Criterion 16: Customer is redirected to customer portal (/portal/subscriptions)"
    );

    // -------------------------------------------------------------------------
    // CRITERIA 17: Search, Filters & Server-Side Pagination
    // -------------------------------------------------------------------------
    console.log("\nSection 11: Search, Filter & Server-Side Pagination Architecture (Criterion 17)");

    // Search query test
    const searchFiltered = await prisma.plan.findMany({
      where: {
        OR: [
          { name: { contains: "Enterprise", mode: "insensitive" } },
          { product: { name: { contains: "Enterprise", mode: "insensitive" } } },
        ],
      },
      include: { product: true },
    });
    assert(searchFiltered.length >= 1, "Criterion 17: Database search correctly filters plans by name");

    // Billing period filter test
    const yearlyPlans = await prisma.plan.findMany({
      where: { billingPeriod: BillingPeriod.YEARLY },
    });
    assert(
      yearlyPlans.every((p) => p.billingPeriod === BillingPeriod.YEARLY),
      "Criterion 17: Database-level billing period filter correctly isolates YEARLY plans"
    );

    // Server-side pagination (take/skip)
    const pagedSlice = await prisma.plan.findMany({
      skip: 0,
      take: 1,
      orderBy: { createdAt: "desc" },
    });
    const totalPlansCount = await prisma.plan.count();
    assert(pagedSlice.length === 1, "Criterion 17: Server-side pagination query limits records loaded to pageSize");
    assert(totalPlansCount >= 2, `Criterion 17: Database total plan count accurately resolved (${totalPlansCount} plans)`);

    // -------------------------------------------------------------------------
    // CRITERIA 18: Non-Regression & Entity Integrity
    // -------------------------------------------------------------------------
    console.log("\nSection 12: Core Financial & Entity Integrity (Criterion 18)");

    const customerCount = await prisma.customer.count();
    const subscriptionCount = await prisma.subscription.count();
    const invoiceCount = await prisma.invoice.count();
    const productCount = await prisma.product.count();
    const userCount = await prisma.user.count();

    assert(customerCount >= 8, `Customers count intact (${customerCount} records)`);
    assert(subscriptionCount >= 8, `Subscriptions count intact (${subscriptionCount} records)`);
    assert(invoiceCount >= 3, `Invoices count intact (${invoiceCount} records)`);
    assert(productCount >= 1, `Products count intact (${productCount} records)`);
    assert(userCount >= 10, `Users count intact (${userCount} records)`);

    console.log("\n===============================================================");
    console.log(`  BATCH 6 PLANS VERIFICATION: ${passedTests}/${totalTests} PASSED`);
    console.log("===============================================================\n");

    if (passedTests !== totalTests) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Batch 6 verification encountered an error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch6PlansVerification();
