import { pool } from './connection';

const clearData = async () => {
  const client = await pool.connect();
  try {
    const tables = [
      'collection_visits', 'collections', 'payment_allocations', 'payments',
      'penalties', 'penalty_rules', 'amortization_schedules', 'loan_disbursements',
      'loans', 'loan_approvals', 'application_documents', 'loan_applications',
      'co_makers', 'borrower_documents', 'borrowers',
      'notifications', 'email_logs', 'sms_logs', 'audit_logs',
    ];
    for (const t of tables) {
      await client.query('TRUNCATE TABLE ' + t + ' CASCADE');
    }
    console.log('Cleared all data. Users, roles, products, branches, settings preserved.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

clearData();
