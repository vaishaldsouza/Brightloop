# Brightloop Subscriptions

Enterprise B2B Subscription Management, GST-Compliant Invoicing, and Recurring Revenue Operations Engine.

## Stack Architecture

- **Framework:** Next.js 15 (App Router, TypeScript Strict, React 19)
- **Database:** PostgreSQL 17 (Docker containerized)
- **ORM:** Prisma 6 with custom SQL migrations
- **Authentication:** NextAuth.js v5 (JWT Strategy, Credentials Provider, Bcrypt password hashing)
- **Styling:** Tailwind CSS v3 using institutional Design Tokens (`./design/tailwind.tokens.js`)
- **Validation:** Zod schemas
- **PDF Generation:** `@react-pdf/renderer`
- **Background Jobs:** `pg-boss`

## Key Architectural Invariants

1. **Integer Currency Arithmetic:** All monetary amounts are stored as integers in **paise** (1 INR = 100 paise). Floating-point arithmetic is strictly prohibited.
2. **Billing Idempotency:** PostgreSQL partial unique index enforced at the database level:
   ```sql
   CREATE UNIQUE INDEX "invoices_subscription_billing_period_start_active_idx" 
   ON "invoices"("subscriptionId", "billingPeriodStart") 
   WHERE "cancelledAt" IS NULL;
   ```
   Prevents double-billing a subscription for the same period unless the previous invoice was cancelled (`cancelledAt` timestamp applied).
3. **Plan Feature Snapshots:** Subscription records snapshot plan parameters (`billingPeriod`, `paymentTerms`, `isPausable`, `isRenewable`, `isClosableEarly`, `autoClose`) at creation time to prevent downstream mutations when plans are edited.
4. **Server-Level RBAC:** Three distinct user roles (`ADMIN`, `STAFF`, `CUSTOMER`) enforced at Edge middleware, API route handlers, and database access layer.

## Quickstart

### 1. Database Setup
```bash
docker run -d --name brightloop-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=brightloop123 -e POSTGRES_DB=brightloop -p 5432:5432 postgres:17
```

### 2. Environment Variables
Copy `.env.example` to `.env` and `.env.local`:
```bash
cp .env.example .env
```

### 3. Migrations & Seeding
```bash
npx prisma migrate dev
npx prisma db seed
```

### 4. Run Foundation Verification Suite
```bash
npx ts-node scripts/verify-foundation.ts
```

### 5. Start Development Server
```bash
npm run dev
```

## Seed Credentials (PRD §12)

| Role | Email | Password | Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `rajesh@brightloop.in` | `admin@123` | Full administrative control |
| **Staff** | `priya.p@brightloop.in` | `staff@123` | Operations, read-only products/plans |
| **Customer** | `contact@techcraft.in` | `customer@123` | Self-service portal (Techcraft Solutions) |
| **Customer** | `info@acmetech.in` | `customer@123` | Self-service portal (Acme Technologies) |
| **Customer** | `admin@bluewave.in` | `customer@123` | Self-service portal (BlueWave Systems) |
