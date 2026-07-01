import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';
import { pool } from '../database/connection';
import multer from 'multer';

export class UtilityController {
  async healthCheck(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const client = await pool.connect();
      const dbResult = await client.query('SELECT NOW() as time');
      const tableCounts = await client.query(
        `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
      );
      client.release();
      const counts: Record<string, number> = {};
      for (const t of tableCounts.rows) {
        const r = await pool.query(`SELECT COUNT(*) as c FROM "${t.tablename}"`);
        counts[t.tablename] = parseInt(r.rows[0].c, 10);
      }
      res.json({ success: true, data: { status: 'ok', dbTime: dbResult.rows[0].time, tableCounts: counts } });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async recalculateBalances(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const loans = await pool.query(`SELECT id, total_amount FROM loans WHERE status IN ('active', 'delinquent')`);
      let updated = 0;
      for (const loan of loans.rows) {
        const payResult = await pool.query(
          `SELECT COALESCE(SUM(amount - COALESCE(penalty_amount, 0)), 0) as total_paid
           FROM payments WHERE loan_id = $1 AND status = 'completed'`,
          [loan.id]
        );
        const totalPaid = parseFloat(payResult.rows[0].total_paid);
        const newBalance = Math.max(0, parseFloat(loan.total_amount) - totalPaid);
        await pool.query('UPDATE loans SET outstanding_balance = $1 WHERE id = $2', [newBalance, loan.id]);
        updated++;
      }
      res.json({ success: true, message: `Updated ${updated} loan(s)` });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async applyPenalties(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const overdueSchedules = await pool.query(
        `SELECT s.id, s.loan_id, s.total_due, s.paid_amount, s.due_date,
                l.penalty_type, l.penalty_value, l.penalty_grace_period
         FROM amortization_schedules s
         JOIN loans l ON l.id = s.loan_id
         WHERE s.status IN ('pending', 'partial')
           AND s.due_date < CURRENT_DATE
           AND l.penalty_type IS NOT NULL`
      );
      let applied = 0;
      let skipped = 0;
      for (const s of overdueSchedules.rows) {
        const paid = parseFloat(s.paid_amount) || 0;
        const due = parseFloat(s.total_due);
        if (paid >= due - 0.005) continue;
        const gracePeriod = s.penalty_grace_period || 0;
        const daysOverdue = Math.floor((Date.now() - new Date(s.due_date).getTime()) / (1000 * 60 * 60 * 24));
        const effectiveDays = Math.max(0, daysOverdue - gracePeriod);
        if (effectiveDays <= 0) { skipped++; continue; }
        const pVal = parseFloat(s.penalty_value) || 0;
        let penalty = 0;
        if (s.penalty_type === 'fixed') penalty = pVal;
        else if (s.penalty_type === 'percentage') penalty = Math.round(due * pVal / 100 * 100) / 100;
        else if (s.penalty_type === 'daily') penalty = Math.round(due * pVal / 100 * effectiveDays * 100) / 100;
        if (penalty > 0) {
          const existing = await pool.query(
            `SELECT id FROM penalties WHERE schedule_id = $1 AND penalty_type = $2`,
            [s.id, s.penalty_type]
          );
          if (existing.rows.length === 0) {
            await pool.query(
              `INSERT INTO penalties (loan_id, schedule_id, penalty_type, amount, calculated_at)
               VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
              [s.loan_id, s.id, s.penalty_type, penalty]
            );
            await pool.query(
              `UPDATE amortization_schedules SET penalty_amount = penalty_amount + $1 WHERE id = $2`,
              [penalty, s.id]
            );
            applied++;
          } else {
            skipped++;
          }
        }
      }
      const total = applied + skipped;
      res.json({ success: true, message: `Processed ${total} overdue schedule(s): ${applied} penalty applied, ${skipped} within grace period` });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async backupDatabase(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tables = (await pool.query(
        `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      )).rows.map((r: any) => r.tablename as string);
      const total = tables.length;

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(JSON.stringify({ type: 'start', total }) + '\n');

      const allCols = (await pool.query(
        `SELECT table_name, column_name, character_maximum_length, numeric_precision, numeric_scale,
                is_nullable, column_default, udt_name
         FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
      )).rows;

      const allPK = (await pool.query(
        `SELECT kcu.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
         ORDER BY kcu.table_name, kcu.ordinal_position`
      )).rows;

      const allIdxs = (await pool.query(
        `SELECT tablename, indexdef FROM pg_catalog.pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`
      )).rows;

      const colMap: Record<string, any[]> = {};
      const pkMap: Record<string, string[]> = {};
      const idxMap: Record<string, string[]> = {};
      for (const c of allCols) (colMap[c.table_name] ??= []).push(c);
      for (const p of allPK) (pkMap[p.table_name] ??= []).push(p.column_name);
      for (const i of allIdxs) {
        if (i.indexdef.includes('_pkey') && pkMap[i.tablename]?.length) continue;
        (idxMap[i.tablename] ??= []).push(i.indexdef);
      }

      const TYPE_MAP: Record<string, string> = { int4: 'integer', int8: 'bigint', bool: 'boolean', float8: 'double precision', float4: 'real' };

      const lines: string[] = [];
      lines.push('-- LendPro Database Backup');
      lines.push(`-- Generated: ${new Date().toISOString()}`);
      lines.push('', 'SET session_replication_role = replica;', '');

      let tableIndex = 0;
      for (const tn of tables) {
        tableIndex++;
        try {
          const cols = colMap[tn] || [];
          const pks = pkMap[tn] || [];
          const idxs = idxMap[tn] || [];

          const colDefs = cols.map((c: any) => {
            let type = TYPE_MAP[c.udt_name] || c.udt_name;
            if (c.udt_name === 'varchar' && c.character_maximum_length) type = `varchar(${c.character_maximum_length})`;
            if (c.udt_name === 'numeric' && c.numeric_precision) type = `numeric(${c.numeric_precision},${c.numeric_scale || 0})`;
            const nullable = c.is_nullable === 'YES' ? '' : ' NOT NULL';
            const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
            return `  "${c.column_name}" ${type}${nullable}${def}`;
          });
          if (pks.length) colDefs.push(`  PRIMARY KEY (${pks.map((c: string) => `"${c}"`).join(', ')})`);
          lines.push(`CREATE TABLE IF NOT EXISTS "${tn}" (`);
          for (let i = 0; i < colDefs.length; i++) lines.push(i < colDefs.length - 1 ? colDefs[i] + ',' : colDefs[i]);
          lines.push(');', '');
          for (const idx of idxs) lines.push(idx + ';', '');
          for (const s of cols.filter((c: any) => c.column_default?.includes('nextval'))) {
            const seqName = s.column_default.match(/nextval\('([^']+)'/)?.[1];
            if (seqName) lines.push(`SELECT setval('${seqName}', COALESCE((SELECT MAX("${s.column_name}") FROM "${tn}"), 1));`, '');
          }

          const data = await pool.query(`SELECT * FROM "${tn}"`);
          if (data.rows.length) {
            const colNames = Object.keys(data.rows[0]).map((k) => `"${k}"`).join(', ');
            const CHUNK = 100;
            for (let i = 0; i < data.rows.length; i += CHUNK) {
              const chunk = data.rows.slice(i, i + CHUNK);
              const rowsSql = chunk.map((row: any) => {
                const vals = Object.keys(row).map((k) => {
                  const v = row[k];
                  if (v === null || v === undefined) return 'NULL';
                  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
                  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
                  if (v instanceof Date) return `'${v.toISOString()}'`;
                  if (typeof v === 'object') return `'${JSON.stringify(v)}'::jsonb`;
                  return String(v);
                });
                return `(${vals.join(', ')})`;
              });
              lines.push(`INSERT INTO "${tn}" (${colNames}) VALUES`);
              lines.push(rowsSql.join(',\n') + ';');
            }
          }
          lines.push('');
        } catch (tableErr: any) {
          lines.push(`-- SKIPPED "${tn}": ${tableErr.message}`, '');
        }
        res.write(JSON.stringify({ type: 'progress', current: tableIndex, total, table: tn }) + '\n');
      }

      lines.push('SET session_replication_role = origin;', '');
      const sql = lines.join('\n');
      const filename = `lendpro-backup-${new Date().toISOString().slice(0, 10)}.sql`;
      res.write(JSON.stringify({ type: 'file', content: Buffer.from(sql).toString('base64'), filename }) + '\n');
      res.end();
    } catch (error: any) {
      res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
      res.end();
    }
  }

  async restoreDatabase(req: AuthRequest, res: Response, next: NextFunction) {
    let client: any = null;
    try {
      if (!req.file || !req.file.buffer) throw new Error('No backup file provided');
      const sql = req.file.buffer.toString('utf-8');
      if (!sql.includes('-- LendPro Database Backup')) throw new Error('Invalid backup file: missing LendPro header');

      // Get all public table names for truncation
      const allTables = (await pool.query(
        `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      )).rows.map((r: any) => r.tablename as string);

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Split SQL into individual statements by semicolon.
      // The LEADING comments (-- LendPro Database Backup, etc.) are grouped
      // with `SET session_replication_role = replica` in the first element,
      // so we can't just filter by s.startsWith('--').
      const rawParts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      const statements: string[] = [];
      for (const part of rawParts) {
        // Skip pure comment blocks
        if (/^--/.test(part.replace(/\n/g, ' ').trim())) continue;
        // Remove leading comment lines before the actual SQL
        const cleaned = part.replace(/^-- .*\n?/gm, '').trim();
        if (cleaned.length > 0) statements.push(cleaned);
      }
      const totalStmts = statements.length;

      res.write(JSON.stringify({ type: 'start', total: totalStmts }) + '\n');

      // Disable triggers on all tables (DDL — persists across connections)
      for (const tn of allTables) {
        try { await pool.query(`ALTER TABLE "${tn}" DISABLE TRIGGER ALL`); } catch {}
      }

      // Truncate all tables in reverse order with CASCADE
      for (const tn of [...allTables].reverse()) {
        try { await pool.query(`TRUNCATE TABLE "${tn}" CASCADE`); } catch {}
      }

      // Execute ALL statements on ONE dedicated connection so that
      // `SET session_replication_role = replica` is active for every INSERT.
      // Each statement is executed individually with try/catch so that
      // "CREATE INDEX" failures DON'T roll back succeeded INSERTs.
      client = await pool.connect();
      // Also try setting replica role directly on this same connection
      try { await client.query(`SET session_replication_role = replica`); } catch {}
      let executed = 0;
      let skipped = 0;
      let firstError: string | null = null;
      for (const stmt of statements) {
        try { await client.query(stmt); executed++; }
        catch (e: any) {
          skipped++;
          if (!firstError) firstError = e.message;
        }
        res.write(JSON.stringify({ type: 'progress', current: executed + skipped, total: totalStmts }) + '\n');
      }

      // Re-enable triggers
      for (const tn of allTables) {
        try { await pool.query(`ALTER TABLE "${tn}" ENABLE TRIGGER ALL`); } catch {}
      }

      // Check if essential tables are empty and auto-seed (dev only)
      const userCount = await pool.query(`SELECT COUNT(*) as c FROM users`);
      const roleCount = await pool.query(`SELECT COUNT(*) as c FROM roles`);
      if (config.nodeEnv === 'development' && (parseInt(userCount.rows[0].c) === 0 || parseInt(roleCount.rows[0].c) === 0)) {
        res.write(JSON.stringify({ type: 'progress_note', message: 'Essential tables empty. Running seed...' }) + '\n');
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('admin123', 12);

        await pool.query(`INSERT INTO roles (name, slug, description, permissions) VALUES
          ('Super Admin', 'super-admin', 'Full system access', '["*"]'::jsonb),
          ('Admin', 'admin', 'Access all modules except users and settings', '["*"]'::jsonb),
          ('Branch Manager', 'branch-manager', 'Manage branch operations', '["loans.approve","reports.view","staff.manage","borrowers.view","payments.view"]'::jsonb),
          ('Loan Officer', 'loan-officer', 'Process loan applications', '["borrowers.create","borrowers.edit","applications.create","applications.submit","documents.upload","borrowers.view"]'::jsonb),
          ('Credit Investigator', 'credit-investigator', 'Verify and assess applications', '["applications.view","applications.verify","applications.assess"]'::jsonb),
          ('Cashier', 'cashier', 'Accept payments', '["payments.create","payments.view","receipts.generate"]'::jsonb),
          ('Collector', 'collector', 'Field collections', '["collections.view","collections.manage","visits.create"]'::jsonb),
          ('Borrower', 'borrower', 'Self-service portal', '["portal.view","portal.loans","portal.payments","portal.statements"]'::jsonb)
        ON CONFLICT (slug) DO NOTHING`);

        const branchResult = await pool.query(`SELECT id FROM branches LIMIT 1`);
        const branchId = branchResult.rows[0]?.id;

        const adminRole = await pool.query(`SELECT id FROM roles WHERE slug = 'super-admin'`);
        const managerRole = await pool.query(`SELECT id FROM roles WHERE slug = 'branch-manager'`);
        const officerRole = await pool.query(`SELECT id FROM roles WHERE slug = 'loan-officer'`);
        const investigatorRole = await pool.query(`SELECT id FROM roles WHERE slug = 'credit-investigator'`);
        const cashierRole = await pool.query(`SELECT id FROM roles WHERE slug = 'cashier'`);
        const collectorRole = await pool.query(`SELECT id FROM roles WHERE slug = 'collector'`);

        await pool.query(`INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, branch_id) VALUES
          ('admin', 'admin@lending.com', $1, 'Super', 'Admin', $2, $3),
          ('manager', 'manager@lending.com', $1, 'Juan', 'Dela Cruz', $4, $3),
          ('officer', 'officer@lending.com', $1, 'Maria', 'Santos', $5, $3),
          ('investigator', 'investigator@lending.com', $1, 'Pedro', 'Reyes', $6, $7),
          ('cashier', 'cashier@lending.com', $1, 'Ana', 'Garcia', $8, $3),
          ('collector', 'collector@lending.com', $1, 'Jose', 'Mercado', $9, $3)
        ON CONFLICT (email) DO NOTHING`,
        [hash, adminRole.rows[0]?.id, branchId, managerRole.rows[0]?.id,
         officerRole.rows[0]?.id, investigatorRole.rows[0]?.id, branchId,
         cashierRole.rows[0]?.id, collectorRole.rows[0]?.id]);
      }

      const note = firstError ? ` First error: ${firstError}` : '';
      res.write(JSON.stringify({ type: 'complete', message: `Restore complete: ${executed} executed, ${skipped} skipped.${note}` }) + '\n');
      res.end();
    } catch (error: any) {
      try { res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n'); res.end(); } catch {}
    } finally {
      if (client) client.release();
    }
  }

  async getLoginHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { userId, limit = '100' } = req.query;
      let where = '';
      const params: any[] = [];
      let idx = 1;
      if (userId) { where = `WHERE lh.user_id = $${idx++}`; params.push(userId); }
      const rows = await pool.query(
        `SELECT lh.*, u.first_name || ' ' || u.last_name as user_name
         FROM login_history lh
         LEFT JOIN users u ON u.id = lh.user_id
         ${where} ORDER BY lh.created_at DESC LIMIT $${idx++}`,
        [...params, parseInt(limit as string)]
      );
      res.json({ success: true, data: rows.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async clearOperationalData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { modules } = req.body;
      if (!modules || !Array.isArray(modules) || modules.length === 0) {
        throw new Error('Select at least one module to clear');
      }

      const MODULE_TABLES: Record<string, string[]> = {
        borrowers: ['borrower_documents', 'co_makers', 'borrowers'],
        applications: ['application_documents', 'loan_approvals', 'loan_applications'],
        loans: ['loan_charges', 'penalties', 'amortization_schedules', 'loan_disbursements', 'loans'],
        payments: ['payment_allocations', 'payments'],
        cashier: ['approval_history', 'cash_reconciliations', 'cash_counts', 'cash_transactions', 'cashier_sessions', 'operating_expenses', 'other_income'],
        collections: ['collection_visits', 'collections'],
        reports: ['audit_logs', 'notifications', 'email_logs', 'sms_logs'],
      };

      // Order matters — child tables before parents
      const TABLE_ORDER: Record<string, number> = {};
      const allTables = Object.values(MODULE_TABLES).flat();
      allTables.forEach((t, i) => { TABLE_ORDER[t] = i; });

      const tablesToClear = new Set<string>();
      for (const mod of modules) {
        const tbls = MODULE_TABLES[mod];
        if (tbls) tbls.forEach((t: string) => tablesToClear.add(t));
      }

      const sorted = [...tablesToClear].sort((a, b) => (TABLE_ORDER[a] || 0) - (TABLE_ORDER[b] || 0));

      for (const t of sorted) {
        await pool.query('TRUNCATE TABLE ' + t + ' CASCADE');
      }

      res.json({
        success: true,
        message: `Cleared data for: ${modules.join(', ')} (${sorted.length} tables truncated). Users, roles, products, charges, settings preserved.`
      });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const utilityController = new UtilityController();
