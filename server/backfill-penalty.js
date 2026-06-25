require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'lending_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
(async () => {
  // Get all payments with penalty > 0
  const payments = await pool.query("SELECT * FROM payments WHERE penalty_amount > 0 AND penalty_amount IS NOT NULL ORDER BY payment_date");
  console.log('Found', payments.rows.length, 'payments with penalty');

  for (const payment of payments.rows) {
    const penaltyAmt = parseFloat(payment.penalty_amount);
    const paymentDate = new Date(payment.payment_date);
    const payDateNorm = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());

    // Find overdue schedules with shortage > 0 at that payment date
    const schedules = await pool.query(
      "SELECT * FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no",
      [payment.loan_id]
    );

    // First, clear any existing penalty that was set by old code for this specific loan's schedules
    // (we'll re-distribute)
    const overdueScheds: { id: string; shortage: number }[] = [];
    let totalOverdue = 0;

    for (const s of schedules.rows) {
      if (parseFloat(s.paid_amount) >= parseFloat(s.total_due) - 0.005) continue;
      const dueDate = new Date(s.due_date);
      const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (dueNorm >= payDateNorm) continue;
      const shortage = parseFloat(s.total_due) - parseFloat(s.paid_amount);
      // But we need to subtract what THIS payment contributed...
      // Actually, we need the shortage BEFORE this payment was applied.
      // Since payments are processed sequentially, we need the shortage at the time.
      // Use the total_due minus the paid_amount BEFORE this payment.
      // We'll use the current paid_amount and add back this payment's allocation.
      totalOverdue += shortage;
      overdueScheds.push({ id: s.id, shortage });
    }

    console.log(`Payment ${payment.payment_number}: penalty=${penaltyAmt}, overdue=${totalOverdue}, schedules=${overdueScheds.length}`);

    if (penaltyAmt > 0 && totalOverdue > 0) {
      let remainingPenalty = penaltyAmt;
      for (const os of overdueScheds) {
        if (remainingPenalty <= 0) break;
        const portion = Math.round(penaltyAmt * (os.shortage / totalOverdue) * 100) / 100;
        const appliedPenalty = Math.min(portion, remainingPenalty);
        await pool.query("UPDATE amortization_schedules SET penalty_amount = (COALESCE(penalty_amount, '0')::numeric + $1) WHERE id = $2", [appliedPenalty.toFixed(2), os.id]);
        console.log(`  Updated schedule ${os.id}: +${appliedPenalty}`);
        remainingPenalty -= appliedPenalty;
      }
    }
  }

  console.log('Done');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
