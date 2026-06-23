import { schedule, ScheduledTask } from 'node-cron';
import { pool } from '../database/connection';
import { notificationService } from './notification.service';

export class CronService {
  private jobs: ScheduledTask[] = [];

  start() {
    this.jobs.push(schedule('0 2 * * 6', () => this.applyPenalties()));
    this.jobs.push(schedule('0 8 * * *', () => this.sendPaymentReminders()));
    this.jobs.push(schedule('30 8 * * *', () => this.sendOverdueNotices()));
    console.log('✓ Cron jobs scheduled (penalties 2AM, reminders 8AM, overdue 8:30AM)');
  }

  stop() {
    this.jobs.forEach(job => job.stop());
  }

  private async applyPenalties() {
    try {
      const overdueSchedules = await pool.query(
        `SELECT s.id, s.loan_id, s.total_due, s.paid_amount, s.due_date,
                l.penalty_type, l.penalty_value, l.penalty_grace_period
         FROM amortization_schedules s
         JOIN loans l ON l.id = s.loan_id
         WHERE s.status IN ('pending', 'partial')
           AND s.due_date < CURRENT_DATE
           AND l.penalty_type IS NOT NULL`
      );
      let applied = 0;
      let skipped = 0;
      for (const s of overdueSchedules.rows) {
        const paid = parseFloat(s.paid_amount) || 0;
        const due = parseFloat(s.total_due);
        if (paid >= due - 0.005) continue;
        const gracePeriod = s.penalty_grace_period || 0;
        const daysOverdue = Math.floor((Date.now() - new Date(s.due_date).getTime()) / (1000 * 60 * 60 * 24));
        const effectiveDays = Math.max(0, daysOverdue - gracePeriod);
        if (effectiveDays <= 0) { skipped++; continue; }
        const pVal = parseFloat(s.penalty_value) || 0;
        let penalty = 0;
        if (s.penalty_type === 'fixed') penalty = pVal;
        else if (s.penalty_type === 'percentage') penalty = Math.round(due * pVal / 100 * 100) / 100;
        else if (s.penalty_type === 'daily') penalty = Math.round(due * pVal / 100 * effectiveDays * 100) / 100;
        if (penalty > 0) {
          const existing = await pool.query(
            `SELECT id FROM penalties WHERE schedule_id = $1 AND penalty_type = $2 AND calculated_at = CURRENT_DATE`,
            [s.id, s.penalty_type]
          );
          if (existing.rows.length === 0) {
            await pool.query(
              `INSERT INTO penalties (loan_id, schedule_id, penalty_type, amount, calculated_at)
               VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
              [s.loan_id, s.id, s.penalty_type, penalty]
            );
            await pool.query(
              `UPDATE amortization_schedules SET penalty_amount = penalty_amount + $1 WHERE id = $2`,
              [penalty, s.id]
            );
            applied++;
          } else {
            skipped++;
          }
        }
      }
      console.log(`[Cron] Penalties applied: ${applied} applied, ${skipped} skipped`);
    } catch (err: any) {
      console.error('[Cron] Penalty application failed:', err.message);
    }
  }

  private async sendPaymentReminders() {
    try {
      const settings = await pool.query(
        `SELECT value FROM system_settings WHERE key = 'payment_reminder_days'`
      );
      const reminderDays = parseInt(settings.rows[0]?.value || '3');
      if (reminderDays <= 0) return;

      const dueSoon = await pool.query(
        `SELECT s.id, s.due_date, s.total_due, s.paid_amount,
                l.loan_number, l.id as loan_id,
                b.id as borrower_id, b.first_name, b.last_name, b.mobile, b.email
         FROM amortization_schedules s
         JOIN loans l ON l.id = s.loan_id
         JOIN borrowers b ON b.id = l.borrower_id
         WHERE s.status = 'pending'
           AND s.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::integer
           AND l.status IN ('active', 'delinquent')`,
        [reminderDays]
      );

      for (const row of dueSoon.rows) {
        const name = `${row.first_name} ${row.last_name}`;
        const dueAmount = parseFloat(row.total_due) - (parseFloat(row.paid_amount) || 0);
        const formattedDue = row.due_date.toISOString().split('T')[0];

        if (row.email) {
          await notificationService.sendPaymentReminder(
            row.email, name, dueAmount, formattedDue, row.loan_number, true
          );
        }
        if (row.mobile) {
          await notificationService.sendPaymentReminder(
            row.mobile, name, dueAmount, formattedDue, row.loan_number, false
          );
        }
      }
      console.log(`[Cron] Payment reminders sent: ${dueSoon.rows.length} borrower(s)`);
    } catch (err: any) {
      console.error('[Cron] Payment reminders failed:', err.message);
    }
  }

  private async sendOverdueNotices() {
    try {
      const overdue = await pool.query(
        `SELECT s.id, s.due_date, s.total_due, s.paid_amount,
                l.loan_number, l.id as loan_id,
                b.id as borrower_id, b.first_name, b.last_name, b.mobile, b.email
         FROM amortization_schedules s
         JOIN loans l ON l.id = s.loan_id
         JOIN borrowers b ON b.id = l.borrower_id
         WHERE s.status IN ('pending', 'partial')
           AND s.due_date < CURRENT_DATE
           AND (s.paid_amount IS NULL OR s.paid_amount < s.total_due - 0.005)
           AND l.status IN ('active', 'delinquent')`
      );

      for (const row of overdue.rows) {
        const name = `${row.first_name} ${row.last_name}`;
        const dueAmount = parseFloat(row.total_due) - (parseFloat(row.paid_amount) || 0);
        const daysOverdue = Math.floor((Date.now() - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24));

        if (row.email) {
          await notificationService.sendOverdueNotice(
            row.email, name, dueAmount, daysOverdue, row.loan_number, true
          );
        }
        if (row.mobile) {
          await notificationService.sendOverdueNotice(
            row.mobile, name, dueAmount, daysOverdue, row.loan_number, false
          );
        }
      }
      console.log(`[Cron] Overdue notices sent: ${overdue.rows.length} borrower(s)`);
    } catch (err: any) {
      console.error('[Cron] Overdue notices failed:', err.message);
    }
  }
}

export const cronService = new CronService();
