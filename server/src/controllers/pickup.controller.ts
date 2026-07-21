import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { pool } from '../database/connection';
import { generatePickupNumber } from '../utils/helpers';
import { cashierSessionRepo, cashTransactionRepo } from '../repositories';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

export class PickupController {
  async createPickup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { collector_id, notes, denominations } = req.body;
      if (!collector_id) throw new AppError(400, 'Collector is required');
      if (!denominations || !Array.isArray(denominations) || !denominations.length)
        throw new AppError(400, 'At least one denomination entry is required');

      // Must have an open shift to record cash
      const shift = await cashierSessionRepo.findOne({ user_id: req.user!.userId, status: 'open' });
      if (!shift) throw new AppError(400, 'No open shift found. Open a shift first.');

      // Fetch unremitted payments for this collector (by received_by — who actually collected the cash)
      const { rows: payments } = await pool.query(
        `SELECT p.id, p.amount, p.payment_number, p.loan_id, p.borrower_id, p.payment_method, p.created_at,
                CONCAT(b.first_name, ' ', b.last_name) as borrower_name
         FROM payments p
         LEFT JOIN borrowers b ON b.id = p.borrower_id
         WHERE p.received_by = $1 AND p.remittance_status = 'pending' AND p.status != 'cancelled'
         ORDER BY p.created_at ASC`,
        [collector_id]
      );

      if (!payments.length) throw new AppError(400, 'No unremitted payments for this collector');

      const totalAmount = payments.reduce((s: number, p: any) => s + parseFloat(p.amount), 0);
      const denomTotal = denominations.reduce((s: number, d: any) => s + (parseFloat(d.amount) || 0), 0);
      const variance = parseFloat((denomTotal - totalAmount).toFixed(2));

      // Allow mismatch — record actual cash received, variance will surface in reconciliation
      if (Math.abs(variance) > 0.02 && !req.body.variance_reason) {
        throw new AppError(400,
          `Cash amount (${denomTotal.toFixed(2)}) differs from payment total (${totalAmount.toFixed(2)}) by ${variance > 0 ? '+' : ''}${variance.toFixed(2)}. Provide a reason.`
        );
      }

