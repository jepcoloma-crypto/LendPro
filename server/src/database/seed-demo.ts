import { pool } from './connection';

const seedDemo = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add new columns if they don't exist
    await client.query(`ALTER TABLE borrowers ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await client.query(`ALTER TABLE borrowers ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7)`);
    await client.query(`ALTER TABLE borrowers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7)`);

    const existing = await client.query("SELECT COUNT(*) FROM borrowers WHERE borrower_code LIKE 'DEMO-%'");
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('Demo data already exists, skipping...');
      await client.query('COMMIT');
      return;
    }

    const mainBranch = await client.query("SELECT id FROM branches WHERE code = 'MAIN'");
    const qcBranch = await client.query("SELECT id FROM branches WHERE code = 'QC'");
    const cebBranch = await client.query("SELECT id FROM branches WHERE code = 'CEB'");
    const mainId = mainBranch.rows[0].id;
    const qcId = qcBranch.rows[0].id;
    const cebId = cebBranch.rows[0].id;

    const adminUser = await client.query("SELECT id FROM users WHERE email = 'admin@lending.com'");
    const officerUser = await client.query("SELECT id FROM users WHERE email = 'officer@lending.com'");
    const adminId = adminUser.rows[0].id;
    const officerId = officerUser.rows[0].id;

    const personalLoan = await client.query("SELECT id FROM loan_products WHERE name = 'Personal Loan'");
    const salaryLoan = await client.query("SELECT id FROM loan_products WHERE name = 'Salary Loan'");
    const businessLoan = await client.query("SELECT id FROM loan_products WHERE name = 'Business Loan'");
    const emergencyLoan = await client.query("SELECT id FROM loan_products WHERE name = 'Emergency Loan'");
    const personalId = personalLoan.rows[0].id;
    const salaryId = salaryLoan.rows[0].id;
    const businessId = businessLoan.rows[0].id;
    const emergencyId = emergencyLoan.rows[0].id;

    // ============ DETAILED BORROWERS ============
    const cols = `borrower_code, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, nationality,
      mobile, email, present_address, present_city, present_province,
      permanent_address, permanent_city, permanent_province,
      employment_status, employer_name, employer_address, employer_phone, position, monthly_income,
      business_name, business_type, business_address,
      government_id_type, government_id_number,
      latitude, longitude, status, branch_id, created_by`;

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-001', 'Maria', 'Santos', 'Reyes', null, '1990-03-15', 'female', 'married', 'Filipino',
      '+639181234501', 'maria.reyes@email.com', 'Unit 12 Sunshine Condo 45 BGC', 'Taguig', 'NCR',
      '88 Provincial Rd Santa Maria', 'Laguna', 'CALABARZON',
      'employed', 'Philippine National Bank', '100 PNB Financial Center Makati', '+632 8123 4567', 'Branch Manager', 95000,
      null, null, null, 'drivers-license', 'D12-34-567890',
      14.5561, 121.0204, 'active', mainId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-001');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-002', 'Antonio', 'G.', 'Villanueva', 'Jr.', '1985-07-22', 'male', 'married', 'Filipino',
      '+639181234502', 'antonio.v@email.com', '22 San Miguel Street', 'San Juan', 'NCR',
      '55 Heritage Village San Pedro', 'Laguna', 'CALABARZON',
      'self-employed', null, null, null, null, 180000,
      'Villanueva Hardware & Supply', 'Retail - Construction Supplies', '88 Aurora Blvd Pasig',
      'tin', '478-901-234-567',
      14.6010, 121.0340, 'active', mainId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-002');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-003', 'Luzviminda', 'P.', 'Mendoza', null, '1993-11-08', 'female', 'single', 'Filipino',
      '+639181234503', 'luz.mendoza@email.com', '7th Flr Tech Tower Eastwood', 'Quezon City', 'NCR',
      '7th Flr Tech Tower Eastwood', 'Quezon City', 'NCR',
      'employed', 'Accenture Philippines', '78 Cyberzone Pasig', '+632 9876 5432', 'Senior Software Engineer', 120000,
      null, null, null, 'passport', 'P123456789',
      14.6090, 121.0630, 'active', mainId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-003');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-004', 'Ramon', 'D.', 'Fernandez', null, '1978-05-30', 'male', 'married', 'Filipino',
      '+639181234504', 'ramon.f@email.com', '58 Green Meadows Subdivision', 'Cainta', 'Rizal',
      '58 Green Meadows Subdivision', 'Cainta', 'Rizal',
      'employed', 'Department of Education', 'DepEd Central Office Pasig', '+632 8633 7200', 'Division Chief', 78000,
      null, null, null, 'gsis', 'GSIS-1987-456-789',
      14.5680, 121.1250, 'active', cebId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-004');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-005', 'Jennifer', 'C.', 'Tan', null, '1995-09-14', 'female', 'single', 'Filipino',
      '+639181234505', 'jen.tan@email.com', '456 Pioneer St Mandaluyong', 'Mandaluyong', 'NCR',
      '18 Mabini Extension San Pablo', 'Laguna', 'CALABARZON',
      'employed', 'SM Retail Inc.', 'SM Corporate Office Pasay', '+632 8831 8000', 'Store Supervisor', 45000,
      null, null, null, 'sss', '34-5678901-2',
      14.5620, 121.0380, 'active', mainId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-005');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-006', 'Felipe', 'R.', 'Salvador', null, '1982-12-01', 'male', 'married', 'Filipino',
      '+639181234506', 'felipe.salvador@email.com', '99 Riverside Subdivision Baras', 'Rizal', 'CALABARZON',
      '99 Riverside Subdivision Baras', 'Rizal', 'CALABARZON',
      'self-employed', null, null, null, null, 65000,
      'Salvador Rice Trading', 'Agricultural Trading', '99 Riverside Subdivision Baras Rizal',
      'national-id', '1234-5678-9012-3456',
      14.5170, 121.2650, 'active', cebId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-006');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-007', 'Cynthia', 'B.', 'Garcia', null, '1997-04-20', 'female', 'single', 'Filipino',
      '+639181234507', 'cynthia.garcia@email.com', '234 West Avenue Diliman', 'Quezon City', 'NCR',
      'Purok 5 San Isidro', 'Batangas', 'CALABARZON',
      'employed', 'Philippine General Hospital', 'PGH Taft Ave Manila', '+632 8554 8400', 'Registered Nurse', 55000,
      null, null, null, 'prc', 'PRC-0456789',
      14.6520, 121.0350, 'active', mainId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-007');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-008', 'Roberto', 'S.', 'Lim', null, '1989-08-12', 'male', 'married', 'Filipino',
      '+639181234508', 'roberto.lim@email.com', '15-C Camelot Street Ayala Alabang', 'Muntinlupa', 'NCR',
      '678 Old Highway Bay', 'Laguna', 'CALABARZON',
      'self-employed', null, null, null, null, 250000,
      'Lim Auto Repair Shop', 'Automotive Repair & Services', '15-C Camelot Street Ayala Alabang Muntinlupa',
      'drivers-license', 'N01-98-765432',
      14.4150, 121.0300, 'active', mainId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-008');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-009', 'Angelica', 'M.', 'Rivera', null, '1998-01-25', 'female', 'single', 'Filipino',
      '+639181234509', 'angelica.rivera@email.com', '987 Sunset Blvd Alabang', 'Muntinlupa', 'NCR',
      '987 Sunset Blvd Alabang', 'Muntinlupa', 'NCR',
      'employed', 'BDO Unibank', 'BDO Head Office Makati', '+632 8840 7000', 'Bank Teller', 38000,
      null, null, null, 'tin', '123-456-789-012',
      14.4160, 121.0320, 'active', mainId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-009');

    await client.query(`INSERT INTO borrowers (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`, [
      'DEMO-B-010', 'Ricardo', 'N.', 'Domingo', null, '1975-06-18', 'male', 'widowed', 'Filipino',
      '+639181234510', 'ricardo.d@email.com', 'Block 2 Lot 8 Villa Mercedes', 'Calamba', 'Laguna',
      'Block 2 Lot 8 Villa Mercedes', 'Calamba', 'Laguna',
      'unemployed', null, null, null, null, 15000,
      null, null, null, 'umid', 'UMID-4567-8901-2345',
      14.2120, 121.1640, 'active', cebId, adminId,
    ]);
    console.log('  ✓ Created DEMO-B-010');

    // ============ LOAN APPLICATIONS ============
    const bResult = await client.query("SELECT id FROM borrowers WHERE borrower_code LIKE 'DEMO-%' ORDER BY borrower_code");
    const bIds = bResult.rows.map((r: any) => r.id);

    await client.query(`INSERT INTO system_settings (key, value, description)
      VALUES ('application_number_prefix', 'APP-', 'Application number prefix')
      ON CONFLICT (key) DO NOTHING
    `);

    const appCols = `application_number, borrower_id, loan_product_id, principal_amount, term_months, interest_rate, interest_type,
      status, purpose, payment_frequency, assigned_officer_id, created_by, submitted_at`;

    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      'APP-DEMO-001', bIds[0], personalId, 150000, 12, 12.00, 'flat-rate',
      'draft', 'Home renovation', 'monthly', officerId, adminId, null,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`, [
      'APP-DEMO-002', bIds[1], businessId, 300000, 24, 18.00, 'add-on-interest',
      'submitted', 'Business expansion new branch', 'monthly', officerId, adminId,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`, [
      'APP-DEMO-003', bIds[2], salaryId, 75000, 6, 1.50, 'diminishing-balance',
      'approved', 'Medical emergency', 'monthly', officerId, adminId,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      'APP-DEMO-004', bIds[3], businessId, 500000, 36, 18.00, 'add-on-interest',
      'draft', 'Equipment purchase', 'monthly', officerId, adminId, null,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`, [
      'APP-DEMO-005', bIds[4], emergencyId, 30000, 3, 3.00, 'monthly-interest',
      'submitted', 'Tuition fee', 'monthly', officerId, adminId,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`, [
      'APP-DEMO-006', bIds[5], salaryId, 100000, 12, 1.50, 'diminishing-balance',
      'rejected', 'Debt consolidation', 'monthly', officerId, adminId,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`, [
      'APP-DEMO-007', bIds[6], personalId, 200000, 18, 12.00, 'flat-rate',
      'under-review', 'Car down payment', 'monthly', officerId, adminId,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      'APP-DEMO-008', bIds[7], emergencyId, 20000, 3, 3.00, 'monthly-interest',
      'draft', 'Travel expenses', 'monthly', officerId, adminId, null,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`, [
      'APP-DEMO-009', bIds[8], salaryId, 50000, 6, 1.50, 'diminishing-balance',
      'submitted', 'Business inventory', 'bi-weekly', officerId, adminId,
    ]);
    await client.query(`INSERT INTO loan_applications (${appCols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())`, [
      'APP-DEMO-010', bIds[9], businessId, 200000, 24, 18.00, 'add-on-interest',
      'investigation', 'Startup capital for sari-sari store', 'monthly', officerId, adminId,
    ]);

    // Add approval for approved application
    const approvedApp = await client.query("SELECT id FROM loan_applications WHERE application_number = 'APP-DEMO-003'");
    await client.query(`INSERT INTO loan_approvals (application_id, approver_id, approval_level, status, comments, decided_at) VALUES ($1,$2,$3,$4,$5,NOW())`, [
      approvedApp.rows[0].id, adminId, 1, 'approved', 'Application looks good. Approved.'
    ]);

    console.log('\n✅ Demo data inserted successfully\n');
    console.log('Added:');
    console.log('  10 detailed borrowers with complete profiles');
    console.log('  10 loan applications in various statuses');
    console.log('  1 approval record\n');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Demo seed failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seedDemo();
