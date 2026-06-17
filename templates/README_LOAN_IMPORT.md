## Loan Import Guide

To import existing loans, you need **two steps**:

1. **Import borrowers first** — use the borrower CSV template (`borrower_import_template.csv`)
2. **Import loans** — use this file format below

### How borrower lookup works
The system finds the borrower by (in order):
- `Borrower Code` (exact match)  
- `Borrower Mobile` (exact match)  
- `First Name` + `Last Name` (fallback)

All three are optional — provide whichever you have. At least one borrower identifier is required.

### How loan product lookup works
The system finds the loan product by `Loan Product Name`. This must match an existing product in the system. Product names are listed on the **Loan Products** page.

### Amortization schedule
The system **auto-generates** the amortization schedule based on principal, interest rate, term, frequency, and installment count. You don't need to provide installment details.

### Payments
If the loan has existing payments, include them in a separate `loan_payments.csv` file using the template below. Payments are matched to loans by `Loan Number` (auto-generated during loan import) or by `Borrower Code`.

