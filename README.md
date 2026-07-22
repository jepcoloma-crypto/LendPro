# LendPro — Enterprise Lending Management System

A full-featured loan origination, servicing, cash management, and field collection platform built with **Node.js/Express + PostgreSQL** (backend) and **React 19 + TypeScript + rsuite** (frontend).

---

## Architecture Overview

```
┌──────────────────────────────────┐
│      React SPA (Vercel)          │
│  React 19 / rsuite / Tailwind 4  │
│  React Router DOM v7             │
└──────────────┬───────────────────┘
               │ HTTP/JSON
┌──────────────▼───────────────────┐
│   Express REST API (PM2)         │
│   JWT Auth / Zod Validation      │
│   Rate Limiting / Audit Trail    │
│   Idempotency Key                │
├──────────────────────────────────┤
│   PostgreSQL (Supabase)          │
│   42 tables, migrations          │
└──────────────────────────────────┘
```

**Deployment:**
- **Frontend:** Vercel (`lendpro-seven.vercel.app`)
- **Backend:** Local Windows via PM2, exposed via Cloudflare Tunnel
- **Database:** Supabase PostgreSQL (Production + Staging)

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- A Supabase project (or any PostgreSQL instance)
- Cloudflare Tunnel account (for production exposure)

### Installation

```bash
# Clone and install dependencies
git clone <repo>
cd LendPro
npm run install:all

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your database credentials

# Run migrations and seed
cd server
npm run seed

# Start development
npm run dev        # concurrently starts server + client
```

### Environment Variables (`server/.env`)

| Variable | Description |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `DB_SSL` | Enable SSL (true for Supabase) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing keys |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email (nodemailer) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` | SMS/WhatsApp |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) |
| `VITE_API_BASE_URL` | Frontend API base URL (for production) |

### Seed Accounts

All seeded accounts use password `admin123`:

| Email | Role |
|---|---|
| `admin@lending.com` | Super Admin |
| `manager@lending.com` | Branch Manager |
| `officer@lending.com` | Loan Officer |
| `investigator@lending.com` | Credit Investigator |
| `cashier@lending.com` | Cashier |
| `collector@lending.com` | Collector |

---

## Role-Based Access

| Role | Access |
|---|---|
| **Super Admin** | Full system access, user management, settings, utilities |
| **Admin** | All modules except user management and system settings |
| **Branch Manager** | Branch operations, approvals, reports, staff management |
| **Loan Officer** | Application processing, borrower management |
| **Credit Investigator** | Application verification and assessment |
| **Cashier** | Payment acceptance, shift management, receipt generation |
| **Collector** | Field collections, visit tracking, payment reminders |
| **Borrower** | Self-service portal (loans, payments, statements) |

---

## Module Breakdown

### Auth & User Management
- JWT with access + refresh token rotation
- Role/permission-based authorization
- Rate-limited login (20 req/15min)
- Password policies (min 8 chars, upper+lower+digit+special)
- Login history with failure tracking
- 60-minute idle session timeout (reset on API activity + touch events)
- JWT expiry: 4h (access), refresh token rotation with retry queue (3 attempts, exponential backoff)
- Dedicated `/auth/refresh` rate limiter (500/15min)

### Loan Products
- Configurable interest types: Flat Rate, Diminishing Balance, Add-On, Daily, Monthly, Seasonal, Custom
- Product-level penalty rules and processing charge configuration
- Per-product terms (min/max amounts, durations)

### Loan Application Workflow
```
Draft → Submit → Review → Investigate → Assess → Approve → Release
                                                      ↘ Reject
