import app from './app';
import { config } from './config';
import { pool } from './database/connection';
import { loadPrefixes } from './utils/prefixes';
import { cronService } from './services/cron.service';

const startServer = async () => {
  let dbConnected = false;
  try {
    await pool.query('SELECT NOW()');
    dbConnected = true;
    await loadPrefixes();
    console.log('✓ Database connected successfully');
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
