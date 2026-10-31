# PRD: Subscription Management System (Brightloop Software)

## 1. Overview

- **Problem:** Brightloop tracks subscriptions in spreadsheets, hand-types invoices, matches payments manually, and can’t state its recurring revenue.
- **Solution:** One platform covering products, plans, subscriptions, invoicing, payments and revenue reporting, with role-based access and a customer self-service portal.

## 2. Goals and Success Metrics

- 100% of invoices auto-generated from subscriptions, with zero duplicates or skipped billings
- Every page responds in under 2 seconds with 1,000s of subscriptions
- Finance lead sees active subscriptions, revenue, outstanding amounts and overdue invoices in one dashboard
- Customers manage their own subscriptions without emailing staff

## 3. Users and Roles

| Role | Access |
| :--- | :--- |
| **Admin** | Full control: products, plans, taxes, discounts, staff creation, all data |
| **Internal staff** | Day-to-day work: customers, quotations, subscriptions, invoices, payments. No config (taxes, discounts, plans) or staff creation |
| **Customer** | Portal only: own subscriptions and invoices |

## 4. Functional Requirements

### 4.1 Authentication and Accounts
- Signup with email and password. Email must be unique.
- Password must be longer than 8 characters (9 or more), with at least one uppercase letter, one lowercase letter and one special character.
- Forgot password sends a time-limited, single-use reset link to the registered email.
- Only Admin can create staff accounts. Signup always creates a Customer.
- RBAC enforced server-side on every endpoint.

### 4.2 Products and Variants
- Product fields: name, type, sales price, cost price, notes.
- Variants by attribute (e.g. brand) with a price extra (e.g. Odoo = +560). Final price = base price + variant extra.
- Admin only.

### 4.3 Plans
- Fields: name, price, billing period (daily, weekly, monthly or yearly), minimum quantity, available-from and available-to dates.
- Per-plan flags set by the admin: auto-close at end date, closable early, pausable, renewable.
- Plans are only selectable within their availability window.

### 4.4 Quotation Templates
- Predefined plan and product lines, plus a validity period in days.
- Creating a quotation from a template pre-fills lines. Lines remain editable.
- Quotations expire after the validity period.

### 4.5 Subscriptions
- Fields: unique auto-generated number, customer, plan, start date, expiry date, payment terms.
- Lines: product, quantity, unit price, taxes, amount.
- Status flow: Draft → Quotation → Confirmed → Active → Closed.
- Status is visible to all team members. Transitions are validated, with no skipping and an audit log.
- Paused is a boolean flag (`isPaused`), not a status. Paused subscriptions are skipped by the billing job and bill nothing for the paused time.
- Pause and renew actions are available only if the plan permits them.
- An expired quotation (validity days passed, not confirmed) moves to Closed.
- Due date = invoice date + payment terms (Net 15, Net 30, Due on receipt).

### 4.6 Invoicing
- A scheduled billing job creates invoices from Active subscriptions that are due.
- Invoices are pre-filled with customer details, lines, taxes, discounts and totals.
- Idempotency: unique key on `(subscriptionId, billingPeriodStart)` only where `cancelledAt IS NULL` (partial unique index) prevents double billing. The job is retry-safe, and missed runs catch up.
- Stored status flow: Draft → Confirmed → Paid. Actions: confirm, cancel (allowed only while the invoice has zero payments), send (email), print/PDF.
- Cancellation: cancel sets `cancelledAt` on the invoice. Cancelled is NOT a status. Cancelled invoices are hidden from default lists and excluded from all totals.
- Taxes are applied automatically from admin-defined rules and shown only on subscription and invoice screens.

### 4.7 Taxes
- Admin-defined rules: name, percentage, applicable products, and "applies when" (intra-state or inter-state).
- Seeded rules: CGST 9% and SGST 9% (intra-state), IGST 18% (inter-state).
- Company state is Maharashtra; determined per invoice by comparing company state with customer state.
- Taxes are computed per line and totalled on the invoice; shown only on subscription and invoice screens (not on plan, product, or template forms).

