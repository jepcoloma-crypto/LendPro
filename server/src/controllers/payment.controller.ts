import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { paymentService } from '../services/payment.service';
import { paymentRepo, loanRepo, amortizationScheduleRepo, paymentAllocationRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, paramStr } from '../utils/helpers';
import { parse } from 'csv-parse/sync';

export class PaymentController {
  async receivePayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const payment = await paymentService.receivePayment(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: payment, message: 'Payment received successfully' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const loanId = paramStr(req.query.loanId);
      const borrowerId = paramStr(req.query.borrowerId);
      const method = paramStr(req.query.method);
      const search = paramStr(req.query.search);

      const conditions: string[] = ['1=1'];
      const values: any[] = [];
      let paramIndex = 1;

      if (req.user?.roleSlug === 'collector') { conditions.push(`l.collector_id = $${paramIndex++}`); values.push(req.user.userId); }
      if (loanId) { conditions.push(`payments.loan_id = $${paramIndex++}`); values.push(loanId); }
      if (borrowerId) { conditions.push(`payments.borrower_id = $${paramIndex++}`); values.push(borrowerId); }
      if (method) { conditions.push(`payments.payment_method = $${paramIndex++}`); values.push(method); }
      if (search) { conditions.push(`(b.first_name || ' ' || b.last_name ILIKE $${paramIndex++} OR l.loan_number ILIKE $${paramIndex++})`); values.push(`%${search}%`, `%${search}%`); }

      const where = conditions.join(' AND ');

      const countResult = await paymentRepo.query(
        `SELECT COUNT(*) FROM payments JOIN loans l ON payments.loan_id = l.id JOIN borrowers b ON payments.borrower_id = b.id WHERE ${where}`,
        values
      );
      const total = parseInt(countResult[0].count, 10);

      const offset = paramIndex;
      const rows = await paymentRepo.query(
        `SELECT payments.*, l.loan_number, b.first_name || ' ' || b.last_name as borrower_name
         FROM payments
         JOIN loans l ON payments.loan_id = l.id
         JOIN borrowers b ON payments.borrower_id = b.id
         WHERE ${where}
         ORDER BY ${pagination.sortBy} ${pagination.sortOrder}
         LIMIT $${offset} OFFSET $${offset + 1}`,
        [...values, pagination.limit, pagination.offset]
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

  async getPaymentById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const payment = await paymentService.getPaymentById(paramStr(req.params.id));
      res.json({ success: true, data: payment });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async getRecentPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await paymentService.getRecentPayments(parseInt(paramStr(req.query.limit)) || 10);
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async updatePayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const payment = await paymentRepo.update(id, req.body);
      if (!payment) throw new Error('Payment not found');
      res.json({ success: true, data: payment });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getReceipt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const result = await paymentRepo.query(
        `SELECT p.*, l.loan_number, l.principal_amount as loan_principal,
                b.first_name || ' ' || b.last_name as borrower_name,
                b.present_address, b.present_city, b.present_province,
                u.first_name || ' ' || u.last_name as received_by_name,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                    'installment_no', a.installment_no,
                    'due_date', a.due_date,
                    'amount', pa.amount,
                    'allocated_to', pa.allocated_to
                  )) FROM payment_allocations pa
                  JOIN amortization_schedules a ON a.id = pa.schedule_id
                  WHERE pa.payment_id = p.id),
                  '[]'::json
                ) as allocations
         FROM payments p
         JOIN loans l ON l.id = p.loan_id
         JOIN borrowers b ON b.id = p.borrower_id
         JOIN users u ON u.id = p.received_by
         WHERE p.id = $1`,
        [id]
      );
      if (!result || result.length === 0) throw new Error('Payment not found');
      res.json({ success: true, data: result[0] });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async importCsv(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file) throw new Error('No file uploaded');
      const csvBuffer = file.buffer.toString('utf-8');

      const PAYMENT_HEADER_MAP: Record<string, string> = {
        'payment date': 'payment_date', 'date': 'payment_date', 'date paid': 'payment_date',
        'amount': 'amount', 'payment amount': 'amount', 'paid amount': 'amount',
        'principal amount': 'principal_amount', 'principal': 'principal_amount',
        'interest amount': 'interest_amount', 'interest': 'interest_amount',
        'penalty amount': 'penalty_amount', 'penalty': 'penalty_amount',
        'payment method': 'payment_method', 'method': 'payment_method', 'mode': 'payment_method',
        'reference number': 'reference_number', 'reference': 'reference_number', 'ref no': 'reference_number',
        'notes': 'notes', 'remarks': 'notes',
        'borrower code': 'borrower_code', 'borrower code ': 'borrower_code',
        'borrower mobile': 'borrower_mobile', 'mobile': 'borrower_mobile',
        'loan number': 'loan_number', 'loan #': 'loan_number',
      };

      const records: any[] = parse(csvBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      if (records.length === 0) throw new Error('CSV file is empty');

      const rawHeaders = Object.keys(records[0]);
      const columnMap: Record<string, string> = {};
      for (const h of rawHeaders) {
        const key = h.toLowerCase().replace(/\s+/g, ' ').trim();
        columnMap[h] = PAYMENT_HEADER_MAP[key] || key.replace(/[^a-z_]/g, '_');
      }

      const errors: { row: number | string; message: string }[] = [];
      const inserted: any[] = [];

      for (let i = 0; i < records.length; i++) {
        const raw = records[i];
        const row = i + 2;
        const mapped: any = {};
        for (const csvCol of rawHeaders) {
          const dbCol = columnMap[csvCol];
          if (dbCol) mapped[dbCol] = raw[csvCol] || null;
        }

        try {
          const amount = parseFloat(mapped.amount) || 0;
          if (amount <= 0) throw new Error('Invalid payment amount');

          // Resolve loan
          let loan: any = null;
          if (mapped.loan_number) {
            const l = await loanRepo.query(`SELECT * FROM loans WHERE loan_number = $1`, [mapped.loan_number]);
            loan = l[0];
          }
          if (!loan && mapped.borrower_code) {
            const l = await loanRepo.query(
              `SELECT * FROM loans WHERE borrower_id = (SELECT id FROM borrowers WHERE borrower_code = $1) AND status NOT IN ('paid', 'closed', 'written-off', 'cancelled') ORDER BY created_at DESC LIMIT 1`,
              [mapped.borrower_code]
            );
            loan = l[0];
          }
          if (!loan && mapped.borrower_mobile) {
            const l = await loanRepo.query(
              `SELECT * FROM loans WHERE borrower_id = (SELECT id FROM borrowers WHERE mobile = $1) AND status NOT IN ('paid', 'closed', 'written-off', 'cancelled') ORDER BY created_at DESC LIMIT 1`,
              [mapped.borrower_mobile]
            );
            loan = l[0];
          }
          if (!loan) throw new Error('Loan not found');

          const paymentData: any = {
            loanId: loan.id,
            amount,
            paymentMethod: mapped.payment_method || 'cash',
            paymentDate: mapped.payment_date ? new Date(mapped.payment_date).toISOString() : new Date().toISOString(),
          };
          if (mapped.reference_number) paymentData.referenceNumber = mapped.reference_number;
          if (mapped.notes) paymentData.notes = mapped.notes;

          const payment = await paymentService.receivePayment(paymentData, req.user!.userId);
          inserted.push({ payment_number: payment.payment_number, loan_number: loan.loan_number, amount });
        } catch (err: any) {
          errors.push({ row, message: err.message });
        }
      }

      res.json({
        success: true,
        data: {
          total: records.length,
          inserted: inserted.length,
          errors,
        },
      });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async deletePayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);

      // Find payment before deleting
      const payment = await paymentRepo.findById(id);
      if (!payment) throw new Error('Payment not found');

      const loanId = payment.loan_id;
      // outstanding_balance was reduced by amount - penalty at payment time, so restore by same delta
      const restoreAmount = (parseFloat(payment.amount) || 0) - (parseFloat(payment.penalty_amount) || 0);

      // Get allocations to restore schedule records
      const allocations = await paymentAllocationRepo.query(
        `SELECT * FROM payment_allocations WHERE payment_id = $1`, [id]
      );

      // Restore each schedule record
      const penaltyAmt = parseFloat(payment.penalty_amount) || 0;
      for (const alloc of allocations) {
        const scheduleId = alloc.schedule_id;
        const allocAmount = parseFloat(alloc.amount) || 0;
        const schedule = await amortizationScheduleRepo.findById(scheduleId);
        if (schedule) {
          const oldPaid = parseFloat(schedule.paid_amount) || 0;
          const newPaid = Math.max(0, oldPaid - allocAmount);
          const totalDue = parseFloat(schedule.total_due) || 0;
          const status = newPaid <= 0 ? 'pending' : (newPaid >= totalDue - 0.005 ? 'paid' : 'partial');
          await amortizationScheduleRepo.update(scheduleId, {
            paid_amount: newPaid,
            status,
            paid_at: status === 'pending' ? null : schedule.paid_at,
            penalty_amount: penaltyAmt > 0 ? '0' : undefined,
          });
        }
      }

      // Delete payment allocations
      await paymentAllocationRepo.query(
        `DELETE FROM payment_allocations WHERE payment_id = $1`, [id]
      );

      // Restore loan outstanding_balance
      const loan = await loanRepo.findById(loanId);
      if (loan) {
        const oldBalance = parseFloat(loan.outstanding_balance) || 0;
        const newBalance = oldBalance + restoreAmount;
        const newStatus = loan.status === 'closed' ? 'active' : loan.status;
        await loanRepo.update(loanId, {
          outstanding_balance: newBalance,
          status: newStatus,
        });
      }

      // Delete the payment itself
      await paymentRepo.delete(id);

      res.json({ success: true, message: 'Payment deleted and balances restored' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const paymentController = new PaymentController();
