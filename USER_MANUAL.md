# LendPro User Manual

## Table of Contents
1. [Getting Started](#1-getting-started)
2. [Roles & Permissions](#2-roles--permissions)
3. [Dashboard](#3-dashboard)
4. [Borrowers](#4-borrowers)
5. [Loan Applications](#5-loan-applications)
6. [Loan Release](#6-loan-release)
7. [Active Loans](#7-active-loans)
8. [Payments](#8-payments)
9. [Collections](#9-collections)
10. [Calendar](#10-calendar)
11. [Reports](#11-reports)
12. [Administration](#12-administration)
13. [Settings & Utilities](#13-settings--utilities)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Getting Started

### Logging In
1. Open the application URL in your browser
2. Enter your **username** (or email) and **password**
3. Click **Sign In**
   > Note: You can log in with just your username (no `@lending.com` suffix needed)

### Navigation
- The **sidebar** on the left shows all pages you have access to
- On mobile screens (≤768px), the sidebar becomes a slide-in drawer — tap the hamburger icon (☰) in the top-left to open it
- The **top bar** shows the current page title, a theme toggle (🌙/☀️), and your user menu (avatar → Profile / Sign Out)

### Your Profile
1. Click your avatar (top-right) → **Profile**
2. Here you can: update your **first name**, **last name**, **phone number**
3. To change your password: enter current password + new password → **Change Password**

---

## 2. Roles & Permissions

| Role | Typical Access |
|------|---------------|
| **Super Admin** | Full access to everything (users, settings, reports, all modules) |
| **Admin** | Everything except User Management and System Settings |
| **Branch Manager** | Approve loans, view reports, manage staff, view borrowers and payments |
| **Loan Officer** | Create/edit borrowers, create/submit applications, upload documents |
| **Credit Investigator** | View applications, verify info, assess risk |
| **Cashier** | Record payments, view payment history, generate receipts |
| **Collector** | View assigned collections, record field visits, view assigned loans |
| **Borrower** | Self-service portal (view own loans, payments, statements) |

---

## 3. Dashboard

The dashboard gives you a snapshot of the entire lending operation.

### For Admins / Managers
- **KPI Cards**: Active Loans, Total Portfolio, Collection Rate, Overdue Loans
- **Trend Chart**: 6-month performance (collections vs. releases)
- **Portfolio Pie**: Active / Delinquent / Closed-Paid breakdown
- **Revenue Overview**: Interest earned and penalty income
- **Top Collectors**: Monthly ranking by collection performance
- **Recent Loans & Payments**: Latest activity

### For Collectors
A simplified view showing only your assigned loans and basic stats — no financial summaries visible.

---

## 4. Borrowers

**Path:** Borrowers → `/borrowers`

### Create a Borrower
1. Click **Add Borrower**
2. Fill in the required fields (marked with `*`)
   - **Basic Info:** First name, Last name, Date of birth, Gender, Civil status, Mobile
   - **Contact:** Email (optional)
   - **Present Address:** Street, City, Province — you can drop a pin on the map
   - **Permanent Address:** Same as present toggle available
   - **Employment:** Status, Employer name, Monthly income
   - **Business Info:** (shown when employment is "Self-Employed" / "Business Owner")
   - **Government ID:** Type and ID number
   - **Photo:** Upload a photo (optional)
3. Click **Save**

### View / Edit / Delete
- Click the **eye icon** to view full details (includes a static map of their address)
- Click the **pencil icon** to edit
- Click the **trash icon** to delete
- In the detail view, click **Payment History** to see all payments this borrower has made (with CSV export)

### Searching
Use the search bar to find borrowers by name, borrower code, or mobile number.

---

## 5. Loan Applications

**Path:** Applications → `/applications`

### The Loan Pipeline
Applications move through these stages:
```
Draft → Submitted → Under Review → Investigation → Approved → Released
                                                                  ↓
                                                            (Rejected)
```

### Create an Application
1. Click **Add Application**
2. **Step 1 — Details:**
   - Select a **Borrower** (must exist in the system)
   - Select a **Loan Product**
   - Enter **Principal Amount**
   - Enter **Term** (in months, weeks, or days — unit is set by the product)
   - Optionally override the **Installment Count**
   - Select **Payment Frequency** (Daily, Weekly, Semi-Monthly, Monthly, Quarterly)
   - Optionally assign a **Collector**
   - Enter a **Purpose** (optional)
3. **Step 2 — Documents:**
   - Upload supporting documents (ID photos, proof of income, etc.)
4. Click **Submit**

### Process an Application

| Status | Available Action | Role Needed |
|--------|-----------------|-------------|
| Draft | Edit, Submit, Delete | Loan Officer |
| Submitted | Send to Review, Reject | Branch Manager / Admin |
| Under Review | Start Investigation | Credit Investigator |
| Investigation | Approve, Reject | Branch Manager / Admin |
| Approved | Release Loan | Admin / Branch Manager |

### View Application Details
Click the **eye icon** on any application row to see:
- Status timeline (creation → submission → approvals)
- Loan details (principal, product, interest rate, term, payment frequency)
- Borrower info
- Uploaded documents
- Approval history with comments

### Print Loan Document
For approved applications, click **Print Amortization Schedule** to generate a printable document showing:
- Company letterhead (from system settings)
- Borrower information
- Full amortization schedule
- Charges breakdown
- Net proceeds calculation
- Signature lines

---

## 6. Loan Release

### Prerequisites
- Application must be in **Approved** status
- Borrower must not exceed credit limit

### Release a Loan
1. Open the approved application → Click **Release Loan**
2. A modal shows:
   - **Principal Amount** — the approved loan amount
   - **Charges** — fees deducted (processing fee, service charge, etc.) shown in red
   - **Net Proceeds** — what the borrower actually receives (principal − charges)
3. Select **Disbursement Method**: Cash, Bank Transfer, Check, GCash, PayMaya
4. Enter an optional **Reference Number** (OR number, transaction reference)
5. Click **Release ₱[net proceeds]**
6. On success, the system:
   - Creates the loan record with amortization schedule
   - Records the disbursement
   - Sets the release date and maturity date
   - Generates the loan number

### About Charges
- **Fixed charges** deduct a flat amount (e.g., ₱500 processing fee)
- **Percentage charges** deduct a percentage of principal (e.g., 1% service charge)
- Charges are automatically applied if they are:
  - **Linked to the loan product** (via Loan Products → Charges button), OR
  - **Active in the Charges Setup** (all active charges apply if none are product-specific)
- Net proceeds = Principal − Total Charges
- The borrower repays the **full principal + interest**, but only receives the **net proceeds**

---

## 7. Active Loans

**Path:** Loans → `/loans`

### Loan List
The table shows: Loan #, Borrower, Product, Principal, **Net Proceeds**, Balance, Term, Status

### View Loan Details
Click the **eye icon** to see:
- Full loan info with Net Proceeds and Total Charges
- **Charges Deducted** table showing each charge by name
- Amortization schedule (all installments with status)
- Payment history

### Edit Loan Status
Click the **pencil icon** to change the status (Active, Delinquent, Closed, Pending).

### Write Off a Loan
> Admin only
1. Click the **Write Off** icon (orange)
2. Enter the **reason** (required) and optional **amount**
3. Confirm — loan status becomes `written-off`

### Restructure a Loan
> Admin only
1. Click the **Restructure** icon (green)
2. Review the remaining principal and past-due interest
3. Enter new terms: principal, interest rate, term, payment frequency
4. The system shows a real-time preview of the new amortization schedule
5. Click **Create Restructured Loan**
   - Original loan is marked `restructured`
   - A new loan is created with the updated terms
   - Credit limits are checked

### Pay Installments
From the loan detail view, click **Pay Installments** to go directly to the Payments page with this loan pre-selected.

---

## 8. Payments

**Path:** Payments → `/payments`

### Quick Payment
1. Click **Quick Payment**
2. Select an active **Loan**
3. Enter the **Amount** (total payment)
4. Choose **Payment Method**: Cash, Bank Transfer, GCash, Maya
5. Enter optional **Reference Number** and **Notes**
6. Set the **Payment Date** (defaults to today)
7. Click **Record Payment**

### Per-Installment Payment (Recommended)
1. Click **Pay Installments** button
2. Select an active **Loan**
3. The amortization schedule appears with unpaid installments
4. For each installment, enter the **Amount** you're paying toward that installment
   - Late fees (penalties) are auto-calculated based on the product's penalty rules
   - You can override the penalty amount if needed
5. Choose **Payment Method**, **Date**, **Reference**
6. Review the total breakdown (Principal + Interest + Penalty)
7. Click **Submit Payment**

### Print Official Receipt
1. Find the payment in the list
2. Click the **Printer icon**
3. A receipt window opens with:
   - Company letterhead (from settings)
   - Receipt number
   - Amount in words
   - Payment allocation breakdown
   - Borrower details

### Edit / Delete Payments
- Click the **eye icon** to view payment details
- Click the **pencil icon** to edit notes
- Click the **trash icon** to delete (restores balances and amortization records)

### CSV Export
Click the **Download icon** to export the current payment list as CSV.

---

## 9. Collections

**Path:** Collections → `/collections`

### For Collectors
- View loans assigned to you
- Three tabs: **All**, **Due Today**, **Overdue**
- Click **View** to see borrower details and visit history

### Record a Field Visit
1. Click the **Visit icon** on a collection
2. Select **Visit Type**: Field, Office, Phone
3. Enter **Notes** about the visit
4. Select **Result**: Collected, Partial, Promise to Pay, No Contact, Refused
5. If "Promise to Pay", enter the **promised date** and **amount**
6. Set a **Next Visit Date** if needed
7. Click **Save Visit**

---

## 10. Calendar

**Path:** Calendar → `/calendar`

The calendar shows collection-related events in a visual monthly view:
- **Blue badges** — Field visits
- **Green badges** — Promise to Pay dates
- **Orange badges** — Installment due dates

**Filter by Collector** to see a specific collector's schedule. Auto-navigates to the month with the nearest upcoming event.

Click any date to see a detailed list of that day's events.

---

## 11. Reports

**Path:** Reports → `/reports`

Reports are organized into categories (tabs at top):

### Collections
- **Daily Collections** — Payments recorded on a specific date, per branch
- **Expected Collections** — Upcoming dues for a date range

### Loans
- **Loans Granted** — All released loans in a date range (includes charges, net proceeds)
- **Disbursements** — Disbursement records by method and reference
- **Portfolio Summary** — Per branch/product: counts, principal, outstanding, delinquency rate
- **Amortization Schedule** — Per borrower, with paid/partial/unpaid status

### Performance
- **Branch Performance** — Loans granted, collected amounts, delinquency/collection rates
- **Collector Performance** — Scored evaluation (A-F grades):
  - Collection Rate: 35% weight
  - Delinquency Rate: 25% weight
  - Visit Efficiency: 20% weight
  - On-Time Payments: 20% weight
  - Click a collector to drill into individual visits and payments
- **Borrower Performance** — Repayment behavior by borrower

### Risk
- **Aging Report** — Loans grouped by days overdue (buckets)
- **Delinquency Report** — All delinquent loans with days overdue

### Financial
- **Interest Income** — Monthly per branch with interest + penalty breakdown

All reports support **CSV export**; the Amortization Schedule report also supports **Print**.

---

## 12. Administration

### Users
**Path:** Users → `/users` *(Super Admin only)*

Create and manage system users:
1. Click **Add User**
2. Enter: username, email, password, first/last name, phone
3. Assign a **Role** (determines permissions)
4. Assign a **Branch** (optional)
5. Toggle **Active** status
6. Click **Save**

Edit users to update info, reset password, change role/branch, or deactivate.

### Branches
**Path:** Branches → `/branches` *(Admin/Super Admin)*

Manage company branches/locations:
- Create: name, code, address, city, province, phone, email
- Toggle active/inactive
- Branches are used in reports and user assignments

### Loan Products
**Path:** Loan Products → `/loan-products` *(Admin/Super Admin)*

Define loan products:
1. Click **Add Product**
2. Configure: name, description, interest type/rate, min/max amount, min/max term
3. **Interest Types**: Fixed, Diminishing, Add-on, Monthly Interest
4. **Term Type**: Months, Weeks, Days
5. Set **Late Payment Fee** and **Penalty** (type + value + grace period)
6. Toggle **Requires Co-Maker** and **Active** status

**Manage Charges per Product:**
- Click the **Charges** icon (violet) on any product row
- Check/uncheck charges that apply to this product
- Optionally override the default amount (for product-specific pricing)
- Charges are deducted from the principal at loan release

### Charges Setup
**Path:** Charges → `/charges` *(Admin/Super Admin)*

Define reusable charge types deducted at loan release:
1. Click **Add Charge**
2. Enter **Name** (e.g., "Processing Fee", "Documentary Stamps", "Notarial Fee")
3. **Computation Type**: Fixed Amount (₱) or Percentage (% of principal)
4. **Default Amount**: The amount (or percentage rate)
5. Toggle **Active** status
6. Click **Save**

Charges apply automatically if they are active and no product-specific charges are configured.

### Audit Logs
**Path:** Audit Logs → `/audit-logs` *(Admin/Super Admin)*

Read-only view of all system activity:
- Filter by user and action type
- See: timestamp, user, action (create/update/delete), entity type, details, IP address
- CSV export available

### Collector Remittance Audit
**Path:** Remittance Audit → `/collector-remittance` *(Admin/Super Admin)*

Verify that collector-reported payments match their field visit records:
- Flags payments recorded without a corresponding field visit within 7 days
- Filter by collector and date range
- CSV export

---

## 13. Settings & Utilities

### System Settings
**Path:** Settings → `/settings` *(Super Admin only)*

Configure global system values:
- **Company Info**: Name, Address, Phone, Email — used on all printed documents/receipts
- **Default Values**: Interest rate, penalty rate, grace period
- **Payment Reminder**: Days before due date to send reminders
- **Notifications**: Toggle SMS and email notifications
- **Number Prefixes**: Customize prefixes for:
  - Loan numbers
  - Application numbers
  - Payment numbers
  - Borrower codes
  - Receipt numbers

### Utilities
**Path:** Utilities → `/utilities` *(Super Admin only)*

| Tool | Description |
|------|-------------|
| **Health Check** | Verifies the system is running properly |
| **Recalculate Balances** | Fixes any incorrect outstanding balances |
| **Apply Penalties** | Manually trigger late penalty calculation |
| **Database Backup** | Downloads a complete SQL backup of the database |
| **Database Restore** | Upload a backup SQL file to restore (replaces all data) |
| **Clear Operational Data** | Removes all operational data (for testing environments) — requires double confirmation |

> ⚠️ **Warning:** Backup/Restore and Clear Data are destructive operations. Always create a backup before restoring.

---

## 14. Troubleshooting

### Login Issues
- "Invalid credentials" — Check your username and password
- Account deactivated — Contact your Super Admin
- Forgot password — Click "Forgot password?" on the login page

### Application Errors
- **"Failed to load" messages** — Usually a network issue. Refresh the page and try again.
- **"Credit limit exceeded"** — The borrower's total active loans would exceed their credit limit. Either increase the credit limit or reduce the loan amount.
- **"Application is not approved"** — Only approved applications can be released.

### Payment Errors
- **Payment fails to save** — Check that the amount is not zero and the loan is active
- **Receipt doesn't print** — Pop-up blocker may be preventing the print window. Allow pop-ups for this site.

### Report Issues
- **No data in reports** — Adjust the date range filter. Some reports require a date range to be set.
- **CSV export downloads empty file** — Apply the necessary filters first.

### Common Misconceptions
- **Net Proceeds vs. Principal** — The borrower repays the **full principal + interest** but only **receives the net proceeds** (principal minus charges). This is correct.
- **Charges not showing** — Ensure charges are either (a) linked to the product via Loan Products → Charges button, or (b) active in the Charges Setup (all active charges apply by default)
- **Outstanding balance includes interest** — The balance shown is principal + interest remaining, not just principal.
