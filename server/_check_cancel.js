const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });
(async () => {
  const r = await p.query(`SELECT id, payment_number, amount, principal_amount, interest_amount, penalty_amount, penalty_waived, advance_amount FROM payments WHERE payment_number = 'PAY-MRPNQPPK4QZ3'`);
  console.log(JSON.stringify(r.rows[0], null, 2));

  // Check what allocations this payment had
  const allocs = await p.query(`SELECT * FROM payment_allocations WHERE payment_id = $1`, [r.rows[0].id]);
  console.log('Allocations:', JSON.stringify(allocs.rows, null, 2));
  p.end();
})();