```
- Multi-step approval chain
- Soft delete with trash/restore
- Document uploads per application
- Auto-generated amortization schedule preview
- Historical loan creation (import existing loans)

### Loan Servicing
- Amortization schedules with daily installment tracking
- Payment processing (Quick Payment or Per-Installment allocation)
- **Advance balance** — excess payments credited as prepayment, reduces outstanding balance, never auto-consumed, manually distributable to schedules
- Overdue status computed on-the-fly; **Delinquent** (within term + missed schedules) and **Past Due** (matured + missed schedules) classification
- Maturity-based classification: `maturity_date >= current_date` with missed schedules = delinquent; `maturity_date < current_date` with missed schedules = past due
- Loan restructuring, write-off, and release date/amount correction (admin tools)
- Automated penalty calculation (pre/post maturity)
- Daily cron (2:30 AM) auto-updates loan statuses

### Payment Processing
- **Quick Payment** — pays overdue schedules first, remainder cascades forward; searches across `active`/`delinquent`/`past_due` loans
- **Per-Installment** — user picks which schedules to pay; includes delinquent/past-due loans
- **Advance Distribution** — apply advance balance to specific schedules
- Payment reversal via cancellation workflow (approval required); direct cancellation restricted to super-admin/admin
- Idempotency key to prevent duplicate payments
- Overpayment validation (rejects if amount exceeds outstanding balance)
- **Collector payments** — attributed to loan's assigned active collector; auto-reassigns loan if current collector inactive
- **Cash Pickup** — collector remittance with denomination breakdown; creates cash transactions at pickup time (not at payment)
- **Payment Corrector** (admin tool) — reassign collector, adjust amounts, cancel

### Cash Management

| Feature | Details |
|---|---|
| **Shift Management** | Open/close with opening float, date validation (Manila TZ) |
| **Cash Transactions** | Auto-recorded for every payment, expense, income; all `::date` casts use Manila TZ |
| **Cash Counts** | Denomination-level breakdown recording |
| **Reconciliation** | Variance tracking with threshold-based auto-approval |
| **Collector Pickups** | Cash remittance tracking with variance handling; inactive collectors hidden |
| **Employee Advances** | Employee cash advance tracking (give/repay) with balance management |
| **Approval Workflow** | Variance approval/rejection/recount requests |

### Collections
- Due Today / Overdue / Delinquent tabs
- Collection case management with promise-to-pay tracking
- Field visit recording with geo-coordinates
- Collector assignment and performance tracking

### Reports
- **Loan Performance:** Aging, Delinquency, Amortization, Portfolio Summary, Past Due & Delinquent, Loans Granted, Advance Summary, Penalty Detail
- **Financial:** Interest Income, Processing Charges, Cash Flow, Branch P&L (restricted to admin/super-admin)
- **Collector:** Performance, Remittance Audit (with grand total footer), Visits, Payments
- **Cash:** Collection Summary (grouped tree view by Branch/Month), Variance Summary, Method Summary, Daily Position
- **Borrower:** Performance, Master List
- **Operational:** Daily Collections, Disbursements (excludes closed loans), Expected Collections

### Notifications
- Email via Nodemailer
- SMS/WhatsApp via Twilio
- Balance inquiry via SMS webhook (PIN-authenticated)
- Notification queue with delivery tracking

### Audit & Security
- **Audit Trail** — every CRUD operation logged (old/new values, IP, user agent); admin tools (corrections) logged separately
- **Idempotency** — payment deduplication via Idempotency-Key header (24h TTL)
- **Rate Limiting** — 6 tiers: global (1000/15min), API (300/15min keyed by userId), write (100/15min), auth (100/15min), refresh (500/15min), strict (20/15min), Twilio webhook (30/15min)
- **Shift Validation** — payment/release date must match shift date (Manila TZ)
- **Cancellation Workflow** — request → approve/reject (admin/super-admin only)
- **Direct Cancellation** — restricted to super-admin/admin only
- **Loan Corrector** (super-admin only) — adjust release date, loan amount with schedule regeneration + data integrity verification

---

## Database Schema (42 tables)

### Core Domain
| Table | Purpose |
|---|---|
| `users`, `roles`, `branches` | Authentication, authorization, organizational structure |
| `borrowers`, `co_makers`, `borrower_documents` | Borrower profiles and relationships |
| `loan_products`, `interest_types` | Product definitions and interest calculation methods |
| `loan_applications`, `application_documents`, `loan_approvals` | Application lifecycle |
| `loans`, `loan_disbursements` | Active loan accounts and disbursements |
| `amortization_schedules` | Installment-level payment schedule |
| `payments`, `payment_allocations` | Payment transactions and schedule allocation |
| `penalty_rules`, `penalties` | Penalty configuration and applied penalties |
| `collections`, `collection_visits` | Collection case management |

### Cash & Financial
| Table | Purpose |
|---|---|
| `cashier_sessions` | Shift open/close with float tracking |
| `cash_transactions` | Per-transaction cash movement |
| `cash_counts`, `cash_reconciliations` | Denomination counts and variance reconciliation |
| `collector_pickups`, `pickup_denominations` | Collector remittance pickup |
| `operating_expenses`, `other_income`, `employee_advances` | Branch-level P&L tracking and employee cash advances |

### System
| Table | Purpose |
|---|---|
| `audit_logs` | Full CRUD audit trail |
| `login_history` | Authentication attempt log |
| `idempotency_keys` | Payment deduplication (24h TTL) |
| `cancellation_requests` | Payment cancellation approval workflow |
| `approval_history` | Reconciliation approval tracking |
| `system_settings` | Key-value configuration store |
| `notifications`, `email_logs`, `sms_logs` | Notification delivery tracking |

---

## API Overview

~140+ endpoints organized by module. Key groups:

| Module | Base Path | Key Endpoints |
|---|---|---|
| Auth | `/api/auth` | login, refresh, logout, profile, change-password |
| Users | `/api/users` | CRUD, collector list |
| Borrowers | `/api/borrowers` | CRUD, documents, co-makers, PIN |
| Loans | `/api/loans` | list, dashboard, historical, schedule, write-off, restructure, distribute-advance |
| Applications | `/api/applications` | Full workflow lifecycle (submit → release) |
| Payments | `/api/payments` | create (idempotent), list, import CSV, cancel, receipt PDF |
| Cashier | `/api/cashier-sessions` | open, close, details, dashboard |
| Cash | `/api/cash-transactions`, `/api/cash-counts`, `/api/cash-reconciliations` | Full cash management |
| Pickups | `/api/pickups` | Collector cash pickup with remittance tracking |
| Reports | `/api/reports` | 20+ reporting endpoints (Loans Granted, Disbursements, Collection Summary, etc.) |
| Admin | `/api/admin` | Payment corrector, loan corrector (release date, loan amount), deactivate user |
| Advances | `/api/advances` | CRUD, repay |
| Utilities | `/api/utilities` | backup, restore, recalculate-balances, clear-data |

---

## Scripts

```bash
# Root
npm run dev          # Start server + client concurrently
npm run build        # Build both server and client

