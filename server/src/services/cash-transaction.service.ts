import { cashTransactionRepo, cashierSessionRepo } from '../repositories';

export async function autoRecordTransaction(params: {
  userId: string;
  loanId?: string;
  borrowerId?: string;
  paymentId?: string;
  transactionType: string;
  direction: 'in' | 'out';
  amount: number;
  paymentMethod?: string;
  referenceNumber?: string;
  receiptNumber?: string;
  description?: string;
}) {
  try {
    let shift = await cashierSessionRepo.findOne({ user_id: params.userId, status: 'open' });

    // Auto-open a shift if none exists
    if (!shift) {
      shift = await cashierSessionRepo.create({
        user_id: params.userId,
        opening_float: 0,
        expected_cash: 0,
        status: 'open',
      });
    }

    const txn = await cashTransactionRepo.create({
      shift_id: shift.id,
      loan_id: params.loanId || null,
      borrower_id: params.borrowerId || null,
      payment_id: params.paymentId || null,
      transaction_type: params.transactionType,
      direction: params.direction,
      amount: params.amount,
      payment_method: params.paymentMethod || 'cash',
      reference_number: params.referenceNumber || null,
      receipt_number: params.receiptNumber || null,
      description: params.description || null,
      created_by: params.userId,
    });

    // Update shift expected cash in real time
    const delta = params.direction === 'in' ? params.amount : -params.amount;
    await cashierSessionRepo.query(
      `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
      [delta, shift.id]
    );

    return txn;
  } catch (err) {
    // Best-effort: don't let transaction recording fail the main operation
    console.error('Failed to auto-record cash transaction:', err);
  }
}
