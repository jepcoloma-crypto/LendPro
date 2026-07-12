# LendPro — Enterprise Lending Management System

A full-featured loan origination, servicing, and cash management platform built with **Node.js/Express + PostgreSQL** (backend) and **React 19 + TypeScript** (frontend).

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
│   40+ tables, migrations         │
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
- 15-minute idle session timeout

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
- **Advance balance** — excess payments credited as prepayment, reduces outstanding balance, never auto-consumed
- Overdue and delinquent (5+ days) status computed on-the-fly
- Loan restructuring and write-off
- Automated penalty calculation (pre/post maturity)

### Payment Processing
- **Quick Payment** — pays overdue schedules first, remainder cascades forward
- **Per-Installment** — user picks which schedules to pay
- **Advance Distribution** — apply advance balance to specific schedules
- Payment reversal via cancellation workflow (approval required)
- Idempotency key to prevent duplicate payments
- Overpayment validation (rejects if amount exceeds outstanding balance)

### Cash Management

| Feature | Details |
|---|---|
| **Shift Management** | Open/close with opening float, date validation |
| **Cash Transactions** | Auto-recorded for every payment, expense, income |
| **Cash Counts** | Denomination-level breakdown recording |
| **Reconciliation** | Variance tracking with threshold-based auto-approval |
| **Collector Pickups** | Cash remittance tracking with variance handling |
| **Approval Workflow** | Variance approval/rejection/recount requests |

### Collections
- Due Today / Overdue / Delinquent tabs
- Collection case management with promise-to-pay tracking
- Field visit recording with geo-coordinates
- Collector assignment and performance tracking

### Reports
- **Loan Performance:** Aging, Delinquency, Amortization, Portfolio Summary, Past Due, Loans Granted
- **Financial:** Interest Income, Processing Charges, Cash Flow, Branch P&L
- **Collector:** Performance, Remittance, Visits, Payments
- **Cash:** Collection Summary, Variance Summary, Method Summary, Daily Position
- **Borrower:** Performance, Master List
- **Operational:** Daily Collections, Disbursements, Expected Collections

### Notifications
- Email via Nodemailer
- SMS/WhatsApp via Twilio
- Balance inquiry via SMS webhook (PIN-authenticated)
- Notification queue with delivery tracking

### Audit & Security
- **Audit Trail** — every CRUD operation logged (old/new values, IP, user agent)
- **Idempotency** — payment deduplication via Idempotency-Key header (24h TTL)
- **Rate Limiting** — auth endpoints (100/15min), sensitive operations (20/15min)
- **Shift Validation** — payment date must match shift date
- **Cancellation Workflow** — request → approve/reject (admin/super-admin only)
- **Direct Cancellation** — restricted to super-admin/admin only

---

## Database Schema (40+ tables)

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
| `operating_expenses`, `other_income` | Branch-level P&L tracking |

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
| Reports | `/api/reports` | 20+ reporting endpoints |
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
- **Overdue vs Delinquent** — overdue = 1+ day past due, delinquent = 5+ days past due (both computed on-the-fly, no explicit DB status)
- **Shift Date Validation** — payment date must match open shift date (not today's date), allowing recording of prior-day payments on an open shift
- **Idempotency** — Idempotency-Key header with 24h TTL prevents duplicate payment processing from network retries
- **Audit Trail** — middleware-based; automatically captures old/new values on every mutation endpoint
- **Penalty Calculation** — proportional distribution across overdue schedules; matured loans use higher penalty rate
