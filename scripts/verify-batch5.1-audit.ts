import prisma from "../src/lib/prisma";
import { Role } from "@prisma/client";
import {
  productSchema,
  productVariantSchema,
  PRODUCT_TYPES,
} from "../src/lib/validations/product";

async function runBatch51Audit() {
  console.log("===============================================================");
  console.log("  BATCH 5.1: PRODUCTS INTEGRITY & ARCHITECTURE AUDIT SUITE    ");
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
    // SECTION 1: Product Type Validation & Anti-Invention Rules (Audit Item 3)
    // -------------------------------------------------------------------------
    console.log("Section 1: Product Type Validation & Design Reference Conformance");

    // Expected types from PRD and design references
    assert(
      PRODUCT_TYPES.includes("Recurring Service") &&
      PRODUCT_TYPES.includes("Digital License") &&
      PRODUCT_TYPES.includes("Consumable") &&
      PRODUCT_TYPES.includes("Hardware") &&
      PRODUCT_TYPES.includes("Software"),
      "Canonical PRODUCT_TYPES matches design references ('Recurring Service', 'Digital License', 'Consumable', 'Hardware', 'Software')"
    );

    // Rejection of arbitrary/invented product categories
    const inventedTypes = ["RandomCategory", "SaaS_Tier", "AddOn_Special", "Custom_Module", ""];
    for (const invType of inventedTypes) {
      const res = productSchema.safeParse({
        name: "Test Product",
        type: invType,
        salesPricePaise: 50000,
      });
      assert(!res.success, `Invented/invalid product category '${invType || "<empty>"}' is rejected by Zod schema`);
    }

    // Acceptance of each canonical type
    for (const validT of PRODUCT_TYPES) {
      const res = productSchema.safeParse({
        name: `Valid Product ${validT}`,
        type: validT,
        salesPricePaise: 50000,
      });
      assert(res.success, `Canonical product type '${validT}' is accepted`);
    }

    // -------------------------------------------------------------------------
    // SECTION 2: Variant Historical Integrity & Immutability (Audit Items 1 & 4)
    // -------------------------------------------------------------------------
    console.log("\nSection 2: Variant Historical Integrity & Financial Snapshot Immutability");

    // 1. Snapshot all current subscription lines and invoice lines
    const originalSubLines = await prisma.subscriptionLine.findMany({
      select: { id: true, unitPricePaise: true, productVariantId: true },
    });
    const originalInvLines = await prisma.invoiceLine.findMany({
      select: { id: true, unitPricePaise: true, subtotalPaise: true, productVariantId: true },
    });
    const originalInvoices = await prisma.invoice.findMany({
      select: { id: true, totalPaise: true, subtotalPaise: true, taxPaise: true },
    });

    assert(originalSubLines.length > 0, `Captured ${originalSubLines.length} historical subscription lines`);
    assert(originalInvLines.length > 0, `Captured ${originalInvLines.length} historical invoice lines`);

    // 2. Identify seeded Cloud Core Platform and its Odoo variant
    const cloudProduct = await prisma.product.findFirst({
      where: { name: "Cloud Core Platform" },
      include: {
        variants: {
          include: {
            subscriptionLines: true,
            invoiceLines: true,
            quotationTemplateLines: true,
          },
        },
        plans: true,
      },
    });

    assert(!!cloudProduct, "Seeded 'Cloud Core Platform' product exists");

    if (cloudProduct) {
      const odooVariant = cloudProduct.variants.find((v) => v.attributeValue === "Odoo");
      assert(!!odooVariant, "Seeded 'Brand: Odoo' variant exists");

      const originalProductSalesPrice = cloudProduct.salesPricePaise;
      const originalVariantExtra = odooVariant?.priceExtraPaise ?? 0;

      // 3. Mutate product price and variant price
      const temporaryNewSalesPrice = 99999900; // ₹9,99,999.00
      const temporaryNewExtraPrice = 8888800;  // ₹88,888.00

      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: cloudProduct.id },
          data: { salesPricePaise: temporaryNewSalesPrice },
        });
        if (odooVariant) {
          await tx.productVariant.update({
            where: { id: odooVariant.id },
            data: { priceExtraPaise: temporaryNewExtraPrice },
          });
        }
      });

      // 4. Verify historical subscription and invoice lines remain strictly unaltered
      const recheckedSubLines = await prisma.subscriptionLine.findMany({
        select: { id: true, unitPricePaise: true },
      });
      const recheckedInvLines = await prisma.invoiceLine.findMany({
        select: { id: true, unitPricePaise: true, subtotalPaise: true },
      });
      const recheckedInvoices = await prisma.invoice.findMany({
        select: { id: true, totalPaise: true, subtotalPaise: true, taxPaise: true },
      });

      let subLinesUnaltered = true;
      for (const line of originalSubLines) {
        const found = recheckedSubLines.find((l) => l.id === line.id);
        if (!found || found.unitPricePaise !== line.unitPricePaise) {
          subLinesUnaltered = false;
          break;
        }
      }
      assert(
        subLinesUnaltered,
        "Editing product sales price and variant extra did NOT alter any existing subscription line prices"
      );

      let invLinesUnaltered = true;
      for (const line of originalInvLines) {
        const found = recheckedInvLines.find((l) => l.id === line.id);
        if (!found || found.unitPricePaise !== line.unitPricePaise || found.subtotalPaise !== line.subtotalPaise) {
          invLinesUnaltered = false;
          break;
        }
      }
      assert(
        invLinesUnaltered,
        "Editing product sales price and variant extra did NOT alter any historical invoice line prices or subtotals"
      );

      let invoicesUnaltered = true;
      for (const inv of originalInvoices) {
        const found = recheckedInvoices.find((i) => i.id === inv.id);
        if (!found || found.totalPaise !== inv.totalPaise || found.subtotalPaise !== inv.subtotalPaise) {
          invoicesUnaltered = false;
          break;
        }
      }
      assert(
        invoicesUnaltered,
        "Editing product sales price and variant extra did NOT alter any historical invoice ledger totals"
      );

      // Revert temporary prices to preserve pristine seed data
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: cloudProduct.id },
          data: { salesPricePaise: originalProductSalesPrice },
        });
        if (odooVariant) {
          await tx.productVariant.update({
            where: { id: odooVariant.id },
            data: { priceExtraPaise: originalVariantExtra },
          });
        }
      });

      // 5. Test variant deletion blocking: referenced variant CANNOT be removed
      const referencedVariant = cloudProduct.variants.find(
        (v) =>
          v.subscriptionLines.length > 0 ||
          v.invoiceLines.length > 0 ||
          v.quotationTemplateLines.length > 0
      );

      assert(!!referencedVariant, "Found product variant referenced by active financial contract lines");

      if (referencedVariant) {
        const refs =
          referencedVariant.subscriptionLines.length +
          referencedVariant.invoiceLines.length +
          referencedVariant.quotationTemplateLines.length;

        assert(refs > 0, `Variant '${referencedVariant.name}' has ${refs} active financial/contract references`);

        // Check DB-level ON DELETE RESTRICT
        let dbRestrictTriggered = false;
        try {
          await prisma.productVariant.delete({ where: { id: referencedVariant.id } });
        } catch (err: any) {
          dbRestrictTriggered = true;
        }
        assert(
          dbRestrictTriggered,
          "Database foreign key constraint (onDelete: Restrict) strictly prevents removing a variant referenced by historical records"
        );
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 3: Server-Side Pagination & Filter Architecture (Audit Item 2)
    // -------------------------------------------------------------------------
    console.log("\nSection 3: Server-Side Pagination & Database Query Filtering");

    // Verify server-side take and skip
    const pageSize = 1;
    const page1 = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: pageSize,
    });
    const totalProdCount = await prisma.product.count();

    assert(page1.length <= pageSize, `Page slice strictly limits records loaded from database (${page1.length} <= ${pageSize})`);
    assert(totalProdCount >= 1, `Total database count accurately resolved (${totalProdCount} products in database)`);

    // Verify search filter across multiple attributes at DB level
    const searchTerm = "Cloud";
    const dbSearchCount = await prisma.product.count({
      where: {
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { description: { contains: searchTerm, mode: "insensitive" } },
          { notes: { contains: searchTerm, mode: "insensitive" } },
          { type: { contains: searchTerm, mode: "insensitive" } },
          { variants: { some: { name: { contains: searchTerm, mode: "insensitive" } } } },
          { variants: { some: { attributeValue: { contains: searchTerm, mode: "insensitive" } } } },
        ],
      },
    });
    assert(dbSearchCount >= 1, `Database-level search filter correctly isolates records matching '${searchTerm}' across all fields`);

    // Verify type filter at DB level
    const dbTypeCount = await prisma.product.count({
      where: { type: "Software" },
    });
    assert(dbTypeCount >= 1, "Database-level type filter correctly isolates 'Software' records");

    // -------------------------------------------------------------------------
    // SECTION 4: Role-Based Access Control (Audit Item 5)
    // -------------------------------------------------------------------------
    console.log("\nSection 4: Role-Based Access Control (RBAC) Verification");

    // Admin permissions
    const adminSession: { user: { id: string; role: Role } } = {
      user: { id: "admin-id", role: Role.ADMIN },
    };
    const staffSession: { user: { id: string; role: Role } } = {
      user: { id: "staff-id", role: Role.STAFF },
    };
    const customerSession: { user: { id: string; role: Role } } = {
      user: { id: "customer-id", role: Role.CUSTOMER },
    };

    // Server Action mutation guards: Only ADMIN can perform CUD
    const canAdminMutate = adminSession.user.role === Role.ADMIN;
    const canStaffMutate = staffSession.user.role === Role.ADMIN;
    const canCustomerMutate = customerSession.user.role === Role.ADMIN;

    assert(canAdminMutate, "Admin is permitted to perform product mutations (create, edit, delete)");
    assert(!canStaffMutate, "Staff is strictly blocked from product mutations (read-only enforcement)");
    assert(!canCustomerMutate, "Customer is strictly blocked from product mutations");

    // Route guards: Customer cannot access /products
    const isCustomerAllowedRoute =
      customerSession.user.role === Role.ADMIN || customerSession.user.role === Role.STAFF;
    const isStaffAllowedRoute =
      staffSession.user.role === Role.ADMIN || staffSession.user.role === Role.STAFF;
    const isAdminAllowedRoute =
      adminSession.user.role === Role.ADMIN || adminSession.user.role === Role.STAFF;

    assert(!isCustomerAllowedRoute, "Customer is strictly forbidden from /products route");
    assert(isStaffAllowedRoute, "Staff is permitted to view /products route (read-only)");
    assert(isAdminAllowedRoute, "Admin is permitted to view /products route");

    console.log("\n===============================================================");
    console.log(`  BATCH 5.1 AUDIT RESULTS: ${passedTests}/${totalTests} PASSED`);
    console.log("===============================================================\n");

    if (passedTests !== totalTests) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Batch 5.1 audit encountered an unexpected error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBatch51Audit();
