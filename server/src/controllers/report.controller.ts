import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { paymentRepo, loanRepo, amortizationScheduleRepo, collectionRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';

export class ReportController {
  async getAgingReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query;
      const conditions: string[] = ['COALESCE(a.paid_amount,0) < a.total_due'];
      const params: any[] = [];
      let idx = 1;
      if (branchId) { conditions.push(`b.branch_id = $${idx++}`); params.push(branchId); }
      const where = conditions.join(' AND ');
      const result = await amortizationScheduleRepo.query(
        `SELECT
           CASE
             WHEN a.due_date < CURRENT_DATE - INTERVAL '90 days' THEN '90+ Days'
             WHEN a.due_date < CURRENT_DATE - INTERVAL '60 days' THEN '61-90 Days'
             WHEN a.due_date < CURRENT_DATE - INTERVAL '30 days' THEN '31-60 Days'
             WHEN a.due_date < CURRENT_DATE - INTERVAL '5 days' THEN '1-30 Days'
             WHEN a.due_date < CURRENT_DATE THEN '1-5 Days'
             ELSE 'Current'
           END as aging_bucket,
           COUNT(a.id) as count,
           SUM(a.total_due - COALESCE(a.paid_amount,0)) as total_amount
         FROM amortization_schedules a
         JOIN loans l ON l.id = a.loan_id
         JOIN borrowers b ON b.id = l.borrower_id
         WHERE ${where}
         GROUP BY aging_bucket
         ORDER BY MIN(a.due_date)`,
        params
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getDelinquencyReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query;
      const conditions: string[] = ['a.due_date < CURRENT_DATE', 'COALESCE(a.paid_amount,0) < a.total_due', 'l.status NOT IN (\'closed\', \'written-off\', \'cancelled\')'];
      const params: any[] = [];
      let idx = 1;
      if (branchId) { conditions.push(`bor.branch_id = $${idx++}`); params.push(branchId); }
      const where = conditions.join(' AND ');
      const result = await collectionRepo.query(
        `SELECT l.id as loan_id, l.loan_number, l.principal_amount, l.outstanding_balance, l.release_date,
                bor.first_name || ' ' || bor.last_name as borrower_name, bor.mobile, bor.borrower_code,
                COALESCE(branch.name, 'Unassigned') as branch_name,
                CASE WHEN MAX(CURRENT_DATE - a.due_date) >= 5 THEN 'delinquent' ELSE 'overdue' END as computed_status,
                COALESCE(SUM(a.total_due - COALESCE(a.paid_amount,0)), 0) as total_overdue,
                COALESCE(MAX(CURRENT_DATE - a.due_date), 0)::int as days_overdue,
                (SELECT MAX(payment_date) FROM payments WHERE loan_id = l.id AND status = 'completed') as last_payment_date,
                u.first_name || ' ' || u.last_name as collector_name
         FROM loans l
         JOIN borrowers bor ON l.borrower_id = bor.id
         JOIN amortization_schedules a ON a.loan_id = l.id
         LEFT JOIN branches branch ON branch.id = bor.branch_id
         LEFT JOIN users u ON u.id = l.collector_id
         WHERE ${where}
         GROUP BY l.id, l.loan_number, l.principal_amount, l.outstanding_balance, l.release_date,
                  bor.first_name, bor.last_name, bor.mobile, bor.borrower_code, branch.name, u.first_name, u.last_name
         ORDER BY MAX(CURRENT_DATE - a.due_date) DESC`,
        params
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getInterestIncomeReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { branchId, startDate, endDate } = req.query;
      const conditions: string[] = ['p.status = \'completed\''];
      const params: any[] = [];
      let idx = 1;
      if (branchId) { conditions.push(`b.id = $${idx++}`); params.push(branchId); }
      if (startDate) { conditions.push(`p.payment_date >= $${idx++}`); params.push(startDate); }
      if (endDate) { conditions.push(`p.payment_date <= $${idx++}`); params.push(endDate); }
      const where = conditions.length ? conditions.join(' AND ') : '1=1';
      const result = await paymentRepo.query(
        `SELECT DATE_TRUNC('month', p.payment_date) as month,
                COALESCE(b.name, 'Unassigned') as branch_name,
                SUM(p.interest_amount) as total_interest,
                SUM(p.penalty_amount) as total_penalty,
                COUNT(p.id) as transaction_count
         FROM payments p
         JOIN loans l ON l.id = p.loan_id
         JOIN borrowers br ON br.id = l.borrower_id
         LEFT JOIN branches b ON b.id = br.branch_id
         WHERE ${where}
         GROUP BY DATE_TRUNC('month', p.payment_date), b.name
         ORDER BY month DESC, b.name`,
        params
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getAmortizationReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { borrowerId } = req.query;
      const params: any[] = [];
      let borrowerFilter = '';
      if (borrowerId) {
        borrowerFilter = `AND l.borrower_id = $1`;
        params.push(borrowerId);
      }
      const rows = await loanRepo.query(
        `SELECT l.id as loan_id, l.loan_number, l.principal_amount, l.total_amount, l.outstanding_balance, l.net_proceeds, l.status as loan_status,
                b.first_name || ' ' || b.last_name as borrower_name, b.borrower_code,
                a.id as schedule_id, a.installment_no, a.due_date, a.total_due, a.paid_amount, a.status as schedule_status, a.penalty_amount, a.paid_at,
                u.first_name || ' ' || u.last_name as loan_officer_name,
                COALESCE(la.previous_balance, 0) as previous_balance,
                COALESCE((SELECT SUM(amount) FROM loan_charges WHERE loan_id = l.id), 0) as total_charges
         FROM loans l
         JOIN borrowers b ON l.borrower_id = b.id
         JOIN amortization_schedules a ON a.loan_id = l.id
         LEFT JOIN loan_applications la ON l.application_id = la.id
         LEFT JOIN users u ON la.assigned_officer_id = u.id
         WHERE l.status IN ('active', 'delinquent') ${borrowerFilter}
         ORDER BY b.last_name, b.first_name, l.loan_number, a.installment_no ASC`,
        params
      );
      const grouped: any[] = [];
      let current: any = null;
      for (const row of rows) {
        if (!current || row.loan_id !== current.loan_id) {
          current = {
            loan_id: row.loan_id,
            loan_number: row.loan_number,
            loan_status: row.loan_status,
            borrower_name: row.borrower_name,
            borrower_code: row.borrower_code,
            principal_amount: row.principal_amount,
            total_amount: row.total_amount,
            outstanding_balance: row.outstanding_balance,
            loan_officer_name: row.loan_officer_name || '',
            net_proceeds: row.net_proceeds,
            previous_balance: parseFloat(row.previous_balance) || 0,
            total_charges: parseFloat(row.total_charges) || 0,
            paid: 0, partial: 0, unpaid: 0,
            schedules: [],
          };
          grouped.push(current);
        }
        current.schedules.push({
          id: row.schedule_id,
          installment_no: row.installment_no,
          due_date: row.due_date,
          total_due: row.total_due,
          paid_amount: row.paid_amount,
          status: row.schedule_status,
          penalty_amount: row.penalty_amount,
          paid_at: row.paid_at,
        });
        if (row.schedule_status === 'paid') current.paid++;
        else if (row.schedule_status === 'partial') current.partial++;
        else current.unpaid++;
      }
      for (const g of grouped) {
        g.effective_net_proceeds = Math.max(0, parseFloat(g.principal_amount) - g.total_charges - g.previous_balance);
      }
      res.json({ success: true, data: grouped });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getCollectorVisits(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const collectorId = paramStr(req.query.collectorId);
      if (!collectorId) throw new Error('collectorId is required');
      const startDate = paramStr(req.query.startDate);
      const endDate = paramStr(req.query.endDate);
      const result = await collectionRepo.query(
        `SELECT cv.id, cv.visit_date, cv.visit_type, cv.result, cv.notes,
                c.id as collection_id, c.status as collection_status,
                l.loan_number,
                b.first_name || ' ' || b.last_name as borrower_name
         FROM collection_visits cv
         JOIN collections c ON c.id = cv.collection_id
         JOIN loans l ON l.id = c.loan_id
         JOIN borrowers b ON b.id = c.borrower_id
         WHERE cv.collector_id = $1
           AND ($2::date IS NULL OR cv.visit_date >= $2::date)
           AND ($3::date IS NULL OR cv.visit_date <= $3::date)
         ORDER BY cv.visit_date DESC`,
        [collectorId, startDate || null, endDate || null]
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getCollectorPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const collectorId = paramStr(req.query.collectorId);
      const startDate = paramStr(req.query.startDate);
      const endDate = paramStr(req.query.endDate);
      const result = await collectionRepo.query(
        `       SELECT p.id, p.payment_number, p.amount, p.principal_amount, p.interest_amount,
                p.penalty_amount, p.payment_method, p.payment_date, p.reference_number, p.status,
                l.loan_number,
                b.first_name || ' ' || b.last_name as borrower_name,
                u.first_name || ' ' || u.last_name as collector_name,
                u.id as collector_id,
                c.id as collection_id,
                c.status as collection_status
         FROM payments p
         JOIN loans l ON p.loan_id = l.id
         JOIN borrowers b ON p.borrower_id = b.id
         LEFT JOIN collections c ON c.loan_id = l.id AND c.collector_id IS NOT NULL
         JOIN users u ON u.id = COALESCE(l.collector_id, c.collector_id)
         WHERE u.role_id = (SELECT id FROM roles WHERE slug = 'collector')
           AND COALESCE(l.collector_id, c.collector_id) IS NOT NULL
           AND ($1::uuid IS NULL OR u.id = $1::uuid)
           AND ($2::date IS NULL OR p.payment_date >= $2::date)
           AND ($3::date IS NULL OR p.payment_date <= $3::date)
         ORDER BY u.last_name, u.first_name, p.payment_date DESC`,
        [collectorId || null, startDate || null, endDate || null]
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
  async getCollectorPerformance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const collectorId = paramStr(req.query.collectorId);
      const startDate = paramStr(req.query.startDate);
      const endDate = paramStr(req.query.endDate);
      const result = await collectionRepo.query(
        `SELECT u.id as collector_id,
                u.first_name || ' ' || u.last_name as collector_name,
                COALESCE(loan_stats.total_assigned, 0) as total_assigned,
                COALESCE(loan_stats.active_assigned, 0) as active_assigned,
                COALESCE(loan_stats.delinquent_assigned, 0) as delinquent_assigned,
                COALESCE(loan_stats.closed_assigned, 0) as closed_assigned,
                COALESCE(loan_stats.total_due, 0) as total_due,
                COALESCE(pay_stats.total_collected, 0) as total_collected,
                COALESCE(pay_stats.total_payments, 0) as total_payments,
                COALESCE(pay_stats.on_time_payments, 0) as on_time_payments,
                 COALESCE(visit_stats.total_visits, 0) as total_visits,
                 COALESCE(visit_stats.effective_visits, 0) as effective_visits,
                 COALESCE(visit_stats.field_visits, 0) as field_visits,
                 COALESCE(visit_stats.office_visits, 0) as office_visits,
                 COALESCE(visit_stats.phone_visits, 0) as phone_visits,
                 COALESCE(visit_stats.collected_visits, 0) as collected_visits,
                 COALESCE(visit_stats.partial_visits, 0) as partial_visits,
                 COALESCE(visit_stats.promise_visits, 0) as promise_visits,
                 COALESCE(visit_stats.no_contact_visits, 0) as no_contact_visits,
                 COALESCE(visit_stats.refused_visits, 0) as refused_visits,
                 visit_stats.last_visit_date,
                 COALESCE(loan_stats.total_outstanding, 0) as total_outstanding
         FROM users u
         JOIN roles r ON r.id = u.role_id AND r.slug = 'collector'
          JOIN (
            SELECT l.collector_id,
                   COUNT(*) as total_assigned,
                    COUNT(CASE WHEN l.status = 'active' THEN 1 END) as active_assigned,
                    COUNT(CASE WHEN EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l.id AND a.due_date < CURRENT_DATE - INTERVAL '5 days' AND COALESCE(a.paid_amount,0) < a.total_due) THEN 1 END) as delinquent_assigned,
                   COUNT(CASE WHEN l.status = 'closed' THEN 1 END) as closed_assigned,
                   COALESCE(SUM(sched.total_due), 0) as total_due,
                   COALESCE(SUM(CASE WHEN l.status NOT IN ('closed','written-off') THEN l.outstanding_balance ELSE 0 END), 0) as total_outstanding
             FROM loans l
             LEFT JOIN LATERAL (
               SELECT COALESCE(SUM(s.total_due), 0) as total_due FROM amortization_schedules s WHERE s.loan_id = l.id
             ) sched ON true
             WHERE l.collector_id IS NOT NULL
             GROUP BY l.collector_id
          ) loan_stats ON loan_stats.collector_id = u.id
         LEFT JOIN (
           SELECT l.collector_id,
                  COUNT(DISTINCT pay.id) as total_payments,
                  COALESCE(SUM(pay.amount), 0) as total_collected,
                  COUNT(DISTINCT CASE WHEN pay.payment_date::date <= sched.due_date THEN pay.id END) as on_time_payments
           FROM payments pay
           JOIN loans l ON l.id = pay.loan_id
           LEFT JOIN payment_allocations pa ON pa.payment_id = pay.id
           LEFT JOIN amortization_schedules sched ON sched.id = pa.schedule_id
           WHERE l.collector_id IS NOT NULL
             AND ($2::date IS NULL OR pay.payment_date >= $2::date)
             AND ($3::date IS NULL OR pay.payment_date <= $3::date)
           GROUP BY l.collector_id
         ) pay_stats ON pay_stats.collector_id = u.id
          LEFT JOIN (
            SELECT cv.collector_id,
                   COUNT(*) as total_visits,
                   COUNT(CASE WHEN cv.result IN ('collected', 'promise') THEN 1 END) as effective_visits,
                   COUNT(CASE WHEN cv.visit_type = 'field' THEN 1 END) as field_visits,
                   COUNT(CASE WHEN cv.visit_type = 'office' THEN 1 END) as office_visits,
                   COUNT(CASE WHEN cv.visit_type = 'phone' THEN 1 END) as phone_visits,
                   COUNT(CASE WHEN cv.result = 'collected' THEN 1 END) as collected_visits,
                   COUNT(CASE WHEN cv.result = 'partial' THEN 1 END) as partial_visits,
                   COUNT(CASE WHEN cv.result = 'promise' THEN 1 END) as promise_visits,
                   COUNT(CASE WHEN cv.result = 'no-contact' THEN 1 END) as no_contact_visits,
                   COUNT(CASE WHEN cv.result = 'refused' THEN 1 END) as refused_visits,
                   MAX(cv.visit_date) as last_visit_date
            FROM collection_visits cv
            WHERE ($2::date IS NULL OR cv.visit_date >= $2::date)
              AND ($3::date IS NULL OR cv.visit_date <= $3::date)
            GROUP BY cv.collector_id
          ) visit_stats ON visit_stats.collector_id = u.id
         WHERE u.role_id = (SELECT id FROM roles WHERE slug = 'collector')
           AND u.is_active = true
           AND ($1::uuid IS NULL OR u.id = $1::uuid)
         ORDER BY u.first_name, u.last_name`,
        [collectorId || null, startDate || null, endDate || null]
      );
      const graded = (result || []).map((r: any) => {
        const collectionRate = r.total_due > 0
          ? parseFloat(((parseFloat(r.total_collected) / parseFloat(r.total_due)) * 100).toFixed(2))
          : 0;
        const visitEfficiency = parseInt(r.total_visits) > 0
          ? parseFloat(((parseInt(r.effective_visits) / parseInt(r.total_visits)) * 100).toFixed(2))
          : 0;
        const delinquencyRate = parseInt(r.total_assigned) > 0
          ? parseFloat(((parseInt(r.delinquent_assigned) / parseInt(r.total_assigned)) * 100).toFixed(2))
          : 0;
        const onTimeRate = parseInt(r.total_payments) > 0
          ? parseFloat(((parseInt(r.on_time_payments) / parseInt(r.total_payments)) * 100).toFixed(2))
          : 0;
        const rawScore = (collectionRate * 0.35) + (visitEfficiency * 0.20) + ((100 - delinquencyRate) * 0.25) + (onTimeRate * 0.20);
        const score = parseFloat(rawScore.toFixed(2));
        const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
        return { ...r, collection_rate: collectionRate, visit_efficiency: visitEfficiency, delinquency_rate: delinquencyRate, on_time_rate: onTimeRate, performance_score: score, grade };
      });
      res.json({ success: true, data: graded });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
  async getBorrowerPerformance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const borrowerId = paramStr(req.query.borrowerId);
      const startDate = paramStr(req.query.startDate);
      const endDate = paramStr(req.query.endDate);
      const result = await collectionRepo.query(
        `SELECT b.id as borrower_id,
                b.borrower_code,
                b.first_name || ' ' || b.last_name as borrower_name,
                b.mobile, b.email, b.present_city, b.present_province,
                b.employment_status, b.monthly_income, b.status as borrower_status,
                b.created_at as borrower_since,
                COALESCE(loan_stats.total_loans, 0) as total_loans,
                COALESCE(loan_stats.completed_loans, 0) as completed_loans,
                COALESCE(loan_stats.active_loans, 0) as active_loans,
                COALESCE(loan_stats.delinquent_loans, 0) as delinquent_loans,
                COALESCE(loan_stats.total_borrowed, 0) as total_borrowed,
                COALESCE(loan_stats.outstanding_balance, 0) as outstanding_balance,
                COALESCE(pay_stats.total_payments, 0) as total_payments,
                COALESCE(pay_stats.on_time_payments, 0) as on_time_payments,
                COALESCE(pay_stats.total_paid, 0) as total_paid,
                COALESCE(pay_stats.avg_days_late, 0) as avg_days_late,
                pay_stats.last_payment_date,
                loan_stats.last_loan_date,
                COALESCE(cm.co_maker_count, 0) as co_maker_count,
                (SELECT u.first_name || ' ' || u.last_name
                 FROM loans l2
                 JOIN users u ON u.id = l2.collector_id
                 WHERE l2.borrower_id = b.id
                   AND l2.status IN ('active', 'delinquent')
                 ORDER BY l2.release_date DESC NULLS LAST
                 LIMIT 1) as current_collector_name
         FROM borrowers b
         LEFT JOIN (
           SELECT l.borrower_id,
                  COUNT(*) as total_loans,
                  COUNT(CASE WHEN l.status = 'paid' OR l.status = 'completed' THEN 1 END) as completed_loans,
                   COUNT(CASE WHEN l.status = 'active' THEN 1 END) as active_loans,
                   COUNT(CASE WHEN EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l.id AND a.due_date < CURRENT_DATE - INTERVAL '5 days' AND COALESCE(a.paid_amount,0) < a.total_due) THEN 1 END) as delinquent_loans,
                  COALESCE(SUM(l.principal_amount), 0) as total_borrowed,
                  COALESCE(SUM(l.outstanding_balance), 0) as outstanding_balance,
                  MAX(l.release_date) as last_loan_date
           FROM loans l
           GROUP BY l.borrower_id
         ) loan_stats ON loan_stats.borrower_id = b.id
         LEFT JOIN (
           SELECT pay.borrower_id,
                  COUNT(DISTINCT pay.id) as total_payments,
                  COUNT(DISTINCT CASE WHEN pay.payment_date::date <= sched.due_date THEN pay.id END) as on_time_payments,
                  COALESCE(SUM(pay.amount), 0) as total_paid,
                  COALESCE(AVG(CASE WHEN pay.payment_date::date > sched.due_date THEN pay.payment_date::date - sched.due_date ELSE NULL END), 0) as avg_days_late,
                  MAX(pay.payment_date) as last_payment_date
           FROM payments pay
           LEFT JOIN payment_allocations pa ON pa.payment_id = pay.id
           LEFT JOIN amortization_schedules sched ON sched.id = pa.schedule_id
           WHERE ($2::date IS NULL OR pay.payment_date >= $2::date)
             AND ($3::date IS NULL OR pay.payment_date <= $3::date)
           GROUP BY pay.borrower_id
         ) pay_stats ON pay_stats.borrower_id = b.id
         LEFT JOIN (
           SELECT borrower_id, COUNT(*) as co_maker_count
           FROM co_makers
           GROUP BY borrower_id
         ) cm ON cm.borrower_id = b.id
         WHERE b.status = 'active'
           AND ($1::uuid IS NULL OR b.id = $1::uuid)
         ORDER BY b.first_name, b.last_name`,
        [borrowerId || null, startDate || null, endDate || null]
      );
      const graded = (result || []).map((r: any) => {
        const onTimeRate = parseInt(r.total_payments) > 0
          ? parseFloat(((parseInt(r.on_time_payments) / parseInt(r.total_payments)) * 100).toFixed(2))
          : r.total_payments > 0 ? 0 : 100;
        const completionRate = parseInt(r.total_loans) > 0
          ? parseFloat(((parseInt(r.completed_loans) / parseInt(r.total_loans)) * 100).toFixed(2))
          : 0;
        const delinquentRate = parseInt(r.total_loans) > 0
          ? parseFloat(((parseInt(r.delinquent_loans) / parseInt(r.total_loans)) * 100).toFixed(2))
          : 0;
        const rawScore = (onTimeRate * 0.40) + (completionRate * 0.25) + ((100 - Math.min(delinquentRate, 100)) * 0.25) - (Math.min(parseInt(r.avg_days_late) || 0, 30) * 0.5);
        const score = parseFloat(Math.max(0, Math.min(100, rawScore)).toFixed(2));
        const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
        return { ...r, on_time_rate: onTimeRate, completion_rate: completionRate, delinquent_rate: delinquentRate, risk_score: score, grade };
      });
      res.json({ success: true, data: graded });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getCollectorRemittance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const collectorId = paramStr(req.query.collectorId);
      const startDate = paramStr(req.query.startDate);
      const endDate = paramStr(req.query.endDate);
      const result = await collectionRepo.query(
        `SELECT p.id, p.payment_number, p.amount, p.principal_amount, p.interest_amount,
                p.penalty_amount, p.payment_method, p.payment_date, p.receipt_number,
                p.created_at as payment_created_at,
                l.loan_number,
                b.first_name || ' ' || b.last_name as borrower_name,
                b.present_address, b.present_city,
                u.first_name || ' ' || u.last_name as collector_name,
                u.id as collector_id,
                (SELECT json_agg(json_build_object(
                  'visit_date', cv.visit_date,
                  'visit_type', cv.visit_type,
                  'notes', cv.notes,
                  'result', cv.result
                ) ORDER BY cv.visit_date DESC)
                FROM collection_visits cv
                WHERE cv.collector_id = u.id
                  AND cv.visit_date >= p.payment_date - interval '7 days'
                  AND cv.visit_date <= p.payment_date + interval '1 day'
                ) as nearby_visits
         FROM payments p
         JOIN loans l ON p.loan_id = l.id
         JOIN borrowers b ON p.borrower_id = b.id
         JOIN users u ON u.id = p.received_by
         WHERE u.role_id = (SELECT id FROM roles WHERE slug = 'collector')
           AND ($1::uuid IS NULL OR u.id = $1::uuid)
           AND ($2::date IS NULL OR p.payment_date >= $2::date)
           AND ($3::date IS NULL OR p.payment_date <= $3::date)
         ORDER BY p.payment_date DESC`,
        [collectorId || null, startDate || null, endDate || null]
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getLoansGranted(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = req.query;
      const rows = await paymentRepo.query(
        `SELECT
            l.loan_number, l.release_date,
            l.principal_amount, l.interest_amount, l.total_amount, l.net_proceeds,
            l.term_months, l.payment_frequency, l.status,
            la.application_type, la.previous_balance,
            b.name as branch_name,
           br.first_name || ' ' || br.last_name as borrower_name,
           br.present_address, br.present_city, br.present_province,
           COALESCE(lc.total_charges, 0) as total_charges,
           COALESCE(pi.total_paid_interest, 0) as paid_interest
         FROM loans l
         JOIN loan_applications la ON la.id = l.application_id
         JOIN borrowers br ON br.id = l.borrower_id
         JOIN users u ON u.id = la.collector_id
         JOIN branches b ON b.id = u.branch_id
         LEFT JOIN (SELECT loan_id, SUM(amount) as total_charges FROM loan_charges GROUP BY loan_id) lc ON lc.loan_id = l.id
         LEFT JOIN (SELECT loan_id, SUM(interest_amount) as total_paid_interest FROM payments WHERE status = 'completed' GROUP BY loan_id) pi ON pi.loan_id = l.id
         WHERE l.release_date IS NOT NULL
           AND ($1::date IS NULL OR l.release_date >= $1::date)
           AND ($2::date IS NULL OR l.release_date <= $2::date)
           AND ($3::uuid IS NULL OR b.id = $3::uuid)
         ORDER BY l.release_date DESC`,
        [startDate || null, endDate || null, branchId || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getExpectedCollections(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = req.query;
      const rows = await paymentRepo.query(
        `SELECT
           l.loan_number, l.outstanding_balance,
           br.first_name || ' ' || br.last_name as borrower_name,
           br.mobile,
           COALESCE(br.present_address, '') || CASE WHEN br.present_city IS NOT NULL THEN ', ' || br.present_city ELSE '' END as address,
           b.name as branch_name,
            MIN(asch.total_due) as amount_per_due,
            COUNT(asch.id) as due_installments,
            SUM(asch.total_due) as total_amount_due
         FROM amortization_schedules asch
         JOIN loans l ON l.id = asch.loan_id
         JOIN borrowers br ON br.id = l.borrower_id
         LEFT JOIN branches b ON b.id = br.branch_id
         WHERE asch.status IN ('pending', 'overdue')
           AND asch.due_date >= $1::date
           AND asch.due_date <= $2::date
           AND ($3::uuid IS NULL OR b.id = $3::uuid)
         GROUP BY l.id, l.loan_number, l.outstanding_balance, br.first_name, br.last_name, br.mobile, br.present_address, br.present_city, b.name
         ORDER BY b.name, br.last_name, br.first_name`,
        [startDate || new Date().toISOString().slice(0, 10), endDate || (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })(), branchId || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getPortfolioSummary(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await paymentRepo.query(
        `SELECT
           lp.name as product_name, b.name as branch_name,
           COUNT(l.id) as loan_count,
           COALESCE(SUM(l.principal_amount), 0) as total_principal,
           COALESCE(SUM(l.outstanding_balance), 0) as total_outstanding,
           COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l.id AND a.due_date < CURRENT_DATE - INTERVAL '5 days' AND COALESCE(a.paid_amount,0) < a.total_due) THEN 1 ELSE 0 END), 0) as delinquent_count,
           COALESCE(SUM(CASE WHEN l.status = 'paid' THEN 1 ELSE 0 END), 0) as paid_count,
           ROUND(COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l.id AND a.due_date < CURRENT_DATE - INTERVAL '5 days' AND COALESCE(a.paid_amount,0) < a.total_due) THEN 1 ELSE 0 END), 0)::numeric /
             NULLIF(COUNT(l.id), 0) * 100, 1) as delinquency_rate
         FROM loans l
         JOIN loan_products lp ON lp.id = l.product_id
         JOIN loan_applications la ON la.id = l.application_id
         JOIN users u ON u.id = la.collector_id
         JOIN branches b ON b.id = u.branch_id
         GROUP BY lp.name, b.name
         ORDER BY b.name, lp.name`
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getBranchPerformance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const rows = await paymentRepo.query(
        `SELECT
           b.id as branch_id, b.name as branch_name,
           COALESCE(g.loans_granted, 0) as loans_granted,
           COALESCE(g.total_principal, 0) as total_principal,
           COALESCE(c.total_collected, 0) as total_collected,
           COALESCE(c.payment_count, 0) as payment_count,
           COALESCE(a.active_loans, 0) as active_loans,
           COALESCE(d.delinquent_count, 0) as delinquent_count,
           CASE WHEN COALESCE(a.active_loans, 0) > 0
             THEN ROUND(COALESCE(d.delinquent_count, 0)::numeric / a.active_loans * 100, 1)
             ELSE 0 END as delinquency_rate,
           CASE WHEN COALESCE(g.total_principal, 0) > 0
             THEN ROUND(COALESCE(c.total_collected, 0)::numeric /
               NULLIF(COALESCE(g.total_principal, 0) + COALESCE(c.total_collected, 0), 0) * 100, 1)
             ELSE 0 END as collection_rate
         FROM branches b
          LEFT JOIN (SELECT br.branch_id, COUNT(l.id) as loans_granted, COALESCE(SUM(l.principal_amount), 0) as total_principal
            FROM loans l
            JOIN borrowers br ON br.id = l.borrower_id
            WHERE l.release_date IS NOT NULL
              AND br.branch_id IS NOT NULL
              AND ($1::date IS NULL OR l.release_date >= $1::date)
              AND ($2::date IS NULL OR l.release_date <= $2::date)
            GROUP BY br.branch_id) g ON g.branch_id = b.id
          LEFT JOIN (SELECT br.branch_id, COUNT(p.id) as payment_count, COALESCE(SUM(p.amount), 0) as total_collected
            FROM payments p
            JOIN loans l ON l.id = p.loan_id
            JOIN borrowers br ON br.id = l.borrower_id
            WHERE p.status = 'completed'
              AND br.branch_id IS NOT NULL
              AND ($1::date IS NULL OR p.payment_date >= $1::date)
              AND ($2::date IS NULL OR p.payment_date <= $2::date)
            GROUP BY br.branch_id) c ON c.branch_id = b.id
          LEFT JOIN (SELECT br.branch_id, COUNT(*) as active_loans
            FROM loans l
            JOIN borrowers br ON br.id = l.borrower_id
            WHERE l.status = 'active'
              AND br.branch_id IS NOT NULL
            GROUP BY br.branch_id) a ON a.branch_id = b.id
          LEFT JOIN (SELECT br.branch_id, COUNT(*) as delinquent_count
            FROM loans l
            JOIN borrowers br ON br.id = l.borrower_id
            WHERE EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l.id AND a.due_date < CURRENT_DATE - INTERVAL '5 days' AND COALESCE(a.paid_amount,0) < a.total_due)
              AND br.branch_id IS NOT NULL
            GROUP BY br.branch_id) d ON d.branch_id = b.id
         WHERE b.is_active = true
         ORDER BY b.name`,
        [startDate || null, endDate || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getDisbursements(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = req.query;
      const rows = await paymentRepo.query(
        `SELECT
           ld.disbursed_at, ld.disbursement_method, ld.amount as disbursed_amount,
           ld.reference_number, ld.notes,
           l.loan_number, l.principal_amount, l.net_proceeds,
           br.first_name || ' ' || br.last_name as borrower_name,
           b.name as branch_name,
           du.first_name || ' ' || du.last_name as disbursed_by_name
         FROM loan_disbursements ld
         JOIN loans l ON l.id = ld.loan_id
         JOIN borrowers br ON br.id = l.borrower_id
         JOIN loan_applications la ON la.id = l.application_id
         JOIN users u ON u.id = la.collector_id
         JOIN branches b ON b.id = u.branch_id
         LEFT JOIN users du ON du.id = ld.disbursed_by
         WHERE ($1::date IS NULL OR ld.disbursed_at >= $1::date)
           AND ($2::date IS NULL OR ld.disbursed_at <= $2::date)
           AND ($3::uuid IS NULL OR b.id = $3::uuid)
         ORDER BY ld.disbursed_at DESC`,
        [startDate || null, endDate || null, branchId || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getBorrowerMasterList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query;
      const rows = await paymentRepo.query(
        `SELECT
           b.id as branch_id, b.name as branch_name,
           br.id as borrower_id, br.borrower_code, br.first_name, br.last_name, br.middle_name, br.suffix,
           br.mobile, br.present_address, br.present_city, br.present_province, br.status,
           COUNT(l.id) FILTER (WHERE l.status = 'active') as active_loans,
           COALESCE(SUM(l.outstanding_balance) FILTER (WHERE l.status = 'active'), 0) as outstanding_balance
         FROM borrowers br
         JOIN branches b ON b.id = br.branch_id
         LEFT JOIN loans l ON l.borrower_id = br.id
         WHERE ($1::uuid IS NULL OR br.branch_id = $1::uuid)
         GROUP BY b.id, b.name, br.id, br.borrower_code, br.first_name, br.last_name, br.middle_name, br.suffix,
                  br.mobile, br.present_address, br.present_city, br.present_province, br.status
         ORDER BY b.name, br.last_name, br.first_name`,
        [branchId || null]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getProcessingCharges(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const rows = await paymentRepo.query(
        `SELECT
           COALESCE(b.name, 'Unassigned') as branch_name,
           lc.charge_name,
           COUNT(DISTINCT l.id) as loan_count,
           SUM(lc.amount) as total_amount
         FROM loan_charges lc
         JOIN loans l ON l.id = lc.loan_id
         LEFT JOIN borrowers br ON br.id = l.borrower_id
         LEFT JOIN branches b ON b.id = br.branch_id
         WHERE l.status IN ('active', 'closed')
           AND ($1::date IS NULL OR l.release_date >= $1::date)
           AND ($2::date IS NULL OR l.release_date <= $2::date)
         GROUP BY b.name, lc.charge_name
         ORDER BY branch_name, lc.charge_name`,
        [startDate || null, endDate || null]
      );

      const totals = await paymentRepo.query(
        `SELECT
           COALESCE(b.name, 'Unassigned') as branch_name,
           COUNT(DISTINCT l.id) as loan_count,
           SUM(lc.amount) as total_amount
         FROM loan_charges lc
         JOIN loans l ON l.id = lc.loan_id
         LEFT JOIN borrowers br ON br.id = l.borrower_id
         LEFT JOIN branches b ON b.id = br.branch_id
         WHERE l.status IN ('active', 'closed')
           AND ($1::date IS NULL OR l.release_date >= $1::date)
           AND ($2::date IS NULL OR l.release_date <= $2::date)
         GROUP BY b.name
         ORDER BY branch_name`,
        [startDate || null, endDate || null]
      );

      const grand = await paymentRepo.query(
        `SELECT
           COUNT(DISTINCT l.id) as loan_count,
           SUM(lc.amount) as total_amount
         FROM loan_charges lc
         JOIN loans l ON l.id = lc.loan_id
         WHERE l.status IN ('active', 'closed')
           AND ($1::date IS NULL OR l.release_date >= $1::date)
           AND ($2::date IS NULL OR l.release_date <= $2::date)`,
        [startDate || null, endDate || null]
      );

      res.json({
        success: true,
        data: { details: rows, totals, grandTotal: grand[0] || { loan_count: 0, total_amount: 0 } }
      });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getDailyCollections(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { date, startDate, endDate, branchId } = req.query;
      const targetDate = date || new Date().toISOString().slice(0, 10);
      const sDate = startDate || targetDate;
      const eDate = endDate || targetDate;
      const rows = await paymentRepo.query(
        `SELECT
           COALESCE(b.id, '00000000-0000-0000-0000-000000000000') as branch_id,
           COALESCE(b.name, 'Unassigned') as branch_name,
           COUNT(p.id) as payment_count,
           COALESCE(SUM(p.amount), 0) as total_collected,
           COALESCE(SUM(p.principal_amount), 0) as total_principal,
           COALESCE(SUM(p.interest_amount), 0) as total_interest,
           COALESCE(SUM(p.penalty_amount), 0) as total_penalty
         FROM payments p
         JOIN loans l ON l.id = p.loan_id
         LEFT JOIN users u ON u.id = l.collector_id
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE p.status = 'completed'
           AND p.payment_date::date BETWEEN $1::date AND $2::date
           AND ($3::uuid IS NULL OR b.id = $3::uuid OR (b.id IS NULL AND $3::uuid = '00000000-0000-0000-0000-000000000000'))
         GROUP BY b.id, b.name
         ORDER BY branch_name`,
        [sDate, eDate, branchId || null]
      );
      res.json({ success: true, data: { startDate: sDate, endDate: eDate, branches: rows } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getPastDue(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query;
      const conditions: string[] = [
        'a.due_date < CURRENT_DATE',
        'a.due_date >= CURRENT_DATE - INTERVAL \'5 days\'',
        'COALESCE(a.paid_amount,0) < a.total_due',
        'l.status NOT IN (\'closed\', \'written-off\', \'cancelled\')'
      ];
      const params: any[] = [];
      let idx = 1;
      if (branchId) { conditions.push(`bor.branch_id = $${idx++}`); params.push(branchId); }
      const where = conditions.join(' AND ');
      const rows = await paymentRepo.query(
        `SELECT
           l.id as loan_id,
           l.loan_number,
           l.principal_amount,
           l.outstanding_balance,
           l.release_date,
           l.maturity_date,
           bor.first_name || ' ' || bor.last_name as borrower_name,
           COALESCE(branch.name, 'Unassigned') as branch_name,
           u.first_name || ' ' || u.last_name as collector_name,
           COALESCE(SUM(a.total_due - COALESCE(a.paid_amount,0)), 0) as total_overdue,
           COALESCE(MAX(CURRENT_DATE - a.due_date), 0)::int as days_overdue,
           (SELECT MAX(payment_date) FROM payments WHERE loan_id = l.id AND status = 'completed') as last_payment_date
         FROM loans l
         JOIN borrowers bor ON bor.id = l.borrower_id
         LEFT JOIN users u ON u.id = l.collector_id
         LEFT JOIN branches branch ON branch.id = bor.branch_id
         JOIN amortization_schedules a ON a.loan_id = l.id
         WHERE ${where}
         GROUP BY l.id, l.loan_number, l.principal_amount, l.outstanding_balance, l.release_date, l.maturity_date,
                  bor.first_name, bor.last_name, branch.name, u.first_name, u.last_name
         ORDER BY MAX(CURRENT_DATE - a.due_date) DESC, borrower_name`,
        params
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async getApplicationTypes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const rows = await paymentRepo.query(
        `SELECT
           COALESCE(b.name, 'Unassigned') as branch_name,
           a.application_type,
           COUNT(a.id) as application_count,
           COALESCE(SUM(a.principal_amount), 0) as total_principal
         FROM loan_applications a
         JOIN borrowers br ON br.id = a.borrower_id
         LEFT JOIN users u ON u.id = a.assigned_officer_id
         LEFT JOIN branches b ON b.id = COALESCE(br.branch_id, u.branch_id)
         WHERE a.deleted_at IS NULL AND a.status != 'draft'
           AND ($1::date IS NULL OR a.created_at >= $1::date)
           AND ($2::date IS NULL OR a.created_at <= $2::date + interval '1 day')
         GROUP BY b.name, a.application_type
         ORDER BY branch_name, a.application_type`,
        [startDate || null, endDate || null]
      );

      const totals = await paymentRepo.query(
        `SELECT
           COALESCE(b.name, 'Unassigned') as branch_name,
           COUNT(a.id) as application_count,
           COALESCE(SUM(a.principal_amount), 0) as total_principal
         FROM loan_applications a
         JOIN borrowers br ON br.id = a.borrower_id
         LEFT JOIN users u ON u.id = a.assigned_officer_id
         LEFT JOIN branches b ON b.id = COALESCE(br.branch_id, u.branch_id)
         WHERE a.deleted_at IS NULL AND a.status != 'draft'
           AND ($1::date IS NULL OR a.created_at >= $1::date)
           AND ($2::date IS NULL OR a.created_at <= $2::date + interval '1 day')
         GROUP BY b.name
         ORDER BY branch_name`,
        [startDate || null, endDate || null]
      );

      res.json({ success: true, data: { details: rows, totals } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
}

export const reportController = new ReportController();
