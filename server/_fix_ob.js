const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });
(async () => {
  // Set outstanding to match actual cash collected: 13680 - 5935 = 7745
  const r = await p.query(`UPDATE loans SET outstanding_balance = 7745 WHERE loan_number = 'LN-MREEL8A447IZ' RETURNING id, loan_number, outstanding_balance`);
  console.log('Fixed:', JSON.stringify(r.rows[0], null, 2));
  p.end();
})();
