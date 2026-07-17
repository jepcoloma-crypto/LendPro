const { Pool } = require('pg');
const p = new Pool({
  host: 'db.hzrxiimkiddugfcibwgx.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '4FKuCgyXsuwNK9nO',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  const r = await p.query('SELECT email, role_id FROM users ORDER BY email');
  console.log(JSON.stringify(r.rows, null, 2));
  p.end();
}
test();
