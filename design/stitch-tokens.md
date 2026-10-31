# Design System: Brightloop Subscriptions

A modern, high-trust B2B SaaS subscription management and recurring revenue platform tailored for finance teams and enterprise operations.

---

## 1. Visual Foundation & Color Palette

### Primary & Accent
- **Primary / Brand**: `#4F46E5` (Indigo 600) — Core CTA, active navigation indicators, key highlights.
- **Primary Hover / Active**: `#4338CA` (Indigo 700)
- **Primary Container / Tint**: `#EEF2FF` (Indigo 50) — Subtle active badges, selection fills.

### Neutrals & Surfaces
- **Page Background**: `#F3F4F6` (Gray 100) — Crisp, neutral desktop and mobile canvas.
- **Card / Container Background**: `#FFFFFF` (Pure White) — Elevated card surfaces.
- **Subtle Surface / Table Headers**: `#F9FAFB` (Gray 50) — Table header backgrounds, input read-only fills.
- **Borders & Dividers**: `#E5E7EB` (Gray 200) — Clean, hairline card borders and structural dividers.
- **Muted Borders**: `#F3F4F6` (Gray 100)

### Typography Colors
- **Text Headings / Bold**: `#111827` (Gray 900) — Primary page titles, prominent numerical amounts.
- **Text Body**: `#374151` (Gray 700) — Form labels, table cells, descriptive copy.
- **Text Secondary / Muted**: `#6B7280` (Gray 500) — Subtitles, helper captions, timestamps.
- **Text Placeholder**: `#9CA3AF` (Gray 400)

### Semantic & Status Tokens
- **Success / Active / Paid**: 
  - Text/Border: `#059669` (Emerald 600)
  - Surface/Badge: `#ECFDF5` (Emerald 50)
- **Warning / Pending / Due Soon**: 
  - Text/Border: `#D97706` (Amber 600)
  - Surface/Badge: `#FFFBEB` (Amber 50)
- **Danger / Overdue / Destructive**: 
  - Text/Border: `#DC2626` (Red 600)
  - Surface/Badge: `#FEF2F2` (Red 50)
- **Info / Draft / Neutral**: 
  - Text/Border: `#4B5563` (Gray 600)
  - Surface/Badge: `#F3F4F6` (Gray 100)

---

## 2. Typography & Hierarchy

- **Primary Font Family**: `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Monospace / Numerical**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` (used for tabular currency values and statutory codes).

### Type Scale
- **Display / App Titles**: `24px` (`text-2xl`), font weight `700` (`font-bold`), tracking `-0.02em`
- **Section Headers**: `18px` (`text-lg`), font weight `600` (`font-semibold`)
- **Card Subheadings / Group Titles**: `14px` (`text-sm`), font weight `600` (`font-semibold`), uppercase with tracking `0.05em`
- **Body Regular**: `14px` (`text-sm`), line height `1.5`, font weight `400`
- **Labels & Microcopy**: `12px` (`text-xs`), font weight `500` (`font-medium`)
- **Monetary / Tabular Figures**: `text-sm` or `text-base`, `tabular-nums font-semibold`

---

## 3. Elevation, Radius & Spacing

- **Border Radius**:
  - Cards & Modals: `rounded-xl` (`12px`)
  - Inputs, Buttons & Table Wrappers: `rounded-lg` (`8px`)
  - Status Badges & Pills: `rounded-full` (`9999px`)
- **Shadows**:
  - Card Default: `shadow-sm` (`0 1px 2px 0 rgb(0 0 0 / 0.05)`)
  - Floating Modals / Dropdowns: `shadow-lg` (`0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`)
- **Spacing Rhythm**: 4px baseline grid (`space-1` = 4px, `space-2` = 8px, `space-4` = 16px, `space-6` = 24px).

---

## 4. Navigation Architecture & Layouts

### Admin App Shell (Desktop)
- **Collapsible Left Sidebar** (`w-64`, fixed height, border-r):
  - **Brand Emblem & Workspace Name**: Brightloop Subscriptions
  - **Primary Navigation Items**:
    1. Dashboard
    2. Customers
    3. Products
    4. Plans
    5. Quotation Templates
    6. Subscriptions
    7. Invoices
    8. Payments
    9. Reports
  - **"Admin only" Section Divider**:
    1. Discounts
    2. Taxes
    3. Staff
- **Top Bar**: Search bar (`⌘K`), quick-action buttons, notifications, user profile menu with role badge.

### Staff App Shell (Desktop)
- Identical layout to Admin Shell, with key governance guardrails:
  - Hides the entire **Admin only** group (Discounts, Taxes, Staff).
  - Displays **Products** and **Plans** in read-only mode.

### Customer Portal (Desktop & Mobile)
- **Simplified Top-Navigation** (no sidebar):
  - Brand Logo + Links: **My Subscriptions**, **My Invoices**, **Account**.
  - Right-aligned profile dropdown showing the customer organization (`Techcraft Solutions Pvt Ltd`) and **Log out**.
- **Mobile View**: Ergonomic 3-destination docked bottom navigation bar (*Subscriptions*, *Invoices*, *Account*).

---

## 5. Domain & Business Rules

1. **Currency & Number Formatting**:
   - Currency: Indian Rupee (`₹`) formatted with standard Indian digit grouping (`₹ 14,50,000.00`).
   - Identifiers: Sequential, non-dated formats: `SUB-00128`, `INV-00456`.
2. **Lifecycle Status Rules**:
   - **Subscriptions**: `Draft` → `Quotation` → `Confirmed` → `Active` → `Closed`.
   - **Invoices**: Core stages are strictly `Draft` → `Confirmed` → `Paid`.
   - Tags like `Overdue` and `Partially paid` are treated as auxiliary badge tags, not stages.
3. **Statutory Tax Alignment**:
   - `CGST + SGST` applied for intra-state supply (Maharashtra 27 code).
   - `IGST` applied for inter-state supply.
   - Taxes appear strictly on Subscriptions and Invoices (never on Plan, Product, or Template creation forms).
4. **Payment Methods**:
   - Methods are standardized to: `Card`, `Bank Transfer`, `Cash`, `UPI` with an explicit `Note` field.
5. **Password Checklist**:
   - Standardized 4-point live validation checklist:
     - *9 or more characters*
     - *one uppercase*
     - *one lowercase*
     - *one special character*
