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
  const shift = await cashierSessionRepo.findOne({ user_id: params.userId, status: 'open' });
  if (!shift) throw new Error('No open shift found. Open a shift first.');

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

  const delta = params.direction === 'in' ? params.amount : -params.amount;
  await cashierSessionRepo.query(
    `UPDATE cashier_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
    [delta, shift.id]
  );

  return txn;
}
