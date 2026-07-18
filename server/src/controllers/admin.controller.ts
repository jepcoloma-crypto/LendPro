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
              `UPDATE cash_transactions SET amount = $1 WHERE id = $2`,
              [newTxnAmt, txn.id]
            );
            await client.query(
              `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
              [diff, txn.shift_id]
            );
          }

          // Update allocations and schedule paid_amounts proportionally
          const { rows: allocs } = await client.query(
            `SELECT id, schedule_id, amount FROM payment_allocations WHERE payment_id = $1`,
            [id]
          );
          if (allocs.length > 0) {
            const ratio = oldAmount > 0 ? newAmount / oldAmount : 1;
            for (const alloc of allocs) {
              const oldAllocAmt = parseFloat(alloc.amount) || 0;
              const newAllocAmt = Math.round(oldAllocAmt * ratio * 100) / 100;
              const allocDiff = newAllocAmt - oldAllocAmt;
              await client.query(
                `UPDATE payment_allocations SET amount = $1 WHERE id = $2`,
                [newAllocAmt, alloc.id]
              );
              await client.query(
                `UPDATE amortization_schedules SET paid_amount = GREATEST(0, paid_amount + $1) WHERE id = $2`,
                [allocDiff, alloc.schedule_id]
              );
            }
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

  async reassignCollector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { collector_id } = req.body;
      if (!collector_id) throw new AppError(400, 'Collector is required');

      const payment = await paymentRepo.findById(id);
      if (!payment) throw new AppError(404, 'Payment not found');

      // Verify collector exists and is active
      const { rows: collectors } = await pool.query(
        `SELECT id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND r.slug = 'collector' AND u.is_active = true`,
        [collector_id]
      );
      if (!collectors.length) throw new AppError(400, 'Collector not found or inactive');

      await pool.query(
        `UPDATE payments SET collector_id = $1, updated_at = NOW() WHERE id = $2`,
        [collector_id, id]
      );

      const updated = await paymentRepo.findById(id);
      res.json({ success: true, data: updated, message: 'Payment collector reassigned' });
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
          `UPDATE cash_transactions SET shift_id = $1 WHERE id = $2`,
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

  // ==================== LOAN QUICK FIX ====================

  async adjustLoan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { maturity_date, status, release_date, principal_amount, outstanding_balance, interest_amount, total_amount } = req.body;

      const loan = await loanRepo.findById(id);
      if (!loan) throw new AppError(404, 'Loan not found');

      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (maturity_date) { updates.push(`maturity_date = $${idx++}`); params.push(new Date(maturity_date).toISOString()); }
      if (release_date) { updates.push(`release_date = $${idx++}`); params.push(new Date(release_date).toISOString()); }
      if (status) { updates.push(`status = $${idx++}`); params.push(status); }
      if (principal_amount !== undefined) { updates.push(`principal_amount = $${idx++}`); params.push(parseFloat(principal_amount)); }
      if (outstanding_balance !== undefined) { updates.push(`outstanding_balance = $${idx++}`); params.push(parseFloat(outstanding_balance)); }
      if (interest_amount !== undefined) { updates.push(`interest_amount = $${idx++}`); params.push(parseFloat(interest_amount)); }
      if (total_amount !== undefined) { updates.push(`total_amount = $${idx++}`); params.push(parseFloat(total_amount)); }

      if (updates.length === 0) throw new AppError(400, 'No fields to update');

      params.push(id);
      await pool.query(
        `UPDATE loans SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
        params
      );

      const updated = await loanRepo.findById(id);
      res.json({ success: true, data: updated, message: 'Loan updated' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async adjustLoanSchedule(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { schedules } = req.body;

      if (!Array.isArray(schedules) || schedules.length === 0) {
        throw new AppError(400, 'Schedules array is required');
      }

      const loan = await loanRepo.findById(id);
      if (!loan) throw new AppError(404, 'Loan not found');

      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        for (const sched of schedules) {
          if (!sched.id) throw new AppError(400, 'Each schedule must have an id');
          const setClauses: string[] = [];
          const schedParams: any[] = [];
          let sIdx = 1;

          if (sched.due_date) { setClauses.push(`due_date = $${sIdx++}`); schedParams.push(new Date(sched.due_date).toISOString().slice(0, 10)); }
          if (sched.principal !== undefined) { setClauses.push(`principal = $${sIdx++}`); schedParams.push(parseFloat(sched.principal)); }
          if (sched.interest !== undefined) { setClauses.push(`interest = $${sIdx++}`); schedParams.push(parseFloat(sched.interest)); }
          if (sched.total_due !== undefined) { setClauses.push(`total_due = $${sIdx++}`); schedParams.push(parseFloat(sched.total_due)); }
          if (sched.paid_amount !== undefined) { setClauses.push(`paid_amount = $${sIdx++}`); schedParams.push(parseFloat(sched.paid_amount)); }
          if (sched.status) { setClauses.push(`status = $${sIdx++}`); schedParams.push(sched.status); }
          if (sched.balance !== undefined) { setClauses.push(`balance = $${sIdx++}`); schedParams.push(parseFloat(sched.balance)); }

          if (setClauses.length === 0) continue;

          schedParams.push(sched.id);
          await client.query(
            `UPDATE amortization_schedules SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${sIdx}`,
            schedParams
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      const { rows: updatedSchedules } = await pool.query(
        `SELECT * FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no`,
        [id]
      );
      res.json({ success: true, data: updatedSchedules, message: 'Schedules updated' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  // ==================== SHIFT MANAGER ====================

  async listShifts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const { status, date_from, date_to, user_id } = req.query;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (status) { conditions.push(`cs.status = $${idx++}`); params.push(status); }
      if (date_from) { conditions.push(`cs.opened_at >= $${idx++}`); params.push(date_from); }
      if (date_to) { conditions.push(`cs.opened_at <= $${idx++}`); params.push(new Date(date_to as string + 'T23:59:59Z').toISOString()); }
      if (user_id) { conditions.push(`cs.user_id = $${idx++}`); params.push(user_id); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await cashierSessionRepo.query(
        `SELECT COUNT(*) as total FROM cashier_sessions cs ${where}`, params
      );
      const total = parseInt(countResult[0]?.total) || 0;

      const offset = ((pagination.page - 1) * pagination.limit);
      params.push(pagination.limit);
      params.push(offset);

      const rows = await cashierSessionRepo.query(
        `SELECT cs.*, u.first_name || ' ' || u.last_name as user_name,
                (SELECT COUNT(*) FROM cash_transactions WHERE shift_id = cs.id) as txn_count,
                (SELECT COALESCE(SUM(amount),0) FROM cash_transactions WHERE shift_id = cs.id) as txn_total
         FROM cashier_sessions cs
         JOIN users u ON u.id = cs.user_id
         ${where}
         ORDER BY cs.opened_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        params
      );

      res.json({ success: true, data: rows, pagination: { ...pagination, total } });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async forceCloseShift(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { actual_cash, notes, variance_reason } = req.body;

      const shift = await cashierSessionRepo.findById(id);
      if (!shift) throw new AppError(404, 'Shift not found');
      if (shift.status !== 'open') throw new AppError(400, 'Shift is not open');

      // Recompute expected_cash from transactions
      const txns = await cashTransactionRepo.query(
        `SELECT direction, payment_method, COALESCE(SUM(amount),0) as total
         FROM cash_transactions WHERE shift_id = $1 GROUP BY direction, payment_method`,
        [id]
      );
      let cashIn = 0, cashOut = 0;
      for (const t of txns) {
        const amt = parseFloat(t.total) || 0;
        if (t.direction === 'in') { cashIn += amt; }
        else { cashOut += amt; }
      }
      const openingFloat = parseFloat(shift.opening_float) || 0;
      const expectedCash = openingFloat + cashIn - cashOut;
      const actual = actual_cash !== undefined ? parseFloat(actual_cash) : expectedCash;

      await cashierSessionRepo.update(id, {
        actual_cash: actual,
        expected_cash: expectedCash,
        over_short: actual - expectedCash,
        closed_at: new Date().toISOString(),
        status: 'closed',
        notes: notes || `Force-closed by admin. ${variance_reason ? 'Reason: ' + variance_reason : ''}`,
      });

      const updated = await cashierSessionRepo.findById(id);
      res.json({ success: true, data: updated, message: 'Shift force-closed' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async reopenShift(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const shift = await cashierSessionRepo.findById(id);
      if (!shift) throw new AppError(404, 'Shift not found');
      if (shift.status !== 'closed') throw new AppError(400, 'Only closed shifts can be reopened');

      await cashierSessionRepo.update(id, {
        status: 'open',
        closed_at: null,
        actual_cash: null,
        over_short: 0,
        notes: (shift.notes || '') + ' | Reopened by admin',
      });

      res.json({ success: true, message: 'Shift reopened' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async deleteShift(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const shift = await cashierSessionRepo.findById(id);
      if (!shift) throw new AppError(404, 'Shift not found');

      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        await client.query(`DELETE FROM approval_history WHERE shift_id = $1`, [id]);
        await client.query(`DELETE FROM cash_reconciliations WHERE shift_id = $1`, [id]);
        await client.query(`DELETE FROM cash_counts WHERE shift_id = $1`, [id]);
        await client.query(`DELETE FROM cash_transactions WHERE shift_id = $1`, [id]);
        await client.query(`DELETE FROM cashier_sessions WHERE id = $1`, [id]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      res.json({ success: true, message: 'Shift and all related records deleted' });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async moveShiftTransactions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { target_shift_id } = req.body;
      if (!target_shift_id) throw new AppError(400, 'target_shift_id is required');

      const sourceShift = await cashierSessionRepo.findById(id);
      if (!sourceShift) throw new AppError(404, 'Source shift not found');
      const targetShift = await cashierSessionRepo.findById(target_shift_id);
      if (!targetShift) throw new AppError(404, 'Target shift not found');

      const client = await pool.connect();
      let txnCount = 0;
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        // Get all transactions from source shift
        const { rows: txns } = await client.query(
          `SELECT id, direction, amount FROM cash_transactions WHERE shift_id = $1`, [id]
        );
        txnCount = txns.length;

        // Move transactions to target shift
        await client.query(
          `UPDATE cash_transactions SET shift_id = $1 WHERE shift_id = $2`,
          [target_shift_id, id]
        );

        // Recalculate expected_cash on both shifts
        let sourceDelta = 0;
        let targetDelta = 0;
        for (const txn of txns) {
          const amt = parseFloat(txn.amount) || 0;
          const delta = txn.direction === 'in' ? amt : -amt;
          sourceDelta -= delta;
          targetDelta += delta;
        }

        await client.query(
          `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
          [sourceDelta, id]
        );
        await client.query(
          `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
          [targetDelta, target_shift_id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      res.json({ success: true, message: `${txnCount} transactions moved to target shift` });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  // ==================== DATA INTEGRITY SCAN ====================

  async dataIntegrityScan(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const issues: any[] = [];

      // 1. Orphaned payments (no loan)
      const orphanPayments = await paymentRepo.query(
        `SELECT p.id, p.payment_number, p.amount, p.loan_id FROM payments p WHERE p.loan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.id = p.loan_id)`
      );
      orphanPayments.forEach((r: any) => issues.push({
        type: 'orphaned_payment',
        severity: 'high',
        entity: `Payment ${r.payment_number}`,
        detail: `References loan ${r.loan_id} which does not exist`,
        amount: parseFloat(r.amount) || 0,
        id: r.id,
      }));

      // 2. Orphaned payment allocations (no payment)
      const orphanAllocs = await paymentAllocationRepo.query(
        `SELECT pa.id, pa.payment_id, pa.amount FROM payment_allocations pa WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = pa.payment_id)`
      );
      orphanAllocs.forEach((r: any) => issues.push({
        type: 'orphaned_allocation',
        severity: 'medium',
        entity: `Allocation ${r.id?.slice(0, 8)}`,
        detail: `References payment ${r.payment_id} which does not exist`,
        amount: parseFloat(r.amount) || 0,
        id: r.id,
      }));

      // 3. Orphaned allocations (no schedule)
      const orphanSchedAllocs = await paymentAllocationRepo.query(
        `SELECT pa.id, pa.payment_id, pa.schedule_id, pa.amount FROM payment_allocations pa WHERE NOT EXISTS (SELECT 1 FROM amortization_schedules s WHERE s.id = pa.schedule_id)`
      );
      orphanSchedAllocs.forEach((r: any) => issues.push({
        type: 'orphaned_allocation_schedule',
        severity: 'medium',
        entity: `Allocation ${r.id?.slice(0, 8)}`,
        detail: `References schedule ${r.schedule_id} which does not exist`,
        amount: parseFloat(r.amount) || 0,
        id: r.id,
      }));

      // 4. Orphaned cash transactions (no shift)
      const orphanTxns = await cashTransactionRepo.query(
        `SELECT ct.id, ct.description, ct.amount FROM cash_transactions ct WHERE NOT EXISTS (SELECT 1 FROM cashier_sessions cs WHERE cs.id = ct.shift_id)`
      );
      orphanTxns.forEach((r: any) => issues.push({
        type: 'orphaned_cash_txn',
        severity: 'high',
        entity: `Cash Transaction ${r.id?.slice(0, 8)}`,
        detail: r.description || 'No shift reference',
        amount: parseFloat(r.amount) || 0,
        id: r.id,
      }));

      // 5. Mismatched loan balances (outstanding_balance != sum of remaining schedule amounts)
      const balanceIssues = await loanRepo.query(
        `SELECT l.id, l.loan_number, l.outstanding_balance,
                COALESCE(l.advance_balance, 0) as advance_balance,
                COALESCE(SUM(s.total_due - s.paid_amount), 0) as sum_remaining
         FROM loans l
         LEFT JOIN amortization_schedules s ON s.loan_id = l.id
         WHERE l.status NOT IN ('written-off', 'pending')
         GROUP BY l.id, l.loan_number, l.outstanding_balance, l.advance_balance
         HAVING ABS(l.outstanding_balance + COALESCE(l.advance_balance, 0) - COALESCE(SUM(s.total_due - s.paid_amount), 0)) > 0.01`
      );
      balanceIssues.forEach((r: any) => issues.push({
        type: 'balance_mismatch',
        severity: 'high',
        entity: `Loan ${r.loan_number}`,
        detail: `Outstanding balance (${parseFloat(r.outstanding_balance).toFixed(2)}) + advance (${parseFloat(r.advance_balance).toFixed(2)}) = ${(parseFloat(r.outstanding_balance) + parseFloat(r.advance_balance)).toFixed(2)} ≠ sum of remaining schedule dues (${parseFloat(r.sum_remaining).toFixed(2)})`,
        amount: Math.abs((parseFloat(r.outstanding_balance) + parseFloat(r.advance_balance)) - parseFloat(r.sum_remaining)),
        id: r.id,
      }));

      // 6. Schedules past maturity still pending
      const pastDueSchedules = await amortizationScheduleRepo.query(
        `SELECT s.id, s.loan_id, s.installment_no, s.due_date, s.total_due, s.paid_amount, l.loan_number
         FROM amortization_schedules s
         JOIN loans l ON l.id = s.loan_id
         WHERE s.due_date < CURRENT_DATE AND s.status = 'pending' AND l.status NOT IN ('written-off', 'closed')`
      );
      pastDueSchedules.forEach((r: any) => issues.push({
        type: 'past_due_pending',
        severity: 'low',
        entity: `Loan ${r.loan_number} #${r.installment_no}`,
        detail: `Due ${new Date(r.due_date).toLocaleDateString()} still pending, total_due=${parseFloat(r.total_due).toFixed(2)}`,
        amount: parseFloat(r.total_due) - (parseFloat(r.paid_amount) || 0),
        id: r.id,
      }));

      // 7. Loans that should be closed (outstanding_balance <= 0 but status != 'closed')
      const shouldBeClosed = await loanRepo.query(
        `SELECT id, loan_number, outstanding_balance, status FROM loans WHERE outstanding_balance <= 0 AND status NOT IN ('closed', 'written-off', 'pending')`
      );
      shouldBeClosed.forEach((r: any) => issues.push({
        type: 'should_be_closed',
        severity: 'medium',
        entity: `Loan ${r.loan_number}`,
        detail: `Outstanding balance is ${parseFloat(r.outstanding_balance).toFixed(2)} but status is '${r.status}'`,
        amount: 0,
        id: r.id,
      }));

      res.json({ success: true, data: issues, meta: { total: issues.length, by_severity: { high: issues.filter(i => i.severity === 'high').length, medium: issues.filter(i => i.severity === 'medium').length, low: issues.filter(i => i.severity === 'low').length } } });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  // ==================== CONNECTION MONITOR ====================

  async getConnections(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const connections = await pool.query(`
        SELECT pid, usename, application_name, client_addr, client_port, state, query, query_start, state_change, wait_event_type, wait_event
        FROM pg_stat_activity WHERE pid <> pg_backend_pid() ORDER BY query_start DESC NULLS LAST
      `);
      res.json({ success: true, data: connections.rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async killConnection(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pid = parseInt(paramStr(req.params.pid));
      if (!pid) throw new AppError(400, 'PID is required');
      const result = await pool.query(`SELECT pg_terminate_backend($1) as terminated`, [pid]);
      const terminated = result.rows[0]?.terminated;
      if (!terminated) throw new AppError(403, 'Permission denied. This database user may not have privileges to terminate connections, or the connection may be managed by PgBouncer (port 6543). Try direct PostgreSQL (port 5432) or contact your database admin.');
      res.json({ success: true, message: `Connection ${pid} terminated` });
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }
}

export const adminController = new AdminController();
