const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });

(async () => {
  const loan = await p.query(`SELECT id, total_amount, principal_amount, outstanding_balance FROM loans WHERE loan_number = 'LN-MREEL8A447IZ'`);
  const li = loan.rows[0];
  console.log('Loan:', JSON.stringify(li));

  const payments = await p.query(`SELECT id, payment_number, amount, principal_amount, interest_amount, penalty_amount, advance_amount, status FROM payments WHERE loan_id = $1 ORDER BY created_at`, [li.id]);
  console.log('\n=== PAYMENTS ===');
  let totalPrincipal = 0;
  payments.rows.forEach(p => {
    totalPrincipal += parseFloat(p.principal_amount);
    console.log(`  ${p.payment_number}: amount=${p.amount} principal=${p.principal_amount} interest=${p.interest_amount} status=${p.status}`);
  });
  console.log(`\nTotal principal paid: ${totalPrincipal}`);
  console.log(`Expected outstanding: ${parseFloat(li.total_amount) - totalPrincipal}`);
  console.log(`Actual outstanding: ${li.outstanding_balance}`);

  const allocs = await p.query(`SELECT pa.schedule_id, pa.amount, pa.allocated_to, s.installment_no FROM payment_allocations pa JOIN amortization_schedules s ON s.id = pa.schedule_id WHERE pa.payment_id IN (SELECT id FROM payments WHERE loan_id = $1) ORDER BY s.installment_no`, [li.id]);
  console.log('\n=== ALLOCATIONS ===');
  allocs.rows.forEach(a => console.log(`  #${a.installment_no}: ${a.amount} (${a.allocated_to})`));

  const totalAlloc = allocs.rows.reduce((s, a) => s + parseFloat(a.amount), 0);
  console.log(`\nTotal allocated: ${totalAlloc}`);

  p.end();
})();
