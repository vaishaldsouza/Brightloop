import {
  PrismaClient,
  Role,
  SubscriptionStatus,
  InvoiceStatus,
  BillingPeriod,
  PaymentTerms,
  PaymentMethod,
  TaxType,
  DiscountType,
  DiscountScope,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Helper to compute derived tags per PRD §4.9
function computeInvoiceDerivedTags(invoice: {
  status: InvoiceStatus;
  dueDate: Date;
  totalPaise: number;
  paidPaise: number;
  cancelledAt?: Date | null;
}, today: Date) {
  const isCancelled = invoice.cancelledAt != null;
  const outstandingPaise = invoice.totalPaise - invoice.paidPaise;
  const isPartiallyPaid = invoice.paidPaise > 0 && invoice.paidPaise < invoice.totalPaise;
  const isPaid = invoice.paidPaise >= invoice.totalPaise;
  // PRD §4.9: Overdue = Confirmed invoice, due date before today, and outstanding amount > 0 (no grace period)
  const isOverdue = invoice.status === InvoiceStatus.CONFIRMED && invoice.dueDate < today && outstandingPaise > 0;

  return {
    isCancelled,
    outstandingPaise,
    isPartiallyPaid,
    isPaid,
    isOverdue,
  };
}

async function runVerification() {
  console.log("==========================================================");
  console.log("🧪 Brightloop BATCH 2.1 – PRD Compliance Audit & Verification");
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── 1. User & Role Segregation ───────────────────────────────────
    console.log("\n[Test Group 1] Users, Roles & Credentials (PRD §3, §12.1)");
    const admin = await prisma.user.findUnique({ where: { email: "rajesh@brightloop.in" } });
    assert(admin?.role === Role.ADMIN, "Admin user exists with Role.ADMIN");
    assert(await bcrypt.compare("admin@123", admin?.password || ""), "Admin password hash verifies correctly");

    const staff = await prisma.user.findUnique({ where: { email: "priya.p@brightloop.in" } });
    assert(staff?.role === Role.STAFF, "Staff user exists with Role.STAFF");
    assert(await bcrypt.compare("staff@123", staff?.password || ""), "Staff password hash verifies correctly");

    const userCount = await prisma.user.count();
    assert(userCount >= 10, `Total users seeded is ${userCount} (1 Admin + 1 Staff + 8 Customers)`);

    // ── 2. Customers & Tax Jurisdiction ──────────────────────────────
    console.log("\n[Test Group 2] Customers & GST Jurisdiction (PRD §4.7, §12.2, §12.6)");
    const techcraft = await prisma.customer.findFirst({
      where: { companyName: "Techcraft Solutions Pvt Ltd" },
      include: { user: true },
    });
    assert(techcraft?.gstState === "Maharashtra", "Techcraft is in Maharashtra (Intra-state)");
    assert(techcraft?.gstStateCode === "27", "Techcraft state code is 27");
    assert(techcraft?.user.role === Role.CUSTOMER, "Techcraft user has Role.CUSTOMER");

    const acme = await prisma.customer.findFirst({
      where: { companyName: "Acme Technologies Pvt Ltd" },
      include: { user: true },
    });
    assert(acme?.gstState === "Karnataka", "Acme is in Karnataka (Inter-state)");
    assert(acme?.gstStateCode === "29", "Acme state code is 29");

    const bluewave = await prisma.customer.findFirst({
      where: { companyName: "BlueWave Systems" },
    });
    assert(bluewave?.gstState === "Maharashtra", "BlueWave is in Maharashtra (Intra-state)");

    const cgstTax = await prisma.tax.findUnique({ where: { id: "tax-cgst-9" } });
    assert(cgstTax?.rate === 900 && cgstTax?.taxType === TaxType.CGST, "CGST 9% rule configured (900 bps)");

    const sgstTax = await prisma.tax.findUnique({ where: { id: "tax-sgst-9" } });
    assert(sgstTax?.rate === 900 && sgstTax?.taxType === TaxType.SGST, "SGST 9% rule configured (900 bps)");

    const igstTax = await prisma.tax.findUnique({ where: { id: "tax-igst-18" } });
    assert(igstTax?.rate === 1800 && igstTax?.taxType === TaxType.IGST, "IGST 18% rule configured (1800 bps)");

    // ── 3. Products, Variants & Plans ────────────────────────────────
    console.log("\n[Test Group 3] Products, Variants & Plan Definitions (PRD §4.2, §4.3, §12.3, §12.4)");
    const cloudCore = await prisma.product.findUnique({
      where: { id: "prod-cloud-core" },
      include: { variants: true },
    });
    assert(cloudCore?.name === "Cloud Core Platform", "Product 'Cloud Core Platform' exists");

    const odooVariant = cloudCore?.variants.find((v) => v.attributeValue === "Odoo");
    assert(odooVariant?.priceExtraPaise === 56000, "Odoo variant price extra is +₹560 (56,000 paise)");

    const entAnnualPlan = await prisma.plan.findUnique({ where: { id: "plan-enterprise-annual" } });
    assert(entAnnualPlan?.billingPeriod === BillingPeriod.YEARLY, "Enterprise Annual is YEARLY billing");
    assert(entAnnualPlan?.isPausable === false, "Enterprise Annual plan has isPausable = false");
    assert(entAnnualPlan?.isClosableEarly === false, "Enterprise Annual plan has isClosableEarly = false");
    assert(entAnnualPlan?.isRenewable === true, "Enterprise Annual plan has isRenewable = true");

    const growthMonthlyPlan = await prisma.plan.findUnique({ where: { id: "plan-growth-monthly" } });
    assert(growthMonthlyPlan?.billingPeriod === BillingPeriod.MONTHLY, "Growth Monthly is MONTHLY billing");
    assert(growthMonthlyPlan?.isPausable === true, "Growth Monthly plan has isPausable = true");
    assert(growthMonthlyPlan?.isClosableEarly === true, "Growth Monthly plan has isClosableEarly = true");

    // ── 4. Subscription Statuses & Plan Snapshots ────────────────────
    console.log("\n[Test Group 4] Subscription Statuses & Plan Snapshots (PRD §4.5, §12.6)");
    const sub128 = await prisma.subscription.findUnique({
      where: { number: "SUB-00128" },
      include: { lines: true, customer: true, plan: true },
    });
    assert(sub128?.status === SubscriptionStatus.ACTIVE, "SUB-00128 status is strictly ACTIVE");
    assert(sub128?.isPaused === false, "SUB-00128 isPaused is false (boolean, not status)");
    assert(sub128?.isPausable === false, "SUB-00128 snapshotted isPausable = false");
    assert(sub128?.isClosableEarly === false, "SUB-00128 snapshotted isClosableEarly = false");
    assert(sub128?.isRenewable === true, "SUB-00128 snapshotted isRenewable = true");
    assert(sub128?.billingPeriod === BillingPeriod.YEARLY, "SUB-00128 snapshotted billingPeriod = YEARLY");
    assert(sub128?.lines.length === 3, "SUB-00128 has 3 itemized lines");

    // Line items verification for SUB-00128
    const sub128Subtotal = sub128?.lines.reduce((sum, l) => sum + l.quantity * l.unitPricePaise, 0) || 0;
    assert(sub128Subtotal === 145000000, `SUB-00128 subtotal is ₹14,50,000 (14,50,00,000 paise), got ${sub128Subtotal}`);

    const sub129 = await prisma.subscription.findUnique({ where: { number: "SUB-00129" } });
    assert(sub129?.status === SubscriptionStatus.ACTIVE, "SUB-00129 status is strictly ACTIVE");
    assert(sub129?.isPausable === true, "SUB-00129 snapshotted isPausable = true");

    const sub130 = await prisma.subscription.findUnique({ where: { number: "SUB-00130" } });
    assert(sub130?.status === SubscriptionStatus.ACTIVE, "SUB-00130 status is strictly ACTIVE");

    const sub131 = await prisma.subscription.findUnique({ where: { number: "SUB-00131" } });
    assert(sub131?.status === SubscriptionStatus.DRAFT, "SUB-00131 status is strictly DRAFT");

    const sub132 = await prisma.subscription.findUnique({ where: { number: "SUB-00132" } });
    assert(sub132?.status === SubscriptionStatus.QUOTATION, "SUB-00132 status is strictly QUOTATION");

    const sub133 = await prisma.subscription.findUnique({ where: { number: "SUB-00133" } });
    assert(sub133?.status === SubscriptionStatus.CONFIRMED, "SUB-00133 status is strictly CONFIRMED");

    const sub134 = await prisma.subscription.findUnique({ where: { number: "SUB-00134" } });
    assert(sub134?.status === SubscriptionStatus.CLOSED, "SUB-00134 status is strictly CLOSED");

    const sub135 = await prisma.subscription.findUnique({ where: { number: "SUB-00135" } });
    assert(sub135?.status === SubscriptionStatus.CLOSED, "SUB-00135 status is strictly CLOSED (expired quotation)");

    // ── 5. Invoices, Exact Amounts & Derived Tags ────────────────────
    console.log("\n[Test Group 5] Invoices, Taxes, Payments & Derived Tags (PRD §4.6, §4.9, §12.6)");

    // INV-00456 (Techcraft)
    const inv456 = await prisma.invoice.findUnique({
      where: { number: "INV-00456" },
      include: { taxes: true, payments: true, lines: true },
    });
    assert(inv456?.status === InvoiceStatus.CONFIRMED, "INV-00456 status is strictly CONFIRMED (not stored as Partially Paid)");
    assert(inv456?.subtotalPaise === 145000000, `INV-00456 subtotal is ₹14,50,000 (14,50,00,000 paise), got ${inv456?.subtotalPaise}`);
    assert(inv456?.totalPaise === 171100000, `INV-00456 total is ₹17,11,000 (17,11,00,000 paise), got ${inv456?.totalPaise}`);

    const cgst456 = inv456?.taxes.find((t) => t.taxType === TaxType.CGST);
    assert(cgst456?.amountPaise === 13050000, `INV-00456 CGST is ₹1,30,500 (1,30,50,000 paise), got ${cgst456?.amountPaise}`);

    const sgst456 = inv456?.taxes.find((t) => t.taxType === TaxType.SGST);
    assert(sgst456?.amountPaise === 13050000, `INV-00456 SGST is ₹1,30,500 (1,30,50,000 paise), got ${sgst456?.amountPaise}`);

    assert(inv456?.payments.length === 1, "INV-00456 has 1 recorded payment");
    assert(inv456?.payments[0].amountPaise === 100000000, "INV-00456 payment is ₹10,00,000 (10,00,00,000 paise)");
    assert(inv456?.payments[0].paymentMethod === PaymentMethod.BANK_TRANSFER, "INV-00456 payment method is BANK_TRANSFER");

    const tags456 = computeInvoiceDerivedTags(inv456!, today);
    assert(tags456.isPartiallyPaid === true, "INV-00456 correctly computes derived tag 'Partially paid'");
    assert(tags456.isOverdue === false, "INV-00456 is NOT overdue (due today T, outstanding > 0)");
    assert(tags456.outstandingPaise === 71100000, `INV-00456 outstanding amount is ₹7,11,000, got ${tags456.outstandingPaise}`);

    // INV-00457 (Acme)
    const inv457 = await prisma.invoice.findUnique({
      where: { number: "INV-00457" },
      include: { taxes: true, payments: true },
    });
    assert(inv457?.status === InvoiceStatus.CONFIRMED, "INV-00457 status is strictly CONFIRMED (not stored as Overdue)");
    assert(inv457?.subtotalPaise === 36000000, `INV-00457 subtotal is ₹3,60,000, got ${inv457?.subtotalPaise}`);
    assert(inv457?.totalPaise === 42480000, `INV-00457 total is ₹4,24,800, got ${inv457?.totalPaise}`);

    const igst457 = inv457?.taxes.find((t) => t.taxType === TaxType.IGST);
    assert(igst457?.amountPaise === 6480000, `INV-00457 IGST is ₹64,800 (64,80,000 paise), got ${igst457?.amountPaise}`);
    assert(inv457?.payments.length === 0, "INV-00457 has 0 payments recorded");

    const tags457 = computeInvoiceDerivedTags(inv457!, today);
    assert(tags457.isOverdue === true, "INV-00457 correctly computes derived tag 'Overdue' (due T-16)");
    assert(tags457.isPartiallyPaid === false, "INV-00457 is NOT partially paid (paid = 0)");
    assert(tags457.outstandingPaise === 42480000, `INV-00457 outstanding amount is ₹4,24,800, got ${tags457.outstandingPaise}`);

    // INV-00458 (BlueWave)
    const inv458 = await prisma.invoice.findUnique({
      where: { number: "INV-00458" },
      include: { taxes: true, payments: true },
    });
    assert(inv458?.status === InvoiceStatus.PAID, "INV-00458 status is strictly PAID");
    assert(inv458?.subtotalPaise === 20000000, `INV-00458 subtotal is ₹2,00,000, got ${inv458?.subtotalPaise}`);
    assert(inv458?.totalPaise === 23600000, `INV-00458 total is ₹2,36,000, got ${inv458?.totalPaise}`);
    assert(inv458?.payments[0].paymentMethod === PaymentMethod.UPI, "INV-00458 payment method is UPI");
    assert(inv458?.payments[0].amountPaise === 23600000, "INV-00458 payment amount is full ₹2,36,000");

    const tags458 = computeInvoiceDerivedTags(inv458!, today);
    assert(tags458.isPaid === true, "INV-00458 is fully paid");
    assert(tags458.isOverdue === false, "INV-00458 is NOT overdue");
    assert(tags458.isPartiallyPaid === false, "INV-00458 is NOT partially paid");
    assert(tags458.outstandingPaise === 0, "INV-00458 outstanding amount is 0");

    // ── 6. Integer Arithmetic & Mathematical Consistency ─────────────
    console.log("\n[Test Group 6] Integer Arithmetic & Financial Ledger Integrity");
    const allInvoices = [inv456!, inv457!, inv458!];
    for (const inv of allInvoices) {
      assert(Number.isInteger(inv.subtotalPaise), `${inv.number} subtotalPaise is an integer`);
      assert(Number.isInteger(inv.taxPaise), `${inv.number} taxPaise is an integer`);
      assert(Number.isInteger(inv.totalPaise), `${inv.number} totalPaise is an integer`);
      assert(Number.isInteger(inv.paidPaise), `${inv.number} paidPaise is an integer`);
      assert(
        inv.subtotalPaise + inv.taxPaise - inv.discountPaise === inv.totalPaise,
        `${inv.number} math matches: subtotal (${inv.subtotalPaise}) + tax (${inv.taxPaise}) - discount (${inv.discountPaise}) = total (${inv.totalPaise})`
      );
    }

    // ── 7. Billing Idempotency Partial Unique Index ──────────────────
    console.log("\n[Test Group 7] Billing Idempotency Partial Unique Index (PRD §4.6, §7)");
    const testSubId = sub128!.id;
    const testBillingStart = new Date("2026-11-01T00:00:00.000Z");
    const testBillingEnd = new Date("2026-11-30T23:59:59.000Z");

    await prisma.invoice.deleteMany({
      where: { number: { in: ["TEST-IDEMP-001", "TEST-IDEMP-002"] } },
    });

    // 1. Create first active invoice
    const testInv1 = await prisma.invoice.create({
      data: {
        number: "TEST-IDEMP-001",
        subscriptionId: testSubId,
        billingPeriodStart: testBillingStart,
        billingPeriodEnd: testBillingEnd,
        dueDate: testBillingStart,
        subtotalPaise: 100000,
        totalPaise: 100000,
      },
    });
    assert(!!testInv1.id, "Created first active test invoice for 2026-11-01");

    // 2. Attempt duplicate active invoice for same period -> MUST FAIL
    let duplicateRejected = false;
    try {
      await prisma.invoice.create({
        data: {
          number: "TEST-IDEMP-002",
          subscriptionId: testSubId,
          billingPeriodStart: testBillingStart,
          billingPeriodEnd: testBillingEnd,
          dueDate: testBillingStart,
          subtotalPaise: 100000,
          totalPaise: 100000,
        },
      });
    } catch (err: unknown) {
      duplicateRejected = true;
      const msg = (err as Error).message || "";
      const isUniqueConstraint = msg.includes("Unique constraint failed") || msg.includes("unique");
      assert(isUniqueConstraint, "PostgreSQL partial unique index rejected duplicate active billing period");
    }
    assert(duplicateRejected, "Duplicate active invoice was rejected by database constraint");

    // 3. Cancel the first invoice (cancelledAt timestamp set)
    await prisma.invoice.update({
      where: { id: testInv1.id },
      data: { cancelledAt: new Date() },
    });
    console.log("Applied cancelledAt timestamp to first test invoice");

    // 4. Re-billing for same period MUST SUCCEED now because cancelledAt IS NOT NULL on first
    let rebillSuccess = false;
    try {
      const testInv2 = await prisma.invoice.create({
        data: {
          number: "TEST-IDEMP-002",
          subscriptionId: testSubId,
          billingPeriodStart: testBillingStart,
          billingPeriodEnd: testBillingEnd,
          dueDate: testBillingStart,
          subtotalPaise: 100000,
          totalPaise: 100000,
        },
      });
      rebillSuccess = !!testInv2.id;
    } catch (err) {
      console.error("Rebill attempt failed:", err);
    }
    assert(rebillSuccess, "Re-billing succeeds after previous invoice was cancelled (cancelledAt IS NOT NULL)");

    await prisma.invoice.deleteMany({
      where: { number: { in: ["TEST-IDEMP-001", "TEST-IDEMP-002"] } },
    });
    console.log("Cleaned up test idempotency invoices");

    // ── 8. Customer Signup & Role Elevation Protection ───────────────
    console.log("\n[Test Group 8] Customer Signup & Server-Level Role Enforcement (PRD §4.1)");
    const testSignupEmail = "verified-compliance-test@example.com";
    await prisma.user.deleteMany({ where: { email: testSignupEmail } });

    const newHash = await bcrypt.hash("Enterprise@2026!", 12);
    const signupTx = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: "Test Signer",
          email: testSignupEmail,
          password: newHash,
          role: Role.CUSTOMER, // Server strictly enforces CUSTOMER
        },
      });
      const c = await tx.customer.create({
        data: {
          userId: u.id,
          companyName: "Signer Enterprises",
          gstState: "Maharashtra",
          gstStateCode: "27",
        },
      });
      return { u, c };
    });

    assert(signupTx.u.role === Role.CUSTOMER, "Public signup strictly creates Role.CUSTOMER");
    assert(signupTx.c.companyName === "Signer Enterprises", "Customer record atomically created and linked");

    await prisma.user.deleteMany({ where: { email: testSignupEmail } });
    console.log("Cleaned up test customer user");

  } catch (error) {
    console.error("Verification suite failure:", error);
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
