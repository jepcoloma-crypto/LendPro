import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { collectionRepo, collectionVisitRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, paramStr } from '../utils/helpers';

export class CollectionController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const status = paramStr(req.query.status);
      const collectorId = paramStr(req.query.collectorId);
      const conditions: any = {};
      if (status) conditions['c.status'] = status;
      if (collectorId) conditions['c.collector_id'] = collectorId;

      const whereClauses: string[] = ['c.loan_id IS NOT NULL'];
      const values: any[] = [];
      let paramIndex = 1;
      if (status) { whereClauses.push(`c.status = $${paramIndex++}`); values.push(status); }
      if (collectorId) { whereClauses.push(`c.collector_id = $${paramIndex++}`); values.push(collectorId); }
      const where = whereClauses.join(' AND ');

      const countResult = await collectionRepo.query(
        `SELECT COUNT(*) FROM collections c WHERE ${where}`,
        values
      );
      const total = parseInt(countResult[0].count, 10);

      const offset = paramIndex;
      const sql = `SELECT c.id, c.loan_id, c.borrower_id, c.collector_id,
        c.status, c.promise_to_pay_date, c.promise_to_pay_amount,
        c.last_visit_date, c.last_visit_notes, c.next_visit_date,
        c.created_at, c.updated_at,
        l.loan_number, l.outstanding_balance,
        b.first_name || ' ' || b.last_name as borrower_name, b.mobile,
        CASE WHEN l.status = 'closed' THEN 'closed'
             WHEN COALESCE(SUM(CASE WHEN a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due
                              THEN 1 ELSE 0 END), 0) > 0 THEN 'delinquent'
             WHEN l.maturity_date < CURRENT_DATE AND l.outstanding_balance > 0 THEN 'overdue'
             ELSE 'active' END as computed_status,
        l.outstanding_balance as total_due,
        COALESCE(SUM(CASE WHEN a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due
                     THEN (a.total_due - COALESCE(a.paid_amount,0)) ELSE 0 END), 0) as total_overdue,
        COALESCE(MAX(CASE WHEN a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due
                     THEN CURRENT_DATE - a.due_date ELSE 0 END), 0)::int as days_overdue
      FROM collections c
      JOIN loans l ON c.loan_id = l.id
      JOIN borrowers b ON c.borrower_id = b.id
      LEFT JOIN amortization_schedules a ON a.loan_id = l.id
      WHERE ${where}
      GROUP BY c.id, c.loan_id, c.borrower_id, c.collector_id, c.status,
        c.promise_to_pay_date, c.promise_to_pay_amount,
        c.last_visit_date, c.last_visit_notes, c.next_visit_date,
        c.created_at, c.updated_at,
        l.loan_number, l.outstanding_balance, l.maturity_date, l.status, b.first_name, b.last_name, b.mobile
      ORDER BY ${pagination.sortBy} ${pagination.sortOrder}
      LIMIT $${offset} OFFSET $${offset + 1}`;

      const rows = await collectionRepo.query(sql, [...values, pagination.limit, pagination.offset]);

      res.json({
        success: true,
        data: rows,
        pagination: { ...pagination, total, totalPages: Math.ceil(total / pagination.limit) },
      });
    } catch (error: any) {
      console.error('collections.getAll error:', error);
      next(new AppError(500, error.message));
    }
  }

  async getDueToday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await collectionRepo.query(
        `SELECT c.id, c.loan_id, c.borrower_id, c.collector_id,
          c.status, c.promise_to_pay_date, c.promise_to_pay_amount,
          c.last_visit_date, c.last_visit_notes, c.next_visit_date,
          c.created_at, c.updated_at,
          l.loan_number, l.outstanding_balance as total_due,
          b.first_name || ' ' || b.last_name as borrower_name, b.mobile,
          COALESCE((
            SELECT SUM(a2.total_due - COALESCE(a2.paid_amount,0))
            FROM amortization_schedules a2
            WHERE a2.loan_id = l.id AND a2.due_date < CURRENT_DATE
              AND COALESCE(a2.paid_amount,0) < a2.total_due
          ), 0) as total_overdue,
          COALESCE((
            SELECT MAX(CURRENT_DATE - a3.due_date)
            FROM amortization_schedules a3
            WHERE a3.loan_id = l.id AND a3.due_date < CURRENT_DATE
              AND COALESCE(a3.paid_amount,0) < a3.total_due
          ), 0)::int as days_overdue
         FROM collections c
         JOIN loans l ON c.loan_id = l.id
         JOIN borrowers b ON c.borrower_id = b.id
         WHERE EXISTS (
           SELECT 1 FROM amortization_schedules a
           WHERE a.loan_id = l.id
           AND a.due_date = CURRENT_DATE
           AND COALESCE(a.paid_amount, 0) < a.total_due
         )`
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('collections.getDueToday error:', error);
      next(new AppError(500, error.message));
    }
  }

  async getOverdue(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await collectionRepo.query(
        `SELECT c.id, c.loan_id, c.borrower_id, c.collector_id,
          c.status, c.promise_to_pay_date, c.promise_to_pay_amount,
          c.last_visit_date, c.last_visit_notes, c.next_visit_date,
          c.created_at, c.updated_at,
          l.loan_number, l.outstanding_balance as total_due,
          b.first_name || ' ' || b.last_name as borrower_name, b.mobile,
          'overdue' as computed_status,
          l.outstanding_balance as total_overdue,
          COALESCE((SELECT MAX(CURRENT_DATE - a.due_date)::int
                   FROM amortization_schedules a
                   WHERE a.loan_id = l.id
                     AND a.due_date < CURRENT_DATE
                     AND COALESCE(a.paid_amount,0) < a.total_due), 0) as days_overdue
         FROM collections c
         JOIN loans l ON c.loan_id = l.id
         JOIN borrowers b ON c.borrower_id = b.id
         WHERE l.maturity_date < CURRENT_DATE
           AND l.outstanding_balance > 0
           AND l.status != 'closed'
         ORDER BY l.maturity_date`
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('collections.getOverdue error:', error);
      next(new AppError(500, error.message));
    }
  }

  async updateVisit(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const visit = await collectionVisitRepo.create({
        collection_id: id,
        collector_id: req.user!.userId,
        visit_date: new Date(),
        visit_type: req.body.visitType || 'field',
        notes: req.body.notes || null,
        location_coordinates: req.body.coordinates || null,
        result: req.body.result || null,
      });
      await collectionRepo.update(id, {
        last_visit_date: new Date(),
        last_visit_notes: req.body.notes,
        next_visit_date: req.body.nextVisitDate || null,
      });
      res.status(201).json({ success: true, data: visit });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const collections = await collectionRepo.query(
        `SELECT c.*, l.loan_number, l.outstanding_balance, l.next_payment_date,
          l.status as loan_status,
          b.first_name || ' ' || b.last_name as borrower_name, b.mobile, b.present_address,
          u.first_name || ' ' || u.last_name as collector_name
         FROM collections c
         JOIN loans l ON c.loan_id = l.id
         JOIN borrowers b ON c.borrower_id = b.id
         LEFT JOIN users u ON c.collector_id = u.id
         WHERE c.id = $1`,
        [id]
      );
      if (!collections.length) throw new Error('Collection not found');

      const overdue = await collectionRepo.query(
        `SELECT
          COALESCE(SUM(CASE WHEN a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due
                       THEN (a.total_due - COALESCE(a.paid_amount,0)) ELSE 0 END), 0) as total_overdue,
          COALESCE(MAX(CASE WHEN a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due
                       THEN CURRENT_DATE - a.due_date ELSE 0 END), 0)::int as days_overdue,
          COUNT(CASE WHEN COALESCE(a.paid_amount,0) < a.total_due THEN 1 END) as pending_schedules,
          COUNT(CASE WHEN COALESCE(a.paid_amount,0) >= a.total_due THEN 1 END) as paid_schedules
         FROM amortization_schedules a
         WHERE a.loan_id = $1`,
        [collections[0].loan_id]
      );

      const visits = await collectionVisitRepo.findAll({
        conditions: { collection_id: id },
        orderBy: 'visit_date DESC',
        limit: 50,
        offset: 0,
      });
      res.json({ success: true, data: { ...collections[0], ...overdue[0], visits: visits.rows } });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { collector_id, promise_to_pay_date, promise_to_pay_amount, next_visit_date } = req.body;
      const data: any = {};
      if (collector_id !== undefined) data.collector_id = collector_id;
      if (promise_to_pay_date !== undefined) data.promise_to_pay_date = promise_to_pay_date;
      if (promise_to_pay_amount !== undefined) data.promise_to_pay_amount = promise_to_pay_amount;
      if (next_visit_date !== undefined) data.next_visit_date = next_visit_date;
      const result = await collectionRepo.update(id, data);
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const collectionController = new CollectionController();
