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
