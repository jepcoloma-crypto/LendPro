const { Client } = require("pg");
const prod = new Client({
  host: "db.hzrxiimkiddugfcibwgx.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "4FKuCgyXsuwNK9nO",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await prod.connect();

  // Find latest reconciliations with variance
  const recs = await prod.query(`
    SELECT cr.id, cr.shift_id, cr.expected_cash, cr.actual_cash, cr.variance, cr.variance_reason, cr.created_at,
           cs.opened_at, cs.closed_at, cs.opening_float, cs.expected_cash as shift_expected,
           CONCAT(u.first_name, ' ', u.last_name) as cashier_name,
           b.name as branch_name
    FROM cash_reconciliations cr
    JOIN cashier_sessions cs ON cs.id = cr.shift_id
    JOIN users u ON u.id = cs.user_id
    LEFT JOIN branches b ON b.id = cs.branch_id
    ORDER BY cr.created_at DESC
    LIMIT 10
  `);
  console.log("=== RECENT RECONCILIATIONS ===");
  for (const r of recs.rows) {
    console.log(`\nID: ${r.id} | Shift: ${r.shift_id}`);
    console.log(`Cashier: ${r.cashier_name} | Branch: ${r.branch_name}`);
    console.log(`Opened: ${r.opened_at} | Closed: ${r.closed_at}`);
    console.log(`Opening Float: ${r.opening_float} | Expected: ${r.expected_cash} | Actual: ${r.actual_cash} | Variance: ${r.variance}`);
    console.log(`Variance Reason: ${r.variance_reason || '(none)'}`);
    console.log(`Created: ${r.created_at}`);
  }

  // Get transactions for the shift with the largest absolute variance
  if (recs.rows.length > 0) {
    const target = recs.rows.reduce((min, r) => Math.abs(parseFloat(r.variance)) > Math.abs(parseFloat(min.variance)) ? r : min);
    console.log(`\n\n=== TRANSACTIONS FOR SHIFT ${target.shift_id} (variance: ${target.variance}) ===`);
    const txns = await prod.query(`
      SELECT ct.id, ct.transaction_type, ct.direction, ct.amount, ct.payment_method, ct.payment_id,
             ct.created_at, ct.description,
             CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM cash_transactions ct
      LEFT JOIN users u ON u.id = ct.created_by
      WHERE ct.shift_id = $1
      ORDER BY ct.created_at ASC
    `, [target.shift_id]);
    let totalIn = 0, totalOut = 0;
    for (const t of txns.rows) {
      console.log(`${t.created_at} | ${t.transaction_type} | ${t.direction} | ${t.amount} | ${t.payment_method || '-'} | ${t.description || ''} | by: ${t.created_by_name || '-'}`);
      if (t.direction === 'in') totalIn += parseFloat(t.amount);
      else totalOut += parseFloat(t.amount);
    }
    console.log(`\nTotal In: ${totalIn} | Total Out: ${totalOut} | Net: ${totalIn - totalOut}`);
    console.log(`Opening Float: ${target.opening_float}`);
    console.log(`Expected (float + net): ${parseFloat(target.opening_float) + totalIn - totalOut}`);
    
    // Check pickups
    const pickups = await prod.query(`
      SELECT cp.id, cp.pickup_number, cp.total_amount, cp.created_at,
             CONCAT(cu.first_name, ' ', cu.last_name) as collector_name
      FROM collector_pickups cp
      JOIN users cu ON cu.id = cp.collector_id
      WHERE cp.shift_id = $1
      ORDER BY cp.created_at ASC
    `, [target.shift_id]);
    console.log(`\n=== PICKUPS FOR SHIFT ===`);
    let totalPickups = 0;
    for (const p of pickups.rows) {
      console.log(`${p.pickup_number} | ${p.total_amount} | ${p.created_at} | collector: ${p.collector_name}`);
      totalPickups += parseFloat(p.total_amount);
    }
    console.log(`Total Pickups: ${totalPickups}`);
    console.log(`\nShift expected_cash: ${target.shift_expected}`);
    console.log(`Reconciliation expected_cash: ${target.expected_cash}`);

    // Also get all payments in this shift to compare
    const payments = await prod.query(`
      SELECT p.payment_number, p.amount, p.payment_method, p.created_at,
             CONCAT(u.first_name, ' ', u.last_name) as collector_name
      FROM payments p
      LEFT JOIN users u ON u.id = p.collector_id
      WHERE p.shift_id = $1 AND p.status != 'cancelled'
      ORDER BY p.created_at ASC
    `, [target.shift_id]);
    console.log(`\n=== PAYMENTS IN SHIFT ===`);
    let totalPayments = 0;
    let collPayments = 0;
    for (const p of payments.rows) {
      console.log(`${p.payment_number} | ${p.amount} | ${p.payment_method} | ${p.created_at} | collector: ${p.collector_name || 'direct'}`);
      totalPayments += parseFloat(p.amount);
      if (p.collector_name) collPayments += parseFloat(p.amount);
    }
    console.log(`Total Payments: ${totalPayments}`);
    console.log(`Collector Payments: ${collPayments}`);
    console.log(`Direct Payments: ${totalPayments - collPayments}`);
  }

  await prod.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
