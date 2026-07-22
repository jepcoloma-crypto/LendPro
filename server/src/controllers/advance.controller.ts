import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';
import { pool } from '../database/connection';
import { autoRecordTransaction } from '../services/cash-transaction.service';

export class AdvanceController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId, status, page = '1', limit = '100' } = req.query;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (employeeId) { conditions.push(`a.employee_id = $${idx++}`); params.push(employeeId); }
      if (status === 'active') { conditions.push('a.balance > 0'); }
      else if (status === 'settled') { conditions.push('a.balance <= 0'); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const countResult = await pool.query(`SELECT COUNT(*) FROM employee_advances a ${where}`, params);
      const total = parseInt(countResult.rows[0].count);
      const result = await pool.query(
        `SELECT a.*,
                u.first_name || ' ' || u.last_name as employee_name,
                cu.first_name || ' ' || cu.last_name as created_by_name
         FROM employee_advances a
         JOIN users u ON u.id = a.employee_id
         LEFT JOIN users cu ON cu.id = a.created_by
         ${where}
         ORDER BY a.advance_date DESC, a.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit as string), offset]
      );
      res.json({ success: true, data: result.rows, pagination: { total, page: parseInt(page as string), limit: parseInt(limit as string) } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employee_id, amount, advance_date, notes } = req.body;
      if (!employee_id || !amount || !advance_date) {
        return next(new AppError(400, 'Employee, amount, and date are required'));
      }
      const parsedAmount = parseFloat(amount);
      if (parsedAmount <= 0) return next(new AppError(400, 'Amount must be positive'));

      const result = await pool.query(
        `INSERT INTO employee_advances (employee_id, amount, balance, advance_date, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [employee_id, parsedAmount, parsedAmount, advance_date, notes || null, req.user?.userId]
      );

      await autoRecordTransaction({
        userId: req.user!.userId,
        transactionType: 'expense',
        direction: 'out',
        amount: parsedAmount,
        paymentMethod: 'cash',
        description: `Employee Cash Advance: ${advance_date}`,
      });

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async repay(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { amount } = req.body;
      if (!amount || parseFloat(amount) <= 0) return next(new AppError(400, 'Repayment amount must be positive'));

      const advance = await pool.query('SELECT * FROM employee_advances WHERE id = $1', [id]);
      if (!advance.rows[0]) return next(new AppError(404, 'Advance not found'));
      if (parseFloat(advance.rows[0].balance) <= 0) return next(new AppError(400, 'Advance is already fully settled'));

      const repayAmount = parseFloat(amount);
      const currentBalance = parseFloat(advance.rows[0].balance);
      const newBalance = Math.max(0, currentBalance - repayAmount);

      const result = await pool.query(
        'UPDATE employee_advances SET balance = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [newBalance, id]
      );

      await autoRecordTransaction({
        userId: req.user!.userId,
        transactionType: 'income',
        direction: 'in',
        amount: repayAmount,
        paymentMethod: 'cash',
        description: `Advance repayment - ${advance.rows[0].employee_id}`,
      });

      res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const advance = await pool.query('SELECT * FROM employee_advances WHERE id = $1', [id]);
      if (!advance.rows[0]) return next(new AppError(404, 'Advance not found'));
      if (parseFloat(advance.rows[0].balance) !== parseFloat(advance.rows[0].amount)) {
        return next(new AppError(400, 'Cannot delete an advance with partial repayments'));
      }
      await pool.query('DELETE FROM employee_advances WHERE id = $1', [id]);
      res.json({ success: true, message: 'Advance deleted' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const advanceController = new AdvanceController();
