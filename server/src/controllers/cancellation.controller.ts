import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { paymentRepo, amortizationScheduleRepo, paymentAllocationRepo, loanRepo, cancellationRequestRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';

export class CancellationController {
  async requestCancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const paymentId = paramStr(req.params.id);
      const { reason } = req.body;
      if (!reason) throw new Error('Cancellation reason is required');
      const payment = await paymentRepo.findById(paymentId);
      if (!payment) throw new Error('Payment not found');
      if (payment.status === 'cancelled') throw new Error('Payment is already cancelled');
      const existing = await cancellationRequestRepo.findOne({ payment_id: paymentId, status: 'pending' });
      if (existing) throw new Error('A pending cancellation request already exists for this payment');
      const request = await cancellationRequestRepo.create({
        payment_id: paymentId,
        requested_by: req.user?.userId,
        reason,
        status: 'pending',
        type: 'cancel',
      });
      res.json({ success: true, data: request });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async requestVoidRepay(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const paymentId = paramStr(req.params.id);
      const { reason, replacementPaymentId } = req.body;
      if (!reason) throw new Error('Cancellation reason is required');
      if (!replacementPaymentId) throw new Error('Replacement payment ID is required');
      const payment = await paymentRepo.findById(paymentId);
      if (!payment) throw new Error('Payment not found');
      if (payment.status === 'cancelled') throw new Error('Payment is already cancelled');
      const existing = await cancellationRequestRepo.findOne({ payment_id: paymentId, status: 'pending' });
      if (existing) throw new Error('A pending cancellation request already exists for this payment');
      const request = await cancellationRequestRepo.create({
        payment_id: paymentId,
        requested_by: req.user?.userId,
        reason,
        status: 'pending',
        type: 'void-repay',
        replacement_payment_id: replacementPaymentId,
      });
      res.json({ success: true, data: request });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async approve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const request = await cancellationRequestRepo.findById(id);
      if (!request) throw new Error('Cancellation request not found');
      if (request.status !== 'pending') throw new Error('Request is already ' + request.status);

      const payment = await paymentRepo.findById(request.payment_id);
      if (!payment) throw new Error('Payment not found');

      const loanId = payment.loan_id;
      const restoreAmount = (parseFloat(payment.amount) || 0) - (parseFloat(payment.penalty_amount) || 0);
      const allocations = await paymentAllocationRepo.query(`SELECT * FROM payment_allocations WHERE payment_id = $1`, [request.payment_id]);

      const penaltyAmt = parseFloat(payment.penalty_amount) || 0;
      for (const alloc of allocations) {
        const schedule = await amortizationScheduleRepo.findById(alloc.schedule_id);
        if (schedule) {
          const oldPaid = parseFloat(schedule.paid_amount) || 0;
          const newPaid = Math.max(0, oldPaid - (parseFloat(alloc.amount) || 0));
          const totalDue = parseFloat(schedule.total_due) || 0;
          const status = newPaid <= 0 ? 'pending' : (newPaid >= totalDue - 0.005 ? 'paid' : 'partial');
          await amortizationScheduleRepo.update(alloc.schedule_id, {
            paid_amount: newPaid, status,
            paid_at: status === 'pending' ? null : schedule.paid_at,
            penalty_amount: penaltyAmt > 0 ? '0' : undefined,
          });
        }
      }
      await paymentAllocationRepo.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [request.payment_id]);

      const loan = await loanRepo.findById(loanId);
      if (loan) {
        const oldBalance = parseFloat(loan.outstanding_balance) || 0;
        const newBalance = oldBalance + restoreAmount;
        const newStatus = loan.status === 'closed' ? 'active' : loan.status;
        await loanRepo.update(loanId, { outstanding_balance: newBalance, status: newStatus });
      }

      await paymentRepo.update(request.payment_id, { status: 'cancelled', cancellation_reason: request.reason });
      await cancellationRequestRepo.update(id, { status: 'approved', reviewed_by: req.user?.userId, reviewed_at: new Date().toISOString() });

      res.json({ success: true, message: 'Cancellation approved' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async reject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { rejection_reason } = req.body;
      const request = await cancellationRequestRepo.findById(id);
      if (!request) throw new Error('Cancellation request not found');
      if (request.status !== 'pending') throw new Error('Request is already ' + request.status);

      if (request.type === 'void-repay' && request.replacement_payment_id) {
        await paymentAllocationRepo.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [request.replacement_payment_id]);
        const repPayment = await paymentRepo.findById(request.replacement_payment_id);
        if (repPayment) {
          const repLoanId = repPayment.loan_id;
          const repRestore = (parseFloat(repPayment.amount) || 0) - (parseFloat(repPayment.penalty_amount) || 0);
          const repLoan = await loanRepo.findById(repLoanId);
          if (repLoan) {
            const oldBal = parseFloat(repLoan.outstanding_balance) || 0;
            const newBal = oldBal + repRestore;
            const newStat = repLoan.status === 'closed' ? 'active' : repLoan.status;
            await loanRepo.update(repLoanId, { outstanding_balance: newBal, status: newStat });
          }
          await paymentRepo.delete(request.replacement_payment_id);
        }
      }

      await cancellationRequestRepo.update(id, { status: 'rejected', reviewed_by: req.user?.userId, reviewed_at: new Date().toISOString(), rejection_reason });
      res.json({ success: true, message: 'Cancellation rejected' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status } = req.query;
      const rows = await cancellationRequestRepo.query(
        `SELECT cr.*, 
          u1.first_name || ' ' || u1.last_name as requested_by_name,
          u2.first_name || ' ' || u2.last_name as reviewed_by_name,
          p.payment_number, p.amount as payment_amount,
          l.loan_number
        FROM cancellation_requests cr
        LEFT JOIN users u1 ON u1.id = cr.requested_by
        LEFT JOIN users u2 ON u2.id = cr.reviewed_by
        LEFT JOIN payments p ON p.id = cr.payment_id
        LEFT JOIN loans l ON l.id = p.loan_id
        WHERE ($1::text IS NULL OR cr.status = $1)
        ORDER BY cr.created_at DESC`,
        [status || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async pendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await cancellationRequestRepo.query(
        `SELECT COUNT(*) as count FROM cancellation_requests WHERE status = 'pending'`
      );
      res.json({ success: true, data: { count: parseInt(result[0]?.count || '0') } });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const cancellationController = new CancellationController();