# Server
cd server && npm run dev       # Dev mode (tsx watch)
cd server && npm run build     # Compile TypeScript
cd server && npm run start     # Run compiled JS (PM2)
cd server && npm run migrate   # Run database migrations
cd server && npm run seed      # Seed staff/roles/products
cd server && npm run seed:demo # Seed demo borrowers + applications

# Client
cd client && npm run dev       # Vite dev server
cd client && npm run build     # Production build
cd client && npm run lint      # TypeScript check
```

---

## Deployment

### Backend (PM2 on Windows)
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Key processes
# lendpro-server      — Staging API (port 5000, staging DB)
# lendpro-server-prod — Production API (port 5001, production DB)
# lendpro-tunnel      — Cloudflare Tunnel

# After code changes
npx tsc                          # Compile TypeScript
pm2 restart lendpro-server-prod  # Restart production
```

### Frontend (Vercel)
```bash
cd client
npx vercel --prod      # Deploy to production
```

### Database Sync (Production → Staging)
```bash
# Dump production public schema
pg_dump --no-owner --no-acl -n public -F p -h <prod-host> -U postgres > dump.sql

# Clean and restore to staging
psql -h <staging-host> -U postgres -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql -h <staging-host> -U postgres -f dump.sql
```

---

## Key Design Decisions

- **Advance Balance** — excess payments go to advance balance (not partial on next schedule), reduces outstanding balance, shown as separate credit in UI, manually distributable to schedules
- **Delinquent vs Past Due** — delinquent = `maturity_date >= CURRENT_DATE` with missed schedules (within term); past due = `maturity_date < CURRENT_DATE` with missed schedules (matured). Both computed on-the-fly, no explicit DB columns
- **Shift Date Validation** — payment/release date must match open shift date (not today's date), allowing recording of prior-day payments on an open shift; Manila TZ throughout
- **Collector Payments** — cash transaction created at pickup time (not payment time), avoiding expected_cash inflation; payments always attributed to loan's assigned collector
- **Idempotency** — Idempotency-Key header with 24h TTL prevents duplicate payment processing from network retries
- **Audit Trail** — middleware-based; automatically captures old/new values on every mutation endpoint; admin tools have dedicated audit logging
- **Penalty Calculation** — proportional distribution across overdue schedules; matured loans use higher penalty rate; `penalty_waived` column tracks waivers for P&L accuracy
- **Rate Limiting** — 6 tiers keyed by userId for authenticated requests (branch users sharing public IPs get individual buckets)
- **Employee Advances** — separate table (`employee_advances`) with balance tracking; cash out = decrease balance, repay = increase balance; treated as receivable, not expense
- **Renewal Handling** — skips delinquent check when `previous_balance > 0`; `releaseLoan` auto-settles old loan, distributes previous balance across schedules, closes old loan + collection
- **Data Integrity** — check formula: `outstanding_balance + advance_balance = sum_remaining` (sum of unpaid schedule balances)
- **Cron Jobs** — daily 2:30 AM auto-updates loan statuses (active/delinquent/past_due/closed) based on maturity_date and overdue schedule check
