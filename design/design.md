# Brightloop Design Guide

## Source of truth
- PRD.md defines behavior, roles, statuses and data rules.
- /design/screens/*.html are VISUAL REFERENCES ONLY: layout, spacing, components.
- If an HTML file conflicts with "Rules that override the HTML" below, the rules win.
- Never copy sample data, fake KPIs or marketing text from the HTML.
- Tailwind tokens: /design/tailwind.tokens.js. Reuse them in the app's Tailwind config.

## Visual tokens
- Primary indigo #4F46E5, page background #F3F4F6
- White cards, rounded-xl, border-gray-200/80, subtle shadow
- Inter font, tabular numerals for all ₹ amounts, Indian grouping (₹ 14,50,000.00)
- Material Symbols Outlined icons
- Badge colors: Draft gray, Quotation blue, Confirmed amber, Active/Paid emerald,
  Closed/Overdue rose. Use ONE style for each status on every screen.

## Layout
- Admin/Staff: fixed 256px left sidebar, 64px sticky top bar, content max-w-7xl
- Sidebar order: Dashboard, Customers, Products, Plans, Quotation Templates,
  Subscriptions, Invoices, Payments, Reports. Then divider "Admin only":
  Discounts, Taxes, Staff (lock icon on each).
- No Settings item, no help link, no "New Subscription" button in the sidebar.
- Staff: hide the Admin only group; Products and Plans are read-only
  (hide Add, Edit, Delete).
- Customer portal: top navigation, no sidebar.
- Top bar: search, notifications, profile with role badge. No gateway or
  webhook status pills.

## Screen map
| Screen | Reference file |
|---|---|
| Admin shell | screens/admin-shell.html |
| Staff shell | screens/staff-shell.html |
| Dashboard | screens/dashboard.html |
| Subscriptions list | screens/subscriptions-list.html |
| New from template | screens/subscription-new-from-template.html |
| Subscription detail | screens/subscription-detail.html |
| Invoices list | screens/invoices-list.html |
| Invoice detail | screens/invoice-detail.html |
| Record payment modal | screens/record-payment-modal.html |
| Payments list | screens/payments-list.html |
Not designed yet (build from shared components): Products, Plans, Templates,
Discounts, Taxes, Staff, Auth, Customer Portal.

## Rules that override the HTML
1. Numbers: SUB-00128, INV-00456. Never include a year (INV-2024-8841 is wrong).
2. Subscription statuses: Draft, Quotation, Confirmed, Active, Closed.
   Invoice statuses: Draft, Confirmed, Paid.
   "Overdue" and "Partially paid" are derived tags beside the status, never a
   status or a stepper step. Remove "In Review", "In Trial", "Past Due",
   "Settled / Paid", and "Overdue" as a subscription status or donut slice.
3. Actions show only when valid for the current status and role:
   - Confirm only on Draft/Quotation, never on Active
   - Invoice "Confirmed" is not a button
   - Cancel is hidden once a payment exists
   - No manual invoice creation anywhere (remove "+ Create Manual")
4. Payment methods: Card, Bank Transfer, Cash, UPI only.
   The payment form has method, amount, date, note. Merge "Reference / UTR"
   into Note. The submit button says "Record Payment" (the invoice becomes
   Paid automatically when payments reach the total).
5. Tax: CGST 9% + SGST 9% for intra-state, IGST 18% for inter-state, decided by
   comparing customer state with Brightloop's state (Maharashtra). Show tax only on
   subscription and invoice screens, never on plan, product or template forms.
   Remove IRN, e-invoice, GSTR, ITC, SAC and SKU widgets and columns.
6. Dates: never hardcode 2024 or FY24-25. Use real data and relative dates.
   Overdue days = today minus due date.
7. Remove these elements wherever they appear: dunning, retry, failed card
   retries, ARR/MRR cards, contract/MSA/Leegality bars, account manager, renewal
   policy toggle, shipping address, "Post-Audited", bank account details,
   PCI-DSS or uptime claims, "Unallocated/Suspense", "Production IN-West",
   skeleton/empty/loading preview toggles and their scripts.
8. KPI cards live only on the Dashboard. List pages have no KPI row.
9. Status filter chips come from real counts and match the status list in rule 2.
10. Sample data must reconcile across screens. Use the seed data from the PRD,
    not the HTML samples.
11. Wording: one label per action. "New from template" saves as Draft only.
    Confirming happens on the detail page.

## Components to build once
StatusBadge, TagBadge (Overdue, Partially paid), Stepper (subscription 5-step,
invoice 3-step), DataTable with server pagination, FilterBar, KpiCard,
PageHeader with breadcrumb, Modal, MoneyText (Indian grouping), RoleGuard,
PasswordChecklist ("9 or more characters", one uppercase, one lowercase,
one special character), Sidebar, TopBar.

## How to use the references
Copy structure, spacing and class patterns from the screens. Replace all
data with real data from the API. If a screen shows something not listed in
the PRD, leave it out.

## Reference tokens
- design/stitch-tokens.md has exact hex values, type scale, radius and shadow
  from Stitch. Use it for visual values only.
- Where it conflicts with the rules above, the rules above win. Specifically:
  money uses Inter with tabular-nums (not monospace); status badge colors are the
  list in "Visual tokens" (Quotation blue, Confirmed amber, Active/Paid emerald,
  Closed/Overdue rose, Draft gray); the customer profile menu shows the
  customer's name and email, not the organization name.
- Customer portal mobile uses a 3-item bottom nav (Subscriptions, Invoices, Account).
