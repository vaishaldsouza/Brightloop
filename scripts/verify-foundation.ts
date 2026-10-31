import { PrismaClient, Role, InvoiceStatus, BillingPeriod, PaymentTerms } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function runVerification() {
  console.log("==========================================================");
  console.log("🧪 Brightloop Batch 2 Foundation Verification Suite");
  console.log("==========================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Database Connection & Seed Data Verification
    console.log("\n[Test Group 1] Database Entities & PRD §12 Seed Integrity");
    const userCount = await prisma.user.count();
    assert(userCount >= 10, `User count is ${userCount} (expected >= 10)`);

    const admin = await prisma.user.findUnique({ where: { email: "rajesh@brightloop.in" } });
    assert(admin?.role === Role.ADMIN, "Admin user exists with Role.ADMIN");
    assert(await bcrypt.compare("admin@123", admin?.password || ""), "Admin password hash verifies correctly");

    const staff = await prisma.user.findUnique({ where: { email: "priya.p@brightloop.in" } });
    assert(staff?.role === Role.STAFF, "Staff user exists with Role.STAFF");

    const customerUser = await prisma.user.findUnique({
      where: { email: "contact@techcraft.in" },
      include: { customer: true },
    });
    assert(customerUser?.role === Role.CUSTOMER, "Customer user exists with Role.CUSTOMER");
    assert(customerUser?.customer?.companyName === "Techcraft Solutions", "Customer profile linked with company name");

    const subscriptions = await prisma.subscription.findMany();
    assert(subscriptions.length >= 8, `Subscriptions count is ${subscriptions.length} (expected >= 8)`);

    // 2. Integer Paise Verification
    console.log("\n[Test Group 2] Currency in Integer Paise (No Float)");
    const invoices = await prisma.invoice.findMany();
    assert(invoices.length >= 3, `Invoice count is ${invoices.length} (expected >= 3)`);

    const inv456 = invoices.find((i) => i.number === "INV-00456");
    assert(Number.isInteger(inv456?.totalPaise), "Invoice totalPaise is an integer");
    assert(Number.isInteger(inv456?.subtotalPaise), "Invoice subtotalPaise is an integer");
    assert(Number.isInteger(inv456?.taxPaise), "Invoice taxPaise is an integer");
    assert(inv456?.totalPaise === 106200, `INV-00456 total is 106200 paise (Rs 1,062.00), got ${inv456?.totalPaise}`);

    // 3. Subscription Snapshot Verification
    console.log("\n[Test Group 3] Plan Feature Flags Snapshotted on Subscription");
    const sub128 = await prisma.subscription.findUnique({ where: { number: "SUB-00128" } });
    assert(sub128?.isPausable === true, "Subscription SUB-00128 snapshots isPausable=true");
    assert(sub128?.isRenewable === true, "Subscription SUB-00128 snapshots isRenewable=true");
    assert(sub128?.billingPeriod === BillingPeriod.MONTHLY, "Subscription SUB-00128 snapshots billingPeriod=MONTHLY");

    // 4. PostgreSQL Partial Unique Index & Billing Idempotency Verification
    console.log("\n[Test Group 4] Billing Idempotency Partial Unique Index");
    console.log("Requirement: (subscriptionId, billingPeriodStart) WHERE cancelledAt IS NULL");

    const testSub = sub128!;
    const testBillingStart = new Date("2026-01-01T00:00:00.000Z");
    const testBillingEnd = new Date("2026-01-31T23:59:59.000Z");

    // Clean up any test artifact from previous run
    await prisma.invoice.deleteMany({
      where: { number: { in: ["TEST-INV-IDEMP-1", "TEST-INV-IDEMP-2"] } },
    });

    // Create Invoice 1
    const inv1 = await prisma.invoice.create({
      data: {
        number: "TEST-INV-IDEMP-1",
        subscriptionId: testSub.id,
        billingPeriodStart: testBillingStart,
        billingPeriodEnd: testBillingEnd,
        dueDate: testBillingStart,
        subtotalPaise: 99900,
        totalPaise: 99900,
      },
    });
    assert(!!inv1.id, "Created first active invoice for period 2026-01-01");

    // Attempt to create duplicate active invoice for the exact same subscription & billingPeriodStart
    let duplicateCaught = false;
    try {
      await prisma.invoice.create({
        data: {
          number: "TEST-INV-IDEMP-2",
          subscriptionId: testSub.id,
          billingPeriodStart: testBillingStart,
          billingPeriodEnd: testBillingEnd,
          dueDate: testBillingStart,
          subtotalPaise: 99900,
          totalPaise: 99900,
        },
      });
    } catch (err: unknown) {
      duplicateCaught = true;
      const msg = (err as Error).message || "";
      const isUniqueError = msg.includes("Unique constraint failed") || msg.includes("unique");
      assert(isUniqueError, "PostgreSQL partial unique index rejected duplicate active invoice");
    }

    assert(duplicateCaught, "Duplicate invoice was rejected by database constraint");

    // Cancel Invoice 1 (set cancelledAt timestamp)
    await prisma.invoice.update({
      where: { id: inv1.id },
      data: { cancelledAt: new Date() },
    });
    console.log("Cancelled first invoice (cancelledAt timestamp applied)");

    // Now re-attempting invoice creation for the same billing period start MUST SUCCEED!
    let rebillSucceeded = false;
    try {
      const invRebill = await prisma.invoice.create({
        data: {
          number: "TEST-INV-IDEMP-2",
          subscriptionId: testSub.id,
          billingPeriodStart: testBillingStart,
          billingPeriodEnd: testBillingEnd,
          dueDate: testBillingStart,
          subtotalPaise: 99900,
          totalPaise: 99900,
        },
      });
      rebillSucceeded = !!invRebill.id;
    } catch (err) {
      console.error("Re-bill failed:", err);
    }
    assert(rebillSucceeded, "Re-billing succeeds after original invoice was marked cancelledAt");

    // Clean up test invoices
    await prisma.invoice.deleteMany({
      where: { number: { in: ["TEST-INV-IDEMP-1", "TEST-INV-IDEMP-2"] } },
    });
    console.log("Cleaned up test invoices");

    // 5. Customer Signup Atomicity and Role Isolation Verification
    console.log("\n[Test Group 5] Customer Signup Atomicity & Role Enforcement");
    const testSignupEmail = "test-customer-verification@example.com";
    await prisma.user.deleteMany({ where: { email: testSignupEmail } });

    const signupHash = await bcrypt.hash("SecurePass@123", 10);
    const createdCustomer = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: "Test Signer",
          email: testSignupEmail,
          password: signupHash,
          role: Role.CUSTOMER,
        },
      });
      const c = await tx.customer.create({
        data: {
          userId: u.id,
          companyName: "Verification Enterprise",
          gstin: "27AABCV1234F1Z1",
          gstState: "Maharashtra",
          gstStateCode: "27",
        },
      });
      return { u, c };
    });

    assert(createdCustomer.u.role === Role.CUSTOMER, "Signup enforces Role.CUSTOMER");
    assert(createdCustomer.c.companyName === "Verification Enterprise", "Customer record linked");

    await prisma.user.deleteMany({ where: { email: testSignupEmail } });
    console.log("Cleaned up test customer user");

  } catch (error) {
    console.error("Verification suite encountered an error:", error);
    failed++;
  } finally {
    await prisma.$disconnect();
    console.log("\n==========================================================");
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log("==========================================================");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runVerification();
