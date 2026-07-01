import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { loanService } from '../services/loan.service';
import { loanRepo, loanApplicationRepo, loanProductRepo, amortizationScheduleRepo, applicationDocumentRepo, coMakerRepo, cashierSessionRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, paramStr, calculateAmortization, calculateInterest } from '../utils/helpers';
import { autoRecordTransaction } from '../services/cash-transaction.service';
import { validateUploadedFile } from '../utils/fileValidation';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'applications');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`),
});
const uploadDoc = multer({ storage: docStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  cb(null, allowed.includes(file.mimetype));
} }).array('documents', 10);

export class LoanController {
  async createApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.createApplication(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: app });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async submitApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.submitApplication(paramStr(req.params.id));
      res.json({ success: true, data: app });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async reviewApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.reviewApplication(paramStr(req.params.id), req.user!.userId);
      res.json({ success: true, data: app });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async investigateApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.investigateApplication(paramStr(req.params.id), req.user!.userId, req.body.riskScore, req.body.riskNotes);
      res.json({ success: true, data: app });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async assessApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.assessApplication(paramStr(req.params.id), req.user!.userId, req.body.decision, req.body.comments);
      res.json({ success: true, data: app, message: `Application ${req.body.decision}d` });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getApplications(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const status = paramStr(req.query.status);
      const search = paramStr(req.query.search);
      const borrowerId = paramStr(req.query.borrowerId);
      let where = '';
      const values: any[] = [];
      let idx = 1;
      if (status) { where += `${where ? ' AND ' : 'WHERE '} la.status = $${idx++}`; values.push(status); }
      if (borrowerId) { where += `${where ? ' AND ' : 'WHERE '} la.borrower_id = $${idx++}`; values.push(borrowerId); }
      if (search) { where += `${where ? ' AND ' : 'WHERE '} (b.first_name ILIKE $${idx} OR b.last_name ILIKE $${idx} OR b.borrower_code ILIKE $${idx})`; values.push(`%${search}%`); idx++; }
      const countResult = await loanApplicationRepo.query(
        `SELECT COUNT(*) FROM loan_applications la JOIN borrowers b ON la.borrower_id = b.id ${where}`, values
      );
      const total = parseInt(countResult[0]?.count || '0', 10);
      values.push(pagination.limit, pagination.offset);
      const rows = await loanApplicationRepo.query(
        `SELECT la.*, b.first_name || ' ' || b.last_name as borrower_name, b.borrower_code, lp.name as product_name
         FROM loan_applications la
         JOIN borrowers b ON la.borrower_id = b.id
         JOIN loan_products lp ON la.loan_product_id = lp.id
         ${where}
         ORDER BY ${pagination.sortBy} ${pagination.sortOrder} LIMIT $${idx++} OFFSET $${idx}`,
        values
      );
      res.json({
        success: true,
        data: rows,
        pagination: { ...pagination, total, totalPages: Math.ceil(total / pagination.limit) },
      });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getApplicationById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const apps = await loanApplicationRepo.query(
        `SELECT la.*, b.first_name || ' ' || b.last_name as borrower_name, b.borrower_code, b.mobile,
                lp.name as product_name, lp.interest_type, lp.interest_rate as product_rate,
                u.first_name || ' ' || u.last_name as officer_name
         FROM loan_applications la
         JOIN borrowers b ON la.borrower_id = b.id
         JOIN loan_products lp ON la.loan_product_id = lp.id
         LEFT JOIN users u ON la.assigned_officer_id = u.id
         WHERE la.id = $1`,
        [id]
      );
      if (!apps.length) throw new Error('Application not found');
      const approvals = await loanApplicationRepo.query(
        `SELECT la.*, u.first_name || ' ' || u.last_name as approver_name
         FROM loan_approvals la LEFT JOIN users u ON la.approver_id = u.id
         WHERE la.application_id = $1 ORDER BY la.approval_level ASC`,
        [id]
      );
      const loanRows = await loanApplicationRepo.query(
        `SELECT net_proceeds FROM loans WHERE application_id = $1 LIMIT 1`, [id]
      );
      res.json({ success: true, data: { ...apps[0], approvals, net_proceeds: loanRows[0]?.net_proceeds ?? null } });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async getTempAmortization(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const apps = await loanApplicationRepo.query(
        `SELECT la.principal_amount, la.term_months, la.interest_rate, la.interest_type, la.payment_frequency,
                b.first_name || ' ' || b.last_name as borrower_name, la.application_number
         FROM loan_applications la JOIN borrowers b ON la.borrower_id = b.id WHERE la.id = $1`,
        [id]
      );
      if (!apps.length) throw new Error('Application not found');
      const app = apps[0];
      const { schedule, totalInterest, totalAmount } = calculateAmortization(
        parseFloat(app.principal_amount), parseFloat(app.interest_rate),
        app.term_months, app.interest_type, app.payment_frequency, new Date(),
        app.term_type || 'months',
        app.installment_count || undefined
      );
      res.json({
        success: true,
        data: {
          application_number: app.application_number,
          borrower_name: app.borrower_name,
          principal_amount: parseFloat(app.principal_amount),
          interest_rate: parseFloat(app.interest_rate),
          interest_type: app.interest_type,
          term_type: app.term_type || 'months',
          term_months: app.term_months,
          payment_frequency: app.payment_frequency,
          totalInterest, totalAmount,
          schedule: schedule.map(s => ({ ...s, dueDate: s.dueDate.toISOString().split('T')[0] })),
        },
      });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getPrintDocument(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const apps = await loanApplicationRepo.query(
        `SELECT la.*, b.first_name || ' ' || b.last_name as borrower_name, b.borrower_code, b.mobile, b.email,
                b.present_address, b.present_city, b.present_province, b.permanent_address, b.permanent_city, b.permanent_province,
                b.date_of_birth, b.gender, b.civil_status, b.government_id_type, b.government_id_number,
                b.employment_status, b.employer_name, b.monthly_income,
                b.business_name, b.business_type,
                lp.name as product_name, lp.interest_rate as product_rate,
                u.first_name || ' ' || u.last_name as officer_name
         FROM loan_applications la
         JOIN borrowers b ON la.borrower_id = b.id
         JOIN loan_products lp ON la.loan_product_id = lp.id
         LEFT JOIN users u ON la.assigned_officer_id = u.id
         WHERE la.id = $1`,
        [id]
      );
      if (!apps.length) throw new Error('Application not found');
      const app = apps[0];
      const { schedule, totalInterest, totalAmount } = calculateAmortization(
        parseFloat(app.principal_amount), parseFloat(app.interest_rate),
        app.term_months, app.interest_type, app.payment_frequency, new Date(),
        app.term_type || 'months',
        app.installment_count || undefined
      );
      const approvals = await loanApplicationRepo.query(
        `SELECT la.*, u.first_name || ' ' || u.last_name as approver_name, r.name as approver_role
         FROM loan_approvals la LEFT JOIN users u ON la.approver_id = u.id LEFT JOIN roles r ON u.role_id = r.id
         WHERE la.application_id = $1 ORDER BY la.approval_level ASC`,
        [id]
      );
      let coMaker = null;
      if (app.co_maker_id) {
        const coMakers = await coMakerRepo.query(
          `SELECT * FROM co_makers WHERE borrower_id = $1`, [app.borrower_id]
        );
        coMaker = coMakers.length > 0 ? coMakers[0] : null;
      }

      // Fetch charges (from loan_charges if released, otherwise from loan_product_charges)
      let charges: any[] = [];
      if (app.status === 'released') {
        const loanRows = await loanApplicationRepo.query(
          `SELECT id FROM loans WHERE application_id = $1 LIMIT 1`, [id]
        );
        if (loanRows.length) {
          const rawCharges = await loanApplicationRepo.query(
            `SELECT charge_name, amount FROM loan_charges WHERE loan_id = $1`,
            [loanRows[0].id]
          );
          charges = rawCharges.map((rc: any) => ({ charge_name: rc.charge_name, amount: parseFloat(rc.amount) || 0 }));
        }
      }
      if (charges.length === 0) {
        const productCharges = await loanApplicationRepo.query(
          `SELECT c.name, lpc.amount, c.default_amount, c.computation_type
           FROM loan_product_charges lpc
           JOIN charges c ON c.id = lpc.charge_id
           WHERE lpc.loan_product_id = $1 AND c.is_active = true`,
          [app.loan_product_id]
        );
        charges = productCharges.map((pc: any) => ({
          charge_name: pc.name,
          amount: pc.computation_type === 'percentage'
            ? Math.round(parseFloat(app.principal_amount) * parseFloat(pc.amount || pc.default_amount || 0) / 100 * 100) / 100
            : parseFloat(pc.amount || pc.default_amount || 0),
        }));
      }
      if (charges.length === 0) {
        const allCharges = await loanApplicationRepo.query(
          `SELECT name, default_amount, computation_type FROM charges WHERE is_active = true ORDER BY name`
        );
        charges = allCharges.map((c: any) => ({
          charge_name: c.name,
          amount: c.computation_type === 'percentage'
            ? Math.round(parseFloat(app.principal_amount) * parseFloat(c.default_amount || 0) / 100 * 100) / 100
            : parseFloat(c.default_amount || 0),
        }));
      }
      const totalCharges = charges.reduce((sum: number, c: any) => sum + parseFloat(c.amount) || 0, 0);
      const netProceeds = Math.max(0, parseFloat(app.principal_amount) - totalCharges);

      res.json({
        success: true,
        data: {
          application: {
            number: app.application_number,
            principal_amount: parseFloat(app.principal_amount),
            term_months: app.term_months,
            interest_rate: parseFloat(app.interest_rate),
            interest_type: app.interest_type,
            payment_frequency: app.payment_frequency,
            purpose: app.purpose,
            status: app.status,
            submitted_at: app.submitted_at,
            created_at: app.created_at,
          },
          borrower: {
            name: app.borrower_name,
            code: app.borrower_code,
            mobile: app.mobile,
            email: app.email,
            present_address: app.present_address,
            present_city: app.present_city,
            present_province: app.present_province,
            permanent_address: app.permanent_address,
            permanent_city: app.permanent_city,
            permanent_province: app.permanent_province,
            date_of_birth: app.date_of_birth,
            gender: app.gender,
            civil_status: app.civil_status,
            government_id_type: app.government_id_type,
            government_id_number: app.government_id_number,
            employment_status: app.employment_status,
            employer_name: app.employer_name,
            monthly_income: app.monthly_income,
            business_name: app.business_name,
            business_type: app.business_type,
          },
          product_name: app.product_name,
          officer_name: app.officer_name,
          co_maker: coMaker ? {
            name: `${coMaker.first_name} ${coMaker.middle_name || ''} ${coMaker.last_name}`.trim(),
            mobile: coMaker.mobile,
            address: coMaker.address,
            government_id_type: coMaker.government_id_type,
            government_id_number: coMaker.government_id_number,
            relationship: coMaker.relationship,
          } : null,
          approvals: approvals.map((a: any) => ({
            level: a.approval_level,
            status: a.status,
            approver_name: a.approver_name,
            approver_role: a.approver_role,
            comments: a.comments,
            decided_at: a.decided_at,
          })),
          charges,
          total_charges: totalCharges,
          net_proceeds: netProceeds,
          amortization: {
            total_interest: totalInterest,
            total_amount: totalAmount,
            schedule: schedule.map(s => ({
              installment_no: s.installmentNo,
              due_date: s.dueDate.toISOString().split('T')[0],
              principal: Math.round(s.principal * 100) / 100,
              interest: Math.round(s.interest * 100) / 100,
              total_due: Math.round(s.totalDue * 100) / 100,
              balance: Math.round(s.balance * 100) / 100,
            })),
          },
        },
      });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async approveApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.approveApplication(paramStr(req.params.id), req.user!.userId, req.body.comments);
      res.json({ success: true, data: app, message: 'Application approved' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async rejectApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.rejectApplication(paramStr(req.params.id), req.user!.userId, req.body.comments);
      res.json({ success: true, data: app, message: 'Application rejected' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async updateApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await loanService.updateApplication(paramStr(req.params.id), req.body);
      res.json({ success: true, data: app });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async deleteApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await loanService.deleteApplication(paramStr(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async releaseLoan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const method = req.body.method || 'cash';
      const appId = paramStr(req.params.id);

      const myShift = await cashierSessionRepo.findOne({ user_id: req.user!.userId, status: 'open' });
      if (!myShift) {
        throw new AppError(400, 'No open shift found. Please open a cashier shift before releasing a loan.');
      }

      const loan = await loanService.releaseLoan(appId, req.user!.userId, method, req.body.reference);

      await autoRecordTransaction({
        userId: req.user!.userId,
        loanId: loan.id,
        borrowerId: loan.borrower_id,
        transactionType: 'disbursement',
        direction: 'out',
        amount: parseFloat(loan.net_proceeds) || 0,
        paymentMethod: req.body.method || 'cash',
        referenceNumber: req.body.reference || null,
        description: `Loan release ${loan.loan_number}`,
      });
      res.status(201).json({ success: true, data: loan, message: 'Loan released successfully' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getLoans(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const status = paramStr(req.query.status);
      const search = paramStr(req.query.search);
      const borrowerId = paramStr(req.query.borrowerId);
      let where = '';
      const values: any[] = [];
      let idx = 1;
      if (status) { where += `${where ? ' AND ' : 'WHERE '} l.status = $${idx++}`; values.push(status); }
      if (borrowerId) { where += `${where ? ' AND ' : 'WHERE '} l.borrower_id = $${idx++}`; values.push(borrowerId); }
      if (search) { where += `${where ? ' AND ' : 'WHERE '} (b.first_name ILIKE $${idx} OR b.last_name ILIKE $${idx} OR b.borrower_code ILIKE $${idx})`; values.push(`%${search}%`); idx++; }
      if (req.user?.roleSlug === 'collector') { where += `${where ? ' AND ' : 'WHERE '} l.collector_id = $${idx++}`; values.push(req.user.userId); }
      const countResult = await loanRepo.query(
        `SELECT COUNT(*) FROM loans l JOIN borrowers b ON l.borrower_id = b.id ${where}`, values
      );
      const total = parseInt(countResult[0]?.count || '0', 10);
      values.push(pagination.limit, pagination.offset);
      const rows = await loanRepo.query(
        `SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name, b.borrower_code, b.mobile, lp.name as product_name
         FROM loans l
         JOIN borrowers b ON l.borrower_id = b.id
         JOIN loan_products lp ON l.product_id = lp.id
         ${where}
         ORDER BY ${pagination.sortBy} ${pagination.sortOrder} LIMIT $${idx++} OFFSET $${idx}`,
        values
      );
      res.json({
        success: true,
        data: rows,
        pagination: { ...pagination, total, totalPages: Math.ceil(total / pagination.limit) },
      });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getLoanById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await loanService.getLoanById(paramStr(req.params.id));
      res.json({ success: true, data });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async getLoanSchedule(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const schedule = await loanService.getLoanSchedule(paramStr(req.params.id));
      res.json({ success: true, data: schedule });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async getProducts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await loanProductRepo.findAll({
        orderBy: 'name ASC',
        limit: 100,
        offset: 0,
      });
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async createProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const product = await loanProductRepo.create(req.body);
      res.status(201).json({ success: true, data: product });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async updateProduct(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const product = await loanProductRepo.update(paramStr(req.params.id), req.body);
      if (!product) throw new Error('Product not found');
      res.json({ success: true, data: product });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getDashboardStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await loanService.getDashboardStats(req.user?.userId, req.user?.roleSlug);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async uploadDocuments(req: AuthRequest, res: Response, next: NextFunction) {
    uploadDoc(req, res, async (err) => {
      if (err) return next(new AppError(400, err.message));
      const id = paramStr(req.params.id);
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) return next(new AppError(400, 'No documents uploaded'));
      // Validate magic bytes for each file
      for (const file of files) {
        if (!validateUploadedFile(file.path, file.mimetype)) {
          return next(new AppError(400, `Invalid file content: ${file.originalname} does not match expected format`));
        }
      }
      const docs = [];
      for (const file of files) {
        const doc = await applicationDocumentRepo.create({
          application_id: id,
          document_type: req.body.documentType || 'collateral',
          file_name: file.originalname,
          file_url: `/uploads/applications/${file.filename}`,
          uploaded_by: req.user!.userId,
        });
        docs.push(doc);
      }
      res.status(201).json({ success: true, data: docs });
    });
  }

  async getDocuments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const result = await applicationDocumentRepo.findAll({ conditions: { application_id: id }, orderBy: 'created_at DESC', limit: 100, offset: 0 });
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async updateLoan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const loan = await loanRepo.update(id, req.body);
      if (!loan) throw new Error('Loan not found');
      res.json({ success: true, data: loan });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async restructureLoan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const newLoan = await loanService.restructureLoan(id, req.user!.userId, req.body);
      res.status(201).json({ success: true, data: newLoan });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async previewRestructure(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { principalAmount, interestRate, interestType, termMonths, termType, paymentFrequency, installmentCount } = req.body;
      if (!principalAmount || !interestRate || !termMonths || !paymentFrequency) throw new Error('Missing required fields');
      const { schedule, totalInterest, totalAmount } = calculateAmortization(
        parseFloat(principalAmount), parseFloat(interestRate),
        parseInt(termMonths), interestType || 'flat', paymentFrequency, new Date(),
        termType || 'months',
        installmentCount ? parseInt(installmentCount) : undefined
      );
      res.json({
        success: true,
        data: {
          totalInterest, totalAmount,
          schedule: schedule.map(s => ({ ...s, dueDate: s.dueDate.toISOString().split('T')[0] })),
        },
      });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async writeOffLoan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { reason, amount } = req.body;
      if (!reason) throw new Error('Write-off reason is required');
      const loan = await loanRepo.findById(id);
      if (!loan) throw new Error('Loan not found');
      if (loan.status === 'paid' || loan.status === 'written-off' || loan.status === 'cancelled') throw new Error('Loan cannot be written off');
      const updated = await loanRepo.update(id, {
        status: 'written-off',
        write_off_reason: reason,
        write_off_amount: amount || loan.outstanding_balance,
        written_off_by: req.user!.userId,
        written_off_at: new Date(),
      });
      res.json({ success: true, data: updated });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async deleteLoan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const updated = await loanRepo.update(id, { status: 'cancelled' });
      if (!updated) throw new Error('Loan not found');
      res.json({ success: true, message: 'Loan cancelled' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async downloadDocument(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const docId = paramStr(req.params.docId);
      const doc = await applicationDocumentRepo.findById(docId);
      if (!doc) throw new Error('Document not found');
      const filePath = path.join(__dirname, '..', '..', doc.file_url);
      if (!fs.existsSync(filePath)) throw new Error('File not found on server');
      res.sendFile(filePath);
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async deleteDocument(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const docId = paramStr(req.params.docId);
      const doc = await applicationDocumentRepo.findById(docId);
      if (!doc) throw new Error('Document not found');
      const filePath = path.join(__dirname, '..', '..', doc.file_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await applicationDocumentRepo.delete(docId);
      res.json({ success: true, message: 'Document deleted' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

}

export const loanController = new LoanController();
