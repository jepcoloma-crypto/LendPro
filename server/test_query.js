const { Pool } = require('pg');
const p = new Pool({
  host: 'db.hzrxiimkiddugfcibwgx.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '4FKuCgyXsuwNK9nO',
  ssl: { rejectUnauthorized: false }
});

const sDate = '2026-07-01';
const eDate = '2026-07-17';

async function test() {
  const r1 = await p.query('SELECT count(*) as c FROM branches WHERE is_active = true');
  console.log('Active branches:', r1.rows[0].c);

  const r2 = await p.query("SELECT count(*) as c FROM payments WHERE status = 'completed' AND payment_date::date BETWEEN $1::date AND $2::date", [sDate, eDate]);
  console.log('Payments in range:', r2.rows[0].c);

  const r3 = await p.query("SELECT count(*) as c FROM loans WHERE release_date IS NOT NULL AND release_date::date BETWEEN $1::date AND $2::date", [sDate, eDate]);
  console.log('Releases in range:', r3.rows[0].c);

  const r4 = await p.query("SELECT count(*) as c FROM generate_series($1::date, $2::date, '1 day'::interval) dt", [sDate, eDate]);
  console.log('Generate series days:', r4.rows[0].c);

  try {
    const result = await p.query(`
      WITH dates AS (
        SELECT generate_series($1::date, $2::date, '1 day'::interval) AS dt
      ),
      branches_list AS (
        SELECT id, name FROM branches WHERE is_active = true
      ),
      date_branches AS (
        SELECT b.id as branch_id, b.name as branch_name, d.dt::date as report_date
        FROM dates d CROSS JOIN branches_list b
      )
      SELECT count(*) as c FROM date_branches
    `, [sDate, eDate]);
    console.log('Date branches rows:', result.rows[0].c);
  } catch(e) { console.error('Full CTE error:', e.message); }

  // Test the FULL query
  try {
    const result = await p.query(`
      WITH dates AS (
        SELECT generate_series($1::date, $2::date, '1 day'::interval) AS dt
      ),
      branches_list AS (
        SELECT id, name FROM branches WHERE is_active = true
      ),
      date_branches AS (
        SELECT b.id as branch_id, b.name as branch_name, d.dt::date as report_date
        FROM dates d CROSS JOIN branches_list b
      ),
      payments_agg AS (
        SELECT br.branch_id, p.payment_date::date as pdate,
          COALESCE(SUM(p.amount), 0) as total_collection,
          COALESCE(SUM(p.penalty_amount), 0) as penalty,
          COALESCE(SUM(p.advance_amount), 0) as advance_payment
        FROM payments p
        JOIN loans l ON l.id = p.loan_id
        JOIN borrowers br ON br.id = l.borrower_id
        WHERE p.status = 'completed'
          AND p.payment_date::date BETWEEN $1::date AND $2::date
        GROUP BY br.branch_id, p.payment_date::date
      ),
      cash_agg AS (
        SELECT cs.branch_id, ct.created_at::date as cdate,
          COALESCE(SUM(ct.amount), 0) as actual_collection
        FROM cash_transactions ct
        JOIN cashier_sessions cs ON cs.id = ct.shift_id
        WHERE ct.direction = 'in' AND ct.transaction_type = 'collection'
          AND ct.created_at::date BETWEEN $1::date AND $2::date
        GROUP BY cs.branch_id, ct.created_at::date
      ),
      release_agg AS (
        SELECT br.branch_id, l.release_date::date as rdate,
          COALESCE(SUM(l.principal_amount), 0) as day_release
        FROM loans l
        JOIN borrowers br ON br.id = l.borrower_id
        WHERE l.release_date IS NOT NULL
          AND l.release_date::date BETWEEN $1::date AND $2::date
        GROUP BY br.branch_id, l.release_date::date
      ),
      cumulative_release AS (
        SELECT br.branch_id,
          COALESCE(SUM(l.principal_amount), 0) as ending_loan_release
        FROM loans l
        JOIN borrowers br ON br.id = l.borrower_id
        WHERE l.release_date IS NOT NULL
          AND l.release_date::date <= $2::date
        GROUP BY br.branch_id
      ),
      past_due AS (
        SELECT br.branch_id, COUNT(*) as past_due_count
        FROM loans l
        JOIN borrowers br ON br.id = l.borrower_id
        WHERE l.maturity_date < $2::date
          AND l.outstanding_balance > 0
          AND l.status NOT IN ('closed', 'written-off', 'cancelled')
        GROUP BY br.branch_id
      ),
      delinquent AS (
        SELECT br.branch_id, COUNT(DISTINCT l.id) as delinquent_count
        FROM loans l
        JOIN borrowers br ON br.id = l.borrower_id
        WHERE l.status NOT IN ('closed', 'written-off', 'cancelled')
          AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l.id AND a.due_date < $2::date AND COALESCE(a.paid_amount, 0) < a.total_due)
        GROUP BY br.branch_id
      )
      SELECT
        db.report_date,
        db.branch_name,
        COALESCE(p.total_collection, 0) as total_collection,
        COALESCE(p.penalty, 0) as penalty,
        COALESCE(p.advance_payment, 0) as advance_payment,
        COALESCE(c.actual_collection, 0) as actual_collection,
        COALESCE(r.day_release, 0) as actual_released_day,
        SUM(COALESCE(r.day_release, 0)) OVER (PARTITION BY db.branch_id ORDER BY db.report_date) as total_release,
        0::numeric as rebate,
        0::numeric as offset_amount,
        COALESCE(cr.ending_loan_release, 0) as ending_loan_release,
        COALESCE(pd.past_due_count, 0) as past_due_accounts,
        COALESCE(d.delinquent_count, 0) as total_delinquent
      FROM date_branches db
      LEFT JOIN payments_agg p ON p.branch_id = db.branch_id AND p.pdate = db.report_date
      LEFT JOIN cash_agg c ON c.branch_id = db.branch_id AND c.cdate = db.report_date
      LEFT JOIN release_agg r ON r.branch_id = db.branch_id AND r.rdate = db.report_date
      LEFT JOIN cumulative_release cr ON cr.branch_id = db.branch_id
      LEFT JOIN past_due pd ON pd.branch_id = db.branch_id
      LEFT JOIN delinquent d ON d.branch_id = db.branch_id
      ORDER BY db.branch_name, db.report_date
    `, [sDate, eDate]);
    console.log('Full query rows:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('First row:', JSON.stringify(result.rows[0]));
    }
  } catch(e) {
    console.error('Full query error:', e.message);
    if (e.position) {
      console.log('Error position:', e.position);
      // show context around error position
      const fullSql = result.query || '';
      const pos = parseInt(e.position);
      console.log('Context:', fullSql.substring(Math.max(0,pos-50), pos+50));
    }
  }

  p.end();
}
test();
