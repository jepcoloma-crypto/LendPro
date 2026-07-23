const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });
p.query('SELECT id, loan_number, status, principal_amount, outstanding_balance, advance_balance, created_at FROM loans WHERE loan_number = \', ['LN-MRN2O26R4CXA']).then(r => { console.log(JSON.stringify(r.rows, null, 2)); p.end(); });
