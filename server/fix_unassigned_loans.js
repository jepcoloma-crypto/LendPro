const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:4FKuCgyXsuwNK9nO@db.hzrxiimkiddugfcibwgx.supabase.co:5432/postgres' });

async function main() {
  // Steven Bautista recorded all payments for these loans
  const stevenId = '4fd2fc57-e3d1-4d84-913e-445ec0f87672';
  
  const { rowCount } = await p.query(`
    UPDATE loans SET collector_id = $1
    WHERE loan_number IN ('LN-MRMV9DSJB78X','LN-MREEL8A447IZ','LN-MRMVNR427VD3','LN-MRMVCGA5BVQA')
      AND collector_id IS NULL
  `, [stevenId]);
  
  console.log(`Assigned Steven Bautista to ${rowCount} loans`);
  
  // Verify
  const { rows } = await p.query(`
    SELECT l.loan_number, br.first_name||' '||br.last_name as borrower,
           u.first_name||' '||u.last_name as collector_name
    FROM loans l
    JOIN borrowers br ON br.id = l.borrower_id
    LEFT JOIN users u ON u.id = l.collector_id
    WHERE l.loan_number IN ('LN-MRMV9DSJB78X','LN-MREEL8A447IZ','LN-MRMVNR427VD3','LN-MRMVCGA5BVQA')
  `);
  console.log('\nUpdated loans:');
  for (const r of rows) {
    console.log(`${r.loan_number} | ${r.borrower} → collector: ${r.collector_name}`);
  }

  p.end();
}
main();
