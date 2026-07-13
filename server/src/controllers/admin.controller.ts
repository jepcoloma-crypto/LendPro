import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { paymentRepo, loanRepo, amortizationScheduleRepo, paymentAllocationRepo, cashTransactionRepo, cashierSessionRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { paramStr, parsePagination } from '../utils/helpers';
import { pool } from '../database/connection';

export class AdminController {

  async getPaymentAllocations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const rows = await paymentAllocationRepo.query(
        `SELECT pa.*, asch.due_date, asch.total_due, asch.paid_amount as schedule_paid
         FROM payment_allocations pa
         JOIN amortization_schedules asch ON asch.id = pa.schedule_id
         WHERE pa.payment_id = $1
         ORDER BY asch.due_date`,
        [id]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  // ==================== PAYMENT CORRECTOR ====================

  async forceCancelPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { cancellation_reason } = req.body;
      if (!cancellation_reason) throw new AppError(400, 'Cancellation reason is required');

      const payment = await paymentRepo.findById(id);
      if (!payment) throw new AppError(404, 'Payment not found');
      if (payment.status === 'cancelled') throw new AppError(400, 'Payment is already cancelled');

      const loanId = payment.loan_id;
      const restoreAmount = (parseFloat(payment.amount) || 0) - (parseFloat(payment.penalty_amount) || 0);
      const penaltyAmt = parseFloat(payment.penalty_amount) || 0;

      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        const { rows: allocations } = await client.query(`SELECT * FROM payment_allocations WHERE payment_id = $1`, [id]);
        for (const alloc of allocations) {
          const { rows: schedRows } = await client.query(`SELECT * FROM amortization_schedules WHERE id = $1`, [alloc.schedule_id]);
          const schedule = schedRows[0];
          if (schedule) {
            const oldPaid = parseFloat(schedule.paid_amount) || 0;
            const newPaid = Math.max(0, oldPaid - (parseFloat(alloc.amount) || 0));
            const totalDue = parseFloat(schedule.total_due) || 0;
            const schedStatus = newPaid <= 0 ? 'pending' : (newPaid >= totalDue - 0.005 ? 'paid' : 'partial');
            await client.query(
              `UPDATE amortization_schedules SET paid_amount = $1, status = $2, paid_at = $3, penalty_amount = $4, updated_at = NOW() WHERE id = $5`,
              [newPaid, schedStatus, schedStatus === 'pending' ? null : schedule.paid_at, penaltyAmt > 0 ? '0' : schedule.penalty_amount, alloc.schedule_id]
            );
          }
        }

        await client.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [id]);

        const { rows: loanRows } = await client.query(`SELECT * FROM loans WHERE id = $1`, [loanId]);
        const loan = loanRows[0];
        if (loan) {
          const oldBalance = parseFloat(loan.outstanding_balance) || 0;
          const newBalance = oldBalance + restoreAmount;
          const newStatus = loan.status === 'closed' ? 'active' : loan.status;
          await client.query(
            `UPDATE loans SET outstanding_balance = $1, status = $2, updated_at = NOW() WHERE id = $3`,
            [newBalance, newStatus, loanId]
          );
        }

        const { rows: cashTxns } = await client.query(`SELECT id, shift_id FROM cash_transactions WHERE payment_id = $1`, [id]);
        for (const txn of cashTxns) {
          await client.query(`DELETE FROM cash_transactions WHERE id = $1`, [txn.id]);
          await client.query(
            `UPDATE cashier_sessions SET expected_cash = expected_cash - $1 WHERE id = $2`,
            [payment.amount, txn.shift_id]
          );
        }

        await client.query(
          `UPDATE payments SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW() WHERE id = $2`,
          [cancellation_reason, id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      const cancelled = await paymentRepo.findById(id);
      res.json({ success: true, data: cancelled, message: 'Payment force-cancelled' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async adjustPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { amount, payment_date } = req.body;

      const payment = await paymentRepo.findById(id);
      if (!payment) throw new AppError(404, 'Payment not found');
      if (payment.status === 'cancelled') throw new AppError(400, 'Cannot adjust a cancelled payment');

      const oldAmount = parseFloat(payment.amount) || 0;
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (amount !== undefined && amount !== null) {
        const newAmount = parseFloat(amount);
        if (isNaN(newAmount) || newAmount <= 0) throw new AppError(400, 'Invalid amount');
        const diff = newAmount - oldAmount;

        updates.push(`amount = $${idx++}`);
        params.push(newAmount);

        const client = await pool.connect();
        try {
          await client.query('SET search_path TO public');
          await client.query('BEGIN');

          // Update loan outstanding_balance (inverse of amount change)
          const { rows: loanRows } = await client.query(`SELECT * FROM loans WHERE id = $1`, [payment.loan_id]);
          const loan = loanRows[0];
          if (loan) {
            const oldBalance = parseFloat(loan.outstanding_balance) || 0;
            const newBalance = oldBalance - diff;
            await client.query(
              `UPDATE loans SET outstanding_balance = $1, updated_at = NOW() WHERE id = $2`,
              [newBalance, payment.loan_id]
            );
          }

          // Update cash transaction amount
          const { rows: cashTxns } = await client.query(`SELECT id, amount, shift_id FROM cash_transactions WHERE payment_id = $1`, [id]);
          for (const txn of cashTxns) {
            const oldTxnAmt = parseFloat(txn.amount) || 0;
            const newTxnAmt = oldTxnAmt + diff;
            await client.query(
              `UPDATE cash_transactions SET amount = $1, updated_at = NOW() WHERE id = $2`,
              [newTxnAmt, txn.id]
            );
            await client.query(
              `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
              [diff, txn.shift_id]
            );
          }

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      }

      if (payment_date) {
        updates.push(`payment_date = $${idx++}`);
        params.push(new Date(payment_date).toISOString());
      }

      if (updates.length > 0) {
        params.push(id);
        await pool.query(
          `UPDATE payments SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
          params
        );
      }

      const updated = await paymentRepo.findById(id);
      res.json({ success: true, data: updated, message: 'Payment adjusted' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async reAllocatePayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { allocations } = req.body;

      if (!Array.isArray(allocations) || allocations.length === 0) {
        throw new AppError(400, 'Allocations array is required');
      }

      const payment = await paymentRepo.findById(id);
      if (!payment) throw new AppError(404, 'Payment not found');
      if (payment.status === 'cancelled') throw new AppError(400, 'Cannot re-allocate a cancelled payment');

      const totalAllocated = allocations.reduce((sum: number, a: any) => sum + (parseFloat(a.amount) || 0), 0);
      const paymentAmount = parseFloat(payment.amount) || 0;
      if (Math.abs(totalAllocated - paymentAmount) > 0.01) {
        throw new AppError(400, `Allocation total (${totalAllocated}) must equal payment amount (${paymentAmount})`);
      }

      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        // Reset all existing schedules for this loan from this payment
        const { rows: oldAllocs } = await client.query(`SELECT * FROM payment_allocations WHERE payment_id = $1`, [id]);
        for (const alloc of oldAllocs) {
          const { rows: schedRows } = await client.query(`SELECT * FROM amortization_schedules WHERE id = $1`, [alloc.schedule_id]);
          const schedule = schedRows[0];
          if (schedule) {
            const oldPaid = parseFloat(schedule.paid_amount) || 0;
            const newPaid = Math.max(0, oldPaid - (parseFloat(alloc.amount) || 0));
            const totalDue = parseFloat(schedule.total_due) || 0;
            const schedStatus = newPaid <= 0 ? 'pending' : (newPaid >= totalDue - 0.005 ? 'paid' : 'partial');
            await client.query(
              `UPDATE amortization_schedules SET paid_amount = $1, status = $2, paid_at = $3, updated_at = NOW() WHERE id = $4`,
              [newPaid, schedStatus, schedStatus === 'pending' ? null : schedule.paid_at, alloc.schedule_id]
            );
          }
        }

        await client.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [id]);

        // Apply new allocations
        for (const alloc of allocations) {
          const allocAmt = parseFloat(alloc.amount) || 0;
          const { rows: schedRows } = await client.query(`SELECT * FROM amortization_schedules WHERE id = $1`, [alloc.schedule_id]);
          const schedule = schedRows[0];
          if (!schedule) throw new AppError(400, `Schedule ${alloc.schedule_id} not found`);

          const oldPaid = parseFloat(schedule.paid_amount) || 0;
          const newPaid = oldPaid + allocAmt;
          const totalDue = parseFloat(schedule.total_due) || 0;
          const schedStatus = newPaid >= totalDue - 0.005 ? 'paid' : 'partial';

          await client.query(
            `UPDATE amortization_schedules SET paid_amount = $1, status = $2, paid_at = $3, updated_at = NOW() WHERE id = $4`,
            [newPaid, schedStatus, schedule.paid_at || new Date().toISOString(), alloc.schedule_id]
          );

          await client.query(
            `INSERT INTO payment_allocations (payment_id, schedule_id, amount, allocated_to) VALUES ($1, $2, $3, 'principal')`,
            [id, alloc.schedule_id, allocAmt]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      const updated = await paymentRepo.findById(id);
      res.json({ success: true, data: updated, message: 'Payment re-allocated' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  // ==================== CASH TRANSACTION ADMIN ====================

  async listCashTransactions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const { shift_id, date_from, date_to, transaction_type } = req.query;

      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (shift_id) {
        conditions.push(`ct.shift_id = $${idx++}`);
        params.push(shift_id);
      }
      if (date_from) {
        conditions.push(`ct.created_at >= $${idx++}`);
        params.push(date_from);
      }
      if (date_to) {
        conditions.push(`ct.created_at <= $${idx++}`);
        params.push(new Date(date_to as string + 'T23:59:59Z').toISOString());
      }
      if (transaction_type) {
        conditions.push(`ct.transaction_type = $${idx++}`);
        params.push(transaction_type);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await cashTransactionRepo.query(
        `SELECT COUNT(*) as total FROM cash_transactions ct ${where}`,
        params
      );
      const total = parseInt(countResult[0]?.total) || 0;

      const offset = ((pagination.page - 1) * pagination.limit);
      params.push(pagination.limit);
      params.push(offset);

      const rows = await cashTransactionRepo.query(
        `SELECT ct.*, cs.opened_at as shift_date, u.first_name || ' ' || u.last_name as created_by_name
         FROM cash_transactions ct
         LEFT JOIN cashier_sessions cs ON cs.id = ct.shift_id
         LEFT JOIN users u ON u.id = ct.created_by
         ${where}
         ORDER BY ct.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        params
      );

      res.json({ success: true, data: rows, pagination: { ...pagination, total } });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async deleteCashTransaction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);

      const txn = await cashTransactionRepo.findById(id);
      if (!txn) throw new AppError(404, 'Cash transaction not found');

      const amount = parseFloat(txn.amount) || 0;
      const direction = txn.direction;

      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        await client.query(`DELETE FROM cash_transactions WHERE id = $1`, [id]);

        const delta = direction === 'in' ? -amount : amount;
        await client.query(
          `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
          [delta, txn.shift_id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      res.json({ success: true, message: 'Cash transaction deleted' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async reassignCashTransaction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { shift_id } = req.body;
      if (!shift_id) throw new AppError(400, 'Target shift_id is required');

      const txn = await cashTransactionRepo.findById(id);
      if (!txn) throw new AppError(404, 'Cash transaction not found');

      const targetShift = await cashierSessionRepo.findById(shift_id);
      if (!targetShift) throw new AppError(404, 'Target shift not found');

      const amount = parseFloat(txn.amount) || 0;
      const direction = txn.direction;
      const oldShiftId = txn.shift_id;

      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        await client.query(
          `UPDATE cash_transactions SET shift_id = $1, updated_at = NOW() WHERE id = $2`,
          [shift_id, id]
        );

        // Remove from old shift
        const oldDelta = direction === 'in' ? -amount : amount;
        await client.query(
          `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
          [oldDelta, oldShiftId]
        );

        // Add to new shift
        const newDelta = direction === 'in' ? amount : -amount;
        await client.query(
          `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
          [newDelta, shift_id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      const updated = await cashTransactionRepo.findById(id);
      res.json({ success: true, data: updated, message: 'Transaction reassigned' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }
}

export const adminController = new AdminController();
