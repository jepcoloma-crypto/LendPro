const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });
const loanId = 'LN-MREEL8A447IZ';

(async () => {
  const loan = await p.query(`SELECT id, loan_number, status, principal_amount, outstanding_balance, advance_balance, maturity_date, release_date FROM loans WHERE loan_number = $1`, [loanId]);
  console.log('=== LOAN ===');
  console.log(JSON.stringify(loan.rows[0], null, 2));

  const schedules = await p.query(`SELECT id, installment_no, total_due, paid_amount, (total_due - COALESCE(paid_amount,0)) as remaining, due_date, status FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no`, [loan.rows[0].id]);
  const sumRemaining = schedules.rows.reduce((s, r) => s + parseFloat(r.remaining), 0);
  console.log(`\nSum of remaining: ${sumRemaining}`);
  console.log(`Outstanding: ${loan.rows[0].outstanding_balance}`);
  console.log(`Advance: ${loan.rows[0].advance_balance}`);
  console.log(`Formula: ${parseFloat(loan.rows[0].outstanding_balance) + parseFloat(loan.rows[0].advance_balance)} = ${sumRemaining}`);
  console.log(`\n=== SCHEDULES (${schedules.rows.length}) ===`);
  schedules.rows.forEach(s => console.log(`  #${s.installment_no} due=${s.due_date} total=${s.total_due} paid=${s.paid_amount} rem=${s.remaining} status=${s.status}`));

  p.end();
})();
