# Reports Enhancement Backlog

> Reference document for outstanding improvements across all report modules.
> Check this file each session to prioritize remaining work.

---

## Priority Legend
- **P0** — Bug / broken functionality
- **P1** — Missing feature with backend already supporting it
- **P2** — Inconsistency / polish
- **P3** — Nice-to-have

---

## P1 — All items completed ✅

---

## Medium Priority

### P2 — Standardize Date Inputs
6 tabs use native `<input type="date">` instead of rsuite `DatePicker`:
- Loans Granted
- Disbursements
- Branch Performance
- Daily Collections
- Expected Collections
- Processing Charges

### P2 — Unify Controllers and Routes
Report endpoints are split across `report.controller.ts` and `cashflow.controller.ts`:

| Endpoint | Current location | Should be |
|---|---|---|
| Cash Flow | `cashflow.controller.ts` line 178 | `report.controller.ts` |
| Expense Report | `cashflow.controller.ts` line 253 | `report.controller.ts` |
| Income Report | `cashflow.controller.ts` line 284 | `report.controller.ts` |
| Profit & Loss | `cashflow.controller.ts` line 309 | `report.controller.ts` |
| Borrower Master List route | `routes/index.ts` line 257 (misplaced) | Move to main reports block (lines 189-207) |

### P2 — Portfolio Summary Branch Join
Portfolio Summary joins through `loan_applications → users → branches` instead of `borrowers → branches`. Inconsistent with P&L and Processing Charges which use borrower's branch.

### P2 — Missing Print Signature Blocks
Daily Collections uses a custom HTML print template that omits the standard "Prepared By / Checked By / Approved By" signature blocks present in other reports.

### P2 — Authorization Inconsistency
`GET /reports/branch-pl` requires `authorize('super-admin', 'admin')` while all other report routes only require `authenticate`. Either document this as intentional or align with other reports.

---

## Low Priority

### P3 — Loans Granted Collector Join
SQL uses `JOIN users u ON u.id = la.collector_id` (INNER JOIN), silently excluding loans without a collector. Change to LEFT JOIN or join through borrowers.

### P3 — Branch Performance Collection Rate
Formula is `collected / (principal + collected)`. Standard formula is `collected / principal`. Current formula can exceed 100%.

### P3 — Aging Report Bucket Labels
Bucket ranges have conceptual overlap: "1-5 Days" and "1-30 Days" overlap. Clarify or restructure to non-overlapping ranges (e.g., 0, 1-5, 6-30, 31-60, 61-90, 90+).

### P3 — Loan Loss Provision Rate Hardcoded
P&L uses hardcoded `provisionRate = 0.50`. Could be stored in `system_settings` table for configurability.

### P3 — Cost of Funds String Match
P&L identifies Cost of Funds by `category = 'Cost of Funds'` string comparison. Fragile if category names change. Consider a separate column or lookup table.

### P3 — Amortization Schedule: Only Active/Delinquent
Hardcoded `WHERE l.status IN ('active', 'delinquent')`. Closed/completed loans are excluded. Add filter option.

### P3 — Add Branch Filter to Reports
Tabs missing branch filter:
- Daily Collections
- Amortization Schedule

### P3 — Export Formatting
P&L CSV export uses `String(v)` instead of `formatCurrency(v)`, producing raw numbers without formatting.

---

## Completed Items

### P1 — Fixed
- **CSV Export** added to 5 tabs: Amortization Schedule, Collector Performance, Borrower Performance, Aging Report, Overdue List
- **Shared state bug** fixed: Borrower Performance now uses its own `borrowerStartDate`/`borrowerEndDate` (was sharing `collectorStartDate`/`collectorEndDate`)
- **Expected Collections**: exposed branch and collector filters (backend already supported)
- **Loans Granted**: exposed branch filter (backend already supported)
- **Disbursements**: exposed branch filter (backend already supported)
- **Application Types**: exposed date range filter (backend already supported)

### P2 & P3 — Done
- Penalty waivers tracked in payments and displayed in P&L
- Interest Income: date range filter + borrower branch join (was collector branch)
- Delinquency Report: 5-day threshold, computed_status, branch filter
- Aging Report: branch filter, improved query (paid_amount < total_due instead of status)
- Past Due Clients merged into Overdue List (all overdue 1+ day with status tag, removed separate tab)
- Overdue List footer shows both Total Outstanding and Total Overdue
