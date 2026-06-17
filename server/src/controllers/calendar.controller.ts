import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';
import { collectionVisitRepo, collectionRepo, amortizationScheduleRepo } from '../repositories';

export class CalendarController {
  async getEvents(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const collectorId = paramStr(req.query.collectorId);
      const startDate = paramStr(req.query.start) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const endDate = paramStr(req.query.end) || new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);

      const userId = req.user!.userId;
      const roleCheck: any[] = await collectionVisitRepo.query(
        `SELECT r.slug FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`, [userId]
      );
      const isCollector = (roleCheck[0] as any)?.slug === 'collector';
      const filterCollector = collectorId || (isCollector ? userId : null);

      const visits = await collectionVisitRepo.query(
        `SELECT cv.id, cv.visit_date, cv.visit_type, cv.result, cv.notes,
                b.first_name || ' ' || b.last_name as borrower_name,
                l.loan_number, c.id as collection_id, cv.collector_id,
                'visit' as event_type, cv.visit_date as event_date
         FROM collection_visits cv
         JOIN collections c ON c.id = cv.collection_id
         JOIN loans l ON l.id = c.loan_id
         JOIN borrowers b ON b.id = c.borrower_id
         WHERE ($1::uuid IS NULL OR cv.collector_id = $1::uuid)
           AND cv.visit_date::date >= $2::date AND cv.visit_date::date <= $3::date
         ORDER BY cv.visit_date`,
        [filterCollector, startDate, endDate]
      );

      const promises = await collectionRepo.query(
        `SELECT c.id, c.promise_to_pay_date, c.promise_to_pay_amount, c.next_visit_date,
                b.first_name || ' ' || b.last_name as borrower_name,
                l.loan_number, c.collector_id,
                'promise' as event_type, c.promise_to_pay_date as event_date
         FROM collections c
         JOIN loans l ON l.id = c.loan_id
         JOIN borrowers b ON b.id = c.borrower_id
         WHERE c.promise_to_pay_date IS NOT NULL
           AND ($1::uuid IS NULL OR c.collector_id = $1::uuid)
           AND c.promise_to_pay_date >= $2::date AND c.promise_to_pay_date <= $3::date
         ORDER BY c.promise_to_pay_date`,
        [filterCollector, startDate, endDate]
      );

      const dueDates = await amortizationScheduleRepo.query(
        `SELECT a.id, a.due_date, a.total_due, a.paid_amount, a.status, a.installment_no,
                b.first_name || ' ' || b.last_name as borrower_name,
                l.loan_number, l.collector_id,
                'due' as event_type, a.due_date as event_date
         FROM amortization_schedules a
         JOIN loans l ON l.id = a.loan_id
         JOIN borrowers b ON b.id = l.borrower_id
         WHERE a.paid_amount < a.total_due
           AND ($1::uuid IS NULL OR COALESCE(l.collector_id, (SELECT c2.collector_id FROM collections c2 WHERE c2.loan_id = l.id LIMIT 1)) = $1::uuid)
           AND a.due_date >= $2::date AND a.due_date <= $3::date
         ORDER BY a.due_date`,
        [filterCollector, startDate, endDate]
      );

      res.json({ success: true, data: { visits, promises, dueDates } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
}

export const calendarController = new CalendarController();
