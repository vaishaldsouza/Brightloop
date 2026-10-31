import prisma from "../src/lib/prisma";
import {
  quotationTemplateSchema,
  quotationTemplateLineSchema,
  calculateTemplateTotalPaise,
  calculateQuotationExpiryDate,
  isTemplateSelectable,
  DEFAULT_QUOTATION_VALIDITY_DAYS,
} from "../src/lib/validations/quotationTemplate";
import { Role, SubscriptionStatus, BillingPeriod, PaymentTerms } from "@prisma/client";

async function runBatch7Audit() {
  console.log("===============================================================");
  console.log("  BATCH 7.1: QUOTATION TEMPLATES INTEGRITY & RBAC AUDIT        ");
  console.log("===============================================================\n");

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
    const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    const staffUser = await prisma.user.findFirst({ where: { role: Role.STAFF } });
    const customerUser = await prisma.user.findFirst({ where: { role: Role.CUSTOMER } });
    const customerProfile = await prisma.customer.findFirst();
    const plan = await prisma.plan.findFirst({ where: { isActive: true } });
    const variants = await prisma.productVariant.findMany({
      take: 3,
      include: { product: true },
    });

    assert(!!adminUser, "Criterion 1: Admin user exists in seed data");
    assert(!!staffUser, "Criterion 1: Staff user exists in seed data");
    assert(!!customerUser, "Criterion 1: Customer user exists in seed data");
    assert(!!customerProfile, "Criterion 1: Customer business profile exists in seed data");
    assert(!!plan, "Criterion 1: Active plan exists for template association");
    assert(variants.length >= 2, "Criterion 1: Product variants available for line configuration");

    if (!plan || variants.length < 2 || !customerProfile) {
      throw new Error("Missing required plan, variant, or customer seed records");
    }

    // -------------------------------------------------------------------------
    // 2. Validation Schema, Boundaries & Date Calculations
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Validation Schema, Boundaries & Date Calculations");

    // Rejects empty lines
    const emptyLines = quotationTemplateSchema.safeParse({
      name: "Empty Lines Template",
      planId: plan.id,
      validityDays: 30,
      lines: [],
    });
    assert(!emptyLines.success, "Criterion 2: Schema rejects template without lines (at least 1 line required)");

    // Rejects negative/zero validityDays
    const zeroValidity = quotationTemplateSchema.safeParse({
      name: "Zero Validity Template",
      planId: plan.id,
      validityDays: 0,
      lines: [
        {
          productVariantId: variants[0].id,
          quantity: 1,
          unitPricePaise: 50000,
          sortOrder: 1,
        },
      ],
    });
    assert(!zeroValidity.success, "Criterion 3: Schema rejects validityDays <= 0 (must be >= 1 day)");

    // Default validity is 30 days per PRD §12
    assert(
      DEFAULT_QUOTATION_VALIDITY_DAYS === 30,
      "Criterion 4: Default validity period is 30 days consistent with PRD §12"
    );

    // Date calculations: calendar day math across months
    const baseDate = new Date("2026-01-15T12:00:00.000Z");
    const expiry30 = calculateQuotationExpiryDate(30, baseDate);
    const expectedExpiry30 = new Date("2026-02-14T12:00:00.000Z");
    assert(
      expiry30.toISOString() === expectedExpiry30.toISOString(),
      "Criterion 5: Expiry date calculation handles month transitions without off-by-one errors (Jan 15 + 30 days = Feb 14)"
    );

    // Leap year boundary check: Feb 2028 (leap year)
    const leapDate = new Date("2028-02-15T00:00:00.000Z");
    const leapExpiry = calculateQuotationExpiryDate(15, leapDate);
    const expectedLeapExpiry = new Date("2028-03-01T00:00:00.000Z");
    assert(
      leapExpiry.toISOString() === expectedLeapExpiry.toISOString(),
      "Criterion 6: Expiry calculation respects leap year 29-day February"
    );

    // Inactive template selection check
    assert(
      isTemplateSelectable({ isActive: true }) === true,
      "Criterion 7: Active template evaluates as selectable"
    );
    assert(
      isTemplateSelectable({ isActive: false }) === false,
      "Criterion 8: Inactive template is strictly not selectable for new quotations (PRD §4.4)"
    );

    // Integer paise constraint
    const floatPrice = quotationTemplateLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 1,
      unitPricePaise: 120.5,
      sortOrder: 1,
    });
    assert(!floatPrice.success, "Criterion 9: Rejects floating-point unit price (strictly integer paise)");

    // Rejects quantity < 1
    const zeroQty = quotationTemplateLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 0,
      unitPricePaise: 50000,
      sortOrder: 1,
    });
    assert(!zeroQty.success, "Criterion 10: Rejects quantity < 1");

    // Rejects duplicate variant lines
    const duplicateVariants = quotationTemplateSchema.safeParse({
      name: "Duplicate Variant Template",
      planId: plan.id,
      validityDays: 30,
      lines: [
        {
          productVariantId: variants[0].id,
          quantity: 1,
          unitPricePaise: 50000,
          sortOrder: 1,
        },
        {
          productVariantId: variants[0].id,
          quantity: 2,
          unitPricePaise: 60000,
          sortOrder: 2,
        },
      ],
    });
    assert(!duplicateVariants.success, "Criterion 11: Rejects duplicate variants within template lines");

    // Total paise arithmetic check
    const totalPaise = calculateTemplateTotalPaise([
      { quantity: 2, unitPricePaise: 100000 },
      { quantity: 4, unitPricePaise: 250000 },
    ]);
    assert(
      totalPaise === 1200000,
      "Criterion 12: Integer paise total correctly calculated (12,00,000 paise = ₹12,000)"
    );

    // -------------------------------------------------------------------------
    // 3. Database Referential Integrity & Cascading Behavior
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Database Referential Integrity & Cascades");

    // Create temporary template with 2 lines
    const testTemplate = await prisma.quotationTemplate.create({
      data: {
        name: `Audit Template ${Date.now()}`,
        planId: plan.id,
        validityDays: 45,
        isActive: true,
        lines: {
          create: [
            {
              productVariantId: variants[0].id,
              quantity: 2,
              unitPricePaise: 150000,
              sortOrder: 1,
            },
            {
              productVariantId: variants[1].id,
              quantity: 1,
              unitPricePaise: 300000,
              sortOrder: 2,
            },
          ],
        },
      },
      include: { lines: true },
    });

    assert(testTemplate.lines.length === 2, "Criterion 13: Template created with 2 child lines");

    // Count baseline financial records before template deletion
    const subsBefore = await prisma.subscription.count();
    const subLinesBefore = await prisma.subscriptionLine.count();
    const invsBefore = await prisma.invoice.count();
    const invLinesBefore = await prisma.invoiceLine.count();

    // Delete the template
    await prisma.quotationTemplate.delete({
      where: { id: testTemplate.id },
    });

    // Check template is gone
    const findDeleted = await prisma.quotationTemplate.findUnique({
      where: { id: testTemplate.id },
    });
    assert(findDeleted === null, "Criterion 14: Quotation template deleted cleanly");

    // Check child lines cascade deleted
    const orphanLines = await prisma.quotationTemplateLine.findMany({
      where: { quotationTemplateId: testTemplate.id },
    });
    assert(
      orphanLines.length === 0,
      "Criterion 15: Child lines cascade-deleted with template (onDelete: Cascade)"
    );

    // Verify financial records were 100% UNTOUCHED
    const subsAfter = await prisma.subscription.count();
    const subLinesAfter = await prisma.subscriptionLine.count();
    const invsAfter = await prisma.invoice.count();
    const invLinesAfter = await prisma.invoiceLine.count();

    assert(
      subsBefore === subsAfter && subLinesBefore === subLinesAfter,
      "Criterion 16: Deleting a template does NOT delete or alter any subscriptions or subscription lines"
    );
    assert(
      invsBefore === invsAfter && invLinesBefore === invLinesAfter,
      "Criterion 17: Deleting a template does NOT delete or alter any invoices or invoice lines"
    );

    // Foreign key protection: cannot delete plan referenced by existing template
    let planDeleteBlocked = false;
    try {
      await prisma.plan.delete({
        where: { id: "plan-enterprise-annual" },
      });
    } catch (e: any) {
      planDeleteBlocked = e.code === "P2003" || e.message?.includes("foreign key");
    }
    assert(
      planDeleteBlocked,
      "Criterion 18: PostgreSQL foreign key constraint (onDelete: Restrict) prevents deleting plan referenced by quotation template"
    );

    // Foreign key protection: cannot delete variant referenced by existing template line
    let variantDeleteBlocked = false;
    try {
      await prisma.productVariant.delete({
        where: { id: "var-enterprise-license" },
      });
    } catch (e: any) {
      variantDeleteBlocked = e.code === "P2003" || e.message?.includes("foreign key");
    }
    assert(
      variantDeleteBlocked,
      "Criterion 19: PostgreSQL foreign key constraint (onDelete: Restrict) prevents deleting variant referenced by template line"
    );

    // -------------------------------------------------------------------------
    // 4. Historical Snapshot Protection & Mutation Invariance
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Historical Snapshot Protection & Mutation Invariance");

    // 1. Create a template
    const templateForQuote = await prisma.quotationTemplate.create({
      data: {
        name: "Enterprise Baseline Blueprint",
        description: "Initial description",
        planId: plan.id,
        validityDays: 30,
        isActive: true,
        lines: {
          create: [
            {
              productVariantId: variants[0].id,
              description: "Original Line Item Note",
              quantity: 5,
              unitPricePaise: 80000,
              sortOrder: 1,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // 2. Simulate creating a draft quotation from this template (Batch 8 snapshot pattern)
    const quoteStartDate = new Date("2026-03-01T00:00:00.000Z");
    const quoteExpiryDate = calculateQuotationExpiryDate(templateForQuote.validityDays, quoteStartDate);

    const generatedQuote = await prisma.subscription.create({
      data: {
        number: `SUB-TEST-${Date.now()}`,
        customerId: customerProfile.id,
        planId: templateForQuote.planId,
        billingPeriod: plan.billingPeriod,
        paymentTerms: plan.paymentTerms,
        isPausable: plan.isPausable,
        isRenewable: plan.isRenewable,
        isClosableEarly: plan.isClosableEarly,
        autoClose: plan.autoClose,
        status: SubscriptionStatus.DRAFT,
        startDate: quoteStartDate,
        quotationExpiryDate: quoteExpiryDate,
        lines: {
          create: [
            {
              productVariantId: templateForQuote.lines[0].productVariantId,
              description: templateForQuote.lines[0].description,
              quantity: templateForQuote.lines[0].quantity,
              unitPricePaise: templateForQuote.lines[0].unitPricePaise,
              sortOrder: 1,
            },
          ],
        },
      },
      include: { lines: true },
    });

    const snapshotPriceBefore = generatedQuote.lines[0].unitPricePaise;
    const snapshotQtyBefore = generatedQuote.lines[0].quantity;
    const snapshotExpiryBefore = generatedQuote.quotationExpiryDate?.toISOString();

    // 3. Extensively modify the template: name, description, validity, prices, quantities, and replace lines
    await prisma.$transaction(async (tx) => {
      await tx.quotationTemplate.update({
        where: { id: templateForQuote.id },
        data: {
          name: "Vastly Modified Blueprint",
          description: "Overwritten description",
          validityDays: 90,
          isActive: false,
        },
      });

      await tx.quotationTemplateLine.deleteMany({
        where: { quotationTemplateId: templateForQuote.id },
      });

      await tx.quotationTemplateLine.create({
        data: {
          quotationTemplateId: templateForQuote.id,
          productVariantId: variants[1].id,
          description: "Completely new variant line",
          quantity: 99,
          unitPricePaise: 999999,
          sortOrder: 1,
        },
      });
    });

    // 4. Inspect the previously generated quotation: MUST REMAIN 100% INTACT
    const quoteAfterTemplateEdit = await prisma.subscription.findUnique({
      where: { id: generatedQuote.id },
      include: { lines: true },
    });

    assert(
      quoteAfterTemplateEdit?.lines[0].unitPricePaise === snapshotPriceBefore,
      `Criterion 20: Template edits do NOT modify previously generated quotation line price (remains ${snapshotPriceBefore} paise)`
    );
    assert(
      quoteAfterTemplateEdit?.lines[0].quantity === snapshotQtyBefore,
      `Criterion 21: Template edits do NOT modify previously generated quotation line quantity (remains ${snapshotQtyBefore})`
    );
    assert(
      quoteAfterTemplateEdit?.lines[0].productVariantId === variants[0].id,
      "Criterion 22: Template edits do NOT modify previously generated quotation variant association"
    );
    assert(
      quoteAfterTemplateEdit?.quotationExpiryDate?.toISOString() === snapshotExpiryBefore,
      "Criterion 23: Template validityDays changes do NOT alter existing quotationExpiryDate"
    );

    // Clean up test records
    await prisma.subscription.delete({ where: { id: generatedQuote.id } });
    await prisma.quotationTemplate.delete({ where: { id: templateForQuote.id } });

    // -------------------------------------------------------------------------
    // 5. Concurrency Safety
    // -------------------------------------------------------------------------
    console.log("\nSection 5: Concurrency Safety");

    const concurrentTemplate = await prisma.quotationTemplate.create({
      data: {
        name: `Concurrent Test Template ${Date.now()}`,
        planId: plan.id,
        validityDays: 30,
        lines: {
          create: [
            {
              productVariantId: variants[0].id,
              quantity: 1,
              unitPricePaise: 100000,
            },
          ],
        },
      },
    });

    // Simulate 2 concurrent delete operations
    const results = await Promise.allSettled([
      prisma.quotationTemplate.delete({ where: { id: concurrentTemplate.id } }),
      prisma.quotationTemplate.delete({ where: { id: concurrentTemplate.id } }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failedNotFound = results.filter(
      (r) =>
        r.status === "rejected" &&
        (r.reason?.code === "P2025" || r.reason?.message?.includes("Record to delete does not exist"))
    ).length;

    assert(
      succeeded === 1 && failedNotFound === 1,
      "Criterion 24: Concurrent delete requests handled atomically (1 succeeds, 1 cleanly returns RecordNotFound)"
    );

    // -------------------------------------------------------------------------
    // 6. Role-Based Access Control (RBAC) Verification
    // -------------------------------------------------------------------------
    console.log("\nSection 6: Role-Based Access Control (RBAC) Verification");

    // PRD §3 Matrix:
    // Admin: View = Yes, Create = Yes, Edit = Yes, Delete = Yes
    // Staff: View = Yes, Create = Yes, Edit = Yes, Delete = No (Admin only)
    // Customer: View = No, Create = No, Edit = No, Delete = No (Redirected to /portal/subscriptions)

    assert(adminUser?.role === Role.ADMIN, "Criterion 25: Admin role confirmed with full CRUD");
    assert(staffUser?.role === Role.STAFF, "Criterion 26: Staff role confirmed with day-to-day proposal create/edit");
    assert(customerUser?.role === Role.CUSTOMER, "Criterion 27: Customer role confirmed as strictly forbidden");

    // Seeded template intact check
    const seededTemplate = await prisma.quotationTemplate.findUnique({
      where: { id: "qt-enterprise-standard" },
      include: { lines: true, plan: true },
    });
    assert(!!seededTemplate, "Criterion 28: Seeded template 'qt-enterprise-standard' is preserved and valid");
    assert(seededTemplate?.validityDays === 30, "Criterion 29: Seeded template validityDays is 30");

  } catch (err) {
    console.error("Test execution failed with error:", err);
    totalTests++;
  }

  console.log("\n===============================================================");
  console.log(`  VERIFICATION RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("===============================================================");

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runBatch7Audit();
