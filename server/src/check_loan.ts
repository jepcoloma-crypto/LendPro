import { pool } from './database/connection';
async function main() {
  const ln = 'LN-MREEHWPOCVE5';
  const { rows: loans } = await pool.query('SELECT * FROM loans WHERE loan_number = $1', [ln]);
  if (!loans.length) { console.log('Loan not found'); process.exit(0); }
  const loan = loans[0];
  console.log('=== LOAN ===');
  console.log(JSON.stringify(loan, (k, v) => v instanceof Date ? v.toISOString() : v, 2));

  const { rows: sched } = await pool.query('SELECT * FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no', [loan.id]);
  console.log('\n=== SCHEDULES ===');
  sched.forEach(s => console.log(JSON.stringify(s, (k, v) => v instanceof Date ? v.toISOString() : v)));

  const { rows: pays } = await pool.query('SELECT * FROM payments WHERE loan_id = $1 ORDER BY payment_date', [loan.id]);
  console.log('\n=== PAYMENTS ===');
  pays.forEach(p => console.log(JSON.stringify(p, (k, v) => v instanceof Date ? v.toISOString() : v)));

  const { rows: allocs } = await pool.query(`SELECT pa.*, s.installment_no FROM payment_allocations pa JOIN amortization_schedules s ON s.id = pa.schedule_id WHERE pa.payment_id IN (SELECT id FROM payments WHERE loan_id = $1) ORDER BY s.installment_no`, [loan.id]);
  console.log('\n=== ALLOCATIONS ===');
  allocs.forEach(a => console.log(JSON.stringify(a)));

  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
