import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { pool } from '../database/connection';
import { generatePickupNumber } from '../utils/helpers';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

export class PickupController {
  async createPickup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { collector_id, notes, denominations } = req.body;
      if (!collector_id) throw new AppError(400, 'Collector is required');
      if (!denominations || !Array.isArray(denominations) || !denominations.length)
        throw new AppError(400, 'At least one denomination entry is required');

      // Fetch unremitted payments for this collector
      const { rows: payments } = await pool.query(
        `SELECT p.id, p.amount, p.payment_number, p.created_at,
                CONCAT(b.first_name, ' ', b.last_name) as borrower_name
         FROM payments p
         LEFT JOIN borrowers b ON b.id = p.borrower_id
         WHERE p.collector_id = $1 AND p.remittance_status = 'pending' AND p.status != 'cancelled'
         ORDER BY p.created_at ASC`,
        [collector_id]
      );

      if (!payments.length) throw new AppError(400, 'No unremitted payments for this collector');

      const totalAmount = payments.reduce((s: number, p: any) => s + parseFloat(p.amount), 0);
      const denomTotal = denominations.reduce((s: number, d: any) => s + (parseFloat(d.amount) || 0), 0);

      if (Math.abs(denomTotal - totalAmount) > 0.02) {
        throw new AppError(400, `Denomination total (${denomTotal.toFixed(2)}) does not match payment total (${totalAmount.toFixed(2)})`);
      }

      const pickupNumber = generatePickupNumber();
      const client = await pool.connect();
      try {
        await client.query('SET search_path TO public');
        await client.query('BEGIN');

        // Create pickup
        const { rows: [pickup] } = await client.query(
          `INSERT INTO collector_pickups (pickup_number, collector_id, cashier_id, total_amount, notes)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [pickupNumber, collector_id, req.user!.userId, totalAmount, notes || null]
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

        await client.query('COMMIT');

        // Auto-record cash transaction
        const { autoRecordTransaction } = require('../services/cash-transaction.service');
        await autoRecordTransaction({
          userId: req.user!.userId,
          transactionType: 'collection',
          direction: 'in',
          amount: totalAmount,
          paymentMethod: 'cash',
          description: `Cash pick-up ${pickupNumber} from collector`,
        });

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
         WHERE p.collector_id = $1 AND p.remittance_status = 'pending' AND p.status != 'cancelled'
         ORDER BY p.created_at ASC`,
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
                  WHERE p.collector_id = u.id AND p.remittance_status = 'pending' AND p.status != 'cancelled'
                ), 0) as outstanding_amount,
                COUNT(pf.id) FILTER (WHERE pf.remittance_status = 'pending' AND pf.status != 'cancelled') as pending_count,
                COUNT(pf.id) FILTER (WHERE pf.remittance_status = 'remitted') as remitted_count
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN payments pf ON pf.collector_id = u.id
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
