import app from './app';
import { config } from './config';
import { pool } from './database/connection';
import { loadPrefixes } from './utils/prefixes';
import { cronService } from './services/cron.service';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hash } from 'bcryptjs';
import { v4 } from 'uuid';

const seedRolesAndAdmin = async () => {
  // Only auto-seed in development mode
  if (config.nodeEnv !== 'development') return;
  try {
    const tables = await pool.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`);
    if (tables.rows.length === 0) {
      const schema = readFileSync(join(__dirname, '..', 'src', 'database', 'schema.sql'), 'utf8');
      await pool.query(schema.replace(/^-- .*\n?/gm, ''));
      const migration = readFileSync(join(__dirname, '..', 'src', 'database', 'migrations', '003_loan_columns.sql'), 'utf8');
      await pool.query(migration.replace(/^-- .*\n?/gm, ''));
      console.log('✓ Schema created');
    }
    const existingUser = await pool.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (existingUser.rows.length === 0) {
      const roles = [
        { name: 'Super Admin', slug: 'super-admin', permissions: ['*'] },
        { name: 'Admin', slug: 'admin', permissions: ['loans.*', 'payments.*', 'collections.*', 'reports.*', 'borrowers.*', 'branches.*', 'loan-products.*', 'charges.*'] },
        { name: 'Branch Manager', slug: 'branch-manager', permissions: ['loans.create', 'loans.view', 'loans.approve', 'payments.*', 'collections.*', 'reports.*', 'borrowers.*'] },
        { name: 'Loan Officer', slug: 'loan-officer', permissions: ['loans.create', 'loans.view', 'borrowers.create', 'borrowers.view'] },
        { name: 'Credit Investigator', slug: 'credit-investigator', permissions: ['applications.view', 'applications.investigate'] },
        { name: 'Collector', slug: 'collector', permissions: ['collections.*', 'payments.create', 'payments.view', 'reports.collector'] },
        { name: 'Cashier', slug: 'cashier', permissions: ['payments.create', 'payments.view', 'receipts.generate'] },
      ];
      for (const r of roles) {
        await pool.query(`INSERT INTO roles (id, name, slug, permissions) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (slug) DO NOTHING`, [v4(), r.name, r.slug, JSON.stringify(r.permissions)]);
      }
      const pw = await hash('admin123', 10);
      const roleId = (await pool.query(`SELECT id FROM roles WHERE slug = 'super-admin'`)).rows[0]?.id;
      if (roleId) {
        await pool.query(`INSERT INTO users (username, email, password_hash, first_name, last_name, role_id) VALUES ('admin', 'admin@lending.com', $1, 'Super', 'Admin', $2) ON CONFLICT (username) DO NOTHING`, [pw, roleId]);
        console.log('✓ Admin user seeded (admin / admin123)');
      }
    }
  } catch (err: any) {
    console.warn('⚠ Auto-seed skipped:', err.message);
  }
};

const startServer = async () => {
  let dbConnected = false;
  try {
    await pool.query('SELECT NOW()');
    dbConnected = true;
    await loadPrefixes();
    console.log('✓ Database connected successfully');
    await seedRolesAndAdmin();
    cronService.start();
  } catch (error: any) {
    console.warn('⚠ Database not available - API will return DB errors:', error.message);
    console.warn('  To set up PostgreSQL:');
    console.warn('    1. Install PostgreSQL or use Supabase');
    console.warn('    2. Create a .env file from .env.example');
    console.warn('    3. Run: npm run migrate && npm run seed');
  }

  app.listen(config.port, () => {
    console.log(`\n┌─────────────────────────────────────────────┐`);
    console.log(`│  Enterprise Lending Management System      │`);
    console.log(`├─────────────────────────────────────────────┤`);
    console.log(`│  Server:  http://localhost:${config.port}/api              │`);
    console.log(`│  Health:  http://localhost:${config.port}/health            │`);
    console.log(`│  Status:  ${dbConnected ? '✓ DB Connected' : '⚠ DB Unavailable'}              │`);
    console.log(`│  Mode:    ${config.nodeEnv}                        │`);
    console.log(`└─────────────────────────────────────────────┘\n`);
  });
};

startServer();
