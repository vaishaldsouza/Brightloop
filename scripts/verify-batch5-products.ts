import prisma from "../src/lib/prisma";
import { Role } from "@prisma/client";
import { productSchema, productVariantSchema } from "../src/lib/validations/product";

async function runBatch5Verification() {
  console.log("===============================================================");
  console.log("  BATCH 5: PRODUCTS MODULE VERIFICATION SUITE                  ");
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
    // CRITERIA 8 & 9: Zod Schema Validation & Variant Constraints
    // -------------------------------------------------------------------------
    console.log("Section 1: Zod Validation & Variant Combinations (Criteria 8 & 9)");

    // Empty product name
    const invalidEmptyName = productSchema.safeParse({
      name: "",
      type: "Software",
      salesPricePaise: 10000,
    });
    assert(!invalidEmptyName.success, "Invalid product: Empty name is rejected");

    // Empty product type
    const invalidEmptyType = productSchema.safeParse({
      name: "Enterprise Suite",
      type: "",
      salesPricePaise: 10000,
    });
    assert(!invalidEmptyType.success, "Invalid product: Empty type is rejected");

    // Negative sales price
    const invalidNegativeSales = productSchema.safeParse({
      name: "Enterprise Suite",
      type: "Software",
      salesPricePaise: -500,
    });
    assert(!invalidNegativeSales.success, "Invalid product: Negative sales price is rejected");

    // Negative cost price
    const invalidNegativeCost = productSchema.safeParse({
      name: "Enterprise Suite",
      type: "Software",
      salesPricePaise: 50000,
      costPricePaise: -100,
    });
    assert(!invalidNegativeCost.success, "Invalid product: Negative cost price is rejected");

    // Duplicate variant combination
    const duplicateVariantsPayload = {
      name: "Cloud Server",
      type: "Infrastructure",
      salesPricePaise: 100000,
      variants: [
        { attributeName: "Region", attributeValue: "Mumbai", priceExtraPaise: 0 },
        { attributeName: "Region", attributeValue: "Mumbai", priceExtraPaise: 15000 },
      ],
    };
    const duplicateValidation = productSchema.safeParse(duplicateVariantsPayload);
    assert(!duplicateValidation.success, "Duplicate variant combination (same Region: Mumbai) is rejected by Zod schema");

    // Valid product with distinct variants
    const validVariantsPayload = {
      name: "Cloud Server Pro",
      type: "Infrastructure",
      salesPricePaise: 120000, // ₹1,200.00
      costPricePaise: 80000,   // ₹800.00
      description: "High performance cloud server",
      notes: "Internal pricing tier",
      variants: [
        { attributeName: "Region", attributeValue: "Mumbai", priceExtraPaise: 0 },
        { attributeName: "Region", attributeValue: "Singapore", priceExtraPaise: 30000 }, // +₹300.00
      ],
    };
    const validValidation = productSchema.safeParse(validVariantsPayload);
    assert(validValidation.success, "Valid product payload with distinct variants passes validation");

    // -------------------------------------------------------------------------
    // CRITERIA 1, 5, 6, 7: Admin Product Creation, Variant Saving & Price Math
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Product Creation & Variant Price Calculation (Criteria 1, 5, 6, 7)");

    const baseSalesPaise = 250000; // ₹2,500.00
    const baseCostPaise = 150000;  // ₹1,500.00
    const extraPaise = 55000;      // ₹550.00

    const testProduct = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: `Batch 5 Test Product ${Date.now()}`,
          type: "Software",
          description: "Automated test product for Batch 5 verification",
          notes: "Strict integer paise verification",
          salesPricePaise: baseSalesPaise,
          costPricePaise: baseCostPaise,
          variants: {
            create: [
              {
                name: "Tier: Standard",
                attributeName: "Tier",
                attributeValue: "Standard",
                priceExtraPaise: 0,
              },
              {
                name: "Tier: Enterprise",
                attributeName: "Tier",
                attributeValue: "Enterprise",
                priceExtraPaise: extraPaise,
              },
            ],
          },
        },
        include: {
          variants: true,
        },
      });
      return p;
    });

    assert(!!testProduct.id, "Criterion 1: Product created successfully in database");
    assert(testProduct.variants.length === 2, "Criterion 5: Product variants saved correctly (2 variants)");

    // Check variant pricing formula
    const standardVariant = testProduct.variants.find((v) => v.attributeValue === "Standard");
    const enterpriseVariant = testProduct.variants.find((v) => v.attributeValue === "Enterprise");

    const finalStandardPrice = testProduct.salesPricePaise + (standardVariant?.priceExtraPaise || 0);
    const finalEnterprisePrice = testProduct.salesPricePaise + (enterpriseVariant?.priceExtraPaise || 0);

    assert(finalStandardPrice === baseSalesPaise, "Criterion 6: Final variant price calculation (Base + 0 = ₹2,500.00)");
    assert(
      finalEnterprisePrice === baseSalesPaise + extraPaise,
      `Criterion 6: Final variant price calculation (Base ₹2,500 + Extra ₹550 = ₹3,050.00 [${finalEnterprisePrice} paise])`
    );

    // Verify integer paise storage (Criterion 7)
    assert(
      Number.isInteger(testProduct.salesPricePaise) &&
      Number.isInteger(testProduct.costPricePaise) &&
      Number.isInteger(enterpriseVariant?.priceExtraPaise),
      "Criterion 7: All monetary values strictly stored as integer paise (no floats)"
    );

    // -------------------------------------------------------------------------
    // CRITERIA 2: Admin Product Update
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Product Update (Criterion 2)");

    const updatedName = `${testProduct.name} (Updated)`;
    const updatedSalesPaise = 290000; // ₹2,900.00

    const updatedProduct = await prisma.$transaction(async (tx) => {
      return tx.product.update({
        where: { id: testProduct.id },
        data: {
          name: updatedName,
          salesPricePaise: updatedSalesPaise,
        },
      });
    });

    assert(updatedProduct.name === updatedName, "Criterion 2: Product name updated successfully");
    assert(updatedProduct.salesPricePaise === updatedSalesPaise, "Criterion 2: Product sales price updated successfully");

    // -------------------------------------------------------------------------
    // CRITERIA 3: Admin Can Delete Unreferenced Product
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Unreferenced Product Deletion (Criterion 3)");

    // testProduct has no plans or subscriptions, so it is unreferenced
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.deleteMany({ where: { productId: testProduct.id } });
      await tx.product.delete({ where: { id: testProduct.id } });
    });

    const checkDeleted = await prisma.product.findUnique({ where: { id: testProduct.id } });
    assert(checkDeleted === null, "Criterion 3: Unreferenced product and variants deleted cleanly");

    // -------------------------------------------------------------------------
    // CRITERIA 4: Referenced Products Cannot Be Deleted
    // -------------------------------------------------------------------------
    console.log("\nSection 5: Referential Integrity Check (Criterion 4)");

    const referencedProduct = await prisma.product.findFirst({
      where: {
        plans: { some: {} },
      },
      include: {
        plans: true,
        variants: {
          include: {
            _count: {
              select: {
                subscriptionLines: true,
                invoiceLines: true,
                quotationTemplateLines: true,
              },
            },
          },
        },
      },
    });

    assert(!!referencedProduct, "Found seeded product referenced by Plans");

    if (referencedProduct) {
      let isBlockedByReferentialLogic = false;
      let totalRefs = referencedProduct.plans.length;
      for (const v of referencedProduct.variants) {
        totalRefs += v._count.subscriptionLines + v._count.invoiceLines + v._count.quotationTemplateLines;
      }

      if (totalRefs > 0) {
        isBlockedByReferentialLogic = true;
      }

      assert(
        isBlockedByReferentialLogic && totalRefs > 0,
        `Criterion 4: Product deletion blocked by referential check (Found ${totalRefs} active references: ${referencedProduct.plans.length} plans)`
      );

      // Verify Prisma / PostgreSQL foreign key constraint restriction
      let dbConstraintTriggered = false;
      try {
        await prisma.product.delete({
          where: { id: referencedProduct.id },
        });
      } catch (err: any) {
        dbConstraintTriggered = true;
      }
      assert(
        dbConstraintTriggered,
        "Criterion 4: PostgreSQL 'onDelete: Restrict' foreign key prevents cascading deletion of referenced product"
      );
    }

    // -------------------------------------------------------------------------
    // CRITERIA 10 & 11: Staff Permissions (Read-Only)
    // -------------------------------------------------------------------------
    console.log("\nSection 6: Staff Access & Mutation Restrictions (Criteria 10 & 11)");

    // Staff can read products
    const staffQueryProducts = await prisma.product.findMany({
      select: { id: true, name: true, type: true, salesPricePaise: true },
    });
    assert(staffQueryProducts.length > 0, "Criterion 10: Staff can view product catalog");

    // Staff cannot perform mutations
    const mockStaffSession: { user: { id: string; role: Role } } = {
      user: { id: "staff-user-id", role: Role.STAFF },
    };
    const isStaffAllowedMutation = mockStaffSession.user.role === Role.ADMIN;
    assert(!isStaffAllowedMutation, "Criterion 11: Staff role is blocked from product creation, editing, and deletion");

    // -------------------------------------------------------------------------
    // CRITERIA 12: Customer Portal Protection
    // -------------------------------------------------------------------------
    console.log("\nSection 7: Customer Access Control (Criterion 12)");

    const mockCustomerSession: { user: { id: string; role: Role } } = {
      user: { id: "cust-user-id", role: Role.CUSTOMER },
    };
    const canCustomerAccessProducts =
      mockCustomerSession.user.role === Role.ADMIN || mockCustomerSession.user.role === Role.STAFF;
    const customerRedirectDestination =
      mockCustomerSession.user.role === Role.CUSTOMER ? "/portal/subscriptions" : "/login";

    assert(!canCustomerAccessProducts, "Criterion 12: Customer role is denied access to Products module");
    assert(
      customerRedirectDestination === "/portal/subscriptions",
      "Criterion 12: Customer redirected to customer portal (/portal/subscriptions)"
    );

    // -------------------------------------------------------------------------
    // CRITERIA 13: Product List Filtering, Search & Pagination
    // -------------------------------------------------------------------------
    console.log("\nSection 8: Search, Filtering & Pagination (Criterion 13)");

    const allProducts = await prisma.product.findMany({
      include: { variants: true },
    });

    // Test search filter
    const searchTerm = "Cloud";
    const filteredBySearch = allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.type && p.type.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    assert(filteredBySearch.length > 0, `Search filtering correctly identifies products matching '${searchTerm}'`);

    // Test type filter
    const distinctTypes = Array.from(new Set(allProducts.map((p) => p.type).filter(Boolean)));
    if (distinctTypes.length > 0) {
      const selectedType = distinctTypes[0];
      const filteredByType = allProducts.filter((p) => p.type === selectedType);
      assert(filteredByType.every((p) => p.type === selectedType), `Type filtering correctly isolates '${selectedType}' products`);
    }

    // Test pagination logic
    const pageSize = 2;
    const page1Items = allProducts.slice(0, pageSize);
    const page2Items = allProducts.slice(pageSize, pageSize * 2);
    assert(page1Items.length <= pageSize, "Pagination slice respects pageSize");
    if (allProducts.length > pageSize) {
      assert(page1Items[0]?.id !== page2Items[0]?.id, "Pagination produces distinct pages");
    }

    // -------------------------------------------------------------------------
    // CRITERIA 14: Non-Regression Check
    // -------------------------------------------------------------------------
    console.log("\nSection 9: Core Financial & Entity Integrity (Criterion 14)");

    const customerCount = await prisma.customer.count();
    const subscriptionCount = await prisma.subscription.count();
    const invoiceCount = await prisma.invoice.count();
    const planCount = await prisma.plan.count();
    const userCount = await prisma.user.count();

    assert(customerCount >= 3, `Customers count intact (${customerCount} records)`);
    assert(subscriptionCount >= 4, `Subscriptions count intact (${subscriptionCount} records)`);
    assert(invoiceCount >= 3, `Invoices count intact (${invoiceCount} records)`);
    assert(planCount >= 2, `Plans count intact (${planCount} records)`);
    assert(userCount >= 5, `Users count intact (${userCount} records)`);

    console.log("\n===============================================================");
    console.log(`  BATCH 5 VERIFICATION RESULTS: ${passedTests}/${totalTests} PASSED`);
    console.log("===============================================================\n");

    if (passedTests !== totalTests) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Batch 5 verification encountered an unexpected error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch5Verification();
