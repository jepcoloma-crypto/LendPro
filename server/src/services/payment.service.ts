import { paymentRepo, amortizationScheduleRepo, loanRepo, collectionRepo, paymentAllocationRepo } from '../repositories';
import { generatePaymentNumber, generateReceiptNumber } from '../utils/helpers';
import { pool } from '../database/connection';

export class PaymentService {
  async receivePayment(data: any, userId: string) {
    const loan = await loanRepo.findById(data.loanId);
    if (!loan) throw new Error('Loan not found');
    if (loan.status === 'closed') throw new Error('Loan is already closed');

    const paymentNumber = generatePaymentNumber();
    const receiptNumber = generateReceiptNumber();
    const outstandingBalance = parseFloat(loan.outstanding_balance);
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) throw new Error('Invalid payment amount');
    if (amount > outstandingBalance) {
      throw new Error(`Payment amount (${amount.toFixed(2)}) exceeds outstanding balance (${outstandingBalance.toFixed(2)}). Reduce the payment amount.`);
    }

    if (data.allocations && Array.isArray(data.allocations) && data.allocations.length > 0) {
      return this.receiveWithAllocations(data, loan, userId, paymentNumber, receiptNumber);
    }

    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();

    // Direct query — no unnecessary COUNT
    const { rows: schedules } = await pool.query(
      `SELECT * FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no ASC`,
      [data.loanId]
    );

    let totalOverdue = 0;
    const paymentDateNorm = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
    for (const s of schedules) {
      if (parseFloat(s.paid_amount) >= parseFloat(s.total_due) - 0.005) continue;
      const dueDate = new Date(s.due_date);
      const dueDateNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (dueDateNorm >= paymentDateNorm) continue;
      totalOverdue += parseFloat(s.total_due) - parseFloat(s.paid_amount);
    }

    let penaltyAmount = 0;

    if (data.waivePenalty === true || data.waivePenalty === 'true') {
      // penalty waived by user
    } else {
      const pValue = parseFloat(loan.penalty_value) || 0;
      const maturedValue = parseFloat(loan.penalty_matured_value) || 0;

      if (totalOverdue > 0) {
        const maturityDate = loan.maturity_date ? new Date(loan.maturity_date) : null;
        if (maturityDate && paymentDateNorm > new Date(maturityDate.getFullYear(), maturityDate.getMonth(), maturityDate.getDate())) {
          const daysPast = Math.floor((paymentDateNorm.getTime() - new Date(maturityDate.getFullYear(), maturityDate.getMonth(), maturityDate.getDate()).getTime()) / (1000 * 60 * 60 * 24));
          const monthsPast = daysPast / 30;
          penaltyAmount = Math.round(totalOverdue * (maturedValue / 100) * monthsPast * 100) / 100;
        } else if (pValue > 0) {
          penaltyAmount = Math.round(totalOverdue * (pValue / 100) * 100) / 100;
        }
      }
    }

    const netForSchedules = Math.max(0, amount - penaltyAmount);

    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalAllocated = 0;

    // Compute allocations and principal/interest split
    const allocs: { schedule: any; amount: number; principal: number; interest: number }[] = [];
    let allocRemaining = netForSchedules;
    for (const schedule of schedules) {
      if (allocRemaining <= 0) break;
      const currentPaid = parseFloat(schedule.paid_amount);
      const totalDue = parseFloat(schedule.total_due);
      const shortage = Math.max(0, totalDue - currentPaid);
      if (shortage <= 0) continue;

      const applied = Math.min(allocRemaining, shortage);
      const schedPrincipal = parseFloat(schedule.principal);
      const schedInterest = parseFloat(schedule.interest);
      const schedTotal = schedPrincipal + schedInterest;
      const interestPortion = schedTotal > 0 ? Math.round(applied * schedInterest / schedTotal * 100) / 100 : 0;
      const principalPortion = applied - interestPortion;

      allocs.push({ schedule, amount: applied, principal: principalPortion, interest: interestPortion });
      totalPrincipal += principalPortion;
      totalInterest += interestPortion;
      totalAllocated += applied;
      allocRemaining -= applied;
    }

    const advanceAmount = Math.max(0, allocRemaining);
    totalPrincipal = Math.round(totalPrincipal * 100) / 100;
    totalInterest = Math.round(totalInterest * 100) / 100;

