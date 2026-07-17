const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const p = new Pool({
  host: 'db.hzrxiimkiddugfcibwgx.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '4FKuCgyXsuwNK9nO',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  const r = await p.query("SELECT email, password_hash FROM users WHERE email = 'admin@lending.com'");
  const user = r.rows[0];
  if (!user) { console.log('User not found'); p.end(); return; }
  console.log('Email:', user.email);
  console.log('Hash:', user.password_hash.substring(0, 30) + '...');
  const match = await bcrypt.compare('admin123', user.password_hash);
  console.log('Password match:', match);
  p.end();
}
test();
