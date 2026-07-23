const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });
(async () => {
  // Calculate correct outstanding: 13680 - 5935 = 7745
  const r = await p.query(`UPDATE loans SET outstanding_balance = 7745 WHERE loan_number = 'LN-MREEL8A447IZ' RETURNING id, loan_number, outstanding_balance`);
  console.log('Fixed:', JSON.stringify(r.rows[0], null, 2));
  
  // Verify integrity
  const v = await p.query(`SELECT l.outstanding_balance, l.advance_balance, COALESCE(SUM(a.total_due - COALESCE(a.paid_amount,0)), 0) as sum_remaining FROM loans l JOIN amortization_schedules a ON a.loan_id = l.id WHERE l.loan_number = 'LN-MREEL8A447IZ' GROUP BY l.id`);
  const loan = v.rows[0];
  const formula = parseFloat(loan.outstanding_balance) + parseFloat(loan.advance_balance);
  console.log(`Integrity check: ${loan.outstanding_balance} + ${loan.advance_balance} = ${formula} vs sum_remaining = ${loan.sum_remaining} ${formula === parseFloat(loan.sum_remaining) ? '✓ PASS' : '✗ FAIL'}`);
  p.end();
})();
