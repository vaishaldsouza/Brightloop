import {
  PrismaClient,
  Role,
  BillingPeriod,
  PaymentTerms,
  SubscriptionStatus,
  InvoiceStatus,
  PaymentMethod,
  DiscountType,
  DiscountScope,
  TaxType,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Helper: convert INR rupees to paise (integers only)
const inr = (rupees: number) => Math.round(rupees * 100);

async function main() {
  console.log("🌱 Seeding Brightloop database with strictly compliant PRD §12 data...");

  // Relative date helper based on execution time T
  const T0 = new Date();
  T0.setHours(0, 0, 0, 0); // Start of day today T
  const T = (offsetDays: number) => {
    const d = new Date(T0);
    d.setDate(d.getDate() + offsetDays);
    return d;
  };

  // ── 1. Sequence Counters ──────────────────────────────────────────
  await prisma.sequence.upsert({ where: { id: "SUB" }, update: {}, create: { id: "SUB", current: 127 } });
  await prisma.sequence.upsert({ where: { id: "INV" }, update: {}, create: { id: "INV", current: 455 } });

  // ── 2. Users & Roles (PRD §12.1) ──────────────────────────────────
  const adminPassword = await bcrypt.hash("admin@123", 12);
  const staffPassword = await bcrypt.hash("staff@123", 12);
  const customerPassword = await bcrypt.hash("customer@123", 12);

  // Admin: Rajesh Sharma
  await prisma.user.upsert({
    where: { email: "rajesh@brightloop.in" },
    update: {},
    create: {
      email: "rajesh@brightloop.in",
      name: "Rajesh Sharma",
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  // Internal Staff: Priya Patel
  await prisma.user.upsert({
    where: { email: "priya.p@brightloop.in" },
    update: {},
    create: {
      email: "priya.p@brightloop.in",
      name: "Priya Patel",
      password: staffPassword,
      role: Role.STAFF,
    },
  });

  // Customer Accounts (PRD §12.6)
  const customerList = [
    {
      email: "contact@techcraft.in",
      name: "Techcraft Solutions Contact",
      company: "Techcraft Solutions Pvt Ltd",
      gstin: "27AADCT1234A1Z5",
      gstState: "Maharashtra",
      gstStateCode: "27",
    },
    {
      email: "info@acmetech.in",
      name: "Acme Technologies Contact",
      company: "Acme Technologies Pvt Ltd",
      gstin: "29AAACA5678B2Z3",
      gstState: "Karnataka",
      gstStateCode: "29",
    },
    {
      email: "admin@bluewave.in",
      name: "BlueWave Admin",
      company: "BlueWave Systems",
      gstin: "27AABCB9876C1Z1",
      gstState: "Maharashtra",
      gstStateCode: "27",
    },
    {
      email: "contact@nexusdigital.in",
      name: "Nexus Contact",
      company: "Nexus Digital Cloud",
      gstin: "27AACCN1111D1Z2",
      gstState: "Maharashtra",
      gstStateCode: "27",
    },
    {
      email: "billing@apexscale.in",
      name: "Apex Finance",
      company: "Apex Scale Dynamics",
      gstin: "29AAACS2222E1Z4",
      gstState: "Karnataka",
      gstStateCode: "29",
    },
    {
      email: "finance@zetaanalytics.in",
      name: "Zeta Accounts",
      company: "Zeta Analytics India",
      gstin: "27AABCZ3333F1Z6",
      gstState: "Maharashtra",
      gstStateCode: "27",
    },
    {
      email: "ops@novacloud.in",
      name: "NovaCloud Lead",
      company: "NovaCloud Infra LLP",
      gstin: "36AACCN4444G1Z8",
      gstState: "Telangana",
      gstStateCode: "36",
    },
    {
      email: "accounts@solarismedia.in",
      name: "Solaris Lead",
      company: "Solaris Media Labs",
      gstin: "06AABCS5555H1Z0",
      gstState: "Haryana",
      gstStateCode: "06",
    },
  ];

  const customerMap: Record<string, string> = {};
  for (const c of customerList) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        email: c.email,
        name: c.name,
        password: customerPassword,
        role: Role.CUSTOMER,
      },
    });
    const cust = await prisma.customer.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        companyName: c.company,
        gstin: c.gstin,
        gstState: c.gstState,
        gstStateCode: c.gstStateCode,
        billingAddress: `Corporate Suite 300, Financial District, ${c.gstState}`,
        phone: "+91 98765 43210",
      },
    });
    customerMap[c.company] = cust.id;
  }
  console.log("✅ Users & Customers seeded");

  // ── 3. Taxes (PRD §12.2) ──────────────────────────────────────────
  // Company state: Maharashtra (27). Intra-state -> CGST 9% + SGST 9%. Inter-state -> IGST 18%.
  const cgst = await prisma.tax.upsert({
    where: { id: "tax-cgst-9" },
    update: {},
    create: {
      id: "tax-cgst-9",
      name: "CGST 9%",
      taxType: TaxType.CGST,
      rate: 900, // 900 bps = 9.00%
      isActive: true,
    },
  });

  const sgst = await prisma.tax.upsert({
    where: { id: "tax-sgst-9" },
    update: {},
    create: {
      id: "tax-sgst-9",
      name: "SGST 9%",
      taxType: TaxType.SGST,
      rate: 900, // 900 bps = 9.00%
      isActive: true,
    },
  });

  const igst = await prisma.tax.upsert({
    where: { id: "tax-igst-18" },
    update: {},
    create: {
      id: "tax-igst-18",
      name: "IGST 18%",
      taxType: TaxType.IGST,
      rate: 1800, // 1800 bps = 18.00%
      isActive: true,
    },
  });
  console.log("✅ Taxes seeded (CGST 9%, SGST 9%, IGST 18%)");

  // ── 4. Products & Variants (PRD §12.3) ─────────────────────────────
  // Product: Cloud Core Platform
  const cloudPlatform = await prisma.product.upsert({
    where: { id: "prod-cloud-core" },
    update: {},
    create: {
      id: "prod-cloud-core",
      name: "Cloud Core Platform",
      type: "Software",
      salesPricePaise: inr(10000),
      notes: "Main subscription core platform",
    },
  });

  // Variant Option: Odoo (+₹560 price extra = 56000 paise)
  const variantOdoo = await prisma.productVariant.upsert({
    where: { id: "var-odoo-edition" },
    update: {},
    create: {
      id: "var-odoo-edition",
      productId: cloudPlatform.id,
      name: "Odoo Brand Edition",
      attributeName: "Brand",
      attributeValue: "Odoo",
      priceExtraPaise: inr(560), // +₹560 extra
    },
  });

  // Supporting variants for subscription lines defined in PRD §12.6
  const variantEnterpriseLicense = await prisma.productVariant.upsert({
    where: { id: "var-enterprise-license" },
    update: {},
    create: {
      id: "var-enterprise-license",
      productId: cloudPlatform.id,
      name: "Core Enterprise Cloud License",
      description: "Per-seat annual enterprise license",
      priceExtraPaise: 0,
    },
  });

  const variantDedicatedTAM = await prisma.productVariant.upsert({
    where: { id: "var-dedicated-tam" },
    update: {},
    create: {
      id: "var-dedicated-tam",
      productId: cloudPlatform.id,
      name: "24/7 Dedicated TAM & SLA",
      description: "Technical Account Manager with 15-min SLA",
      priceExtraPaise: 0,
    },
  });

  const variantDatabaseShard = await prisma.productVariant.upsert({
    where: { id: "var-database-shard" },
    update: {},
    create: {
      id: "var-database-shard",
      productId: cloudPlatform.id,
      name: "Dedicated Database Shard",
      description: "Isolated PostgreSQL database replica",
      priceExtraPaise: 0,
    },
  });

  const variantGrowthService = await prisma.productVariant.upsert({
    where: { id: "var-growth-service" },
    update: {},
    create: {
      id: "var-growth-service",
      productId: cloudPlatform.id,
      name: "Growth Cloud Service",
      description: "Managed scalable cloud services tier",
      priceExtraPaise: 0,
    },
  });
  console.log("✅ Products & Variants seeded (Cloud Core Platform + Odoo + Subscription items)");

  // ── 5. Plans (PRD §12.4) ──────────────────────────────────────────
  // Enterprise Annual: Yearly billing, pausable: false, renewable: true, closableEarly: false
  const planEnterpriseAnnual = await prisma.plan.upsert({
    where: { id: "plan-enterprise-annual" },
    update: {},
    create: {
      id: "plan-enterprise-annual",
      productId: cloudPlatform.id,
      name: "Enterprise Annual",
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: false,
    },
  });

  // Growth Monthly: Monthly billing, pausable: true, renewable: true, closableEarly: true
  const planGrowthMonthly = await prisma.plan.upsert({
    where: { id: "plan-growth-monthly" },
    update: {},
    create: {
      id: "plan-growth-monthly",
      productId: cloudPlatform.id,
      name: "Growth Monthly",
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
    },
  });
  console.log("✅ Plans seeded (Enterprise Annual, Growth Monthly)");

  // ── 6. Discounts (PRD §12.5) ──────────────────────────────────────
  // ENT-10: 10% off whole subscriptions, min quantity 1, usage limit 50, valid from T-30 to T+90
  const discountEnt10 = await prisma.discount.upsert({
    where: { code: "ENT-10" },
    update: {},
    create: {
      code: "ENT-10",
      description: "10% off whole subscriptions",
      discountType: DiscountType.PERCENTAGE,
      scope: DiscountScope.SUBSCRIPTION,
      value: 1000, // 1000 bps = 10%
      minQuantity: 1,
      maxUses: 50,
      usedCount: 0,
      startDate: T(-30),
      expiresAt: T(90),
      isActive: true,
    },
  });
  console.log("✅ Discounts seeded (ENT-10: 10% from T-30 to T+90)");

  // ── 7. Subscriptions & Invoices (PRD §12.6) ────────────────────────

  // 1. Techcraft Solutions Pvt Ltd (Maharashtra, Intra-state)
  // SUB-00128: Status: Active, Plan: Enterprise Annual. Not pausable, Not closable early.
  const sub128 = await prisma.subscription.upsert({
    where: { number: "SUB-00128" },
    update: {},
    create: {
      number: "SUB-00128",
      customerId: customerMap["Techcraft Solutions Pvt Ltd"],
      planId: planEnterpriseAnnual.id,
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: false,
      status: SubscriptionStatus.ACTIVE,
      isPaused: false,
      startDate: T(-30),
      nextBillingDate: T(335),
    },
  });

  // Lines for SUB-00128
  // Line 1: Core Enterprise Cloud License, qty: 100 × ₹12,000 = ₹12,00,000
  await prisma.subscriptionLine.upsert({
    where: { id: "sl-128-1" },
    update: {},
    create: {
      id: "sl-128-1",
      subscriptionId: sub128.id,
      productVariantId: variantEnterpriseLicense.id,
      description: "Core Enterprise Cloud License",
      quantity: 100,
      unitPricePaise: inr(12000), // ₹12,000 each = 1,200,000 paise
      sortOrder: 1,
    },
  });

  // Line 2: 24/7 Dedicated TAM & SLA, qty: 1 × ₹1,50,000 = ₹1,50,000
  await prisma.subscriptionLine.upsert({
    where: { id: "sl-128-2" },
    update: {},
    create: {
      id: "sl-128-2",
      subscriptionId: sub128.id,
      productVariantId: variantDedicatedTAM.id,
      description: "24/7 Dedicated TAM & SLA",
      quantity: 1,
      unitPricePaise: inr(150000), // ₹1,50,000
      sortOrder: 2,
    },
  });

  // Line 3: Dedicated Database Shard, qty: 2 × ₹50,000 = ₹1,00,000
  await prisma.subscriptionLine.upsert({
    where: { id: "sl-128-3" },
    update: {},
    create: {
      id: "sl-128-3",
      subscriptionId: sub128.id,
      productVariantId: variantDatabaseShard.id,
      description: "Dedicated Database Shard",
      quantity: 2,
      unitPricePaise: inr(50000), // ₹50,000 each
      sortOrder: 3,
    },
  });

  // Invoice INV-00456 (SUB-00128)
  // Date: T-30, Due Date: T (Net 30 -> due today), Status: Confirmed
  // Subtotal: ₹14,50,000; CGST (9%): ₹1,30,500; SGST (9%): ₹1,30,500; Total: ₹17,11,000
  // Payment: ₹10,00,000 via Bank Transfer on T-19.
  // Amount due: ₹7,11,000. Derived tag: Partially paid. NOT overdue.
  const inv456 = await prisma.invoice.upsert({
    where: { number: "INV-00456" },
    update: {},
    create: {
      number: "INV-00456",
      subscriptionId: sub128.id,
      status: InvoiceStatus.CONFIRMED,
      billingPeriodStart: T(-30),
      billingPeriodEnd: T(-1),
      dueDate: T(0), // Due today T
      subtotalPaise: inr(1450000), // ₹14,50,000
      discountPaise: 0,
      taxPaise: inr(261000), // CGST 1,30,500 + SGST 1,30,500
      totalPaise: inr(1711000), // ₹17,11,000
      paidPaise: inr(1000000), // ₹10,00,000 paid
      sentAt: T(-29),
    },
  });

  await prisma.invoiceLine.upsert({
    where: { id: "il-456-1" },
    update: {},
    create: {
      id: "il-456-1",
      invoiceId: inv456.id,
      productVariantId: variantEnterpriseLicense.id,
      description: "Core Enterprise Cloud License",
      quantity: 100,
      unitPricePaise: inr(12000),
      subtotalPaise: inr(1200000),
      sortOrder: 1,
    },
  });

  await prisma.invoiceLine.upsert({
    where: { id: "il-456-2" },
    update: {},
    create: {
      id: "il-456-2",
      invoiceId: inv456.id,
      productVariantId: variantDedicatedTAM.id,
      description: "24/7 Dedicated TAM & SLA",
      quantity: 1,
      unitPricePaise: inr(150000),
      subtotalPaise: inr(150000),
      sortOrder: 2,
    },
  });

  await prisma.invoiceLine.upsert({
    where: { id: "il-456-3" },
    update: {},
    create: {
      id: "il-456-3",
      invoiceId: inv456.id,
      productVariantId: variantDatabaseShard.id,
      description: "Dedicated Database Shard",
      quantity: 2,
      unitPricePaise: inr(50000),
      subtotalPaise: inr(100000),
      sortOrder: 3,
    },
  });

  await prisma.invoiceTax.upsert({
    where: { id: "it-456-cgst" },
    update: {},
    create: {
      id: "it-456-cgst",
      invoiceId: inv456.id,
      taxId: cgst.id,
      taxName: "CGST 9%",
      taxType: TaxType.CGST,
      rateBps: 900,
      amountPaise: inr(130500),
    },
  });

  await prisma.invoiceTax.upsert({
    where: { id: "it-456-sgst" },
    update: {},
    create: {
      id: "it-456-sgst",
      invoiceId: inv456.id,
      taxId: sgst.id,
      taxName: "SGST 9%",
      taxType: TaxType.SGST,
      rateBps: 900,
      amountPaise: inr(130500),
    },
  });

  await prisma.payment.upsert({
    where: { id: "pay-456-1" },
    update: {},
    create: {
      id: "pay-456-1",
      invoiceId: inv456.id,
      amountPaise: inr(1000000), // ₹10,00,000
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      paidAt: T(-19),
      reference: "NEFT-TECH-001",
      notes: "Advance milestone",
    },
  });

  // 2. Acme Technologies Pvt Ltd (Karnataka, Inter-state)
  // SUB-00129: Status: Active, Plan: Growth Monthly
  const sub129 = await prisma.subscription.upsert({
    where: { number: "SUB-00129" },
    update: {},
    create: {
      number: "SUB-00129",
      customerId: customerMap["Acme Technologies Pvt Ltd"],
      planId: planGrowthMonthly.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.ACTIVE,
      isPaused: false,
      startDate: T(-46),
      nextBillingDate: T(14),
    },
  });

  await prisma.subscriptionLine.upsert({
    where: { id: "sl-129-1" },
    update: {},
    create: {
      id: "sl-129-1",
      subscriptionId: sub129.id,
      productVariantId: variantGrowthService.id,
      description: "Growth Cloud Service",
      quantity: 1,
      unitPricePaise: inr(360000), // ₹3,60,000
      sortOrder: 1,
    },
  });

  // Invoice INV-00457 (SUB-00129)
  // Date: T-46, Due Date: T-16 (Overdue by 16 days), Status: Confirmed
  // Subtotal: ₹3,60,000; IGST (18%): ₹64,800; Total: ₹4,24,800. No payments.
  const inv457 = await prisma.invoice.upsert({
    where: { number: "INV-00457" },
    update: {},
    create: {
      number: "INV-00457",
      subscriptionId: sub129.id,
      status: InvoiceStatus.CONFIRMED,
      billingPeriodStart: T(-46),
      billingPeriodEnd: T(-16),
      dueDate: T(-16), // Overdue by 16 days (T - 16 < T)
      subtotalPaise: inr(360000), // ₹3,60,000
      discountPaise: 0,
      taxPaise: inr(64800), // IGST 18% = ₹64,800
      totalPaise: inr(424800), // ₹4,24,800
      paidPaise: 0,
      sentAt: T(-45),
    },
  });

  await prisma.invoiceLine.upsert({
    where: { id: "il-457-1" },
    update: {},
    create: {
      id: "il-457-1",
      invoiceId: inv457.id,
      productVariantId: variantGrowthService.id,
      description: "Growth Cloud Service",
      quantity: 1,
      unitPricePaise: inr(360000),
      subtotalPaise: inr(360000),
      sortOrder: 1,
    },
  });

  await prisma.invoiceTax.upsert({
    where: { id: "it-457-igst" },
    update: {},
    create: {
      id: "it-457-igst",
      invoiceId: inv457.id,
      taxId: igst.id,
      taxName: "IGST 18%",
      taxType: TaxType.IGST,
      rateBps: 1800,
      amountPaise: inr(64800),
    },
  });

  // 3. BlueWave Systems (Maharashtra, Intra-state)
  // SUB-00130: Status: Active, Plan: Growth Monthly
  const sub130 = await prisma.subscription.upsert({
    where: { number: "SUB-00130" },
    update: {},
    create: {
      number: "SUB-00130",
      customerId: customerMap["BlueWave Systems"],
      planId: planGrowthMonthly.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.ACTIVE,
      isPaused: false,
      startDate: T(-21),
      nextBillingDate: T(9),
    },
  });

  await prisma.subscriptionLine.upsert({
    where: { id: "sl-130-1" },
    update: {},
    create: {
      id: "sl-130-1",
      subscriptionId: sub130.id,
      productVariantId: variantGrowthService.id,
      description: "Growth Cloud Service",
      quantity: 1,
      unitPricePaise: inr(200000), // ₹2,00,000
      sortOrder: 1,
    },
  });

  // Invoice INV-00458 (SUB-00130)
  // Date: T-21, Due Date: T-6, Status: Paid
  // Subtotal: ₹2,00,000; CGST (9%): ₹18,000; SGST (9%): ₹18,000; Total: ₹2,36,000
  // Payment: ₹2,36,000 via UPI on T-8, note: "UPI ref 782341". Amount due: 0
  const inv458 = await prisma.invoice.upsert({
    where: { number: "INV-00458" },
    update: {},
    create: {
      number: "INV-00458",
      subscriptionId: sub130.id,
      status: InvoiceStatus.PAID,
      billingPeriodStart: T(-21),
      billingPeriodEnd: T(-6),
      dueDate: T(-6),
      subtotalPaise: inr(200000), // ₹2,00,000
      discountPaise: 0,
      taxPaise: inr(36000), // CGST 18,000 + SGST 18,000
      totalPaise: inr(236000), // ₹2,36,000
      paidPaise: inr(236000), // Fully paid
      paidAt: T(-8),
      sentAt: T(-20),
    },
  });

  await prisma.invoiceLine.upsert({
    where: { id: "il-458-1" },
    update: {},
    create: {
      id: "il-458-1",
      invoiceId: inv458.id,
      productVariantId: variantGrowthService.id,
      description: "Growth Cloud Service",
      quantity: 1,
      unitPricePaise: inr(200000),
      subtotalPaise: inr(200000),
      sortOrder: 1,
    },
  });

  await prisma.invoiceTax.upsert({
    where: { id: "it-458-cgst" },
    update: {},
    create: {
      id: "it-458-cgst",
      invoiceId: inv458.id,
      taxId: cgst.id,
      taxName: "CGST 9%",
      taxType: TaxType.CGST,
      rateBps: 900,
      amountPaise: inr(18000),
    },
  });

  await prisma.invoiceTax.upsert({
    where: { id: "it-458-sgst" },
    update: {},
    create: {
      id: "it-458-sgst",
      invoiceId: inv458.id,
      taxId: sgst.id,
      taxName: "SGST 9%",
      taxType: TaxType.SGST,
      rateBps: 900,
      amountPaise: inr(18000),
    },
  });

  await prisma.payment.upsert({
    where: { id: "pay-458-1" },
    update: {},
    create: {
      id: "pay-458-1",
      invoiceId: inv458.id,
      amountPaise: inr(236000), // ₹2,36,000
      paymentMethod: PaymentMethod.UPI,
      paidAt: T(-8),
      reference: "UPI ref 782341",
      notes: "UPI ref 782341",
    },
  });

  // 4. Additional Customers & Subscriptions (PRD §12.6.4: All status lifecycle coverage)
  // SUB-00131: Nexus Digital Cloud - Status: Draft, Plan: Growth Monthly
  await prisma.subscription.upsert({
    where: { number: "SUB-00131" },
    update: {},
    create: {
      number: "SUB-00131",
      customerId: customerMap["Nexus Digital Cloud"],
      planId: planGrowthMonthly.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.DRAFT,
      isPaused: false,
      startDate: T(1),
    },
  });

  // SUB-00132: Apex Scale Dynamics - Status: Quotation, Plan: Enterprise Annual. Validity: 30 days
  await prisma.subscription.upsert({
    where: { number: "SUB-00132" },
    update: {},
    create: {
      number: "SUB-00132",
      customerId: customerMap["Apex Scale Dynamics"],
      planId: planEnterpriseAnnual.id,
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: false,
      status: SubscriptionStatus.QUOTATION,
      isPaused: false,
      startDate: T(5),
      quotationExpiryDate: T(35), // 30 days validity
    },
  });

  // SUB-00133: Zeta Analytics India - Status: Confirmed, Plan: Enterprise Annual
  await prisma.subscription.upsert({
    where: { number: "SUB-00133" },
    update: {},
    create: {
      number: "SUB-00133",
      customerId: customerMap["Zeta Analytics India"],
      planId: planEnterpriseAnnual.id,
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: false,
      status: SubscriptionStatus.CONFIRMED,
      isPaused: false,
      startDate: T(0),
      nextBillingDate: T(1),
    },
  });

  // SUB-00134: NovaCloud Infra LLP - Status: Closed, Plan: Growth Monthly
  await prisma.subscription.upsert({
    where: { number: "SUB-00134" },
    update: {},
    create: {
      number: "SUB-00134",
      customerId: customerMap["NovaCloud Infra LLP"],
      planId: planGrowthMonthly.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.CLOSED,
      isPaused: false,
      startDate: T(-90),
      endDate: T(-5),
      closedAt: T(-5),
    },
  });

  // SUB-00135: Solaris Media Labs - Status: Closed (expired quotation)
  await prisma.subscription.upsert({
    where: { number: "SUB-00135" },
    update: {},
    create: {
      number: "SUB-00135",
      customerId: customerMap["Solaris Media Labs"],
      planId: planEnterpriseAnnual.id,
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: false,
      status: SubscriptionStatus.CLOSED,
      isPaused: false,
      startDate: T(-35),
      quotationExpiryDate: T(-5),
      closedAt: T(-5), // Expired quotation transitioned to closed
    },
  });
  console.log("✅ Subscriptions SUB-00128 to SUB-00135 and Invoices INV-00456 to INV-00458 seeded");

  // ── 8. Quotation Templates (PRD §4.4) ─────────────────────────────
  const qtEnterprise = await prisma.quotationTemplate.upsert({
    where: { id: "qt-enterprise-standard" },
    update: {},
    create: {
      id: "qt-enterprise-standard",
      planId: planEnterpriseAnnual.id,
      name: "Enterprise Annual Standard Pack",
      description: "Full enterprise cloud bundle with dedicated TAM and Shard",
      validityDays: 30,
    },
  });

  await prisma.quotationTemplateLine.upsert({
    where: { id: "qtl-ent-1" },
    update: {},
    create: {
      id: "qtl-ent-1",
      quotationTemplateId: qtEnterprise.id,
      productVariantId: variantEnterpriseLicense.id,
      description: "Core Enterprise Cloud License",
      quantity: 100,
      unitPricePaise: inr(12000),
      sortOrder: 1,
    },
  });

  // ── 9. Final Sequence Synchronization ─────────────────────────────
  await prisma.sequence.update({ where: { id: "SUB" }, data: { current: 135 } });
  await prisma.sequence.update({ where: { id: "INV" }, data: { current: 458 } });

  console.log("\n🎉 PRD Compliant Seed Complete!");
  console.log("==================================================");
  console.log("Admin:    rajesh@brightloop.in    / admin@123");
  console.log("Staff:    priya.p@brightloop.in   / staff@123");
  console.log("Customer: contact@techcraft.in    / customer@123");
  console.log("Customer: info@acmetech.in        / customer@123");
  console.log("Customer: admin@bluewave.in       / customer@123");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
