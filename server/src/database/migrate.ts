import { pool } from './connection';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_TABLE = '_schema_migrations';

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    // Create migration tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        hash VARCHAR(64) NOT NULL
      )
    `);

    // Run schema.sql if not yet applied
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const schemaHash = require('crypto').createHash('sha256').update(schema).digest('hex');

    const { rows: existing } = await client.query(
      `SELECT hash FROM ${MIGRATIONS_TABLE} WHERE filename = 'schema.sql'`
    );

    if (existing.length === 0) {
      await client.query('BEGIN');
      // safeSql: add IF NOT EXISTS to CREATE TABLE (only if not already present)
      let safeSql = schema.replace(/CREATE TABLE (?!IF NOT EXISTS\b)/g, 'CREATE TABLE IF NOT EXISTS ');
      await client.query(safeSql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (filename, hash) VALUES ('schema.sql', $1)`,
        [schemaHash]
      );
      await client.query('COMMIT');
      console.log('Schema applied successfully');
    } else if (existing[0].hash !== schemaHash) {
      console.warn('WARNING: schema.sql has changed since last applied. Create a new migration file instead of modifying schema.sql.');
    } else {
      console.log('Schema is up to date');
    }

    // Add write-off columns to loans table if missing
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='write_off_reason') THEN
          ALTER TABLE loans ADD COLUMN write_off_reason TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='write_off_amount') THEN
          ALTER TABLE loans ADD COLUMN write_off_amount NUMERIC(15,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='written_off_by') THEN
          ALTER TABLE loans ADD COLUMN written_off_by UUID REFERENCES users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='written_off_at') THEN
          ALTER TABLE loans ADD COLUMN written_off_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='restructured_from') THEN
          ALTER TABLE loans ADD COLUMN restructured_from UUID REFERENCES loans(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='borrowers' AND column_name='credit_limit') THEN
          ALTER TABLE borrowers ADD COLUMN credit_limit NUMERIC(15,2);
        END IF;
        -- Add unique constraint on penalties for idempotent batch application
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_penalties_schedule_type') THEN
          CREATE UNIQUE INDEX idx_penalties_schedule_type ON penalties (schedule_id, penalty_type);
        END IF;
        -- SMS/WhatsApp balance inquiry support
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='borrowers' AND column_name='pin_hash') THEN
          ALTER TABLE borrowers ADD COLUMN pin_hash TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='borrowers' AND column_name='whatsapp_phone') THEN
          ALTER TABLE borrowers ADD COLUMN whatsapp_phone VARCHAR(20);
        END IF;
        -- Operating expenses
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='operating_expenses') THEN
          CREATE TABLE operating_expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date DATE NOT NULL,
            category VARCHAR(50) NOT NULL,
            amount NUMERIC(15,2) NOT NULL,
            payee VARCHAR(255),
            description TEXT,
            receipt_url TEXT,
            branch_id UUID REFERENCES branches(id),
            created_by UUID REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operating_expenses' AND column_name='branch_id') THEN
          ALTER TABLE operating_expenses ADD COLUMN branch_id UUID REFERENCES branches(id);
        END IF;
        -- Other income
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='other_income') THEN
          CREATE TABLE other_income (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date DATE NOT NULL,
            source VARCHAR(255) NOT NULL,
            amount NUMERIC(15,2) NOT NULL,
            description TEXT,
            branch_id UUID REFERENCES branches(id),
            created_by UUID REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='other_income' AND column_name='branch_id') THEN
          ALTER TABLE other_income ADD COLUMN branch_id UUID REFERENCES branches(id);
        END IF;
        -- Login history for monitoring
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='login_history') THEN
          CREATE TABLE login_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            username VARCHAR(100),
            action VARCHAR(20) NOT NULL DEFAULT 'login',
            ip_address VARCHAR(50),
            user_agent TEXT,
            success BOOLEAN DEFAULT true,
            failure_reason VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);
          CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(created_at);
        END IF;
        -- Payment cancellation support
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='cancellation_reason') THEN
          ALTER TABLE payments ADD COLUMN cancellation_reason TEXT;
        END IF;
        -- Cancellation requests for approval workflow
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cancellation_requests') THEN
          CREATE TABLE cancellation_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            payment_id UUID REFERENCES payments(id),
            requested_by UUID REFERENCES users(id),
            reason TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            type VARCHAR(20) DEFAULT 'cancel',
            replacement_payment_id UUID REFERENCES payments(id),
            reviewed_by UUID REFERENCES users(id),
            reviewed_at TIMESTAMPTZ,
            rejection_reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cancellation_requests' AND column_name='updated_at') THEN
          ALTER TABLE cancellation_requests ADD COLUMN updated_at TIMESTAMPTZ;
        END IF;
        -- Cashier shifts (formerly cashier_sessions, enhanced)
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cashier_sessions') THEN
          CREATE TABLE cashier_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            branch_id UUID REFERENCES branches(id),
            opened_at TIMESTAMPTZ DEFAULT NOW(),
            closed_at TIMESTAMPTZ,
            opening_float NUMERIC(15,2) DEFAULT 0,
            expected_cash NUMERIC(15,2) DEFAULT 0,
            actual_cash NUMERIC(15,2),
            over_short NUMERIC(15,2) DEFAULT 0,
            cash_collected NUMERIC(15,2) DEFAULT 0,
            non_cash_collected NUMERIC(15,2) DEFAULT 0,
            cash_disbursed NUMERIC(15,2) DEFAULT 0,
            status VARCHAR(20) DEFAULT 'open',
            approved_by UUID REFERENCES users(id),
            approved_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_cashier_sessions_user ON cashier_sessions(user_id);
          CREATE INDEX IF NOT EXISTS idx_cashier_sessions_status ON cashier_sessions(status);
        END IF;
        -- Rename starting_cash to opening_float if old column still exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_sessions' AND column_name='starting_cash') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_sessions' AND column_name='opening_float') THEN
          ALTER TABLE cashier_sessions RENAME COLUMN starting_cash TO opening_float;
        END IF;
        -- Cash transactions (auto-recorded from payments, disbursements, etc.)
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cash_transactions') THEN
          CREATE TABLE cash_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            shift_id UUID REFERENCES cashier_sessions(id) NOT NULL,
            loan_id UUID REFERENCES loans(id),
            borrower_id UUID REFERENCES borrowers(id),
            payment_id UUID REFERENCES payments(id),
            transaction_type VARCHAR(30) NOT NULL,
            direction VARCHAR(3) NOT NULL CHECK (direction IN ('in','out')),
            amount NUMERIC(15,2) NOT NULL,
            payment_method VARCHAR(30),
            reference_number VARCHAR(100),
            receipt_number VARCHAR(100),
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by UUID REFERENCES users(id) NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_ct_shift ON cash_transactions(shift_id);
          CREATE INDEX IF NOT EXISTS idx_ct_created ON cash_transactions(created_at);
          CREATE INDEX IF NOT EXISTS idx_ct_type ON cash_transactions(transaction_type);
        END IF;
        -- Cash counts (denomination breakdown)
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cash_counts') THEN
          CREATE TABLE cash_counts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            shift_id UUID REFERENCES cashier_sessions(id) NOT NULL,
            counted_at TIMESTAMPTZ DEFAULT NOW(),
            denominations JSONB NOT NULL DEFAULT '{}',
            total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
            notes TEXT,
            created_by UUID REFERENCES users(id) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_cc_shift ON cash_counts(shift_id);
        END IF;
        -- Cash reconciliations
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cash_reconciliations') THEN
          CREATE TABLE cash_reconciliations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            shift_id UUID REFERENCES cashier_sessions(id) NOT NULL,
            count_id UUID REFERENCES cash_counts(id),
            expected_cash NUMERIC(15,2) NOT NULL,
            actual_cash NUMERIC(15,2) NOT NULL,
            variance NUMERIC(15,2) NOT NULL DEFAULT 0,
            variance_type VARCHAR(10) NOT NULL DEFAULT 'balanced',
            variance_reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            reviewed_by UUID REFERENCES users(id),
            reviewed_at TIMESTAMPTZ,
            review_notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_cr_shift ON cash_reconciliations(shift_id);
          CREATE INDEX IF NOT EXISTS idx_cr_status ON cash_reconciliations(status);
        END IF;
        -- Approval history
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='approval_history') THEN
          CREATE TABLE approval_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            shift_id UUID REFERENCES cashier_sessions(id),
            reconciliation_id UUID REFERENCES cash_reconciliations(id),
            action VARCHAR(30) NOT NULL,
            performed_by UUID REFERENCES users(id) NOT NULL,
            comments TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_ah_shift ON approval_history(shift_id);
        END IF;
        -- Add updated_at to tables created without it (BaseRepository.update requires it)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_reconciliations' AND column_name='updated_at') THEN
          ALTER TABLE cash_reconciliations ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_history' AND column_name='updated_at') THEN
          ALTER TABLE approval_history ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        -- Cash variance threshold setting
        INSERT INTO system_settings (key, value, description) VALUES ('cash_variance_threshold', '500', 'Auto-approve variances within this amount (PHP)')
        ON CONFLICT (key) DO NOTHING;
        -- Soft delete for loan applications
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loan_applications' AND column_name='deleted_at') THEN
          ALTER TABLE loan_applications ADD COLUMN deleted_at TIMESTAMPTZ;
        END IF;
        -- Previous balance deduction on loan release
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loan_applications' AND column_name='previous_balance') THEN
          ALTER TABLE loan_applications ADD COLUMN previous_balance NUMERIC(15,2) DEFAULT 0;
        END IF;
        -- Cash Pick-up: collector remittance tracking
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='collector_id') THEN
          ALTER TABLE payments ADD COLUMN collector_id UUID REFERENCES users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='remittance_status') THEN
          ALTER TABLE payments ADD COLUMN remittance_status VARCHAR(20) DEFAULT 'direct';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='remitted_at') THEN
          ALTER TABLE payments ADD COLUMN remitted_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='collector_pickups') THEN
          CREATE TABLE collector_pickups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pickup_number VARCHAR(20) NOT NULL,
            collector_id UUID REFERENCES users(id) NOT NULL,
            cashier_id UUID REFERENCES users(id) NOT NULL,
            total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_cp_collector ON collector_pickups(collector_id);
          CREATE INDEX IF NOT EXISTS idx_cp_cashier ON collector_pickups(cashier_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pickup_denominations') THEN
          CREATE TABLE pickup_denominations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pickup_id UUID REFERENCES collector_pickups(id) NOT NULL,
            denomination NUMERIC(10,2) NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            amount NUMERIC(15,2) NOT NULL DEFAULT 0
          );
          CREATE INDEX IF NOT EXISTS idx_pd_pickup ON pickup_denominations(pickup_id);
        END IF;
      END $$;
    `);

    // Second block: pickup_id FK after collector_pickups table exists
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='pickup_id') THEN
          ALTER TABLE payments ADD COLUMN pickup_id UUID REFERENCES collector_pickups(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='advance_amount') THEN
          ALTER TABLE payments ADD COLUMN advance_amount NUMERIC(15,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='advance_balance') THEN
          ALTER TABLE loans ADD COLUMN advance_balance NUMERIC(15,2) DEFAULT 0;
        END IF;
        -- Idempotency keys for payment deduplication
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='idempotency_keys') THEN
          CREATE TABLE idempotency_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key TEXT NOT NULL UNIQUE,
            response_status INTEGER NOT NULL,
            response_body JSONB NOT NULL,
            created_by UUID REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
          );
          CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(key);
        END IF;
      END $$;
    `);

    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
};

runMigrations();
