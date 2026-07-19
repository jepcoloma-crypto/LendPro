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
  // Find loans past maturity with balance > 0 but all schedules fully paid
  const { rows } = await prod.query(`
    SELECT l.loan_number, l.outstanding_balance, l.maturity_date, l.status,
           CONCAT(b.first_name, ' ', b.last_name) as borrower_name
    FROM loans l
    JOIN borrowers b ON b.id = l.borrower_id
    WHERE l.maturity_date < CURRENT_DATE
      AND l.outstanding_balance > 0
      AND l.status NOT IN ('closed', 'written-off', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM amortization_schedules a
        WHERE a.loan_id = l.id
          AND COALESCE(a.paid_amount, 0) < a.total_due
      )
    ORDER BY l.maturity_date DESC
  `);
  console.log("Loans past maturity, balance > 0, all schedules paid:");
  console.log(JSON.stringify(rows, null, 2));
  console.log(`\nTotal: ${rows.length}`);

  if (rows.length > 0) {
    console.log("\nUpdating these loans to status = 'closed'...");
    for (const r of rows) {
      await prod.query("UPDATE loans SET status = 'closed' WHERE loan_number = $1", [r.loan_number]);
      console.log(`  Closed ${r.loan_number} (balance: ${r.outstanding_balance})`);
    }
    console.log("Done.");
  }
  await prod.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
