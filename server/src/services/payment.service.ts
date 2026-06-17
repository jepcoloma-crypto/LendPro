import { paymentRepo, amortizationScheduleRepo, loanRepo, collectionRepo, paymentAllocationRepo } from '../repositories';
import { generatePaymentNumber, generateReceiptNumber } from '../utils/helpers';

const normDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export class PaymentService {
  private calcPenalty(schedule: any, loan: any, effectiveDays: number): number {
    if (!loan.penalty_type || !loan.penalty_value) return 0;
    if (effectiveDays <= 0) return 0;
    const pType = loan.penalty_type;
    const pValue = parseFloat(loan.penalty_value) || 0;
    const due = parseFloat(schedule.total_due) - parseFloat(schedule.paid_amount);
    if (pType === 'fixed') return pValue;
    if (pType === 'percentage') return Math.round(due * (pValue / 100) * 100) / 100;
    if (pType === 'daily') return Math.round(due * (pValue / 100) * effectiveDays * 100) / 100;
    return 0;
  }

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
    const gracePeriod = loan.penalty_grace_period || 0;

    const schedules = await amortizationScheduleRepo.findAll({
      conditions: { loan_id: data.loanId },
      orderBy: 'installment_no ASC',
      limit: 1000,
    });

    let penaltyAmount = 0;
    const paymentDateNorm = normDate(paymentDate);
    for (const s of schedules.rows) {
      if (parseFloat(s.paid_amount) >= parseFloat(s.total_due) - 0.005) continue;
      const dueDateNorm = normDate(new Date(s.due_date));
      if (dueDateNorm >= paymentDateNorm) continue;
      const daysOverdue = Math.floor((paymentDateNorm.getTime() - dueDateNorm.getTime()) / (1000 * 60 * 60 * 24));
      const effectiveDays = Math.max(0, daysOverdue - gracePeriod);
      penaltyAmount += this.calcPenalty(s, loan, effectiveDays);
    }
    penaltyAmount = Math.round(penaltyAmount * 100) / 100;

    const applyToPrincipal = Math.min(amount - penaltyAmount, outstandingBalance);

    const payment = await paymentRepo.create({
      payment_number: paymentNumber,
      loan_id: data.loanId,
      borrower_id: loan.borrower_id,
      amount,
      principal_amount: applyToPrincipal,
      interest_amount: 0,
      penalty_amount: penaltyAmount,
      payment_method: data.paymentMethod || 'cash',
      reference_number: data.referenceNumber || null,
      payment_date: data.paymentDate || new Date(),
      received_by: userId,
      receipt_number: receiptNumber,
      notes: data.notes || null,
      status: 'completed',
    });

    const newBalance = Math.max(0, outstandingBalance - applyToPrincipal);
    await loanRepo.update(data.loanId, { outstanding_balance: newBalance });

    let remainingAmount = amount - penaltyAmount;
    let totalPrincipalSplit = 0;
    let totalInterestSplit = 0;
    for (const schedule of schedules.rows) {
      if (remainingAmount <= 0) break;
      const currentPaid = parseFloat(schedule.paid_amount);
      if (currentPaid >= parseFloat(schedule.total_due)) continue;
      const dueAmount = parseFloat(schedule.total_due) - currentPaid;
      const allocation = Math.min(remainingAmount, dueAmount);
      if (allocation > 0) {
        const schedPrincipal = parseFloat(schedule.principal);
        const schedInterest = parseFloat(schedule.interest);
        const schedTotal = schedPrincipal + schedInterest;
        const interestPart = schedTotal > 0 ? Math.round(allocation * schedInterest / schedTotal * 100) / 100 : 0;
        const principalPart = allocation - interestPart;
        totalPrincipalSplit += principalPart;
        totalInterestSplit += interestPart;

        const newPaid = parseFloat(schedule.paid_amount) + allocation;
        const newStatus = newPaid >= parseFloat(schedule.total_due) - 0.005 ? 'paid' : 'partial';
        await amortizationScheduleRepo.update(schedule.id, {
          paid_amount: newPaid,
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date() : null,
        });
        await paymentAllocationRepo.create({
          payment_id: payment.id,
          schedule_id: schedule.id,
          amount: allocation,
          allocated_to: 'principal',
        });
        remainingAmount -= allocation;
      }
    }
    totalPrincipalSplit = Math.round(totalPrincipalSplit * 100) / 100;
    totalInterestSplit = Math.round(totalInterestSplit * 100) / 100;
    await paymentRepo.update(payment.id, {
      principal_amount: totalPrincipalSplit,
      interest_amount: totalInterestSplit,
    });

    if (newBalance <= 0) {
      await loanRepo.update(data.loanId, { status: 'closed', next_payment_date: null });
      await collectionRepo.update(loan.id, { status: 'closed' });
    } else {
      const nextPending = schedules.rows.find(s => s.status === 'pending' || (s.status === 'partial' && parseFloat(s.paid_amount) < parseFloat(s.total_due) - 0.005));
      if (nextPending) {
        await loanRepo.update(data.loanId, { next_payment_date: nextPending.due_date });
      }
    }

    return payment;
  }

  private async receiveWithAllocations(data: any, loan: any, userId: string, paymentNumber: string, receiptNumber: string) {
    const allSchedules = await amortizationScheduleRepo.findAll({
      conditions: { loan_id: data.loanId },
      orderBy: 'installment_no ASC',
      limit: 1000,
    });
    const scheduleMap = new Map(allSchedules.rows.map((s: any) => [s.id, s]));

    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const gracePeriod = loan.penalty_grace_period || 0;

    let totalPenalty = 0;
    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalAllocAmount = 0;
    const paymentDateNorm = normDate(paymentDate);

    for (const alloc of data.allocations) {
      const allocAmount = parseFloat(alloc.amount) || 0;
      totalAllocAmount += allocAmount;
      const schedule = scheduleMap.get(alloc.scheduleId);
      if (schedule) {
        const dueDateNorm = normDate(new Date(schedule.due_date));
        if (dueDateNorm < paymentDateNorm && parseFloat(schedule.paid_amount) < parseFloat(schedule.total_due) - 0.005) {
          const daysOverdue = Math.floor((paymentDateNorm.getTime() - dueDateNorm.getTime()) / (1000 * 60 * 60 * 24));
          const effectiveDays = Math.max(0, daysOverdue - gracePeriod);
          alloc.penalty = this.calcPenalty(schedule, loan, effectiveDays);
        } else {
          alloc.penalty = 0;
        }
        const schedPrincipal = parseFloat(schedule.principal);
        const schedInterest = parseFloat(schedule.interest);
        const schedTotal = schedPrincipal + schedInterest;
        alloc.interest = schedTotal > 0 ? Math.round(allocAmount * schedInterest / schedTotal * 100) / 100 : 0;
        totalInterest += alloc.interest;
        totalPrincipal += allocAmount - alloc.interest;
      } else {
        totalPrincipal += allocAmount;
      }
      totalPenalty += parseFloat(alloc.penalty) || 0;
    }

    totalPrincipal = Math.round(totalPrincipal * 100) / 100;
    totalInterest = Math.round(totalInterest * 100) / 100;
    const paymentAmount = totalAllocAmount + totalPenalty;

    const payment = await paymentRepo.create({
      payment_number: paymentNumber,
      loan_id: data.loanId,
      borrower_id: loan.borrower_id,
      amount: paymentAmount,
      principal_amount: totalPrincipal,
      interest_amount: totalInterest,
      penalty_amount: totalPenalty,
      payment_method: data.paymentMethod || 'cash',
      reference_number: data.referenceNumber || null,
      payment_date: data.paymentDate || new Date(),
      received_by: userId,
      receipt_number: receiptNumber,
      notes: data.notes || null,
      status: 'completed',
    });

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
        paid_at: newStatus === 'paid' ? new Date() : null,
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
          paid_at: newStatus === 'paid' ? new Date() : null,
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
