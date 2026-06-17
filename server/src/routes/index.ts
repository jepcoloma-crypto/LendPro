import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, authorize } from '../middleware/auth';
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
import { auditLogRepo } from '../repositories';
import { pool } from '../database/connection';
import { readFileSync } from 'fs';
import { hash } from 'bcryptjs';
import { v4 } from 'uuid';

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`),
});
const uploadDoc = multer({ storage: docStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  cb(null, allowed.includes(file.mimetype));
} }).single('document');

const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  cb(null, file.mimetype === 'text/csv' || file.originalname.endsWith('.csv'));
} }).single('file');

const router = Router();

// Auth routes
router.post('/auth/login', authController.login.bind(authController));
router.post('/auth/refresh', authController.refreshToken.bind(authController));
router.post('/auth/forgot-password', authController.forgotPassword.bind(authController));
router.post('/auth/reset-password', authController.resetPassword.bind(authController));
router.get('/auth/profile', authenticate, authController.getProfile.bind(authController));
router.put('/auth/profile', authenticate, authController.updateProfile.bind(authController));
router.post('/auth/change-password', authenticate, authController.changePassword.bind(authController));
router.post('/auth/logout', authenticate, authController.logout.bind(authController));

// Users (super-admin only)
router.get('/users', authenticate, authorize('super-admin'), userController.getAll.bind(userController));
router.post('/users', authenticate, authorize('super-admin'), userController.create.bind(userController));
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
router.get('/borrowers', authenticate, borrowerController.getAll.bind(borrowerController));
router.post('/borrowers', authenticate, borrowerController.create.bind(borrowerController));
router.get('/borrowers/:id', authenticate, borrowerController.getById.bind(borrowerController));
router.put('/borrowers/:id', authenticate, borrowerController.update.bind(borrowerController));
router.delete('/borrowers/:id', authenticate, authorize('super-admin', 'admin', 'branch-manager'), borrowerController.delete.bind(borrowerController));
router.post('/borrowers/:id/photo', authenticate, borrowerController.uploadPhotoHandler.bind(borrowerController));
router.post('/borrowers/:id/documents', authenticate, uploadDoc, borrowerController.uploadDocument.bind(borrowerController));
router.post('/borrowers/:id/co-makers', authenticate, borrowerController.addCoMaker.bind(borrowerController));
router.get('/borrowers/:id/payments', authenticate, borrowerController.getPayments.bind(borrowerController));

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
router.delete('/payments/:id', authenticate, authorize('super-admin', 'admin', 'branch-manager', 'cashier'), auditLog('delete', 'payment'), paymentController.deletePayment.bind(paymentController));

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
    const { limit, offset, userId, entityType, action } = req.query;
    let sql = `SELECT al.*, u.first_name || ' ' || u.last_name as user_name FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id`;
    const conditions: string[] = [];
    const values: any[] = [];
    if (userId) { values.push(userId); conditions.push(`al.user_id = $${values.length}`); }
    if (entityType) { values.push(entityType); conditions.push(`al.entity_type = $${values.length}`); }
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

// Settings (super-admin only)
router.get('/settings', authenticate, settingsController.getAll.bind(settingsController));
router.put('/settings', authenticate, authorize('super-admin'), settingsController.update.bind(settingsController));

// Setup (one-time: run migration + seed)
import { join } from 'path';
router.get('/setup', async (_req, res) => {
  try {
    const tables = await pool.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`);
    if (tables.rows.length > 0) return res.json({ message: 'Database already has tables, skipping' });
    const schema = readFileSync(join(__dirname, '..', '..', 'src', 'database', 'schema.sql'), 'utf8');
    await pool.query(schema.replace(/^-- .*\n?/gm, ''));
    const migration = readFileSync(join(__dirname, '..', '..', 'src', 'database', 'migrations', '003_loan_columns.sql'), 'utf8');
    await pool.query(migration.replace(/^-- .*\n?/gm, ''));
    const roles = [{ name: 'Super Admin', slug: 'super-admin', permissions: ['*'] },
      { name: 'Admin', slug: 'admin', permissions: ['loans.*', 'payments.*', 'collections.*', 'reports.*', 'borrowers.*', 'branches.*', 'loan-products.*', 'charges.*'] },
      { name: 'Branch Manager', slug: 'branch-manager', permissions: ['loans.create', 'loans.view', 'loans.approve', 'payments.*', 'collections.*', 'reports.*', 'borrowers.*'] },
      { name: 'Loan Officer', slug: 'loan-officer', permissions: ['loans.create', 'loans.view', 'borrowers.create', 'borrowers.view'] },
      { name: 'Credit Investigator', slug: 'credit-investigator', permissions: ['applications.view', 'applications.investigate'] },
      { name: 'Collector', slug: 'collector', permissions: ['collections.*', 'payments.create', 'payments.view', 'reports.collector'] },
      { name: 'Cashier', slug: 'cashier', permissions: ['payments.create', 'payments.view', 'receipts.generate'] }];
    for (const r of roles) await pool.query(`INSERT INTO roles (id, name, slug, permissions) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (slug) DO NOTHING`, [v4(), r.name, r.slug, JSON.stringify(r.permissions)]);
    const pw = await hash('admin123', 10);
    const roleId = (await pool.query(`SELECT id FROM roles WHERE slug = 'super-admin'`)).rows[0]?.id;
    if (roleId) await pool.query(`INSERT INTO users (username, email, password_hash, first_name, last_name, role_id) VALUES ('admin', 'admin@lending.com', $1, 'Super', 'Admin', $2) ON CONFLICT (username) DO NOTHING`, [pw, roleId]);
    res.json({ success: true, message: 'Database setup complete. Login with admin / admin123' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Utilities (super-admin only)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.get('/utilities/health', authenticate, authorize('super-admin'), utilityController.healthCheck.bind(utilityController));
router.post('/utilities/recalculate-balances', authenticate, authorize('super-admin'), utilityController.recalculateBalances.bind(utilityController));
router.post('/utilities/apply-penalties', authenticate, authorize('super-admin'), utilityController.applyPenalties.bind(utilityController));
router.post('/utilities/clear-data', authenticate, authorize('super-admin'), utilityController.clearOperationalData.bind(utilityController));
router.get('/utilities/backup', authenticate, authorize('super-admin'), utilityController.backupDatabase.bind(utilityController));
router.post('/utilities/restore', authenticate, authorize('super-admin'), upload.single('file'), utilityController.restoreDatabase.bind(utilityController));

// Notifications
router.get('/notifications', authenticate, notificationController.getAll.bind(notificationController));
router.post('/notifications/send-email', authenticate, notificationController.sendEmail.bind(notificationController));
router.post('/notifications/send-sms', authenticate, notificationController.sendSms.bind(notificationController));

export default router;
