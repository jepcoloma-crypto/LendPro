import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';
import { pool } from '../database/connection';
import { cashierSessionRepo } from '../repositories';
import { autoRecordTransaction } from '../services/cash-transaction.service';

export class CashflowController {
  async getExpenses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, category, page = '1', limit = '100' } = req.query;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (startDate) { conditions.push(`e.date >= $${idx++}`); params.push(startDate); }
      if (endDate) { conditions.push(`e.date <= $${idx++}`); params.push(endDate); }
      if (category) { conditions.push(`e.category = $${idx++}`); params.push(category); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const countResult = await pool.query(`SELECT COUNT(*) FROM operating_expenses e ${where}`, params);
      const total = parseInt(countResult.rows[0].count);
      const result = await pool.query(
        `SELECT e.*, b.name as branch_name, u.first_name || ' ' || u.last_name as created_by_name
         FROM operating_expenses e LEFT JOIN users u ON e.created_by = u.id
         LEFT JOIN branches b ON b.id = e.branch_id
         ${where} ORDER BY e.date DESC, e.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit as string), offset]
      );
      res.json({ success: true, data: result.rows, pagination: { total, page: parseInt(page as string), limit: parseInt(limit as string) } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async createExpense(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { date, category, amount, payee, description, branch_id } = req.body;
      if (!date || !category || !amount) return next(new AppError(400, 'Date, category, and amount are required'));
      const result = await pool.query(
        `INSERT INTO operating_expenses (date, category, amount, payee, description, branch_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [date, category, amount, payee || null, description || null, branch_id || null, req.user?.userId]
      );
      const myShift = await cashierSessionRepo.findOne({ user_id: req.user!.userId, status: 'open' });
      if (!myShift) throw new AppError(400, 'No open shift found. Please open a cashier shift before recording an expense.');

      await autoRecordTransaction({
        userId: req.user!.userId,
        transactionType: 'expense',
        direction: 'out',
        amount: parseFloat(amount) || 0,
        paymentMethod: 'cash',
        description: `${category}: ${description || payee || ''}`,
      });
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async updateExpense(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const old = await pool.query('SELECT * FROM operating_expenses WHERE id = $1', [id]);
      (req as any).oldValues = old.rows[0] || null;
      const { date, category, amount, payee, description, branch_id } = req.body;
      const result = await pool.query(
        `UPDATE operating_expenses SET date=$1, category=$2, amount=$3, payee=$4, description=$5, branch_id=$6 WHERE id=$7 RETURNING *`,
        [date, category, amount, payee || null, description || null, branch_id || null, id]
      );
      if (!result.rows.length) return next(new AppError(404, 'Expense not found'));
      res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async deleteExpense(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const shift = await cashierSessionRepo.findOne({ user_id: req.user!.userId, status: 'open' });
      if (!shift) throw new AppError(400, 'Cannot delete expense — shift is closed. Open a new shift first.');

      (req as any).oldValues = (await pool.query('SELECT * FROM operating_expenses WHERE id = $1', [paramStr(req.params.id)])).rows[0] || null;
      const result = await pool.query('DELETE FROM operating_expenses WHERE id=$1 RETURNING id', [paramStr(req.params.id)]);
      if (!result.rows.length) return next(new AppError(404, 'Expense not found'));
      res.json({ success: true });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getIncome(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, page = '1', limit = '100' } = req.query;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (startDate) { conditions.push(`i.date >= $${idx++}`); params.push(startDate); }
      if (endDate) { conditions.push(`i.date <= $${idx++}`); params.push(endDate); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const countResult = await pool.query(`SELECT COUNT(*) FROM other_income i ${where}`, params);
      const total = parseInt(countResult.rows[0].count);
      const result = await pool.query(
        `SELECT i.*, b.name as branch_name, u.first_name || ' ' || u.last_name as created_by_name
         FROM other_income i LEFT JOIN users u ON i.created_by = u.id
         LEFT JOIN branches b ON b.id = i.branch_id
         ${where} ORDER BY i.date DESC, i.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit as string), offset]
      );
      res.json({ success: true, data: result.rows, pagination: { total, page: parseInt(page as string), limit: parseInt(limit as string) } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async createIncome(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { date, source, amount, description, branch_id } = req.body;
      if (!date || !source || !amount) return next(new AppError(400, 'Date, source, and amount are required'));

      const myShift = await cashierSessionRepo.findOne({ user_id: req.user!.userId, status: 'open' });
      if (!myShift) throw new AppError(400, 'No open shift found. Please open a cashier shift before recording income.');

      const result = await pool.query(
        `INSERT INTO other_income (date, source, amount, description, branch_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [date, source, amount, description || null, branch_id || null, req.user?.userId]
      );

      await autoRecordTransaction({
        userId: req.user!.userId,
        transactionType: 'income',
        direction: 'in',
        amount: parseFloat(amount) || 0,
        paymentMethod: 'cash',
        description: `${source}: ${description || ''}`,
      });

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async updateIncome(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const old = await pool.query('SELECT * FROM other_income WHERE id = $1', [id]);
      (req as any).oldValues = old.rows[0] || null;
      const { date, source, amount, description, branch_id } = req.body;
      const result = await pool.query(
        `UPDATE other_income SET date=$1, source=$2, amount=$3, description=$4, branch_id=$5 WHERE id=$6 RETURNING *`,
        [date, source, amount, description || null, branch_id || null, id]
      );
      if (!result.rows.length) return next(new AppError(404, 'Income not found'));
      res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async deleteIncome(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const shift = await cashierSessionRepo.findOne({ user_id: req.user!.userId, status: 'open' });
      if (!shift) throw new AppError(400, 'Cannot delete income — shift is closed. Open a new shift first.');

      (req as any).oldValues = (await pool.query('SELECT * FROM other_income WHERE id = $1', [paramStr(req.params.id)])).rows[0] || null;
      const result = await pool.query('DELETE FROM other_income WHERE id=$1 RETURNING id', [paramStr(req.params.id)]);
      if (!result.rows.length) return next(new AppError(404, 'Income not found'));
      res.json({ success: true });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getCashFlow(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = '';
      const params: any[] = [];
      let idx = 1;
      if (startDate) { dateFilter += ` AND p.payment_date >= $${idx++}`; params.push(startDate); }
      if (endDate) { dateFilter += ` AND p.payment_date <= $${idx++}`; params.push(endDate); }

      // Collections inflow (payments)
      const collections = await pool.query(
        `SELECT p.payment_date as date, SUM(p.amount) as amount
         FROM payments p WHERE p.status = 'completed'${dateFilter}
         GROUP BY p.payment_date ORDER BY p.payment_date`,
        params
      );

      // Other income
      const otherParams2: any[] = [];
      let oi = 1;
      let otherWhere = '';
      if (startDate) { otherWhere += ` AND date >= $${oi++}`; otherParams2.push(startDate); }
      if (endDate) { otherWhere += ` AND date <= $${oi++}`; otherParams2.push(endDate); }
      const otherIncome = await pool.query(
        `SELECT date, SUM(amount) as amount FROM other_income
         WHERE 1=1${otherWhere}
         GROUP BY date ORDER BY date`,
        otherParams2
      );

      // Disbursements outflow
      const disbParams: any[] = [];
      let di = 1;
      let disbWhere = '';
      if (startDate) { disbWhere += ` AND l.release_date::date >= $${di++}`; disbParams.push(startDate); }
      if (endDate) { disbWhere += ` AND l.release_date::date <= $${di++}`; disbParams.push(endDate); }
      const disbursements = await pool.query(
        `SELECT l.release_date::date as date,
                SUM(l.principal_amount - COALESCE((SELECT SUM(lc.amount) FROM loan_charges lc WHERE lc.loan_id = l.id), 0)) as amount
         FROM loans l WHERE l.status = 'active'${disbWhere}
         GROUP BY l.release_date::date ORDER BY l.release_date::date`,
        disbParams
      );

      // Operating expenses outflow
      const expParams: any[] = [];
      let ei = 1;
      let expWhere = '';
      if (startDate) { expWhere += ` AND date >= $${ei++}`; expParams.push(startDate); }
      if (endDate) { expWhere += ` AND date <= $${ei++}`; expParams.push(endDate); }
      const expenses = await pool.query(
        `SELECT date, SUM(amount) as amount FROM operating_expenses
         WHERE 1=1${expWhere}
         GROUP BY date ORDER BY date`,
        expParams
      );

      res.json({ success: true, data: { collections: collections.rows, otherIncome: otherIncome.rows, disbursements: disbursements.rows, expenses: expenses.rows } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getExpenseCategories(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await pool.query(
        `SELECT category, SUM(amount) as total, COUNT(*) as count
         FROM operating_expenses GROUP BY category ORDER BY total DESC`
      );
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getExpenseReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const params: any[] = [];
      let pi = 1;
      let where = '';
      if (startDate) { where += ` AND e.date >= $${pi++}`; params.push(startDate); }
      if (endDate) { where += ` AND e.date <= $${pi++}`; params.push(endDate); }
      const details = await pool.query(
        `SELECT e.date, e.category, e.amount, e.payee, e.description,
                u.first_name || ' ' || u.last_name as created_by_name
         FROM operating_expenses e LEFT JOIN users u ON e.created_by = u.id
         WHERE 1=1${where} ORDER BY e.date DESC, e.created_at DESC`,
        params
      );
      const totals = await pool.query(
        `SELECT category, SUM(amount) as total, COUNT(*) as count
         FROM operating_expenses WHERE 1=1${where}
         GROUP BY category ORDER BY total DESC`,
        params
      );
      const grandTotal = await pool.query(
        `SELECT SUM(amount) as total FROM operating_expenses WHERE 1=1${where}`,
        params
      );
      res.json({ success: true, data: { details: details.rows, totals: totals.rows, grandTotal: grandTotal.rows[0]?.total || 0 } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getIncomeReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const params: any[] = [];
      let pi = 1;
      let where = '';
      if (startDate) { where += ` AND i.date >= $${pi++}::date`; params.push(startDate); }
      if (endDate) { where += ` AND i.date <= $${pi++}::date`; params.push(endDate); }
      const details = await pool.query(
        `SELECT i.date, i.source, i.amount, i.description,
                u.first_name || ' ' || u.last_name as created_by_name
         FROM other_income i LEFT JOIN users u ON i.created_by = u.id
         WHERE 1=1${where} ORDER BY i.date DESC, i.created_at DESC`,
        params
      );
      const grandTotal = await pool.query(
        `SELECT SUM(amount) as total FROM other_income i WHERE 1=1${where}`,
        params
      );
      res.json({ success: true, data: { details: details.rows, grandTotal: grandTotal.rows[0]?.total || 0 } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getBranchPL(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;

      const buildDateFilter = (prefix: string, column: string, idxStart: number) => {
        let filter = '';
        const p: any[] = [];
        let i = idxStart;
        if (startDate) { filter += ` AND ${prefix}.${column} >= $${i++}`; p.push(startDate); }
        if (endDate) { filter += ` AND ${prefix}.${column} <= $${i++}`; p.push(endDate); }
        return { filter, params: p, nextIdx: i };
      };

      // Interest & Penalty income per branch
      const li = buildDateFilter('p', 'payment_date', 1);
      const loanIncome = await pool.query(
        `SELECT COALESCE(b.id, '00000000-0000-0000-0000-000000000000') as branch_id,
                COALESCE(b.name, 'Unassigned') as branch_name,
                COALESCE(SUM(p.interest_amount), 0) as interest_income,
                COALESCE(SUM(p.penalty_amount), 0) as penalty_income,
                COALESCE(SUM(p.penalty_waived), 0) as penalty_waivers
         FROM payments p
         JOIN loans l ON l.id = p.loan_id
         JOIN borrowers br ON br.id = l.borrower_id
         LEFT JOIN branches b ON b.id = br.branch_id
         WHERE p.status = 'completed'${li.filter}
         GROUP BY b.id, b.name
         ORDER BY branch_name`,
        li.params
      );

      // Processing charges per branch
      const ch = buildDateFilter('l', 'release_date', 1);
      const charges = await pool.query(
        `SELECT COALESCE(b.id, '00000000-0000-0000-0000-000000000000') as branch_id,
                COALESCE(b.name, 'Unassigned') as branch_name,
                COALESCE(SUM(lc.amount), 0) as charge_income
         FROM loan_charges lc
         JOIN loans l ON l.id = lc.loan_id
         JOIN borrowers br ON br.id = l.borrower_id
         LEFT JOIN branches b ON b.id = br.branch_id
         WHERE 1=1${ch.filter}
         GROUP BY b.id, b.name`,
        ch.params
      );

      // Other income per branch
      const oi = buildDateFilter('o', 'date', 1);
      const otherIncome = await pool.query(
        `SELECT COALESCE(b.id, '00000000-0000-0000-0000-000000000000') as branch_id,
                COALESCE(b.name, 'Unassigned') as branch_name,
                COALESCE(SUM(o.amount), 0) as other_income
         FROM other_income o
         LEFT JOIN branches b ON b.id = o.branch_id
         WHERE 1=1${oi.filter}
         GROUP BY b.id, b.name`,
        oi.params
      );

      // Cost of Funds per branch (expenses with category = 'Cost of Funds')
      const cof = buildDateFilter('e', 'date', 1);
      const costOfFunds = await pool.query(
        `SELECT COALESCE(b.id, '00000000-0000-0000-0000-000000000000') as branch_id,
                COALESCE(b.name, 'Unassigned') as branch_name,
                COALESCE(SUM(e.amount), 0) as cost_of_funds
         FROM operating_expenses e
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE e.category = 'Cost of Funds'${cof.filter}
         GROUP BY b.id, b.name`,
        cof.params
      );

      // All other operating expenses per branch
      const op = buildDateFilter('e', 'date', 1);
      const otherExpenses = await pool.query(
        `SELECT COALESCE(b.id, '00000000-0000-0000-0000-000000000000') as branch_id,
                COALESCE(b.name, 'Unassigned') as branch_name,
                COALESCE(SUM(e.amount), 0) as operating_expenses
         FROM operating_expenses e
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE e.category != 'Cost of Funds'${op.filter}
         GROUP BY b.id, b.name`,
        op.params
      );

      // Loan Loss Provision: delinquent outstanding * provision rate
      const provisionRate = 0.50; // 50% default; could be stored in system_settings
      const prov = await pool.query(
        `SELECT COALESCE(br.branch_id, '00000000-0000-0000-0000-000000000000') as branch_id,
                COALESCE(b.name, 'Unassigned') as branch_name,
                COALESCE(SUM(a.total_due - COALESCE(a.paid_amount, 0)), 0) as delinquent_balance
         FROM amortization_schedules a
         JOIN loans l ON l.id = a.loan_id
         JOIN borrowers br ON br.id = l.borrower_id
         LEFT JOIN branches b ON b.id = br.branch_id
         WHERE l.status IN ('active', 'closed')
           AND a.due_date < CURRENT_DATE - INTERVAL '90 days'
           AND COALESCE(a.paid_amount, 0) < a.total_due
         GROUP BY br.branch_id, b.name`
      );

      // Merge all data by branch
      const branchMap: Record<string, any> = {};
      const addBranch = (id: string, name: string) => {
        if (!branchMap[id]) branchMap[id] = { branch_id: id, branch_name: name || 'Unassigned', interest_income: 0, penalty_income: 0, penalty_waivers: 0, charge_income: 0, other_income: 0, cost_of_funds: 0, operating_expenses: 0, loan_loss_provision: 0 };
      };

      for (const r of loanIncome.rows) {
        addBranch(r.branch_id, r.branch_name);
        branchMap[r.branch_id].interest_income = parseFloat(r.interest_income) || 0;
        branchMap[r.branch_id].penalty_income = parseFloat(r.penalty_income) || 0;
        branchMap[r.branch_id].penalty_waivers = parseFloat(r.penalty_waivers) || 0;
      }
      for (const r of charges.rows) {
        addBranch(r.branch_id, r.branch_name);
        branchMap[r.branch_id].charge_income = parseFloat(r.charge_income) || 0;
      }
      for (const r of otherIncome.rows) {
        addBranch(r.branch_id, r.branch_name);
        branchMap[r.branch_id].other_income = parseFloat(r.other_income) || 0;
      }
      for (const r of costOfFunds.rows) {
        addBranch(r.branch_id, r.branch_name);
        branchMap[r.branch_id].cost_of_funds = parseFloat(r.cost_of_funds) || 0;
      }
      for (const r of otherExpenses.rows) {
        addBranch(r.branch_id, r.branch_name);
        branchMap[r.branch_id].operating_expenses = parseFloat(r.operating_expenses) || 0;
      }
      for (const r of prov.rows) {
        addBranch(r.branch_id, r.branch_name);
        const delinquent = parseFloat(r.delinquent_balance) || 0;
        branchMap[r.branch_id].loan_loss_provision = Math.round(delinquent * provisionRate * 100) / 100;
      }

      const rows = Object.values(branchMap).map((r: any) => ({
        ...r,
        total_income: r.interest_income + r.penalty_income + r.charge_income + r.other_income,
        total_deductions: r.cost_of_funds + r.operating_expenses + r.loan_loss_provision + r.penalty_waivers,
        net_pl: (r.interest_income + r.penalty_income + r.charge_income + r.other_income) - (r.cost_of_funds + r.operating_expenses + r.loan_loss_provision + r.penalty_waivers),
      })).sort((a: any, b: any) => a.branch_name.localeCompare(b.branch_name));

      // Monthly trend (company-wide)
      const buildMonthlyFilter = (col: string, idxStart: number) => {
        let filter = '';
        const p: any[] = [];
        let i = idxStart;
        if (startDate) { filter += ` AND ${col} >= $${i++}`; p.push(startDate); }
        if (endDate) { filter += ` AND ${col} <= $${i++}`; p.push(endDate); }
        return { filter, params: p };
      };

      const mi = buildMonthlyFilter('p.payment_date', 1);
      const monthlyIncome = await pool.query(
        `SELECT to_char(p.payment_date, 'YYYY-MM') as month,
                COALESCE(SUM(p.interest_amount), 0) as interest_income,
                COALESCE(SUM(p.penalty_amount), 0) as penalty_income,
                COALESCE(SUM(p.penalty_waived), 0) as penalty_waivers
         FROM payments p
         WHERE p.status = 'completed'${mi.filter}
         GROUP BY month ORDER BY month`,
        mi.params
      );

      const mc = buildMonthlyFilter('l.release_date', 1);
      const monthlyCharges = await pool.query(
        `SELECT to_char(l.release_date, 'YYYY-MM') as month,
                COALESCE(SUM(lc.amount), 0) as charge_income
         FROM loan_charges lc
         JOIN loans l ON l.id = lc.loan_id
         WHERE 1=1${mc.filter}
         GROUP BY month ORDER BY month`,
        mc.params
      );

      const mo = buildMonthlyFilter('o.date', 1);
      const monthlyOther = await pool.query(
        `SELECT to_char(o.date, 'YYYY-MM') as month,
                COALESCE(SUM(o.amount), 0) as other_income
         FROM other_income o
         WHERE 1=1${mo.filter}
         GROUP BY month ORDER BY month`,
        mo.params
      );

      const me = buildMonthlyFilter('e.date', 1);
      const monthlyExpenses = await pool.query(
        `SELECT to_char(e.date, 'YYYY-MM') as month,
                COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'Cost of Funds'), 0) as cost_of_funds,
                COALESCE(SUM(e.amount) FILTER (WHERE e.category != 'Cost of Funds'), 0) as operating_expenses
         FROM operating_expenses e
         WHERE 1=1${me.filter}
         GROUP BY month ORDER BY month`,
        me.params
      );

      // Merge monthly data
      const monthMap: Record<string, any> = {};
      for (const r of monthlyIncome.rows) {
        monthMap[r.month] = { month: r.month, interest_income: parseFloat(r.interest_income) || 0, penalty_income: parseFloat(r.penalty_income) || 0, penalty_waivers: parseFloat(r.penalty_waivers) || 0, charge_income: 0, other_income: 0, cost_of_funds: 0, operating_expenses: 0, loan_loss_provision: 0 };
      }
      for (const r of monthlyCharges.rows) {
        if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, interest_income: 0, penalty_income: 0, penalty_waivers: 0, charge_income: 0, other_income: 0, cost_of_funds: 0, operating_expenses: 0, loan_loss_provision: 0 };
        monthMap[r.month].charge_income = parseFloat(r.charge_income) || 0;
      }
      for (const r of monthlyOther.rows) {
        if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, interest_income: 0, penalty_income: 0, penalty_waivers: 0, charge_income: 0, other_income: 0, cost_of_funds: 0, operating_expenses: 0, loan_loss_provision: 0 };
        monthMap[r.month].other_income = parseFloat(r.other_income) || 0;
      }
      for (const r of monthlyExpenses.rows) {
        if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, interest_income: 0, penalty_income: 0, penalty_waivers: 0, charge_income: 0, other_income: 0, cost_of_funds: 0, operating_expenses: 0, loan_loss_provision: 0 };
        monthMap[r.month].cost_of_funds = parseFloat(r.cost_of_funds) || 0;
        monthMap[r.month].operating_expenses = parseFloat(r.operating_expenses) || 0;
      }
      // Monthly provision: pro-rate provision across months (same total, distributed by income ratio)
      const totalIncome = Object.values(monthMap).reduce((s: number, m: any) => s + m.interest_income + m.penalty_income + m.charge_income + m.other_income, 0);
      const totalProvision = rows.reduce((s: number, r: any) => s + r.loan_loss_provision, 0);
      for (const month of Object.values(monthMap) as any[]) {
        const mIncome = month.interest_income + month.penalty_income + month.charge_income + month.other_income;
        month.loan_loss_provision = totalIncome > 0 ? Math.round((mIncome / totalIncome) * totalProvision * 100) / 100 : 0;
        month.total_income = mIncome;
        month.total_deductions = month.cost_of_funds + month.operating_expenses + month.loan_loss_provision + month.penalty_waivers;
        month.net_pl = mIncome - month.total_deductions;
      }

      const monthlyTrend = Object.values(monthMap).sort((a: any, b: any) => a.month.localeCompare(b.month));

      res.json({ success: true, data: rows, monthly: monthlyTrend, provision_rate: provisionRate });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
}

export const cashflowController = new CashflowController();