    // Execute all writes in a single transaction
    const writeClient = await pool.connect();
    try {
      await writeClient.query('SET search_path TO public');
      await writeClient.query('BEGIN');

      // Batch penalty updates — single query instead of N individual round-trips
      if (penaltyAmount > 0 && totalOverdue > 0) {
        let remainingPenalty = penaltyAmount;
        const penaltyRows: { id: string; applied: number }[] = [];
        for (const s of schedules) {
          if (remainingPenalty <= 0) break;
          if (parseFloat(s.paid_amount) >= parseFloat(s.total_due) - 0.005) continue;
          const dueDate = new Date(s.due_date);
          const dueDateNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          if (dueDateNorm >= paymentDateNorm) continue;
          const shortage = parseFloat(s.total_due) - parseFloat(s.paid_amount);
          const portion = Math.round(penaltyAmount * (shortage / totalOverdue) * 100) / 100;
          const appliedPenalty = Math.min(portion, remainingPenalty);
          penaltyRows.push({ id: s.id, applied: appliedPenalty });
          remainingPenalty -= appliedPenalty;
        }
        if (penaltyRows.length > 0) {
          const flatValues = penaltyRows.flatMap(r => [r.id, r.applied]);
          const placeholders = penaltyRows.map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::numeric)`).join(',');
          await writeClient.query(
            `UPDATE amortization_schedules SET penalty_amount = penalty_amount + d.applied, updated_at = NOW() FROM (VALUES ${placeholders}) AS d(id, applied) WHERE id = d.id`,
            flatValues
          );
        }
      }

      const { rows: [payment] } = await writeClient.query(
        `INSERT INTO payments (payment_number, loan_id, borrower_id, amount, principal_amount, interest_amount, penalty_amount, advance_amount, payment_method, reference_number, payment_date, received_by, receipt_number, notes, status, collector_id, remittance_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'completed',$14,$15,$16) RETURNING *`,
        [paymentNumber, data.loanId, loan.borrower_id, netForSchedules + penaltyAmount, totalPrincipal, totalInterest, penaltyAmount, advanceAmount,
         data.paymentMethod || 'cash', data.referenceNumber || null, data.paymentDate || new Date(), userId, receiptNumber,
         data.notes || null, data.collectorId || null, data.collectorId ? 'pending' : 'direct']
      );

      // Track updated statuses in-memory to avoid re-fetch later
      const updatedStatuses = new Map<string, { paid_amount: number; status: string }>();
      for (const schedule of schedules) {
        updatedStatuses.set(schedule.id, { paid_amount: parseFloat(schedule.paid_amount), status: schedule.status });
      }

      for (const alloc of allocs) {
        const schedule = alloc.schedule;
        const curState = updatedStatuses.get(schedule.id)!;
        const newPaid = curState.paid_amount + alloc.amount;
        const totalDue = parseFloat(schedule.total_due);
        const newStatus = newPaid >= totalDue - 0.005 ? 'paid' : (newPaid > 0 ? 'partial' : schedule.status);
        curState.paid_amount = newPaid;
        curState.status = newStatus;

        await writeClient.query(
          `UPDATE amortization_schedules SET paid_amount = $1, status = $2, paid_at = $3, updated_at = NOW() WHERE id = $4`,
          [newPaid, newStatus, newStatus === 'paid' ? paymentDate : null, schedule.id]
        );

        await writeClient.query(
          `INSERT INTO payment_allocations (payment_id, schedule_id, amount, allocated_to) VALUES ($1,$2,$3,'principal')`,
          [payment.id, schedule.id, alloc.amount]
        );
      }

      const netReduction = totalAllocated + advanceAmount;
      const newBalance = Math.max(0, outstandingBalance - netReduction);
      let curAdvance = parseFloat(loan.advance_balance || '0');
      if (advanceAmount > 0) curAdvance += advanceAmount;
      await writeClient.query(
        `UPDATE loans SET outstanding_balance = $1, advance_balance = $2, updated_at = NOW() WHERE id = $3`,
        [newBalance, curAdvance, data.loanId]
      );

      // Use in-memory tracking instead of re-fetching schedules
      const allPaid = [...updatedStatuses.values()].every(s => s.status === 'paid');
      if (allPaid || newBalance <= 0) {
        await writeClient.query(
          `UPDATE loans SET status = 'closed', outstanding_balance = 0, next_payment_date = NULL, updated_at = NOW() WHERE id = $1`,
          [data.loanId]
        );
        await writeClient.query(
          `UPDATE collections SET status = 'closed' WHERE id = $1`,
          [loan.id]
        );
      } else {
        const nextPending = schedules.find(s => {
          const st = updatedStatuses.get(s.id)!;
          return st.status === 'pending' || (st.status === 'partial' && st.paid_amount < parseFloat(s.total_due) - 0.005);
        });
        if (nextPending) {
          await writeClient.query(
            `UPDATE loans SET next_payment_date = $1, updated_at = NOW() WHERE id = $2`,
            [nextPending.due_date, data.loanId]
          );
        }
      }

      await writeClient.query('COMMIT');
      return payment;
    } catch (err) {
      await writeClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      writeClient.release();
    }
  }

  private async receiveWithAllocations(data: any, loan: any, userId: string, paymentNumber: string, receiptNumber: string) {
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const { rows: allSchedules } = await pool.query(
      `SELECT * FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no ASC`,
      [data.loanId]
    );
    const scheduleMap = new Map(allSchedules.map((s: any) => [s.id, s]));

    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalAllocAmount = 0;

    for (const alloc of data.allocations) {
      const allocAmount = parseFloat(alloc.amount) || 0;
      totalAllocAmount += allocAmount;
      const schedule = scheduleMap.get(alloc.scheduleId);
      if (schedule) {
        const schedPrincipal = parseFloat(schedule.principal);
        const schedInterest = parseFloat(schedule.interest);
        const schedTotal = schedPrincipal + schedInterest;
        alloc.interest = schedTotal > 0 ? Math.round(allocAmount * schedInterest / schedTotal * 100) / 100 : 0;
        totalInterest += alloc.interest;
        totalPrincipal += allocAmount - alloc.interest;
      } else {
        totalPrincipal += allocAmount;
      }
    }

    totalPrincipal = Math.round(totalPrincipal * 100) / 100;
    totalInterest = Math.round(totalInterest * 100) / 100;

    const outstandingBalance = parseFloat(loan.outstanding_balance);
    if (totalAllocAmount > outstandingBalance) {
      throw new Error(`Total allocation (${totalAllocAmount.toFixed(2)}) exceeds outstanding balance (${outstandingBalance.toFixed(2)}). Reduce the payment amount.`);
    }

    const penaltyAmount = parseFloat(data.penaltyAmount) || 0;
    let totalAdvance = 0;

    // Execute all writes in a single transaction
    const writeClient = await pool.connect();
    try {
      await writeClient.query('SET search_path TO public');
      await writeClient.query('BEGIN');

      const { rows: [payment] } = await writeClient.query(
        `INSERT INTO payments (payment_number, loan_id, borrower_id, amount, principal_amount, interest_amount, penalty_amount, advance_amount, payment_method, reference_number, payment_date, received_by, receipt_number, notes, status, collector_id, remittance_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'completed',$14,$15,$16) RETURNING *`,
        [paymentNumber, data.loanId, loan.borrower_id, totalAllocAmount + penaltyAmount, totalPrincipal, totalInterest, penaltyAmount, 0,
         data.paymentMethod || 'cash', data.referenceNumber || null, data.paymentDate || new Date(), userId, receiptNumber,
         data.notes || null, data.collectorId || null, data.collectorId ? 'pending' : 'direct']
      );

      // Distribute penalty to all overdue schedules proportionally
      let totalOverdue = 0;
      const payDateNorm = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
      const overdueShortages: { scheduleId: string; shortage: number }[] = [];
      for (const s of allSchedules) {
        if (parseFloat(s.paid_amount) >= parseFloat(s.total_due) - 0.005) continue;
        const dueDate = new Date(s.due_date);
        const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        if (dueNorm >= payDateNorm) continue;
        const shortage = parseFloat(s.total_due) - parseFloat(s.paid_amount);
        totalOverdue += shortage;
        overdueShortages.push({ scheduleId: s.id, shortage });
      }
      if (penaltyAmount > 0 && totalOverdue > 0) {
        let remainingPenalty = penaltyAmount;
        for (const os of overdueShortages) {
          if (remainingPenalty <= 0) break;
          const portion = Math.round(penaltyAmount * (os.shortage / totalOverdue) * 100) / 100;
          const appliedPenalty = Math.min(portion, remainingPenalty);
          const { rows: schedRows } = await writeClient.query(`SELECT penalty_amount FROM amortization_schedules WHERE id = $1`, [os.scheduleId]);
          const curPenalty = parseFloat(schedRows[0]?.penalty_amount || '0');
          await writeClient.query(
            `UPDATE amortization_schedules SET penalty_amount = $1, updated_at = NOW() WHERE id = $2`,
            [(curPenalty + appliedPenalty).toFixed(2), os.scheduleId]
          );
          remainingPenalty -= appliedPenalty;
        }
      }

      // Track updated statuses in-memory
      const updatedStatuses = new Map<string, { paid_amount: number; status: string }>();
      for (const s of allSchedules) {
        updatedStatuses.set(s.id, { paid_amount: parseFloat(s.paid_amount), status: s.status });
      }

      for (const alloc of data.allocations) {
        const allocAmount = parseFloat(alloc.amount) || 0;
        if (allocAmount <= 0) continue;
        const schedule = scheduleMap.get(alloc.scheduleId);
        if (!schedule) continue;

        const curState = updatedStatuses.get(schedule.id)!;
        const currentPaid = curState.paid_amount;
        const totalDue = parseFloat(schedule.total_due);
        const shortage = Math.max(0, totalDue - currentPaid);

        const applied = Math.min(allocAmount, shortage);
        const excess = allocAmount - applied;
        if (excess > 0) totalAdvance += excess;

        const newPaid = currentPaid + applied;
        const newStatus = newPaid >= totalDue - 0.005 ? 'paid' : (newPaid > 0 ? 'partial' : schedule.status);
        curState.paid_amount = newPaid;
        curState.status = newStatus;

        await writeClient.query(
          `UPDATE amortization_schedules SET paid_amount = $1, status = $2, paid_at = $3, updated_at = NOW() WHERE id = $4`,
          [newPaid, newStatus, newStatus === 'paid' ? paymentDate : null, schedule.id]
        );

        await writeClient.query(
          `INSERT INTO payment_allocations (payment_id, schedule_id, amount, allocated_to) VALUES ($1,$2,$3,'principal')`,
          [payment.id, schedule.id, applied]
        );
      }

      if (totalAdvance > 0) {
        await writeClient.query(
          `UPDATE payments SET advance_amount = $1 WHERE id = $2`,
          [totalAdvance, payment.id]
        );
      }

      const outstandingBalance = parseFloat(loan.outstanding_balance);
      const netReduction = totalAllocAmount;
      const newBalance = Math.max(0, outstandingBalance - netReduction);
      let curAdvance = parseFloat(loan.advance_balance || '0');
      if (totalAdvance > 0) curAdvance += totalAdvance;
      await writeClient.query(
        `UPDATE loans SET outstanding_balance = $1, advance_balance = $2, updated_at = NOW() WHERE id = $3`,
        [newBalance, curAdvance, data.loanId]
      );

      // Use in-memory tracking instead of stale allSchedules array
      const allPaid = [...updatedStatuses.values()].every(s => s.status === 'paid');
      if (allPaid || newBalance <= 0) {
        await writeClient.query(
          `UPDATE loans SET status = 'closed', outstanding_balance = 0, next_payment_date = NULL, updated_at = NOW() WHERE id = $1`,
          [data.loanId]
        );
        await writeClient.query(
          `UPDATE collections SET status = 'closed' WHERE id = $1`,
          [loan.id]
        );
      } else {
        const nextPending = allSchedules.find((s: any) => {
          const st = updatedStatuses.get(s.id)!;
          return st.status === 'pending' || (st.status === 'partial' && st.paid_amount < parseFloat(s.total_due) - 0.005);
        });
        if (nextPending) {
          await writeClient.query(
            `UPDATE loans SET next_payment_date = $1, updated_at = NOW() WHERE id = $2`,
            [nextPending.due_date, data.loanId]
          );
        }
      }

      await writeClient.query('COMMIT');
      payment.advance_amount = totalAdvance;
      return payment;
    } catch (err) {
      await writeClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      writeClient.release();
    }
  }

  async getPaymentsByLoan(loanId: string, options: any) {
    return paymentRepo.findAll({
      conditions: { loan_id: loanId },
      orderBy: 'payment_date DESC',
      ...options,
    });
  }

  async getPaymentById(id: string) {
    const payments = await paymentRepo.query(
      `SELECT p.*, l.loan_number, b.first_name || ' ' || b.last_name as borrower_name,
              u.first_name || ' ' || u.last_name as received_by_name
       FROM payments p
       JOIN loans l ON p.loan_id = l.id
       JOIN borrowers b ON p.borrower_id = b.id
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.id = $1`,
      [id]
    );
    if (!payments.length) throw new Error('Payment not found');

    const allocations = await paymentAllocationRepo.findAll({
      conditions: { payment_id: id },
      limit: 1000,
    });

    return { ...payments[0], allocations: allocations.rows };
  }

  async getRecentPayments(limit: number = 10) {
    return paymentRepo.findAll({
      select: 'payments.*, l.loan_number, b.first_name || \' \' || b.last_name as borrower_name',
      joins: 'JOIN loans l ON payments.loan_id = l.id JOIN borrowers b ON payments.borrower_id = b.id',
      orderBy: 'p.created_at DESC',
      limit,
      offset: 0,
    });
  }
}

export const paymentService = new PaymentService();
