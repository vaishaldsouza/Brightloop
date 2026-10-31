import { PrismaClient, Role, BillingPeriod, PaymentTerms, SubscriptionStatus, InvoiceStatus, PaymentMethod, DiscountType, DiscountScope, TaxType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Helper: paise converter (always integer)
const inr = (rupees: number) => Math.round(rupees * 100)

async function main() {
  console.log('🌱 Seeding Brightloop database with PRD data...')

  // ── 1. Sequences ─────────────────────────────────────────────────
  await prisma.sequence.upsert({ where: { id: 'SUB' }, update: {}, create: { id: 'SUB', current: 127 } })
  await prisma.sequence.upsert({ where: { id: 'INV' }, update: {}, create: { id: 'INV', current: 455 } })

  // ── 2. Users & Roles ──────────────────────────────────────────────
  const adminPassword   = await bcrypt.hash('admin@123', 12)
  const staffPassword   = await bcrypt.hash('staff@123', 12)
  const customerPassword = await bcrypt.hash('customer@123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'rajesh@brightloop.in' },
    update: {},
    create: { email: 'rajesh@brightloop.in', name: 'Rajesh Sharma', password: adminPassword, role: Role.ADMIN },
  })

  const staff = await prisma.user.upsert({
    where: { email: 'priya.p@brightloop.in' },
    update: {},
    create: { email: 'priya.p@brightloop.in', name: 'Priya Patel', password: staffPassword, role: Role.STAFF },
  })

  // Customer users and organizations
  const customerList = [
    { email: 'contact@techcraft.in',     name: 'Techcraft Solutions',   company: 'Techcraft Solutions',   gstin: '27AADCT1234A1Z5', gstState: 'Maharashtra', gstStateCode: '27' },
    { email: 'info@acmetech.in',         name: 'Acme Technologies',      company: 'Acme Technologies',      gstin: '29AAACA5678B2Z3', gstState: 'Karnataka',    gstStateCode: '29' },
    { email: 'admin@bluewave.in',        name: 'BlueWave Systems',       company: 'BlueWave Systems',       gstin: '27AABCB9876C1Z1', gstState: 'Maharashtra', gstStateCode: '27' },
    { email: 'accounts@novabiz.in',      name: 'NovaBiz Enterprises',    company: 'NovaBiz Enterprises',    gstin: '27AACBN4321D1Z6', gstState: 'Maharashtra', gstStateCode: '27' },
    { email: 'billing@cloudpeak.in',     name: 'CloudPeak Corp',         company: 'CloudPeak Corp',         gstin: '06AADCC1111E1Z9', gstState: 'Haryana',      gstStateCode: '06' },
    { email: 'finance@zenvault.in',      name: 'ZenVault Tech',          company: 'ZenVault Tech',          gstin: '27AABCZ5555F1Z2', gstState: 'Maharashtra', gstStateCode: '27' },
    { email: 'ops@starforge.in',         name: 'StarForge Innovations',  company: 'StarForge Innovations',  gstin: '36AACSS2222G1Z3', gstState: 'Telangana',   gstStateCode: '36' },
    { email: 'cfo@meridiansoft.in',      name: 'Meridian Software',      company: 'Meridian Software',      gstin: '27AABCM7777H1Z4', gstState: 'Maharashtra', gstStateCode: '27' },
  ]

  const customerMap: Record<string, string> = {}
  for (const c of customerList) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: { email: c.email, name: c.name, password: customerPassword, role: Role.CUSTOMER },
    })
    const cust = await prisma.customer.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        companyName: c.company,
        gstin: c.gstin,
        gstState: c.gstState,
        gstStateCode: c.gstStateCode,
        billingAddress: `Tech Park, Suite 402, ${c.gstState}`,
        phone: '+91 98765 43210',
      },
    })
    customerMap[c.company] = cust.id
  }

  // ── 3. Taxes ──────────────────────────────────────────────────────
  // Company state: Maharashtra (27). Intra-state -> CGST + SGST. Inter-state -> IGST.
  const cgst = await prisma.tax.upsert({
    where: { id: 'tax-cgst-9' },
    update: {},
    create: { id: 'tax-cgst-9', name: 'CGST 9%', taxType: TaxType.CGST, rate: 900 },
  })
  const sgst = await prisma.tax.upsert({
    where: { id: 'tax-sgst-9' },
    update: {},
    create: { id: 'tax-sgst-9', name: 'SGST 9%', taxType: TaxType.SGST, rate: 900 },
  })
  const igst = await prisma.tax.upsert({
    where: { id: 'tax-igst-18' },
    update: {},
    create: { id: 'tax-igst-18', name: 'IGST 18%', taxType: TaxType.IGST, rate: 1800 },
  })

  // ── 4. Discount ───────────────────────────────────────────────────
  const discount = await prisma.discount.upsert({
    where: { code: 'ENT-10' },
    update: {},
    create: {
      code: 'ENT-10',
      description: 'Enterprise 10% off whole subscription',
      discountType: DiscountType.PERCENTAGE,
      scope: DiscountScope.SUBSCRIPTION,
      value: 1000, // 10% in basis points (1000 bps)
      isActive: true,
      maxUses: 100,
    },
  })

  // ── 5. Products & Variants ────────────────────────────────────────
  const cloudStorage = await prisma.product.upsert({
    where: { id: 'prod-cloud-storage' },
    update: {},
    create: { id: 'prod-cloud-storage', name: 'Cloud Storage', description: 'Enterprise object and block storage' },
  })
  const saasAnalytics = await prisma.product.upsert({
    where: { id: 'prod-saas-analytics' },
    update: {},
    create: { id: 'prod-saas-analytics', name: 'SaaS Analytics', description: 'Real-time telemetry and pipeline metrics' },
  })
  const supportSuite = await prisma.product.upsert({
    where: { id: 'prod-support-suite' },
    update: {},
    create: { id: 'prod-support-suite', name: 'Support Suite', description: 'Dedicated SLA customer support tier' },
  })

  const variantStorage100 = await prisma.productVariant.upsert({
    where: { id: 'var-storage-100gb' },
    update: {},
    create: { id: 'var-storage-100gb', productId: cloudStorage.id, name: '100 GB Storage', description: '100 GB cloud storage allocation' },
  })
  const variantStorage500 = await prisma.productVariant.upsert({
    where: { id: 'var-storage-500gb' },
    update: {},
    create: { id: 'var-storage-500gb', productId: cloudStorage.id, name: '500 GB Storage', description: '500 GB cloud storage allocation' },
  })
  const variantAnalyticsBasic = await prisma.productVariant.upsert({
    where: { id: 'var-analytics-basic' },
    update: {},
    create: { id: 'var-analytics-basic', productId: saasAnalytics.id, name: 'Basic Analytics', description: 'Up to 5 dashboards, 1M events/month' },
  })
  const variantAnalyticsPro = await prisma.productVariant.upsert({
    where: { id: 'var-analytics-pro' },
    update: {},
    create: { id: 'var-analytics-pro', productId: saasAnalytics.id, name: 'Pro Analytics', description: 'Unlimited dashboards, 50M events/month' },
  })
  const variantSupportStarter = await prisma.productVariant.upsert({
    where: { id: 'var-support-starter' },
    update: {},
    create: { id: 'var-support-starter', productId: supportSuite.id, name: 'Starter Support', description: 'Up to 3 agents, email channel' },
  })
  const variantSupportEnterprise = await prisma.productVariant.upsert({
    where: { id: 'var-support-enterprise' },
    update: {},
    create: { id: 'var-support-enterprise', productId: supportSuite.id, name: 'Enterprise Support', description: 'Unlimited agents, dedicated phone channel' },
  })

  // ── 6. Plans ──────────────────────────────────────────────────────
  const planMonthlyStorage = await prisma.plan.upsert({
    where: { id: 'plan-monthly-storage' },
    update: {},
    create: {
      id: 'plan-monthly-storage',
      productId: cloudStorage.id,
      name: 'Monthly Cloud Storage',
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.DUE_ON_RECEIPT,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
    },
  })
  const planYearlyAnalytics = await prisma.plan.upsert({
    where: { id: 'plan-yearly-analytics' },
    update: {},
    create: {
      id: 'plan-yearly-analytics',
      productId: saasAnalytics.id,
      name: 'Yearly Analytics',
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: true,
    },
  })
  const planMonthlySupport = await prisma.plan.upsert({
    where: { id: 'plan-monthly-support' },
    update: {},
    create: {
      id: 'plan-monthly-support',
      productId: supportSuite.id,
      name: 'Monthly Support Suite',
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
    },
  })

  // ── 7. Subscriptions (SUB-00128 through SUB-00135) ────────────────
  const now = new Date()
  const T = (offsetDays: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + offsetDays)
    return d
  }

  // SUB-00128: Techcraft - ACTIVE - Monthly Storage - ENT-10 discount
  const sub128 = await prisma.subscription.upsert({
    where: { number: 'SUB-00128' },
    update: {},
    create: {
      number: 'SUB-00128',
      customerId: customerMap['Techcraft Solutions'],
      planId: planMonthlyStorage.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.DUE_ON_RECEIPT,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.ACTIVE,
      startDate: T(-60),
      nextBillingDate: T(1),
      discountId: discount.id,
      discountAmountPaise: inr(99.9), // 10% discount on 999
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-128-1' },
    update: {},
    create: { id: 'sl-128-1', subscriptionId: sub128.id, productVariantId: variantStorage100.id, quantity: 1, unitPricePaise: inr(999), sortOrder: 1 },
  })
  await prisma.discountUsage.upsert({
    where: { discountId_subscriptionId: { discountId: discount.id, subscriptionId: sub128.id } },
    update: {},
    create: { discountId: discount.id, subscriptionId: sub128.id },
  })
  await prisma.discount.update({ where: { id: discount.id }, data: { usedCount: { increment: 1 } } })

  // SUB-00129: Acme - ACTIVE - Yearly Analytics
  const sub129 = await prisma.subscription.upsert({
    where: { number: 'SUB-00129' },
    update: {},
    create: {
      number: 'SUB-00129',
      customerId: customerMap['Acme Technologies'],
      planId: planYearlyAnalytics.id,
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: true,
      status: SubscriptionStatus.ACTIVE,
      startDate: T(-180),
      nextBillingDate: T(185),
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-129-1' },
    update: {},
    create: { id: 'sl-129-1', subscriptionId: sub129.id, productVariantId: variantAnalyticsPro.id, quantity: 1, unitPricePaise: inr(49999), sortOrder: 1 },
  })

  // SUB-00130: BlueWave - PAUSED - Monthly Storage
  const sub130 = await prisma.subscription.upsert({
    where: { number: 'SUB-00130' },
    update: {},
    create: {
      number: 'SUB-00130',
      customerId: customerMap['BlueWave Systems'],
      planId: planMonthlyStorage.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.DUE_ON_RECEIPT,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.PAUSED,
      startDate: T(-90),
      pausedAt: T(-10),
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-130-1' },
    update: {},
    create: { id: 'sl-130-1', subscriptionId: sub130.id, productVariantId: variantStorage500.id, quantity: 2, unitPricePaise: inr(2499), sortOrder: 1 },
  })

  // SUB-00131: NovaBiz - CLOSED - Monthly Support
  const sub131 = await prisma.subscription.upsert({
    where: { number: 'SUB-00131' },
    update: {},
    create: {
      number: 'SUB-00131',
      customerId: customerMap['NovaBiz Enterprises'],
      planId: planMonthlySupport.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.CLOSED,
      startDate: T(-120),
      endDate: T(-5),
      closedAt: T(-5),
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-131-1' },
    update: {},
    create: { id: 'sl-131-1', subscriptionId: sub131.id, productVariantId: variantSupportStarter.id, quantity: 1, unitPricePaise: inr(3999), sortOrder: 1 },
  })

  // SUB-00132: CloudPeak - ACTIVE - Monthly Support
  const sub132 = await prisma.subscription.upsert({
    where: { number: 'SUB-00132' },
    update: {},
    create: {
      number: 'SUB-00132',
      customerId: customerMap['CloudPeak Corp'],
      planId: planMonthlySupport.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.ACTIVE,
      startDate: T(-30),
      nextBillingDate: T(1),
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-132-1' },
    update: {},
    create: { id: 'sl-132-1', subscriptionId: sub132.id, productVariantId: variantSupportEnterprise.id, quantity: 1, unitPricePaise: inr(14999), sortOrder: 1 },
  })

  // SUB-00133: ZenVault - ACTIVE - Monthly Storage
  const sub133 = await prisma.subscription.upsert({
    where: { number: 'SUB-00133' },
    update: {},
    create: {
      number: 'SUB-00133',
      customerId: customerMap['ZenVault Tech'],
      planId: planMonthlyStorage.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.DUE_ON_RECEIPT,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.ACTIVE,
      startDate: T(-15),
      nextBillingDate: T(16),
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-133-1' },
    update: {},
    create: { id: 'sl-133-1', subscriptionId: sub133.id, productVariantId: variantStorage100.id, quantity: 3, unitPricePaise: inr(999), sortOrder: 1 },
  })

  // SUB-00134: StarForge - ACTIVE - Yearly Analytics
  const sub134 = await prisma.subscription.upsert({
    where: { number: 'SUB-00134' },
    update: {},
    create: {
      number: 'SUB-00134',
      customerId: customerMap['StarForge Innovations'],
      planId: planYearlyAnalytics.id,
      billingPeriod: BillingPeriod.YEARLY,
      paymentTerms: PaymentTerms.NET_30,
      isPausable: false,
      isRenewable: true,
      isClosableEarly: false,
      autoClose: true,
      status: SubscriptionStatus.ACTIVE,
      startDate: T(-20),
      nextBillingDate: T(345),
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-134-1' },
    update: {},
    create: { id: 'sl-134-1', subscriptionId: sub134.id, productVariantId: variantAnalyticsBasic.id, quantity: 1, unitPricePaise: inr(24999), sortOrder: 1 },
  })

  // SUB-00135: Meridian - PENDING - Monthly Support
  const sub135 = await prisma.subscription.upsert({
    where: { number: 'SUB-00135' },
    update: {},
    create: {
      number: 'SUB-00135',
      customerId: customerMap['Meridian Software'],
      planId: planMonthlySupport.id,
      billingPeriod: BillingPeriod.MONTHLY,
      paymentTerms: PaymentTerms.NET_15,
      isPausable: true,
      isRenewable: true,
      isClosableEarly: true,
      autoClose: false,
      status: SubscriptionStatus.PENDING,
      startDate: T(0),
      nextBillingDate: T(1),
    },
  })
  await prisma.subscriptionLine.upsert({
    where: { id: 'sl-135-1' },
    update: {},
    create: { id: 'sl-135-1', subscriptionId: sub135.id, productVariantId: variantSupportEnterprise.id, quantity: 1, unitPricePaise: inr(14999), sortOrder: 1 },
  })

  // ── 8. Invoices (INV-00456, INV-00457, INV-00458) ─────────────────
  // INV-00456: Techcraft - PAID
  const inv456 = await prisma.invoice.upsert({
    where: { number: 'INV-00456' },
    update: {},
    create: {
      number: 'INV-00456',
      subscriptionId: sub128.id,
      status: InvoiceStatus.PAID,
      billingPeriodStart: T(-60),
      billingPeriodEnd: T(-31),
      dueDate: T(-60),
      subtotalPaise: inr(999),
      discountPaise: inr(99),
      taxPaise: inr(162), // CGST 9% (81) + SGST 9% (81) on 900
      totalPaise: inr(1062),
      paidPaise: inr(1062),
      paidAt: T(-55),
      sentAt: T(-59),
    },
  })
  await prisma.invoiceLine.upsert({
    where: { id: 'il-456-1' },
    update: {},
    create: { id: 'il-456-1', invoiceId: inv456.id, productVariantId: variantStorage100.id, description: '100 GB Storage', quantity: 1, unitPricePaise: inr(999), subtotalPaise: inr(999), sortOrder: 1 },
  })
  await prisma.invoiceTax.upsert({
    where: { id: 'it-456-cgst' },
    update: {},
    create: { id: 'it-456-cgst', invoiceId: inv456.id, taxId: cgst.id, taxName: 'CGST 9%', taxType: TaxType.CGST, rateBps: 900, amountPaise: inr(81) },
  })
  await prisma.invoiceTax.upsert({
    where: { id: 'it-456-sgst' },
    update: {},
    create: { id: 'it-456-sgst', invoiceId: inv456.id, taxId: sgst.id, taxName: 'SGST 9%', taxType: TaxType.SGST, rateBps: 900, amountPaise: inr(81) },
  })
  await prisma.payment.upsert({
    where: { id: 'pay-456-1' },
    update: {},
    create: { id: 'pay-456-1', invoiceId: inv456.id, amountPaise: inr(1062), paymentMethod: PaymentMethod.BANK_TRANSFER, paidAt: T(-55), reference: 'NEFT-2024-10-001' },
  })

  // INV-00457: Acme - SENT (Overdue computed tag: dueDate < now && paidPaise < totalPaise)
  const inv457 = await prisma.invoice.upsert({
    where: { number: 'INV-00457' },
    update: {},
    create: {
      number: 'INV-00457',
      subscriptionId: sub129.id,
      status: InvoiceStatus.SENT,
      billingPeriodStart: T(-180),
      billingPeriodEnd: T(185),
      dueDate: T(-150), // past due date
      subtotalPaise: inr(49999),
      discountPaise: 0,
      taxPaise: inr(8999), // IGST 18% (inter-state)
      totalPaise: inr(58998),
      paidPaise: 0,
      sentAt: T(-179),
    },
  })
  await prisma.invoiceLine.upsert({
    where: { id: 'il-457-1' },
    update: {},
    create: { id: 'il-457-1', invoiceId: inv457.id, productVariantId: variantAnalyticsPro.id, description: 'Pro Analytics', quantity: 1, unitPricePaise: inr(49999), subtotalPaise: inr(49999), sortOrder: 1 },
  })
  await prisma.invoiceTax.upsert({
    where: { id: 'it-457-igst' },
    update: {},
    create: { id: 'it-457-igst', invoiceId: inv457.id, taxId: igst.id, taxName: 'IGST 18%', taxType: TaxType.IGST, rateBps: 1800, amountPaise: inr(8999) },
  })

  // INV-00458: BlueWave - DRAFT (Partially paid computed tag: paidPaise > 0 && paidPaise < totalPaise)
  const inv458 = await prisma.invoice.upsert({
    where: { number: 'INV-00458' },
    update: {},
    create: {
      number: 'INV-00458',
      subscriptionId: sub130.id,
      status: InvoiceStatus.DRAFT,
      billingPeriodStart: T(-90),
      billingPeriodEnd: T(-61),
      dueDate: T(-90),
      subtotalPaise: inr(4998),
      discountPaise: 0,
      taxPaise: inr(899),
      totalPaise: inr(5897),
      paidPaise: inr(2000), // partial payment
      sentAt: T(-89),
    },
  })
  await prisma.invoiceLine.upsert({
    where: { id: 'il-458-1' },
    update: {},
    create: { id: 'il-458-1', invoiceId: inv458.id, productVariantId: variantStorage500.id, description: '500 GB Storage x2', quantity: 2, unitPricePaise: inr(2499), subtotalPaise: inr(4998), sortOrder: 1 },
  })
  await prisma.invoiceTax.upsert({
    where: { id: 'it-458-cgst' },
    update: {},
    create: { id: 'it-458-cgst', invoiceId: inv458.id, taxId: cgst.id, taxName: 'CGST 9%', taxType: TaxType.CGST, rateBps: 900, amountPaise: inr(450) },
  })
  await prisma.invoiceTax.upsert({
    where: { id: 'it-458-sgst' },
    update: {},
    create: { id: 'it-458-sgst', invoiceId: inv458.id, taxId: sgst.id, taxName: 'SGST 9%', taxType: TaxType.SGST, rateBps: 900, amountPaise: inr(450) },
  })
  await prisma.payment.upsert({
    where: { id: 'pay-458-1' },
    update: {},
    create: { id: 'pay-458-1', invoiceId: inv458.id, amountPaise: inr(2000), paymentMethod: PaymentMethod.CASH, paidAt: T(-80) },
  })

  // ── 9. Quotation Templates ────────────────────────────────────────
  const qt1 = await prisma.quotationTemplate.upsert({
    where: { id: 'qt-storage-basic' },
    update: {},
    create: { id: 'qt-storage-basic', planId: planMonthlyStorage.id, name: 'Storage Starter Pack', description: '100 GB storage bundle' },
  })
  await prisma.quotationTemplateLine.upsert({
    where: { id: 'qtl-storage-basic-1' },
    update: {},
    create: { id: 'qtl-storage-basic-1', quotationTemplateId: qt1.id, productVariantId: variantStorage100.id, description: '100 GB Cloud Storage', quantity: 1, unitPricePaise: inr(999), sortOrder: 1 },
  })

  const qt2 = await prisma.quotationTemplate.upsert({
    where: { id: 'qt-analytics-enterprise' },
    update: {},
    create: { id: 'qt-analytics-enterprise', planId: planYearlyAnalytics.id, name: 'Enterprise Analytics Bundle', description: 'Pro analytics platform subscription' },
  })
  await prisma.quotationTemplateLine.upsert({
    where: { id: 'qtl-analytics-1' },
    update: {},
    create: { id: 'qtl-analytics-1', quotationTemplateId: qt2.id, productVariantId: variantAnalyticsPro.id, description: 'Pro Analytics Platform', quantity: 1, unitPricePaise: inr(49999), sortOrder: 1 },
  })

  // ── 10. Update Sequences to reflect seeded records ───────────────────
  await prisma.sequence.update({ where: { id: 'SUB' }, data: { current: 135 } })
  await prisma.sequence.update({ where: { id: 'INV' }, data: { current: 458 } })

  console.log('\n🎉 Brightloop seed completed successfully!')
  console.log('--------------------------------------------------')
  console.log('Admin:    rajesh@brightloop.in    / admin@123')
  console.log('Staff:    priya.p@brightloop.in   / staff@123')
  console.log('Customer: contact@techcraft.in    / customer@123')
  console.log('--------------------------------------------------')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