### 4.8 Discounts
- Admin only. Type is fixed amount or percentage.
- Conditions: minimum purchase or quantity, start and end dates, usage limit.
- Scope: specific products or whole subscriptions.
- Applied automatically on the next invoice while valid. It stops at expiry or when the usage limit is hit, and usage count increments atomically.

### 4.9 Payments
- Record against an invoice: method, amount, date, note.
- Supports partial and multiple payments per invoice. The invoice becomes Paid automatically when the total received is at least the invoice total.
- Stored statuses are strictly Draft, Confirmed, Paid.
- "Overdue" (status Confirmed, due date < today, amount due > 0; no grace period) and "Partially paid" (0 < total received < invoice total) are derived tags computed at query time, never stored as a database status. The dashboard counts these via queries.

### 4.10 Dashboard and Reporting
- KPIs:
  - Active subscriptions: count of subscriptions with status Active.
  - Revenue collected: sum of payments with payment date in the filter range.
  - Amount outstanding: sum of amount due on Confirmed invoices.
  - Overdue invoices: count and sum of invoices with status Confirmed, due date < today, and amount due > 0 (no grace period).
- Filters by date range, plan, customer and status. Summary view plus drill-down lists.
- Pagination, indexing and pre-aggregation to meet the 2-second target.

### 4.11 Customer Portal
- View own subscriptions and invoices, and download invoice PDFs.
- Self-service actions (pause, close, renew) only where the plan allows.

## 5. Core Data Entities

`User`, `Role`, `Customer` (User with role CUSTOMER plus profile: name, email, gstin [optional], state, billing address), `Product`, `ProductVariant`, `Plan`, `QuotationTemplate` (+lines), `Subscription` (+lines), `Invoice` (+lines), `Tax`, `Discount` (+usage), `Payment`, `AuditLog`.

## 6. Non-Functional Requirements

- **Performance:** page loads under 2 seconds. Indexes on status, due date, customer and subscription number. Server-side pagination.
- **Security:** hashed passwords (bcrypt/argon2), HTTPS, row-level scoping for customers, rate-limited login and reset.
- **Reliability:** transactional invoice creation, a billing job with logs, and alerts on failure.
- **Auditability:** log status changes, discount application and payments.

## 7. Key Edge Cases

- Billing job runs twice or fails midway: no duplicates, resumes cleanly.
- A discount expires between invoice creation and confirmation: the price at creation stands.
- Plan changes after subscription creation: existing subscriptions keep their terms.
- Overpayment or partial payment handling.
- Cancelled invoice: an invoice can be cancelled only while it has no payments. Cancellation sets `cancelledAt` (not a status), which frees its billing period via the partial unique index, but re-billing the period requires an explicit admin action.

## 8. Out of Scope (v1)

Payment gateway integration, multi-currency, dunning automation, proration, external accounting sync. These are candidate v2 items.

## 9. Suggested Milestones

1. Auth, roles, products, variants, plans
2. Quotation templates and subscription lifecycle
3. Taxes, discounts, invoice engine and billing job
4. Payments and customer portal
5. Dashboard, performance tuning, testing

## 10. Acceptance Criteria (Samples)

- A signup with a duplicate email is rejected.
- A password of exactly 8 characters is rejected.
- Staff cannot create discounts or other staff accounts.
- Running the billing job twice for the same period produces one invoice.
- A discount at its usage limit does not appear on the next invoice.
- The dashboard loads in under 2 seconds with 10,000 subscriptions.

## 11. Decisions (formerly Open Questions)

- **Payment Recording:** Payments are recorded manually in v1 (no gateway).
- **Discount Usage Limits:** Discount usage limit is global, not per customer.
- **Paused Subscriptions:** Paused subscriptions skip billing and bill nothing for the paused duration (see 4.5).
- **Overdue Invoices:** Overdue has no grace period (overdue as soon as due date < today and amount due > 0; see 4.9 and 4.10).

## 12. Seed Data

Dates are relative to the day the seed script runs (today = T). Company state: Maharashtra. Money amounts stored in paise in the database (integers).

