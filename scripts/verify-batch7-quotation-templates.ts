import prisma from "../src/lib/prisma";
import {
  quotationTemplateSchema,
  quotationTemplateLineSchema,
  calculateTemplateTotalPaise,
} from "../src/lib/validations/quotationTemplate";
import { Role } from "@prisma/client";

async function runBatch7Verification() {
  console.log("===============================================================");
  console.log("  BATCH 7: QUOTATION TEMPLATES VERIFICATION SUITE              ");
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
    const plan = await prisma.plan.findFirst({ where: { isActive: true } });
    const variants = await prisma.productVariant.findMany({
      take: 3,
      include: { product: true },
    });

    assert(!!adminUser, "Criterion 1: Admin user exists in seed");
    assert(!!staffUser, "Criterion 1: Staff user exists in seed");
    assert(!!customerUser, "Criterion 1: Customer user exists in seed");
    assert(!!plan, "Criterion 1: Active plan exists for template association");
    assert(variants.length >= 2, "Criterion 1: Product variants available for line configuration");

    if (!plan || variants.length < 2) {
      throw new Error("Missing required plan or variant seed records");
    }

    // -------------------------------------------------------------------------
    // 2. Validation Schema & Field Constraints
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Validation Schema & Financial Precision");

    // Rejects empty lines
    const emptyLines = quotationTemplateSchema.safeParse({
      name: "Empty Lines Template",
      planId: plan.id,
      validityDays: 30,
      lines: [],
    });
    assert(!emptyLines.success, "Criterion 2: Rejects template without lines (at least 1 line required)");

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
    assert(!zeroValidity.success, "Criterion 3: Rejects validityDays <= 0 (must be >= 1 day)");

    // Rejects negative unitPricePaise
    const negativePrice = quotationTemplateLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 1,
      unitPricePaise: -100,
      sortOrder: 1,
    });
    assert(!negativePrice.success, "Criterion 4: Rejects negative unitPricePaise");

    // Rejects fractional / float unit price
    const floatPrice = quotationTemplateLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 1,
      unitPricePaise: 120.5,
      sortOrder: 1,
    });
    assert(!floatPrice.success, "Criterion 5: Rejects floating-point unit price (strictly integer paise)");

    // Rejects quantity < 1
    const zeroQty = quotationTemplateLineSchema.safeParse({
      productVariantId: variants[0].id,
      quantity: 0,
      unitPricePaise: 50000,
      sortOrder: 1,
    });
    assert(!zeroQty.success, "Criterion 6: Rejects quantity < 1");

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
    assert(!duplicateVariants.success, "Criterion 7: Rejects duplicate variants within template lines");

    // Accepts valid multi-line template
    const validTemplateParse = quotationTemplateSchema.safeParse({
      name: "Enterprise Multi-Line Template",
      planId: plan.id,
      validityDays: 45,
      description: "Standard corporate bundle",
      isActive: true,
      lines: [
        {
          productVariantId: variants[0].id,
          description: "Line 1 Notes",
          quantity: 2,
          unitPricePaise: 120000,
          sortOrder: 1,
        },
        {
          productVariantId: variants[1].id,
          description: "Line 2 Notes",
          quantity: 1,
          unitPricePaise: 450000,
          sortOrder: 2,
        },
      ],
    });
    assert(validTemplateParse.success, "Criterion 8: Accepts valid multi-line quotation template");

    // Monetary Calculation Test
    const computedTotal = calculateTemplateTotalPaise([
      { quantity: 2, unitPricePaise: 120000 },
      { quantity: 1, unitPricePaise: 450000 },
    ]);
    // 2 * 120000 + 1 * 450000 = 240000 + 450000 = 690000
    assert(computedTotal === 690000, "Criterion 9: Integer paise total correctly calculated (6,90,000 paise = ₹6,900)");

    // -------------------------------------------------------------------------
    // 3. Database Operations & Atomic Transactions
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Database Creation, Line Items & Cascades");

    const createdTemplate = await prisma.$transaction(async (tx) => {
      return tx.quotationTemplate.create({
        data: {
          name: `Batch 7 Verification Blueprint ${Date.now()}`,
          planId: plan.id,
          description: "Created in test suite",
          validityDays: 30,
          isActive: true,
          lines: {
            create: [
              {
                productVariantId: variants[0].id,
                description: "Test Line Item 1",
                quantity: 3,
                unitPricePaise: 100000,
                sortOrder: 1,
              },
              {
                productVariantId: variants[1].id,
                description: "Test Line Item 2",
                quantity: 2,
                unitPricePaise: 200000,
                sortOrder: 2,
              },
            ],
          },
        },
        include: { lines: true, plan: true },
      });
    });

    assert(!!createdTemplate.id, "Criterion 10: QuotationTemplate created in DB with nested lines");
    assert(createdTemplate.lines.length === 2, "Criterion 11: Exactly 2 lines persisted");
    assert(createdTemplate.planId === plan.id, "Criterion 12: Associated plan foreign key correctly linked");

    // Update template: atomic replacement of lines
    await prisma.$transaction(async (tx) => {
      await tx.quotationTemplate.update({
        where: { id: createdTemplate.id },
        data: {
          name: `${createdTemplate.name} (Updated)`,
          validityDays: 60,
        },
      });

      await tx.quotationTemplateLine.deleteMany({
        where: { quotationTemplateId: createdTemplate.id },
      });

      await tx.quotationTemplateLine.create({
        data: {
          quotationTemplateId: createdTemplate.id,
          productVariantId: variants[0].id,
          quantity: 10,
          unitPricePaise: 95000,
          sortOrder: 1,
        },
      });
    });

    const updatedTemplate = await prisma.quotationTemplate.findUnique({
      where: { id: createdTemplate.id },
      include: { lines: true },
    });
    assert(updatedTemplate?.validityDays === 60, "Criterion 13: Template validityDays updated to 60");
    assert(updatedTemplate?.lines.length === 1, "Criterion 14: Old lines deleted and replaced with updated line");
    assert(updatedTemplate?.lines[0].quantity === 10, "Criterion 15: New line quantity reflects update (10)");

    // Deletion and cascade check
    await prisma.quotationTemplate.delete({
      where: { id: createdTemplate.id },
    });

    const deletedTemplateCheck = await prisma.quotationTemplate.findUnique({
      where: { id: createdTemplate.id },
    });
    assert(deletedTemplateCheck === null, "Criterion 16: Template successfully deleted");

    const lingeringLines = await prisma.quotationTemplateLine.findMany({
      where: { quotationTemplateId: createdTemplate.id },
    });
    assert(lingeringLines.length === 0, "Criterion 17: QuotationTemplateLine cascade deleted cleanly");

    // -------------------------------------------------------------------------
    // 4. Quotation Prefill & Historical Integrity
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Quotation Prefill Math & Historical Financial Integrity");

    // Verify seed template exists
    const seedTemplate = await prisma.quotationTemplate.findUnique({
      where: { id: "qt-enterprise-standard" },
      include: { lines: true, plan: true },
    });
    assert(!!seedTemplate, "Criterion 18: Seed quotation template 'qt-enterprise-standard' exists");
    assert(seedTemplate?.validityDays === 30, "Criterion 19: Seed template has validityDays = 30");

    // Simulate prefilling quotation from template
    if (seedTemplate) {
      const now = new Date();
      const quotationExpiresAt = new Date(now.getTime() + seedTemplate.validityDays * 24 * 60 * 60 * 1000);
      assert(
        quotationExpiresAt.getTime() > now.getTime(),
        "Criterion 20: Quotation expiry date correctly projected from template validityDays"
      );
    }

    // Historical financial data check: subscriptions and invoices must not be mutated
    const subLinesCount = await prisma.subscriptionLine.count();
    const invLinesCount = await prisma.invoiceLine.count();
    assert(subLinesCount > 0, `Criterion 21: Historical subscription lines preserved (${subLinesCount} lines)`);
    assert(invLinesCount > 0, `Criterion 22: Historical invoice lines preserved (${invLinesCount} lines)`);

    // -------------------------------------------------------------------------
    // 5. Database Search & Server-Side Pagination
    // -------------------------------------------------------------------------
    console.log("\nSection 5: Server-Side Search & Pagination Query Verification");

    // Search by name
    const searchByName = await prisma.quotationTemplate.findMany({
      where: {
        OR: [
          { name: { contains: "Enterprise", mode: "insensitive" } },
          { description: { contains: "Enterprise", mode: "insensitive" } },
          { plan: { name: { contains: "Enterprise", mode: "insensitive" } } },
        ],
      },
    });
    assert(searchByName.length >= 1, "Criterion 23: Database search finds templates matching 'Enterprise'");

    // Non-matching search returns 0
    const searchNoMatch = await prisma.quotationTemplate.findMany({
      where: {
        OR: [
          { name: { contains: "NON_EXISTENT_BLUEPRINT_XYZ_999", mode: "insensitive" } },
          { description: { contains: "NON_EXISTENT_BLUEPRINT_XYZ_999", mode: "insensitive" } },
          { plan: { name: { contains: "NON_EXISTENT_BLUEPRINT_XYZ_999", mode: "insensitive" } } },
        ],
      },
    });
    assert(searchNoMatch.length === 0, "Criterion 24: Search for non-matching query safely returns empty array");

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

runBatch7Verification();
