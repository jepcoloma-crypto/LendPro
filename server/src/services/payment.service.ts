import { paymentRepo, amortizationScheduleRepo, loanRepo, collectionRepo, paymentAllocationRepo } from '../repositories';
import { generatePaymentNumber, generateReceiptNumber } from '../utils/helpers';

export class PaymentService {
  async receivePayment(data: any, userId: string) {
    const loan = await loanRepo.findById(data.loanId);
    if (!loan) throw new Error('Loan not found');
    if (loan.status === 'closed') throw new Error('Loan is already closed');

    const paymentNumber = generatePaymentNumber();
    const receiptNumber = generateReceiptNumber();
    const outstandingBalance = parseFloat(loan.outstanding_balance);
    const amount = parseFloat(data.amount);

    if (data.allocations && Array.isArray(data.allocations) && data.allocations.length > 0) {
      return this.receiveWithAllocations(data, loan, userId, paymentNumber, receiptNumber);
    }

    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();

    const schedules = await amortizationScheduleRepo.findAll({
      conditions: { loan_id: data.loanId },
      orderBy: 'installment_no ASC',
      limit: 1000,
    });

    let totalOverdue = 0;
    const paymentDateNorm = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
    for (const s of schedules.rows) {
      if (parseFloat(s.paid_amount) >= parseFloat(s.total_due) - 0.005) continue;
      const dueDate = new Date(s.due_date);
      const dueDateNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (dueDateNorm >= paymentDateNorm) continue;
      totalOverdue += parseFloat(s.total_due) - parseFloat(s.paid_amount);
    }

    let penaltyAmount = 0;
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

    const netForSchedules = Math.max(0, amount - penaltyAmount);

    // Distribute penalty proportionally across overdue schedules
    if (penaltyAmount > 0 && totalOverdue > 0) {
      let remainingPenalty = penaltyAmount;
      for (const s of schedules.rows) {
        if (remainingPenalty <= 0) break;
        if (parseFloat(s.paid_amount) >= parseFloat(s.total_due) - 0.005) continue;
        const dueDate = new Date(s.due_date);
        const dueDateNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        if (dueDateNorm >= paymentDateNorm) continue;
        const shortage = parseFloat(s.total_due) - parseFloat(s.paid_amount);
        const portion = Math.round(penaltyAmount * (shortage / totalOverdue) * 100) / 100;
        const appliedPenalty = Math.min(portion, remainingPenalty);
        await amortizationScheduleRepo.update(s.id, {
          penalty_amount: (parseFloat(s.penalty_amount || '0') + appliedPenalty).toFixed(2),
        });
        remainingPenalty -= appliedPenalty;
      }
    }

    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalAllocated = 0;

    // First pass: compute allocations and principal/interest split
    const allocs: { schedule: any; amount: number; principal: number; interest: number }[] = [];
    let allocRemaining = netForSchedules;
    for (const schedule of schedules.rows) {
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

    totalPrincipal = Math.round(totalPrincipal * 100) / 100;
    totalInterest = Math.round(totalInterest * 100) / 100;

    const payment = await paymentRepo.create({
      payment_number: paymentNumber,
      loan_id: data.loanId,
      borrower_id: loan.borrower_id,
      amount: netForSchedules + penaltyAmount,
      principal_amount: totalPrincipal,
      interest_amount: totalInterest,
      penalty_amount: penaltyAmount,
      payment_method: data.paymentMethod || 'cash',
      reference_number: data.referenceNumber || null,
      payment_date: data.paymentDate || new Date(),
      received_by: userId,
      receipt_number: receiptNumber,
      notes: data.notes || null,
      status: 'completed',
    });

    // Second pass: update schedules and record allocations
    for (const alloc of allocs) {
      const schedule = alloc.schedule;
      const newPaid = parseFloat(schedule.paid_amount) + alloc.amount;
      const totalDue = parseFloat(schedule.total_due);
      const newStatus = newPaid >= totalDue - 0.005 ? 'paid' : (newPaid > 0 ? 'partial' : schedule.status);

      await amortizationScheduleRepo.update(schedule.id, {
        paid_amount: newPaid,
        status: newStatus,
        paid_at: newStatus === 'paid' ? paymentDate : null,
      });

      await paymentAllocationRepo.create({
        payment_id: payment.id,
        schedule_id: schedule.id,
        amount: alloc.amount,
        allocated_to: 'principal',
      });
    }

    const newBalance = Math.max(0, outstandingBalance - totalAllocated);
    await loanRepo.update(data.loanId, { outstanding_balance: newBalance });

    if (newBalance <= 0) {
      await loanRepo.update(data.loanId, { status: 'closed', next_payment_date: null });
      await collectionRepo.update(loan.id, { status: 'closed' });
    }

    // Re-fetch to get updated statuses
    const updatedSchedules = await amortizationScheduleRepo.findAll({
      conditions: { loan_id: data.loanId },
      orderBy: 'installment_no ASC',
      limit: 1000,
    });
    const allPaid = updatedSchedules.rows.every(s => s.status === 'paid');
    if (allPaid || newBalance <= 0) {
      await loanRepo.update(data.loanId, { status: 'closed', outstanding_balance: 0, next_payment_date: null });
      await collectionRepo.update(loan.id, { status: 'closed' });
    } else {
      const nextPending = updatedSchedules.rows.find(s => s.status === 'pending' || (s.status === 'partial' && parseFloat(s.paid_amount) < parseFloat(s.total_due) - 0.005));
      if (nextPending) {
        await loanRepo.update(data.loanId, { next_payment_date: nextPending.due_date });
      }
    }

    return payment;
  }

  private async receiveWithAllocations(data: any, loan: any, userId: string, paymentNumber: string, receiptNumber: string) {
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const allSchedules = await amortizationScheduleRepo.findAll({
      conditions: { loan_id: data.loanId },
      orderBy: 'installment_no ASC',
      limit: 1000,
    });
    const scheduleMap = new Map(allSchedules.rows.map((s: any) => [s.id, s]));

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

    const penaltyAmount = parseFloat(data.penaltyAmount) || 0;
    const payment = await paymentRepo.create({
      payment_number: paymentNumber,
      loan_id: data.loanId,
      borrower_id: loan.borrower_id,
      amount: totalAllocAmount + penaltyAmount,
      principal_amount: totalPrincipal,
      interest_amount: totalInterest,
      penalty_amount: penaltyAmount,
      payment_method: data.paymentMethod || 'cash',
      reference_number: data.referenceNumber || null,
      payment_date: data.paymentDate || new Date(),
      received_by: userId,
      receipt_number: receiptNumber,
      notes: data.notes || null,
      status: 'completed',
    });

    // Distribute penalty to all overdue schedules proportionally
    let totalOverdue = 0;
    const payDateNorm = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
    const overdueShortages: { scheduleId: string; shortage: number }[] = [];
    for (const s of allSchedules.rows) {
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
        const sched = allSchedules.rows.find((s: any) => s.id === os.scheduleId);
        const curPenalty = parseFloat(sched?.penalty_amount || '0');
        await amortizationScheduleRepo.update(os.scheduleId, {
          penalty_amount: (curPenalty + appliedPenalty).toFixed(2),
        });
        remainingPenalty -= appliedPenalty;
      }
    }

    let overflow: { [scheduleId: string]: number } = {};
    for (const alloc of data.allocations) {
      overflow[alloc.scheduleId] = (overflow[alloc.scheduleId] || 0) + (parseFloat(alloc.amount) || 0);
    }

    let remainingOverflow = 0;
    for (const schedule of allSchedules.rows) {
      let allocAmount = overflow[schedule.id] || 0;
      if (remainingOverflow > 0) {
        allocAmount += remainingOverflow;
        remainingOverflow = 0;
      }
      if (allocAmount <= 0) continue;

      const currentPaid = parseFloat(schedule.paid_amount);
      const totalDue = parseFloat(schedule.total_due);
      const shortage = Math.max(0, totalDue - currentPaid);

      let applied = allocAmount;
      if (allocAmount > shortage) {
        applied = shortage;
        remainingOverflow = allocAmount - shortage;
      }

      const newPaid = currentPaid + applied;
      const newStatus = newPaid >= totalDue - 0.005 ? 'paid' : (newPaid > 0 ? 'partial' : schedule.status);

      await amortizationScheduleRepo.update(schedule.id, {
        paid_amount: newPaid,
        status: newStatus,
        paid_at: newStatus === 'paid' ? paymentDate : null,
      });

      await paymentAllocationRepo.create({
        payment_id: payment.id,
        schedule_id: schedule.id,
        amount: applied,
        allocated_to: 'principal',
      });
    }

    if (remainingOverflow > 0) {
      for (const schedule of allSchedules.rows) {
        if (remainingOverflow <= 0) break;
        if (schedule.status === 'paid') continue;
        const currentPaid = parseFloat(schedule.paid_amount);
        const totalDue = parseFloat(schedule.total_due);
        const shortage = Math.max(0, totalDue - currentPaid);
        const applied = Math.min(remainingOverflow, shortage);
        if (applied <= 0) continue;

        const newPaid = currentPaid + applied;
        const newStatus = newPaid >= totalDue - 0.005 ? 'paid' : 'partial';
        await amortizationScheduleRepo.update(schedule.id, {
          paid_amount: newPaid,
          status: newStatus,
          paid_at: newStatus === 'paid' ? paymentDate : null,
        });
        await paymentAllocationRepo.create({
          payment_id: payment.id,
          schedule_id: schedule.id,
          amount: applied,
          allocated_to: 'principal',
        });
        remainingOverflow -= applied;
      }
    }

    const outstandingBalance = parseFloat(loan.outstanding_balance);
    const newBalance = Math.max(0, outstandingBalance - totalAllocAmount);
    await loanRepo.update(data.loanId, { outstanding_balance: newBalance });

    const allPaid = allSchedules.rows.every(s => s.status === 'paid');
    if (allPaid || newBalance <= 0) {
      await loanRepo.update(data.loanId, { status: 'closed', outstanding_balance: 0, next_payment_date: null });
      await collectionRepo.update(loan.id, { status: 'closed' });
    } else {
      const nextPending = allSchedules.rows.find(s => s.status === 'pending' || (s.status === 'partial' && parseFloat(s.paid_amount) < parseFloat(s.total_due) - 0.005));
      if (nextPending) {
        await loanRepo.update(data.loanId, { next_payment_date: nextPending.due_date });
      }
    }

    return payment;
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
