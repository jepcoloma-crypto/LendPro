import { pool } from './connection';
import bcrypt from 'bcryptjs';

const seed = async () => {
  const force = process.argv.includes('--force');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!force) {
      const existing = await client.query("SELECT COUNT(*) FROM users WHERE email = 'admin@lending.com'");
      if (parseInt(existing.rows[0].count) > 0) {
        console.log('Seed data already exists, skipping...');
        await client.query('COMMIT');
        return;
      }
    } else {
      console.log('Force mode: clearing operational data + users/roles...');
      const tables = [
        'collection_visits', 'collections', 'payment_allocations', 'payments',
        'penalties', 'penalty_rules', 'amortization_schedules', 'loan_disbursements',
        'loans', 'loan_approvals', 'application_documents', 'loan_applications',
        'co_makers', 'borrower_documents', 'borrowers',
        'notifications', 'email_logs', 'sms_logs', 'audit_logs', 'users', 'roles',
      ];
      for (const t of tables) await client.query(`TRUNCATE TABLE "${t}" CASCADE`);
    }

    const hash = await bcrypt.hash('admin123', 12);

    const branchMain = await client.query(
      `INSERT INTO branches (name, code, address, city, province, phone, email)
       VALUES ('Main Branch', 'MAIN', '123 Business Park', 'Manila', 'NCR', '+632 1234 5678', 'main@lending.com')
       RETURNING id`
    );
    const branchQc = await client.query(
      `INSERT INTO branches (name, code, address, city, province, phone, email)
       VALUES ('Quezon City Branch', 'QC', '456 Commercial Ave', 'Quezon City', 'NCR', '+632 8765 4321', 'qc@lending.com')
       RETURNING id`
    );
    const branchCebu = await client.query(
      `INSERT INTO branches (name, code, address, city, province, phone, email)
       VALUES ('Cebu Branch', 'CEB', '789 Financial District', 'Cebu City', 'Cebu', '+6332 123 4567', 'cebu@lending.com')
       RETURNING id`
    );

    // Seed roles if missing
    await client.query(`INSERT INTO roles (name, slug, description, permissions) VALUES
      ('Super Admin', 'super-admin', 'Full system access', '["*"]'::jsonb),
      ('Admin', 'admin', 'Access all modules except users and settings', '["*"]'::jsonb),
      ('Branch Manager', 'branch-manager', 'Manage branch operations', '["loans.approve","reports.view","staff.manage","borrowers.view","payments.view"]'::jsonb),
      ('Loan Officer', 'loan-officer', 'Process loan applications', '["borrowers.create","borrowers.edit","applications.create","applications.submit","documents.upload","borrowers.view"]'::jsonb),
      ('Credit Investigator', 'credit-investigator', 'Verify and assess applications', '["applications.view","applications.verify","applications.assess"]'::jsonb),
      ('Cashier', 'cashier', 'Accept payments', '["payments.create","payments.view","receipts.generate"]'::jsonb),
      ('Collector', 'collector', 'Field collections', '["collections.view","collections.manage","visits.create"]'::jsonb),
      ('Borrower', 'borrower', 'Self-service portal', '["portal.view","portal.loans","portal.payments","portal.statements"]'::jsonb)
    ON CONFLICT (slug) DO NOTHING`);

    const adminRole = await client.query("SELECT id FROM roles WHERE slug = 'super-admin'");
    const managerRole = await client.query("SELECT id FROM roles WHERE slug = 'branch-manager'");
    const officerRole = await client.query("SELECT id FROM roles WHERE slug = 'loan-officer'");
    const investigatorRole = await client.query("SELECT id FROM roles WHERE slug = 'credit-investigator'");
    const cashierRole = await client.query("SELECT id FROM roles WHERE slug = 'cashier'");
    const collectorRole = await client.query("SELECT id FROM roles WHERE slug = 'collector'");

    await client.query(`INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, branch_id) VALUES
      ('admin', 'admin@lending.com', $1, 'Super', 'Admin', $2, $3),
      ('manager', 'manager@lending.com', $1, 'Juan', 'Dela Cruz', $4, $3),
      ('officer', 'officer@lending.com', $1, 'Maria', 'Santos', $5, $3),
      ('investigator', 'investigator@lending.com', $1, 'Pedro', 'Reyes', $6, $7),
      ('cashier', 'cashier@lending.com', $1, 'Ana', 'Garcia', $8, $3),
      ('collector', 'collector@lending.com', $1, 'Jose', 'Mercado', $9, $3)
    `, [hash, adminRole.rows[0].id, branchMain.rows[0].id, managerRole.rows[0].id,
        officerRole.rows[0].id, investigatorRole.rows[0].id, branchQc.rows[0].id,
        cashierRole.rows[0].id, collectorRole.rows[0].id]);

    await client.query(`INSERT INTO loan_products (name, description, interest_type, interest_rate, min_amount, max_amount, min_term, max_term, processing_fee, service_charge, late_payment_fee, penalty_type, penalty_value, penalty_grace_period, penalty_matured_value) VALUES
      ('Personal Loan', 'Flexible personal loan for employees', 'flat-rate', 12.00, 10000, 500000, 1, 24, 500, 100, 200, 'percentage', 5.00, 3, 5.00),
      ('Salary Loan', 'Loan for employed individuals', 'diminishing-balance', 1.50, 5000, 200000, 1, 12, 300, 50, 150, 'daily', 1.00, 3, 5.00),
      ('Business Loan', 'Capital for small businesses', 'add-on-interest', 18.00, 50000, 2000000, 3, 36, 2000, 500, 500, 'fixed', 500, 5, 5.00),
      ('Emergency Loan', 'Quick cash for emergencies', 'monthly-interest', 3.00, 2000, 50000, 1, 6, 100, 0, 100, 'percentage', 3.00, 2, 5.00)
    `);

    await client.query(`INSERT INTO borrowers (borrower_code, first_name, last_name, mobile, email, present_address, present_city, employment_status, monthly_income, status, branch_id) VALUES
      ('B-0001', 'Carlos', 'Yap', '+639171234567', 'carlos@email.com', '123 Rizal St', 'Manila', 'employed', 35000, 'active', $1),
      ('B-0002', 'Elena', 'Cruz', '+639177654321', 'elena@email.com', '456 Mabini Ave', 'Quezon City', 'self-employed', 85000, 'active', $2)
    `, [branchMain.rows[0].id, branchQc.rows[0].id]);

    await client.query(`INSERT INTO charges (name, description, computation_type, default_amount) VALUES
      ('Processing Fee', 'Loan processing and documentation fee', 'fixed', 500),
      ('Service Charge', 'Administrative service charge', 'fixed', 300),
      ('Notarial Fee', 'Notarization of promissory note', 'fixed', 150),
      ('Documentary Stamp', 'Government documentary stamp tax', 'fixed', 150),
      ('Credit Investigation', 'Credit background check fee', 'fixed', 300),
      ('Insurance Premium', 'Loan protection insurance (MRTA)', 'percentage', 1.00)
      ON CONFLICT DO NOTHING
    `);

    await client.query(`INSERT INTO system_settings (key, value, description)
      VALUES ('loan_approval_levels', '1', 'Number of approval levels required')
      ON CONFLICT (key) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('\n✓ Seed data inserted successfully\n');
    console.log('Demo accounts:');
    console.log('  ┌─────────────────────┬────────────────────┬───────────────┐');
    console.log('  │ Email               │ Password           │ Role          │');
    console.log('  ├─────────────────────┼────────────────────┼───────────────┤');
    console.log('  │ admin@lending.com   │ admin123           │ Super Admin   │');
    console.log('  │ manager@lending.com │ admin123           │ Branch Manager│');
    console.log('  │ officer@lending.com │ admin123           │ Loan Officer  │');
    console.log('  │ investigator@lending│ admin123           │ Investigator  │');
    console.log('  │ cashier@lending.com │ admin123           │ Cashier       │');
    console.log('  │ collector@lending.c │ admin123           │ Collector     │');
    console.log('  └─────────────────────┴────────────────────┴───────────────┘\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