### 12.1 Users & Roles
- **Admin:** Rajesh Sharma (`rajesh@brightloop.in`)
- **Internal Staff:** Priya Patel (`priya.p@brightloop.in`)
- **Customer Logins:** Seeded accounts for each customer listed below.

### 12.2 Taxes
- CGST 9% (intra-state, Maharashtra)
- SGST 9% (intra-state, Maharashtra)
- IGST 18% (inter-state)

### 12.3 Products & Variants
- **Product:** Cloud Core Platform
  - **Variant Attribute:** Brand
  - **Variant Option:** Odoo (+₹560 price extra)

### 12.4 Plans
- **Enterprise Annual:** Yearly billing, pausable: false, renewable: true, closable early: false.
- **Growth Monthly:** Monthly billing, pausable: true, renewable: true, closable early: true.

### 12.5 Discounts
- **ENT-10:** 10% off whole subscriptions, min quantity 1, usage limit 50, valid from T-30 to T+90.

### 12.6 Customers, Subscriptions & Invoices

1. **Techcraft Solutions Pvt Ltd** (Maharashtra, Intra-state)
   - **Subscription SUB-00128:** Status: `Active`, Plan: Enterprise Annual.
     - Line 1: Core Enterprise Cloud License, qty: 100 × ₹12,000 = ₹12,00,000
     - Line 2: 24/7 Dedicated TAM & SLA, qty: 1 × ₹1,50,000 = ₹1,50,000
     - Line 3: Dedicated Database Shard, qty: 2 × ₹50,000 = ₹1,00,000
   - **Invoice INV-00456 (SUB-00128):** Date: T-30, Due Date: T (Net 30), Status: `Confirmed`.
     - Subtotal: ₹14,50,000; CGST (9%): ₹1,30,500; SGST (9%): ₹1,30,500; Total: ₹17,11,000.
     - **Payment:** ₹10,00,000 via Bank Transfer on T-19, note: "Advance milestone".
     - Amount due: ₹7,11,000. Derived tag: `Partially paid`. NOT overdue (due today).

2. **Acme Technologies Pvt Ltd** (Karnataka, Inter-state)
   - **Subscription SUB-00129:** Status: `Active`, Plan: Growth Monthly.
     - Line: Growth Cloud Service, subtotal: ₹3,60,000.
   - **Invoice INV-00457 (SUB-00129):** Date: T-46, Due Date: T-16, Status: `Confirmed`.
     - Subtotal: ₹3,60,000; IGST (18%): ₹64,800; Total: ₹4,24,800.
     - Payments: None.
     - Amount due: ₹4,24,800. Derived tag: `Overdue 16 days`.

3. **BlueWave Systems** (Maharashtra, Intra-state)
   - **Subscription SUB-00130:** Status: `Active`, Plan: Growth Monthly.
     - Line: Growth Cloud Service, subtotal: ₹2,00,000.
   - **Invoice INV-00458 (SUB-00130):** Date: T-21, Due Date: T-6, Status: `Paid`.
     - Subtotal: ₹2,00,000; CGST (9%): ₹18,000; SGST (9%): ₹18,000; Total: ₹2,36,000.
     - **Payment:** ₹2,36,000 via UPI on T-8, note: "UPI ref 782341".
     - Amount due: ₹0.

4. **Additional Customers (Ensuring All Statuses Appear):**
   - **Customer 4: Nexus Digital Cloud**
     - `SUB-00131`: Status: `Draft`, Plan: Growth Monthly.
   - **Customer 5: Apex Scale Dynamics**
     - `SUB-00132`: Status: `Quotation`, Plan: Enterprise Annual. Quotation validity: 30 days.
   - **Customer 6: Zeta Analytics India**
     - `SUB-00133`: Status: `Confirmed`, Plan: Enterprise Annual.
   - **Customer 7: NovaCloud Infra LLP**
     - `SUB-00134`: Status: `Closed`, Plan: Growth Monthly.
   - **Customer 8: Solaris Media Labs**
     - `SUB-00135`: Status: `Closed` (expired quotation).

### 12.7 Performance Benchmark Seed Script
- A separate dev-only script creates 10,000 subscriptions and 30,000 invoices to test the sub-2-second query and dashboard loading requirement.
