import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from '../validators/auth';
import { auditLog } from '../middleware/audit';
import { authController } from '../controllers/auth.controller';
import { loanController } from '../controllers/loan.controller';
import { paymentController } from '../controllers/payment.controller';
import { borrowerController } from '../controllers/borrower.controller';
import { collectionController } from '../controllers/collection.controller';
import { reportController } from '../controllers/report.controller';
import { userController, roleController, branchController, settingsController } from '../controllers/user.controller';
import { notificationController } from '../controllers/notification.controller';
import { calendarController } from '../controllers/calendar.controller';
import { chargesController } from '../controllers/charges.controller';
import { utilityController } from '../controllers/utility.controller';
import { twilioWebhook, setBorrowerPin } from '../controllers/twilio.controller';
import { cashflowController } from '../controllers/cashflow.controller';
import { cancellationController } from '../controllers/cancellation.controller';
import { cashierController } from '../controllers/cashier.controller';
import { auditLogRepo } from '../repositories';


const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`),
});
const uploadDoc = multer({ storage: docStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  cb(null, allowedMimes.includes(file.mimetype));
} }).single('document');

const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  cb(null, file.mimetype === 'text/csv' || file.originalname.endsWith('.csv'));
} }).single('file');

const router = Router();

// Auth routes
router.post('/auth/login', validate(loginSchema), authController.login.bind(authController));
router.post('/auth/refresh', authController.refreshToken.bind(authController));
router.post('/auth/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword.bind(authController));
router.post('/auth/reset-password', validate(resetPasswordSchema), authController.resetPassword.bind(authController));
router.get('/auth/profile', authenticate, authController.getProfile.bind(authController));
router.put('/auth/profile', authenticate, authController.updateProfile.bind(authController));
router.post('/auth/change-password', authenticate, validate(changePasswordSchema), authController.changePassword.bind(authController));
router.post('/auth/logout', authenticate, authController.logout.bind(authController));

// Users (super-admin only)
router.get('/users', authenticate, authorize('super-admin'), userController.getAll.bind(userController));
router.post('/users', authenticate, authorize('super-admin'), userController.create.bind(userController));
router.get('/users/collectors', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'loan-officer', 'credit-investigator'), userController.getCollectors.bind(userController));
router.get('/users/:id', authenticate, authorize('super-admin'), userController.getById.bind(userController));
router.put('/users/:id', authenticate, authorize('super-admin'), userController.update.bind(userController));
router.delete('/users/:id', authenticate, authorize('super-admin'), userController.delete.bind(userController));

// Roles
router.get('/roles', authenticate, roleController.getAll.bind(roleController));

// Branches
router.get('/branches', authenticate, authorize('super-admin', 'admin'), branchController.getAll.bind(branchController));
router.post('/branches', authenticate, authorize('super-admin', 'admin'), branchController.create.bind(branchController));
router.put('/branches/:id', authenticate, authorize('super-admin', 'admin'), branchController.update.bind(branchController));

// Borrowers
router.get('/borrowers', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'loan-officer', 'credit-investigator'), borrowerController.getAll.bind(borrowerController));
router.post('/borrowers', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'loan-officer'), borrowerController.create.bind(borrowerController));
router.get('/borrowers/:id', authenticate, borrowerController.getById.bind(borrowerController));
router.put('/borrowers/:id', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'loan-officer'), borrowerController.update.bind(borrowerController));
router.delete('/borrowers/:id', authenticate, authorize('super-admin', 'admin', 'branch-manager'), borrowerController.delete.bind(borrowerController));
router.post('/borrowers/:id/photo', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'loan-officer'), borrowerController.uploadPhotoHandler.bind(borrowerController));
router.post('/borrowers/:id/documents', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'loan-officer'), uploadDoc, borrowerController.uploadDocument.bind(borrowerController));
router.post('/borrowers/:id/co-makers', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'loan-officer'), borrowerController.addCoMaker.bind(borrowerController));
router.get('/borrowers/:id/payments', authenticate, borrowerController.getPayments.bind(borrowerController));
router.put('/borrowers/:id/pin', authenticate, authorize('super-admin', 'admin', 'branch-manager'), setBorrowerPin);

// Loan Products
router.get('/loan-products', authenticate, loanController.getProducts.bind(loanController));
router.post('/loan-products', authenticate, authorize('super-admin', 'admin'), loanController.createProduct.bind(loanController));
router.put('/loan-products/:id', authenticate, authorize('super-admin', 'admin'), loanController.updateProduct.bind(loanController));

// Loan Applications
router.get('/applications', authenticate, loanController.getApplications.bind(loanController));
router.post('/applications', authenticate, loanController.createApplication.bind(loanController));
router.put('/applications/:id', authenticate, loanController.updateApplication.bind(loanController));
router.delete('/applications/:id', authenticate, authorize('super-admin', 'admin', 'branch-manager'), loanController.deleteApplication.bind(loanController));
router.get('/applications/:id', authenticate, loanController.getApplicationById.bind(loanController));
router.get('/applications/:id/amortization', authenticate, loanController.getTempAmortization.bind(loanController));
router.get('/applications/:id/print-document', authenticate, loanController.getPrintDocument.bind(loanController));
router.post('/applications/:id/submit', authenticate, loanController.submitApplication.bind(loanController));
router.post('/applications/:id/review', authenticate, loanController.reviewApplication.bind(loanController));
router.post('/applications/:id/investigate', authenticate, loanController.investigateApplication.bind(loanController));
router.post('/applications/:id/assess', authenticate, loanController.assessApplication.bind(loanController));
router.post('/applications/:id/approve', authenticate, loanController.approveApplication.bind(loanController));
router.post('/applications/:id/reject', authenticate, loanController.rejectApplication.bind(loanController));
router.post('/applications/:id/release', authenticate, loanController.releaseLoan.bind(loanController));
router.post('/applications/:id/documents', authenticate, loanController.uploadDocuments.bind(loanController));
router.get('/applications/:id/documents', authenticate, loanController.getDocuments.bind(loanController));
router.get('/applications/:id/documents/:docId/download', authenticate, loanController.downloadDocument.bind(loanController));
router.delete('/applications/:id/documents/:docId', authenticate, loanController.deleteDocument.bind(loanController));

// Loans
router.get('/loans', authenticate, loanController.getLoans.bind(loanController));
router.get('/loans/dashboard', authenticate, loanController.getDashboardStats.bind(loanController));
router.get('/loans/:id', authenticate, loanController.getLoanById.bind(loanController));
router.get('/loans/:id/schedule', authenticate, loanController.getLoanSchedule.bind(loanController));
router.put('/loans/:id', authenticate, loanController.updateLoan.bind(loanController));
router.post('/loans/:id/write-off', authenticate, authorize('super-admin', 'admin'), loanController.writeOffLoan.bind(loanController));
router.post('/loans/preview-restructure', authenticate, authorize('super-admin', 'admin'), loanController.previewRestructure.bind(loanController));
router.post('/loans/:id/restructure', authenticate, authorize('super-admin', 'admin'), loanController.restructureLoan.bind(loanController));
router.delete('/loans/:id', authenticate, authorize('super-admin', 'admin', 'branch-manager'), loanController.deleteLoan.bind(loanController));

// Payments
router.get('/payments', authenticate, paymentController.getPayments.bind(paymentController));
router.post('/payments', authenticate, auditLog('create', 'payment'), paymentController.receivePayment.bind(paymentController));
router.post('/payments/import', authenticate, authorize('super-admin', 'admin'), uploadCsv, paymentController.importCsv.bind(paymentController));
router.get('/payments/recent', authenticate, paymentController.getRecentPayments.bind(paymentController));
router.get('/payments/:id', authenticate, paymentController.getPaymentById.bind(paymentController));
router.get('/payments/:id/receipt', authenticate, paymentController.getReceipt.bind(paymentController));
router.put('/payments/:id', authenticate, auditLog('update', 'payment'), paymentController.updatePayment.bind(paymentController));
router.put('/payments/:id/cancel', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), auditLog('cancel', 'payment'), paymentController.cancelPayment.bind(paymentController));
router.delete('/payments/:id', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), auditLog('delete', 'payment'), paymentController.deletePayment.bind(paymentController));
// Cancellation approval workflow
router.post('/payments/:id/cancel-request', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cancellationController.requestCancel.bind(cancellationController));
router.post('/payments/:id/void-repay-request', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cancellationController.requestVoidRepay.bind(cancellationController));
router.get('/cancellation-requests', authenticate, authorize('super-admin', 'admin'), cancellationController.list.bind(cancellationController));
router.get('/cancellation-requests/pending-count', authenticate, cancellationController.pendingCount.bind(cancellationController));
router.put('/cancellation-requests/:id/approve', authenticate, authorize('super-admin', 'admin'), cancellationController.approve.bind(cancellationController));
router.put('/cancellation-requests/:id/reject', authenticate, authorize('super-admin', 'admin'), cancellationController.reject.bind(cancellationController));
// Cashier reconciliation v2
router.post('/cashier-sessions/open', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.shiftOpen.bind(cashierController));
router.put('/cashier-sessions/:id/close', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.shiftClose.bind(cashierController));
router.get('/cashier-sessions', authenticate, authorize('super-admin', 'admin', 'branch-manager'), cashierController.shiftList.bind(cashierController));
router.get('/cashier-sessions/my-open', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.shiftMyOpen.bind(cashierController));
router.get('/cashier-sessions/:id/details', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.shiftDetails.bind(cashierController));
router.get('/cashier-sessions/dashboard/stats', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.dashboard.bind(cashierController));
// Cash transactions
router.post('/cash-transactions', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.recordTransaction.bind(cashierController));
router.get('/cash-transactions', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.getTransactions.bind(cashierController));
// Cash counts
router.post('/cash-counts', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.recordCashCount.bind(cashierController));
router.get('/cash-counts', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.getCashCounts.bind(cashierController));
// Reconciliations
router.post('/cash-reconciliations', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.submitReconciliation.bind(cashierController));
router.get('/cash-reconciliations', authenticate, authorize('super-admin', 'admin', 'branch-manager'), cashierController.getReconciliations.bind(cashierController));
router.get('/cash-reconciliations/pending', authenticate, authorize('super-admin', 'admin'), cashierController.pendingReconciliations.bind(cashierController));
router.put('/cash-reconciliations/:id/approve', authenticate, authorize('super-admin', 'admin'), cashierController.approveReconciliation.bind(cashierController));
router.put('/cash-reconciliations/:id/reject', authenticate, authorize('super-admin', 'admin'), cashierController.rejectReconciliation.bind(cashierController));
router.put('/cash-reconciliations/:id/request-recount', authenticate, authorize('super-admin', 'admin'), cashierController.requestRecount.bind(cashierController));
// Approval history
router.get('/approval-history', authenticate, authorize('super-admin', 'admin'), cashierController.approvalHistory.bind(cashierController));
// Cash management reports
router.get('/cash-reports/collection-summary', authenticate, authorize('super-admin', 'admin', 'branch-manager'), cashierController.reportCollectionSummary.bind(cashierController));
router.get('/cash-reports/variance-summary', authenticate, authorize('super-admin', 'admin', 'branch-manager'), cashierController.reportVarianceSummary.bind(cashierController));
router.get('/cash-reports/method-summary', authenticate, authorize('super-admin', 'admin', 'branch-manager'), cashierController.reportMethodSummary.bind(cashierController));
router.get('/cash-reports/branch-daily', authenticate, authorize('super-admin', 'admin', 'branch-manager'), cashierController.reportBranchDaily.bind(cashierController));
router.get('/cash-reports/daily-chart', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), cashierController.reportDailyChart.bind(cashierController));

// Collections
router.get('/collections', authenticate, collectionController.getAll.bind(collectionController));
router.get('/collections/due-today', authenticate, collectionController.getDueToday.bind(collectionController));
router.get('/collections/overdue', authenticate, collectionController.getOverdue.bind(collectionController));
router.get('/collections/:id', authenticate, collectionController.getById.bind(collectionController));
router.put('/collections/:id', authenticate, collectionController.update.bind(collectionController));
router.post('/collections/:id/visits', authenticate, collectionController.updateVisit.bind(collectionController));

// Reports
router.get('/reports/aging', authenticate, reportController.getAgingReport.bind(reportController));
router.get('/reports/delinquency', authenticate, reportController.getDelinquencyReport.bind(reportController));
router.get('/reports/amortization', authenticate, reportController.getAmortizationReport.bind(reportController));
router.get('/reports/interest-income', authenticate, reportController.getInterestIncomeReport.bind(reportController));

router.get('/reports/collector-visits', authenticate, reportController.getCollectorVisits.bind(reportController));
router.get('/reports/collector-payments', authenticate, reportController.getCollectorPayments.bind(reportController));
router.get('/reports/collector-performance', authenticate, reportController.getCollectorPerformance.bind(reportController));
router.get('/reports/collector-remittance', authenticate, reportController.getCollectorRemittance.bind(reportController));
router.get('/reports/borrower-performance', authenticate, reportController.getBorrowerPerformance.bind(reportController));
router.get('/reports/processing-charges', authenticate, reportController.getProcessingCharges.bind(reportController));
router.get('/reports/past-due', authenticate, reportController.getPastDue.bind(reportController));
router.get('/reports/application-types', authenticate, reportController.getApplicationTypes.bind(reportController));
router.get('/reports/daily-collections', authenticate, reportController.getDailyCollections.bind(reportController));
router.get('/reports/loans-granted', authenticate, reportController.getLoansGranted.bind(reportController));
router.get('/reports/expected-collections', authenticate, reportController.getExpectedCollections.bind(reportController));
router.get('/reports/portfolio-summary', authenticate, reportController.getPortfolioSummary.bind(reportController));
router.get('/reports/branch-performance', authenticate, reportController.getBranchPerformance.bind(reportController));
router.get('/reports/disbursements', authenticate, reportController.getDisbursements.bind(reportController));

// Calendar
router.get('/calendar/events', authenticate, calendarController.getEvents.bind(calendarController));

// Audit Logs
router.get('/audit-logs', authenticate, authorize('super-admin', 'admin'), async (req, res, next) => {
  try {
    const { limit, offset, userId, entityType, entityId, action } = req.query;
    let sql = `SELECT al.*, u.first_name || ' ' || u.last_name as user_name FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id`;
    const conditions: string[] = [];
    const values: any[] = [];
    if (userId) { values.push(userId); conditions.push(`al.user_id = $${values.length}`); }
    if (entityType) { values.push(entityType); conditions.push(`al.entity_type = $${values.length}`); }
    if (entityId) { values.push(entityId); conditions.push(`al.entity_id = $${values.length}`); }
    if (action) { values.push(action); conditions.push(`al.action = $${values.length}`); }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY al.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    const pageLimit = Math.min(parseInt(limit as string) || 50, 200);
    const pageOffset = parseInt(offset as string) || 0;
    values.push(pageLimit, pageOffset);
    const rows = await auditLogRepo.query(sql, values);
    res.json({ success: true, data: rows });
  } catch (err: any) { next(new (require('../middleware/errorHandler').AppError)(400, err.message)); }
});

// Charges
router.get('/charges', authenticate, authorize('super-admin', 'admin'), chargesController.getAll.bind(chargesController));
router.post('/charges', authenticate, authorize('super-admin', 'admin'), chargesController.create.bind(chargesController));
router.put('/charges/:id', authenticate, authorize('super-admin', 'admin'), chargesController.update.bind(chargesController));
router.delete('/charges/:id', authenticate, authorize('super-admin', 'admin'), chargesController.delete.bind(chargesController));

// Product Charges
router.get('/loan-products/:id/charges', authenticate, chargesController.getProductCharges.bind(chargesController));
router.put('/loan-products/:id/charges', authenticate, authorize('super-admin', 'admin'), chargesController.saveProductCharges.bind(chargesController));

// Cash Flow & Expenses
router.get('/expenses', authenticate, cashflowController.getExpenses.bind(cashflowController));
router.post('/expenses', authenticate, cashflowController.createExpense.bind(cashflowController));
router.put('/expenses/:id', authenticate, cashflowController.updateExpense.bind(cashflowController));
router.delete('/expenses/:id', authenticate, cashflowController.deleteExpense.bind(cashflowController));
router.get('/expenses/categories', authenticate, cashflowController.getExpenseCategories.bind(cashflowController));
router.get('/income', authenticate, cashflowController.getIncome.bind(cashflowController));
router.post('/income', authenticate, cashflowController.createIncome.bind(cashflowController));
router.put('/income/:id', authenticate, cashflowController.updateIncome.bind(cashflowController));
router.delete('/income/:id', authenticate, cashflowController.deleteIncome.bind(cashflowController));
router.get('/reports/cash-flow', authenticate, cashflowController.getCashFlow.bind(cashflowController));
router.get('/reports/expense-report', authenticate, cashflowController.getExpenseReport.bind(cashflowController));
router.get('/reports/income-report', authenticate, cashflowController.getIncomeReport.bind(cashflowController));
router.get('/reports/branch-pl', authenticate, cashflowController.getBranchPL.bind(cashflowController));
router.get('/reports/borrower-master-list', authenticate, reportController.getBorrowerMasterList.bind(reportController));

// Settings (super-admin only)
router.get('/settings', authenticate, settingsController.getAll.bind(settingsController));
router.put('/settings', authenticate, authorize('super-admin'), settingsController.update.bind(settingsController));

// Setup route (check auto-seed status) — super-admin only
import { pool } from '../database/connection';
router.get('/setup', authenticate, authorize('super-admin'), async (_req, res) => {
  try {
    const tables = (await pool.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`)).rows.map((r: any) => r.tablename);
    const userCount = (await pool.query(`SELECT COUNT(*) as c FROM users`)).rows[0]?.c || 0;
    res.json({ success: true, tables: tables.length, tables_list: tables, users: parseInt(userCount) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Utilities (super-admin only)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.get('/utilities/health', authenticate, authorize('super-admin'), utilityController.healthCheck.bind(utilityController));
router.post('/utilities/recalculate-balances', authenticate, authorize('super-admin'), utilityController.recalculateBalances.bind(utilityController));
router.post('/utilities/apply-penalties', authenticate, authorize('super-admin'), utilityController.applyPenalties.bind(utilityController));
router.post('/utilities/clear-data', authenticate, authorize('super-admin'), utilityController.clearOperationalData.bind(utilityController));
router.get('/utilities/backup', authenticate, authorize('super-admin'), utilityController.backupDatabase.bind(utilityController));
router.post('/utilities/restore', authenticate, authorize('super-admin'), upload.single('file'), utilityController.restoreDatabase.bind(utilityController));
router.get('/login-history', authenticate, authorize('super-admin'), utilityController.getLoginHistory.bind(utilityController));

// Notifications
router.get('/notifications', authenticate, notificationController.getAll.bind(notificationController));
router.post('/notifications/send-email', authenticate, notificationController.sendEmail.bind(notificationController));
router.post('/notifications/send-sms', authenticate, notificationController.sendSms.bind(notificationController));

// Twilio SMS/WhatsApp webhook (no auth — signed by Twilio, read-only balance inquiry)
router.post('/twilio/webhook', twilioWebhook);

export default router;
