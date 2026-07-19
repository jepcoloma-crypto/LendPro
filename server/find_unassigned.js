const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });
p.query(`
  SELECT p.payment_number, p.amount, p.principal_amount, p.payment_date::date,
         l.loan_number, l.collector_id,
         br.borrower_code, br.first_name||' '||br.last_name as borrower_name,
         br.branch_id as br_branch, b.name as br_branch_name,
         u.branch_id as coll_branch, ub.name as coll_branch_name
  FROM payments p
  JOIN loans l ON l.id=p.loan_id
  JOIN borrowers br ON br.id=p.borrower_id
  LEFT JOIN branches b ON b.id=br.branch_id
  LEFT JOIN users u ON u.id=l.collector_id
  LEFT JOIN branches ub ON ub.id=u.branch_id
  WHERE p.status='completed'
    AND p.payment_date>='2026-01-01'
    AND (br.branch_id IS NULL OR u.branch_id IS NULL OR l.collector_id IS NULL)
  ORDER BY p.payment_date DESC
  LIMIT 25
`).then(r => { console.log(JSON.stringify(r.rows, null, 2)); p.end(); });