      const pickupNumber = generatePickupNumber();
      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        // Create pickup with actual cash received
        const { rows: [pickup] } = await client.query(
          `INSERT INTO collector_pickups (pickup_number, collector_id, cashier_id, total_amount, notes)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [pickupNumber, collector_id, req.user!.userId, denomTotal, notes || null]
        );

        // Insert denominations
        for (const d of denominations) {
          await client.query(
            `INSERT INTO pickup_denominations (pickup_id, denomination, count, amount) VALUES ($1, $2, $3, $4)`,
            [pickup.id, d.denomination, d.count, d.amount]
          );
        }

        // Mark payments as remitted
        const paymentIds = payments.map((p: any) => p.id);
        await client.query(
          `UPDATE payments SET remittance_status = 'remitted', remitted_at = NOW(), pickup_id = $1 WHERE id = ANY($2)`,
          [pickup.id, paymentIds]
        );

        // Calculate how much needs to be added to expected_cash BEFORE inserting cash_transactions
        // (otherwise the NOT EXISTS check would find 0 since we just inserted them all)
        const { rows: needCash } = await client.query(
          `SELECT COALESCE(SUM(p.amount), 0) as total
           FROM payments p
           WHERE p.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM cash_transactions ct WHERE ct.payment_id = p.id)`,
          [paymentIds]
        );
        const newCashTotal = parseFloat(needCash[0]?.total) || 0;

        // Record cash transactions for the remitted payments (cash now physically with cashier).
        for (const pay of payments) {
          const { rows: existing } = await client.query(
            `SELECT id FROM cash_transactions WHERE payment_id = $1`, [pay.id]
          );
          if (existing.length === 0) {
            await client.query(
              `INSERT INTO cash_transactions (shift_id, loan_id, borrower_id, payment_id, transaction_type, direction, amount, payment_method, description, created_by)
               VALUES ($1, $2, $3, $4, 'collection', 'in', $5, $6, $7, $8)`,
              [shift.id, pay.loan_id, pay.borrower_id, pay.id, pay.amount, pay.payment_method || 'cash', `Pickup ${pickupNumber}: ${pay.payment_number}`, req.user!.userId]
            );
          }
        }

        if (newCashTotal > 0) {
          await client.query(
            `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
            [newCashTotal, shift.id]
          );
        }

        // Adjust expected_cash for variance between actual cash and system amount.
        if (Math.abs(variance) > 0.02) {
          const adjDirection = variance > 0 ? 'in' : 'out';
          await client.query(
            `INSERT INTO cash_transactions (shift_id, transaction_type, direction, amount, payment_method, description, created_by)
             VALUES ($1, 'adjustment', $2, $3, 'cash', $4, $5)`,
            [
              shift.id,
              adjDirection,
              Math.abs(variance),
              `Pick-up ${pickupNumber} ${variance > 0 ? 'overage' : 'shortage'}: ${req.body.variance_reason || ''}`,
              req.user!.userId
            ]
          );
          await client.query(
            `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
            [variance, shift.id]
          );
        }

        await client.query('COMMIT');

        res.status(201).json({ success: true, data: pickup, message: 'Cash pick-up recorded successfully' });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (error: any) {
      next(error instanceof AppError ? error : new AppError(400, error.message));
    }
  }

  async getPickups(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { collector_id, startDate, endDate } = req.query;
      let sql = `
        SELECT cp.*, CONCAT(u.first_name, ' ', u.last_name) as cashier_name,
               CONCAT(cu.first_name, ' ', cu.last_name) as collector_name
        FROM collector_pickups cp
        JOIN users u ON u.id = cp.cashier_id
        JOIN users cu ON cu.id = cp.collector_id
        WHERE 1=1`;
      const values: any[] = [];
      let idx = 1;
      if (collector_id) { sql += ` AND cp.collector_id = $${idx++}`; values.push(collector_id); }
      if (startDate) { sql += ` AND (cp.created_at AT TIME ZONE 'Asia/Manila')::date >= $${idx++}::date`; values.push(startDate); }
      if (endDate) { sql += ` AND (cp.created_at AT TIME ZONE 'Asia/Manila')::date <= $${idx++}::date`; values.push(endDate); }
      sql += ' ORDER BY cp.created_at DESC';

      const { rows } = await pool.query(sql, values);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getPickupById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { rows: [pickup] } = await pool.query(
        `SELECT cp.*, CONCAT(u.first_name, ' ', u.last_name) as cashier_name,
                CONCAT(cu.first_name, ' ', cu.last_name) as collector_name
         FROM collector_pickups cp
         JOIN users u ON u.id = cp.cashier_id
         JOIN users cu ON cu.id = cp.collector_id
         WHERE cp.id = $1`,
        [req.params.id]
      );
      if (!pickup) throw new AppError(404, 'Pick-up not found');

      const { rows: denoms } = await pool.query(
        'SELECT * FROM pickup_denominations WHERE pickup_id = $1 ORDER BY denomination DESC',
        [req.params.id]
      );

      const { rows: payments } = await pool.query(
        `SELECT p.id, p.payment_number, p.amount, p.created_at,
                CONCAT(b.first_name, ' ', b.last_name) as borrower_name
         FROM payments p
         LEFT JOIN borrowers b ON b.id = p.borrower_id
         WHERE p.pickup_id = $1`,
        [req.params.id]
      );

      res.json({ success: true, data: { ...pickup, denominations: denoms, payments } });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getUnremittedPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { collector_id } = req.query;
      if (!collector_id) throw new AppError(400, 'collector_id is required');

      const { rows } = await pool.query(
        `SELECT p.id, p.payment_number, p.amount, p.payment_date, p.created_at,
                CONCAT(b.first_name, ' ', b.last_name) as borrower_name,
                l.loan_number
         FROM payments p
         LEFT JOIN borrowers b ON b.id = p.borrower_id
         LEFT JOIN loans l ON l.id = p.loan_id
         WHERE p.received_by = $1 AND p.remittance_status = 'pending' AND p.status != 'cancelled'
         ORDER BY p.created_at ASC`,
        [collector_id]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getRemittedPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { collector_id } = req.query;
      if (!collector_id) throw new AppError(400, 'collector_id is required');

      const { rows } = await pool.query(
        `SELECT p.id, p.payment_number, p.amount, p.payment_date, p.remitted_at, p.created_at,
                CONCAT(b.first_name, ' ', b.last_name) as borrower_name,
                l.loan_number,
                cp.pickup_number
         FROM payments p
         LEFT JOIN borrowers b ON b.id = p.borrower_id
         LEFT JOIN loans l ON l.id = p.loan_id
         LEFT JOIN collector_pickups cp ON cp.id = p.pickup_id
         WHERE p.received_by = $1 AND p.remittance_status = 'remitted' AND p.status != 'cancelled'
         ORDER BY p.remitted_at DESC`,
        [collector_id]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getCollectorOutstanding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) as collector_name,
                b.name as branch_name,
                COALESCE((
                  SELECT SUM(p.amount::numeric)
                  FROM payments p
                  WHERE p.received_by = u.id AND p.remittance_status = 'pending' AND p.status != 'cancelled'
                ), 0) as outstanding_amount,
                COUNT(pf.id) FILTER (WHERE pf.remittance_status = 'pending' AND pf.status != 'cancelled') as pending_count,
                COUNT(pf.id) FILTER (WHERE pf.remittance_status = 'remitted') as remitted_count
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN payments pf ON pf.received_by = u.id
           WHERE r.slug = 'collector' AND u.is_active = true
         GROUP BY u.id, u.first_name, u.last_name, b.name
         ORDER BY u.first_name`
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getPickupReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, collector_id } = req.query;
      let sql = `
        SELECT cp.pickup_number, cp.created_at as pickup_date, cp.total_amount,
               CONCAT(cu.first_name, ' ', cu.last_name) as collector_name,
               CONCAT(ca.first_name, ' ', ca.last_name) as cashier_name,
               cp.notes,
               (SELECT COUNT(*) FROM payments p WHERE p.pickup_id = cp.id) as payment_count
        FROM collector_pickups cp
        JOIN users cu ON cu.id = cp.collector_id
        JOIN users ca ON ca.id = cp.cashier_id
        WHERE 1=1`;
      const values: any[] = [];
      let idx = 1;
      if (collector_id) { sql += ` AND cp.collector_id = $${idx++}`; values.push(collector_id); }
      if (startDate) { sql += ` AND (cp.created_at AT TIME ZONE 'Asia/Manila')::date >= $${idx++}::date`; values.push(startDate); }
      if (endDate) { sql += ` AND (cp.created_at AT TIME ZONE 'Asia/Manila')::date <= $${idx++}::date`; values.push(endDate); }
      sql += ' ORDER BY cp.created_at DESC';

      const { rows } = await pool.query(sql, values);
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const pickupController = new PickupController();
