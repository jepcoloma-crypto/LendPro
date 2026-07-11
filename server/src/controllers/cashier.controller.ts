import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { cashierSessionRepo, cashTransactionRepo, cashCountRepo, cashReconciliationRepo, approvalHistoryRepo, paymentRepo } from '../repositories';
import { pool } from '../database/connection';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

export class CashierController {
  // ========== SHIFT MANAGEMENT ==========

  async shiftOpen(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { opening_float, branch_id, opened_at } = req.body;
      if (!opening_float || parseFloat(opening_float) <= 0) {
        throw new Error('Opening float must be greater than 0. Enter the actual cash on hand to start the shift.');
      }
      const existing = await cashierSessionRepo.findOne({ user_id: req.user?.userId, status: 'open' });
      if (existing) throw new Error('You already have an open shift. Close it first.');

      const shiftDate = opened_at ? new Date(opened_at) : new Date();
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const shiftDateStr = shiftDate.toISOString().slice(0, 10);
      const todayStr = today.toISOString().slice(0, 10);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      if (shiftDateStr !== todayStr && shiftDateStr !== yesterdayStr) {
        throw new Error(`Shift date must be today (${todayStr}) or yesterday (${yesterdayStr}). Cannot backdate further.`);
      }

      const shift = await cashierSessionRepo.create({
        user_id: req.user?.userId,
        branch_id: branch_id || (req.user as any)?.branchId,
        opened_at: shiftDate.toISOString(),
        opening_float: opening_float || 0,
        expected_cash: opening_float || 0,
        status: 'open',
      });
      res.json({ success: true, data: shift });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async shiftClose(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const shift = await cashierSessionRepo.findById(id);
      if (!shift) throw new Error('Shift not found');
      if (shift.status !== 'open') throw new Error('Shift is not open');
      if (shift.user_id !== req.user?.userId) throw new Error('Not your shift');

      // Check for pending unremitted payments
      const pendingPickups = await pool.query(
        `SELECT COUNT(*) as c FROM payments WHERE remittance_status = 'pending' AND status != 'cancelled'`
      );
      if (parseInt(pendingPickups.rows[0]?.c || '0') > 0) {
        throw new Error(`Cannot close shift — ${pendingPickups.rows[0].c} payment(s) are still pending in Cash Pick-up. Record all pick-ups first.`);
      }

      // Check for unresolved reconciliations from previous shifts
      const pendingRecon = await pool.query(
        `SELECT COUNT(*) as c FROM cash_reconciliations r JOIN cashier_sessions s ON s.id = r.shift_id WHERE r.status = 'pending' AND s.user_id = $1`,
        [req.user!.userId]
      );
      if (parseInt(pendingRecon.rows[0]?.c || '0') > 0) {
        throw new Error(`Cannot close shift — you have ${pendingRecon.rows[0].c} pending reconciliation(s) from previous shifts that need approval first.`);
      }

      // Recompute from cash_transactions
      const txns = await cashTransactionRepo.query(
        `SELECT direction, payment_method, COALESCE(SUM(amount),0) as total
         FROM cash_transactions WHERE shift_id = $1 GROUP BY direction, payment_method`,
        [id]
      );
      let cashIn = 0, cashOut = 0, nonCashIn = 0;
      for (const t of txns) {
        const amt = parseFloat(t.total) || 0;
        if (t.direction === 'in') {
          if (t.payment_method === 'cash') cashIn += amt;
          else nonCashIn += amt;
        } else {
          cashOut += amt;
        }
      }
      const openingFloat = parseFloat(shift.opening_float) || 0;
      const expectedCash = openingFloat + cashIn - cashOut;
      if (req.body.actual_cash === undefined || req.body.actual_cash === null || req.body.actual_cash === '') {
        throw new Error('Actual cash on hand is required. Please count and enter the actual cash amount.');
      }
      const actual = parseFloat(req.body.actual_cash);
      if (isNaN(actual) || actual < 0) throw new Error('Invalid actual cash amount.');
      const overShort = actual - expectedCash;
      if (overShort !== 0 && !req.body.variance_reason?.trim()) {
        throw new Error('Variance reason is required when actual cash differs from expected cash.');
      }

      // Update shift record
      await cashierSessionRepo.update(id, {
        closed_at: new Date().toISOString(),
        actual_cash: actual,
        expected_cash: expectedCash,
        over_short: overShort,
        cash_collected: cashIn,
        non_cash_collected: nonCashIn,
        cash_disbursed: cashOut,
        status: 'closed',
        notes: req.body.notes || '',
      });

      // Determine status upfront — auto-approve if within threshold
      const thresholdResult = await cashierSessionRepo.query(
        `SELECT value FROM system_settings WHERE key = 'cash_variance_threshold'`
      );
      const threshold = parseFloat(thresholdResult[0]?.value) || 500;
      const absVariance = Math.abs(overShort);
      const reconcilStatus = absVariance <= threshold ? 'approved' : 'pending';

      const varianceType = overShort === 0 ? 'balanced' : overShort > 0 ? 'over' : 'short';
      const reconciliation = await cashReconciliationRepo.create({
        shift_id: id, count_id: null,
        expected_cash: expectedCash, actual_cash: actual,
        variance: overShort, variance_type: varianceType,
        variance_reason: req.body.variance_reason || null,
        status: reconcilStatus,
        reviewed_by: reconcilStatus === 'approved' ? req.user?.userId : null,
        reviewed_at: reconcilStatus === 'approved' ? new Date().toISOString() : null,
      });

      await approvalHistoryRepo.create({
        shift_id: id, reconciliation_id: reconciliation.id,
        action: reconcilStatus === 'approved' ? 'auto-approved' : 'submitted',
        performed_by: req.user?.userId,
        comments: reconcilStatus === 'approved'
          ? `Variance ${overShort.toFixed(2)} within threshold (${threshold.toFixed(2)}) — auto-approved`
          : `Variance ${overShort.toFixed(2)} exceeds threshold (${threshold.toFixed(2)}) — pending approval`,
      });

      const updated = await cashierSessionRepo.findById(id);
      res.json({ success: true, data: updated });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async shiftList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, userId } = req.query;
      const rows = await cashierSessionRepo.query(
        `SELECT cs.*, u1.first_name || ' ' || u1.last_name as user_name,
                u2.first_name || ' ' || u2.last_name as approved_by_name,
                b.name as branch_name,
                (SELECT COUNT(*) FROM cash_reconciliations cr WHERE cr.shift_id = cs.id AND cr.status = 'pending') as pending_reconciliation
         FROM cashier_sessions cs
         LEFT JOIN users u1 ON u1.id = cs.user_id
         LEFT JOIN users u2 ON u2.id = cs.approved_by
         LEFT JOIN branches b ON b.id = cs.branch_id
         WHERE ($1::text IS NULL OR cs.status = $1)
           AND ($2::uuid IS NULL OR cs.user_id = $2)
         ORDER BY cs.created_at DESC`,
        [status || null, userId || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async shiftMyOpen(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const shift = await cashierSessionRepo.findOne({ user_id: req.user?.userId, status: 'open' });
      res.json({ success: true, data: shift });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async shiftDetails(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const shift = await cashierSessionRepo.findById(id);
      if (!shift) throw new Error('Shift not found');

      const txns = await cashTransactionRepo.query(
        `SELECT ct.*, l.loan_number, concat(b.first_name, ' ', b.last_name) as borrower_name
         FROM cash_transactions ct
         LEFT JOIN loans l ON l.id = ct.loan_id
         LEFT JOIN borrowers b ON b.id = ct.borrower_id
         WHERE ct.shift_id = $1 ORDER BY ct.created_at`,
        [id]
      );
      const counts = await cashCountRepo.query(
        `SELECT * FROM cash_counts WHERE shift_id = $1 ORDER BY counted_at DESC`,
        [id]
      );
      const reconciliations = await cashReconciliationRepo.query(
        `SELECT cr.*, u.first_name || ' ' || u.last_name as reviewer_name
         FROM cash_reconciliations cr
         LEFT JOIN users u ON u.id = cr.reviewed_by
         WHERE cr.shift_id = $1 ORDER BY cr.created_at DESC`,
        [id]
      );
      const approvals = await approvalHistoryRepo.query(
        `SELECT ah.*, u.first_name || ' ' || u.last_name as performed_by_name
         FROM approval_history ah
         LEFT JOIN users u ON u.id = ah.performed_by
         WHERE ah.shift_id = $1 ORDER BY ah.created_at DESC`,
        [id]
      );

      res.json({ success: true, data: { ...shift, transactions: txns, cash_counts: counts, reconciliations, approvals } });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  // ========== CASH TRANSACTIONS ==========

  async recordTransaction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shift_id, loan_id, borrower_id, payment_id, transaction_type, direction, amount, payment_method, reference_number, receipt_number, description } = req.body;
      const shift = await cashierSessionRepo.findById(shift_id);
      if (!shift) throw new Error('Shift not found');
      if (shift.status !== 'open') throw new Error('Shift is not open');
      if (shift.user_id !== req.user?.userId) throw new Error('Not your shift');

      const txn = await cashTransactionRepo.create({
        shift_id, loan_id: loan_id || null, borrower_id: borrower_id || null,
        payment_id: payment_id || null, transaction_type, direction,
        amount, payment_method: payment_method || 'cash',
        reference_number: reference_number || null,
        receipt_number: receipt_number || null,
        description: description || null,
        created_by: req.user?.userId,
      });

      // Update shift expected cash in real time
      const delta = direction === 'in' ? amount : -amount;
      await cashierSessionRepo.query(
        `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
        [delta, shift_id]
      );

      res.json({ success: true, data: txn });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getTransactions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shift_id, type, direction } = req.query;
      let sql = `SELECT ct.*, l.loan_number, concat(b.first_name, ' ', b.last_name) as borrower_name
                 FROM cash_transactions ct
                 LEFT JOIN loans l ON l.id = ct.loan_id
                 LEFT JOIN borrowers b ON b.id = ct.borrower_id
                 WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;
      if (shift_id) { sql += ` AND ct.shift_id = $${idx++}`; params.push(shift_id); }
      if (type) { sql += ` AND ct.transaction_type = $${idx++}`; params.push(type); }
      if (direction) { sql += ` AND ct.direction = $${idx++}`; params.push(direction); }
      sql += ` ORDER BY ct.created_at DESC`;
      const rows = await cashTransactionRepo.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  // ========== CASH COUNT ==========

  async recordCashCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shift_id, denominations, notes } = req.body;
      const shift = await cashierSessionRepo.findById(shift_id);
      if (!shift) throw new Error('Shift not found');
      if (shift.status !== 'open') throw new Error('Shift is not open');
      if (shift.user_id !== req.user?.userId) throw new Error('Not your shift');

      let totalAmount = 0;
      for (const denom of DENOMINATIONS) {
        const count = parseInt(denominations[String(denom)]) || 0;
        totalAmount += denom * count;
      }

      const count = await cashCountRepo.create({
        shift_id, denominations: JSON.stringify(denominations),
        total_amount: totalAmount, notes: notes || null,
        created_by: req.user?.userId,
      });
      res.json({ success: true, data: count });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getCashCounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shift_id } = req.query;
      const rows = await cashCountRepo.query(
        `SELECT cc.*, u.first_name || ' ' || u.last_name as created_by_name
         FROM cash_counts cc LEFT JOIN users u ON u.id = cc.created_by
         WHERE ($1::uuid IS NULL OR cc.shift_id = $1) ORDER BY cc.counted_at DESC`,
        [shift_id || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  // ========== RECONCILIATION ==========

  async submitReconciliation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shift_id, count_id, variance_reason } = req.body;
      const shift = await cashierSessionRepo.findById(shift_id);
      if (!shift) throw new Error('Shift not found');
      if (shift.status !== 'open' && shift.status !== 'closed') throw new Error('Shift must be open or closed');

      const expectedCash = parseFloat(shift.expected_cash) || 0;
      const count = count_id ? await cashCountRepo.findById(count_id) : null;
      const actualCash = count ? parseFloat(count.total_amount) : (parseFloat(shift.actual_cash) || 0);
      const variance = actualCash - expectedCash;
      const varianceType = variance === 0 ? 'balanced' : variance > 0 ? 'over' : 'short';

      const reconciliation = await cashReconciliationRepo.create({
        shift_id, count_id: count_id || null,
        expected_cash: expectedCash, actual_cash: actualCash,
        variance, variance_type: varianceType,
        variance_reason: variance_reason || null,
        status: 'pending',
      });

      // Check threshold for auto-approve
      const thresholdResult = await cashierSessionRepo.query(
        `SELECT value FROM system_settings WHERE key = 'cash_variance_threshold'`
      );
      const threshold = parseFloat(thresholdResult[0]?.value) || 500;
      const absVariance = Math.abs(variance);

      if (absVariance <= threshold) {
        await cashReconciliationRepo.update(reconciliation.id, {
          status: 'approved', reviewed_by: req.user?.userId,
          reviewed_at: new Date().toISOString(),
        });
        await approvalHistoryRepo.create({
          shift_id, reconciliation_id: reconciliation.id,
          action: 'auto-approved', performed_by: req.user?.userId,
          comments: `Variance ${variance.toFixed(2)} within threshold (${threshold.toFixed(2)}) — auto-approved`,
        });
      }

      res.json({ success: true, data: reconciliation });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getReconciliations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shift_id, status } = req.query;
      const rows = await cashReconciliationRepo.query(
        `SELECT cr.*, u.first_name || ' ' || u.last_name as reviewer_name
         FROM cash_reconciliations cr
         LEFT JOIN users u ON u.id = cr.reviewed_by
         WHERE ($1::uuid IS NULL OR cr.shift_id = $1)
           AND ($2::text IS NULL OR cr.status = $2)
         ORDER BY cr.created_at DESC`,
        [shift_id || null, status || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async pendingReconciliations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await cashReconciliationRepo.query(
        `SELECT cr.*, cs.opening_float, cs.opened_at, cs.closed_at,
                u1.first_name || ' ' || u1.last_name as cashier_name,
                u2.first_name || ' ' || u2.last_name as reviewer_name,
                b.name as branch_name
         FROM cash_reconciliations cr
         JOIN cashier_sessions cs ON cs.id = cr.shift_id
         LEFT JOIN users u1 ON u1.id = cs.user_id
         LEFT JOIN users u2 ON u2.id = cr.reviewed_by
         LEFT JOIN branches b ON b.id = cs.branch_id
         WHERE cr.status = 'pending'
         ORDER BY cr.created_at DESC`
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async approveReconciliation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { comments } = req.body;
      const rec = await cashReconciliationRepo.findById(id);
      if (!rec) throw new Error('Reconciliation not found');
      if (rec.status !== 'pending') throw new Error('Reconciliation is not pending');

      await cashReconciliationRepo.update(id, {
        status: 'approved', reviewed_by: req.user?.userId,
        reviewed_at: new Date().toISOString(), review_notes: comments || null,
      });
      await approvalHistoryRepo.create({
        shift_id: rec.shift_id, reconciliation_id: id,
        action: 'approved', performed_by: req.user?.userId,
        comments: comments || null,
      });
      const updated = await cashReconciliationRepo.findById(id);
      res.json({ success: true, data: updated });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async rejectReconciliation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { comments } = req.body;
      const rec = await cashReconciliationRepo.findById(id);
      if (!rec) throw new Error('Reconciliation not found');
      if (rec.status !== 'pending') throw new Error('Reconciliation is not pending');
      if (!comments) throw new Error('Rejection reason required');

      await cashReconciliationRepo.update(id, {
        status: 'rejected', reviewed_by: req.user?.userId,
        reviewed_at: new Date().toISOString(), review_notes: comments,
      });
      await approvalHistoryRepo.create({
        shift_id: rec.shift_id, reconciliation_id: id,
        action: 'rejected', performed_by: req.user?.userId,
        comments,
      });
      const updated = await cashReconciliationRepo.findById(id);
      res.json({ success: true, data: updated });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async requestRecount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { comments } = req.body;
      const rec = await cashReconciliationRepo.findById(id);
      if (!rec) throw new Error('Reconciliation not found');
      if (rec.status !== 'pending') throw new Error('Reconciliation is not pending');

      // Reset to pending recount
      await cashReconciliationRepo.update(id, {
        status: 'pending', review_notes: comments || 'Recount requested',
      });
      await approvalHistoryRepo.create({
        shift_id: rec.shift_id, reconciliation_id: id,
        action: 'recount-requested', performed_by: req.user?.userId,
        comments: comments || 'Recount requested by supervisor',
      });
      res.json({ success: true, message: 'Recount requested' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  // ========== DASHBOARD / REPORTS ==========

  async dashboard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { userId, roleSlug, branchId } = req.user!;

      // Collections/disbursed from cash_transactions (real-time, not just at close)
      let txnFilter = '';
      const txnParams: any[] = [today];
      if (roleSlug === 'cashier') {
        txnFilter = `AND ct.created_by = $2`;
        txnParams.push(userId);
      } else if (roleSlug === 'branch-manager' && branchId) {
        txnFilter = `AND cs.branch_id = $2`;
        txnParams.push(branchId);
      }

      const txnStats = await cashierSessionRepo.query(
        `SELECT
           COALESCE(SUM(ct.amount) FILTER (WHERE (ct.transaction_type = 'payment' OR ct.transaction_type = 'collection') AND (ct.payment_id IS NULL OR (SELECT p.status FROM payments p WHERE p.id = ct.payment_id) IS DISTINCT FROM 'cancelled')), 0) as today_collections,
           COALESCE(SUM(ct.amount) FILTER (WHERE ct.transaction_type = 'disbursement'), 0) as today_disbursed
         FROM cash_transactions ct
         LEFT JOIN cashier_sessions cs ON cs.id = ct.shift_id
         WHERE ct.created_at::date = $1 ${txnFilter}`,
        txnParams
      );

      // Open/closed shift counts from cashier_sessions
      let shiftFilter = '';
      const shiftParams: any[] = [today];
      if (roleSlug === 'cashier') {
        shiftFilter = `AND user_id = $2`;
        shiftParams.push(userId);
      } else if (roleSlug === 'branch-manager' && branchId) {
        shiftFilter = `AND branch_id = $2`;
        shiftParams.push(branchId);
      }

      const shiftStats = await cashierSessionRepo.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'open') as open_shifts,
           COUNT(*) FILTER (WHERE status = 'closed') as closed_shifts
         FROM cashier_sessions
         WHERE created_at::date = $1 ${shiftFilter}`,
        shiftParams
      );

      const pendingApprovals = await cashReconciliationRepo.query(
        `SELECT COUNT(*) as count FROM cash_reconciliations WHERE status = 'pending'`
      );

      const openShift = await cashierSessionRepo.query(
        `SELECT expected_cash, opening_float, opened_at FROM cashier_sessions WHERE user_id = $1 AND status = 'open' LIMIT 1`,
        [userId]
      );

      // Sum cash on hand across all open shifts in scope
      let cohFilter = '';
      const cohParams: any[] = [];
      if (roleSlug === 'cashier') {
        cohFilter = `AND cs.user_id = $1`;
        cohParams.push(userId);
      } else if (roleSlug === 'branch-manager' && branchId) {
        cohFilter = `AND cs.branch_id = $1`;
        cohParams.push(branchId);
      }
      const cashOnHand = await cashierSessionRepo.query(
        `SELECT COALESCE(SUM(expected_cash), 0) as total FROM cashier_sessions cs WHERE cs.status = 'open' ${cohFilter}`,
        cohParams
      );

      const todayTxns = await cashierSessionRepo.query(
        `SELECT COUNT(*) as count FROM cash_transactions WHERE created_at::date = $1`,
        [today]
      );

      res.json({
        success: true,
        data: {
          today_collections: txnStats[0]?.today_collections || 0,
          today_disbursed: txnStats[0]?.today_disbursed || 0,
          open_shifts: parseInt(shiftStats[0]?.open_shifts) || 0,
          closed_shifts: parseInt(shiftStats[0]?.closed_shifts) || 0,
          pending_approvals: parseInt(pendingApprovals[0]?.count) || 0,
          cash_on_hand: parseFloat(cashOnHand[0]?.total) || 0,
          shift_open: !!openShift[0],
          shift_opened_at: openShift[0]?.opened_at || null,
          shift_opening_float: openShift[0]?.opening_float || 0,
          today_txns: parseInt(todayTxns[0]?.count) || 0,
        }
      });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async approvalHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shift_id } = req.query;
      const rows = await approvalHistoryRepo.query(
        `SELECT ah.*, u.first_name || ' ' || u.last_name as performed_by_name
         FROM approval_history ah
         LEFT JOIN users u ON u.id = ah.performed_by
         WHERE ($1::uuid IS NULL OR ah.shift_id = $1)
         ORDER BY ah.created_at DESC`,
        [shift_id || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  // ========== REPORTS ==========

  async reportCollectionSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, cashierId } = req.query;
      const rows = await cashierSessionRepo.query(
        `SELECT u.first_name || ' ' || u.last_name as cashier_name, b.name as branch_name,
                ct.payment_method, COUNT(*) as txn_count, SUM(ct.amount) as total,
                cs.opened_at::date as shift_date
         FROM cash_transactions ct
         JOIN cashier_sessions cs ON cs.id = ct.shift_id
         JOIN users u ON u.id = cs.user_id
         LEFT JOIN branches b ON b.id = cs.branch_id
         WHERE ct.direction = 'in' AND ct.transaction_type = 'collection'
           AND ($1::date IS NULL OR cs.opened_at::date >= $1)
           AND ($2::date IS NULL OR cs.opened_at::date <= $2)
           AND ($3::uuid IS NULL OR cs.user_id = $3)
         GROUP BY u.first_name, u.last_name, b.name, ct.payment_method, cs.opened_at::date
         ORDER BY shift_date DESC`,
        [startDate || null, endDate || null, cashierId || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async reportVarianceSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const rows = await cashReconciliationRepo.query(
        `SELECT cr.*, cs.opened_at, cs.closed_at,
                u1.first_name || ' ' || u1.last_name as cashier_name,
                u2.first_name || ' ' || u2.last_name as reviewer_name,
                b.name as branch_name
         FROM cash_reconciliations cr
         JOIN cashier_sessions cs ON cs.id = cr.shift_id
         JOIN users u1 ON u1.id = cs.user_id
         LEFT JOIN users u2 ON u2.id = cr.reviewed_by
         LEFT JOIN branches b ON b.id = cs.branch_id
         WHERE ($1::date IS NULL OR cr.created_at::date >= $1)
           AND ($2::date IS NULL OR cr.created_at::date <= $2)
         ORDER BY cr.created_at DESC`,
        [startDate || null, endDate || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async reportMethodSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const rows = await cashierSessionRepo.query(
        `SELECT ct.payment_method, COUNT(*) as txn_count, SUM(ct.amount) as total,
                COUNT(*) FILTER (WHERE ct.direction = 'in') as in_count,
                SUM(ct.amount) FILTER (WHERE ct.direction = 'in') as in_total,
                COUNT(*) FILTER (WHERE ct.direction = 'out') as out_count,
                SUM(ct.amount) FILTER (WHERE ct.direction = 'out') as out_total
         FROM cash_transactions ct
         WHERE ($1::date IS NULL OR ct.created_at::date >= $1)
           AND ($2::date IS NULL OR ct.created_at::date <= $2)
         GROUP BY ct.payment_method
         ORDER BY total DESC`,
        [startDate || null, endDate || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async reportBranchDaily(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const rows = await cashierSessionRepo.query(
        `SELECT COALESCE(b.name, 'Unassigned') as branch_name,
                TO_CHAR((cs.opened_at AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') as shift_date,
                COUNT(DISTINCT cs.id) as shift_count,
                SUM(cs.opening_float) as total_float,
                SUM(cs.cash_collected) as total_cash_in,
                SUM(cs.non_cash_collected) as total_non_cash,
                SUM(cs.cash_disbursed) as total_cash_out,
                SUM(cs.expected_cash) as total_expected,
                SUM(cs.over_short) as total_variance
         FROM cashier_sessions cs
         LEFT JOIN branches b ON b.id = cs.branch_id
         WHERE cs.status IN ('closed', 'approved')
           AND (($1::date IS NULL) OR (cs.opened_at AT TIME ZONE 'Asia/Manila')::date >= $1::date)
           AND (($2::date IS NULL) OR (cs.opened_at AT TIME ZONE 'Asia/Manila')::date <= $2::date)
         GROUP BY 1, 2
         ORDER BY shift_date DESC, branch_name`,
        [startDate || null, endDate || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async reportDailyChart(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { days } = req.query;
      const limit = Math.min(parseInt(days as string) || 7, 90);
      const rows = await cashierSessionRepo.query(
        `SELECT created_at::date as txn_date,
                SUM(amount) FILTER (WHERE direction = 'in') as cash_in,
                SUM(amount) FILTER (WHERE direction = 'out') as cash_out
         FROM cash_transactions
         WHERE created_at >= CURRENT_DATE - $1::integer
         GROUP BY created_at::date
         ORDER BY txn_date`,
        [limit]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async reportDailyCashPosition(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      const targetDate = date ? (date as string) : new Date().toISOString().slice(0, 10);

      const rows = await cashierSessionRepo.query(
        `WITH shift_data AS (
           SELECT cs.id as shift_id, cs.opening_float, cs.expected_cash, cs.actual_cash, cs.over_short,
                  cs.status as shift_status, cs.opened_at, cs.closed_at,
                  u.first_name || ' ' || u.last_name as cashier_name,
                  b.name as branch_name
           FROM cashier_sessions cs
           JOIN users u ON u.id = cs.user_id
           LEFT JOIN branches b ON b.id = cs.branch_id
           WHERE (cs.created_at AT TIME ZONE 'Asia/Manila')::date = $1::date
         ),
         txn_data AS (
           SELECT ct.shift_id,
                  COALESCE(SUM(ct.amount) FILTER (WHERE ct.direction = 'in' AND ct.transaction_type IN ('payment', 'collection')), 0) as collections,
                  COALESCE(SUM(ct.amount) FILTER (WHERE ct.direction = 'out' AND ct.transaction_type = 'disbursement'), 0) as disbursements,
                  COALESCE(SUM(ct.amount) FILTER (WHERE ct.direction = 'out' AND ct.transaction_type = 'expense'), 0) as expenses,
                  COALESCE(SUM(ct.amount) FILTER (WHERE ct.direction = 'in' AND ct.transaction_type IN ('replenishment', 'other')), 0) as replenishments,
                  COALESCE(SUM(ct.amount) FILTER (WHERE ct.direction = 'out' AND ct.transaction_type IN ('withdrawal', 'other')), 0) as withdrawals,
                  COUNT(*) as txn_count
           FROM cash_transactions ct
           WHERE (ct.created_at AT TIME ZONE 'Asia/Manila')::date = $1::date
           GROUP BY ct.shift_id
         )
         SELECT sd.*,
                COALESCE(td.collections, 0) as collections,
                COALESCE(td.disbursements, 0) as disbursements,
                COALESCE(td.expenses, 0) as expenses,
                COALESCE(td.replenishments, 0) as replenishments,
                COALESCE(td.withdrawals, 0) as withdrawals,
                COALESCE(td.collections, 0) + COALESCE(td.replenishments, 0) - COALESCE(td.disbursements, 0) - COALESCE(td.expenses, 0) - COALESCE(td.withdrawals, 0) as net_cash_flow,
                COALESCE(td.txn_count, 0) as txn_count
         FROM shift_data sd
         LEFT JOIN txn_data td ON td.shift_id = sd.shift_id
         ORDER BY sd.opened_at DESC`,
        [targetDate]
      );

      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const cashierController = new CashierController();
