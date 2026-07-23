import {
  loanRepo,
  loanApplicationRepo,
  amortizationScheduleRepo,
  paymentRepo,
  paymentAllocationRepo,
  collectionRepo,
  loanProductRepo,
  borrowerRepo,
  loanProductChargeRepo,
  loanChargeRepo,
} from '../repositories';
import { pool, query } from '../database/connection';
import { calculateAmortization, generateLoanNumber, generateApplicationNumber, generatePaymentNumber } from '../utils/helpers';

export class LoanService {
  async createApplication(data: any, userId: string) {
    const product = await loanProductRepo.findById(data.loanProductId);
    if (!product) throw new Error('Loan product not found');

    let applicationType = data.applicationType || 'New';
    if (!data.applicationType) {
      const { rows: existingLoans } = await loanRepo.findAll({ conditions: { borrower_id: data.borrowerId }, limit: 1, select: 'id, status' });
      const hasPreviousLoans = existingLoans.some(
        (l: any) => ['active', 'closed'].includes(l.status)
      );
      if (hasPreviousLoans) applicationType = 'Renewal';
    }

    const application = await loanApplicationRepo.create({
      application_number: generateApplicationNumber(),
      borrower_id: data.borrowerId,
      loan_product_id: data.loanProductId,
      principal_amount: data.principalAmount,
      term_months: data.termMonths,
      term_type: data.termType || product.term_type || 'months',
      installment_count: data.installmentCount || null,
      interest_rate: product.interest_rate,
      interest_type: product.interest_type,
      application_type: applicationType,
      status: 'draft',
      purpose: data.purpose || null,
      payment_frequency: data.paymentFrequency || 'monthly',
      co_maker_id: data.coMakerId || null,
      previous_balance: data.previousBalance || 0,
      collector_id: data.collectorId || null,
      assigned_officer_id: userId,
      created_by: userId,
    });

    return application;
  }

  async submitApplication(id: string) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'draft') throw new Error('Only draft applications can be submitted');
    if (!app.borrower_id) throw new Error('Application has no borrower assigned');

    const borrower = await borrowerRepo.findById(app.borrower_id);
    if (!borrower) throw new Error('Borrower not found');

    await this.checkCreditLimit(app.borrower_id, Number(app.principal_amount));

    const prevBalance = parseFloat(app.previous_balance) || 0;
    // Skip delinquent check for renewals (previous_balance > 0) since the old balance
    // is consolidated into the new loan and settled at release.
    if (prevBalance <= 0) {
      const delinquentLoans = await loanRepo.query(
        `SELECT COUNT(*) as count FROM loans l WHERE l.borrower_id = $1 AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l.id AND a.due_date < CURRENT_DATE - INTERVAL '5 days' AND COALESCE(a.paid_amount,0) < a.total_due)`,
        [app.borrower_id]
      );
      const delinquentCount = parseInt(delinquentLoans[0]?.count || '0', 10);
      if (delinquentCount > 0) throw new Error('Borrower has delinquent loan(s). Please settle outstanding debts before applying.');
    }

    const updated = await loanApplicationRepo.update(id, { status: 'submitted', submitted_at: new Date() });
    return updated;
  }

  async reviewApplication(id: string, userId: string) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'submitted') throw new Error('Application must be in submitted status');
    return loanApplicationRepo.update(id, { status: 'under-review', assigned_officer_id: userId });
  }

  async investigateApplication(id: string, userId: string, riskScore?: number, riskNotes?: string) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'under-review') throw new Error('Application must be under review');
    return loanApplicationRepo.update(id, { status: 'investigation', risk_score: riskScore || null, risk_notes: riskNotes || null, assigned_officer_id: userId });
  }

  private async checkCreditLimit(borrowerId: string, principalAmount: number, excludeAppId?: string, includePendingApproved: boolean = true) {
    const borrower = await borrowerRepo.findById(borrowerId);
    if (!borrower) return;
    const limit = borrower.credit_limit ? Number(borrower.credit_limit) : null;
    if (limit === null || limit <= 0) return;

    const exposure = await loanRepo.query(
      `SELECT
         COALESCE(SUM(l.principal_amount), 0) as total_principal,
         COALESCE(SUM(p.principal_amount), 0) as total_repaid
       FROM loans l
       LEFT JOIN payments p ON p.loan_id = l.id AND p.status = 'completed'
       WHERE l.borrower_id = $1 AND l.status IN ('active', 'delinquent')`,
      [borrowerId]
    );
    const totalPrincipal = Number(exposure[0]?.total_principal || 0);
    const totalRepaid = Number(exposure[0]?.total_repaid || 0);
    const currentExposure = Math.max(0, totalPrincipal - totalRepaid);

    let pendingApproved = 0;
    if (includePendingApproved) {
      const pendingApps = await loanApplicationRepo.query(
        `SELECT COALESCE(SUM(principal_amount), 0) as total
         FROM loan_applications WHERE borrower_id = $1 AND status = 'approved'${excludeAppId ? ' AND id != $2' : ''}`,
        excludeAppId ? [borrowerId, excludeAppId] : [borrowerId]
      );
      pendingApproved = Number(pendingApps[0]?.total || 0);
    }

    if (currentExposure + pendingApproved + Number(principalAmount) > limit) {
      throw new Error(`Credit limit exceeded. Current exposure: ${currentExposure}, pending approved: ${pendingApproved}, request: ${principalAmount}, limit: ${limit}`);
    }
  }

  async assessApplication(id: string, userId: string, decision: 'approved' | 'rejected', comments?: string) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'investigation') throw new Error('Application must be in investigation');
    if (decision === 'approved' && app.borrower_id) {
      await this.checkCreditLimit(app.borrower_id, Number(app.principal_amount));
    }
    const status = decision === 'approved' ? 'approved' : 'rejected';
    const levelResult = await loanApplicationRepo.query(
      `SELECT COALESCE(MAX(approval_level), 0) + 1 as next_level FROM loan_approvals WHERE application_id = $1`,
      [id]
    );
    const nextLevel = levelResult[0]?.next_level || 1;
    await loanApplicationRepo.query(
      `INSERT INTO loan_approvals (application_id, approver_id, approval_level, status, comments, decided_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, userId, nextLevel, status, comments || null]
    );
    await loanApplicationRepo.update(id, { status });
    return loanApplicationRepo.findById(id);
  }

  async approveApplication(id: string, userId: string, comments?: string) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.borrower_id) {
      await this.checkCreditLimit(app.borrower_id, Number(app.principal_amount));
    }

    const levelResult = await loanApplicationRepo.query(
      `SELECT COALESCE(MAX(approval_level), 0) + 1 as next_level FROM loan_approvals WHERE application_id = $1`,
      [id]
    );
    const nextLevel = levelResult[0]?.next_level || 1;

    await loanApplicationRepo.query(
      `INSERT INTO loan_approvals (application_id, approver_id, approval_level, status, comments, decided_at)
       VALUES ($1, $2, $3, 'approved', $4, NOW())`,
      [id, userId, nextLevel, comments || null]
    );

    const settings = await loanApplicationRepo.query(
      `SELECT value FROM system_settings WHERE key = 'loan_approval_levels'`
    );
    const requiredLevels = parseInt(settings[0]?.value || '1', 10);

    if (nextLevel >= requiredLevels) {
      await loanApplicationRepo.update(id, { status: 'approved' });
    }

    return loanApplicationRepo.findById(id);
  }

  async rejectApplication(id: string, userId: string, comments?: string) {
    await loanApplicationRepo.update(id, { status: 'rejected' });
    await loanApplicationRepo.query(
      `INSERT INTO loan_approvals (application_id, approver_id, approval_level, status, comments, decided_at)
       VALUES ($1, $2, 1, 'rejected', $3, NOW())`,
      [id, userId, comments || null]
    );
    return loanApplicationRepo.findById(id);
  }

  async updateApplication(id: string, data: any) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'draft') throw new Error('Only draft applications can be edited');
    if (data.loanProductId) {
      const product = await loanProductRepo.findById(data.loanProductId);
      if (!product) throw new Error('Loan product not found');
    }
    const fields: Record<string, any> = {};
    if (data.borrowerId !== undefined) fields.borrower_id = data.borrowerId;
    if (data.loanProductId !== undefined) {
      fields.loan_product_id = data.loanProductId;
      const product = await loanProductRepo.findById(data.loanProductId);
      fields.interest_rate = product.interest_rate;
      fields.interest_type = product.interest_type;
      fields.term_type = product.term_type || 'months';
    }
    if (data.principalAmount !== undefined) fields.principal_amount = data.principalAmount;
    if (data.termMonths !== undefined) fields.term_months = data.termMonths;
    if (data.installmentCount !== undefined) fields.installment_count = data.installmentCount;
    if (data.paymentFrequency !== undefined) fields.payment_frequency = data.paymentFrequency;
    if (data.purpose !== undefined) fields.purpose = data.purpose;
    if (data.collectorId !== undefined) fields.collector_id = data.collectorId;
    if (data.applicationType !== undefined) fields.application_type = data.applicationType || 'New';
    if (data.previousBalance !== undefined) fields.previous_balance = data.previousBalance;
    if (Object.keys(fields).length === 0) throw new Error('No fields to update');
    return loanApplicationRepo.update(id, fields);
  }

  async deleteApplication(id: string) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (!['draft', 'approved'].includes(app.status)) throw new Error('Only draft or approved applications can be deleted');
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO public');
      await client.query('BEGIN');
      await client.query('DELETE FROM loan_approvals WHERE application_id = $1', [id]);
      await client.query('DELETE FROM application_documents WHERE application_id = $1', [id]);
      await loanApplicationRepo.softDelete(id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async restoreApplication(id: string) {
    const app = await loanApplicationRepo.restore(id);
    if (!app) throw new Error('Application not found or not deleted');
    return app;
  }

  async permanentDeleteApplication(id: string) {
    const deleted = await query(`SELECT id FROM loan_applications WHERE id = $1 AND deleted_at IS NOT NULL`, [id]);
    if (!deleted.rows.length) throw new Error('Application not found in trash');
    await query(`DELETE FROM loan_approvals WHERE application_id = $1`, [id]);
    await query(`DELETE FROM application_documents WHERE application_id = $1`, [id]);
    await loanApplicationRepo.delete(id);
  }

  async emptyTrash() {
    const deleted = await loanApplicationRepo.findDeleted({ limit: 10000 });
    const ids = deleted.rows.map((a: any) => a.id);
    if (!ids.length) return 0;
    await query(`DELETE FROM loan_approvals WHERE application_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM application_documents WHERE application_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM loan_applications WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL`, [ids]);
    return ids.length;
  }

  async releaseLoan(applicationId: string, userId: string, method: string = 'cash', reference?: string, releaseDate?: Date) {
    const app = await loanApplicationRepo.findById(applicationId);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'approved') throw new Error('Application is not approved');
    if (app.borrower_id) {
      await this.checkCreditLimit(app.borrower_id, Number(app.principal_amount), applicationId, false);
    }

    const product = await loanProductRepo.findById(app.loan_product_id);

    const relDate = releaseDate || new Date();

    const { schedule, totalInterest, totalAmount } = calculateAmortization(
      parseFloat(app.principal_amount),
      parseFloat(app.interest_rate),
      app.term_months,
      app.interest_type,
      app.payment_frequency,
      relDate,
      app.term_type || 'months',
      app.installment_count || undefined
    );

    const loanNumber = generateLoanNumber();

    const maturityDate = (() => {
      const d = new Date(relDate);
      if (app.term_type === 'days') d.setDate(d.getDate() + app.term_months);
      else if (app.term_type === 'weeks') d.setDate(d.getDate() + app.term_months * 7);
      else d.setMonth(d.getMonth() + app.term_months);
      return d;
    })();

    const loan = await loanRepo.create({
      loan_number: loanNumber,
      application_id: applicationId,
      borrower_id: app.borrower_id,
      product_id: app.loan_product_id,
      principal_amount: app.principal_amount,
      interest_amount: totalInterest,
      total_amount: totalAmount,
      outstanding_balance: totalAmount,
      interest_rate: app.interest_rate,
      interest_type: app.interest_type,
      term_months: app.term_months,
      term_type: app.term_type || 'months',
      installment_count: app.installment_count || null,
      application_type: app.application_type || 'New',
      payment_frequency: app.payment_frequency,
      status: 'active',
      release_date: relDate,
      next_payment_date: schedule[0]?.dueDate || null,
      maturity_date: maturityDate,
      late_payment_fee: product?.late_payment_fee || 0,
      penalty_type: product?.penalty_type || null,
      penalty_value: product?.penalty_value || null,
      penalty_grace_period: product?.penalty_grace_period || 0,
      penalty_matured_value: product?.penalty_matured_value || 0,
      collector_id: app.collector_id || null,
      released_by: userId,
    });

    await loanApplicationRepo.update(applicationId, { status: 'released' });

    // Compute net proceeds: principal - all product charges
    let chargeSource: any[];
    const productCharges = await loanProductChargeRepo.query(
      `SELECT lpc.*, c.name, c.computation_type, c.default_amount
       FROM loan_product_charges lpc
       JOIN charges c ON c.id = lpc.charge_id
       WHERE lpc.loan_product_id = $1 AND c.is_active = true`,
      [app.loan_product_id]
    );

    if (productCharges.length > 0) {
      chargeSource = productCharges;
    } else {
      // Fallback: apply all active charges
      const allCharges = await loanProductChargeRepo.query(
        `SELECT NULL as id, NULL as loan_product_id, c.id as charge_id, NULL as amount, false as is_required,
                c.name, c.computation_type, c.default_amount
         FROM charges c WHERE c.is_active = true ORDER BY c.name`
      );
      chargeSource = allCharges;
    }

    let totalCharges = 0;
    const chargeRecords: any[] = [];
    for (const pc of chargeSource) {
      const rawAmount = parseFloat(pc.amount ?? pc.default_amount ?? 0);
      const chargeAmount = pc.computation_type === 'percentage'
        ? Math.round(parseFloat(app.principal_amount) * rawAmount / 100 * 100) / 100
        : rawAmount;
      totalCharges += chargeAmount;
      chargeRecords.push({
        loan_id: loan.id,
        charge_id: pc.charge_id,
        charge_name: pc.name,
        amount: chargeAmount,
      });
    }
    for (const cr of chargeRecords) {
      await loanChargeRepo.create(cr);
    }

    const prevBalance = parseFloat(app.previous_balance) || 0;
    const netProceeds = parseFloat(app.principal_amount) - totalCharges - prevBalance;
    await loanRepo.update(loan.id, { net_proceeds: netProceeds });
    loan.net_proceeds = netProceeds;

    await loanApplicationRepo.query(
      `INSERT INTO loan_disbursements (loan_id, disbursement_method, amount, reference_number, disbursed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [loan.id, method, netProceeds, reference || null, userId]
    );

    await amortizationScheduleRepo.batchCreate(
      schedule.map((item: any) => ({
        loan_id: loan.id,
        installment_no: item.installmentNo,
        due_date: item.dueDate,
        principal: item.principal,
        interest: item.interest,
        balance: item.balance,
        total_due: item.totalDue,
        status: 'pending',
      }))
    );

    await collectionRepo.create({
      loan_id: loan.id,
      borrower_id: app.borrower_id,
      collector_id: loan.collector_id || null,
      status: 'active',
      total_due: totalAmount,
      total_overdue: 0,
      days_overdue: 0,
    });

    // Close old active loans on renewal — the borrower's previous balance
    // was deducted from this loan's proceeds, so the old obligation is settled.
    // Distribute any advance_balance to unpaid schedules first,
    // then create a settlement payment for whatever remains.
    if (app.application_type === 'Renewal' && prevBalance > 0) {
      const oldLoans = await loanRepo.query(
        `SELECT id, total_amount, advance_balance FROM loans WHERE borrower_id = $1 AND status = 'active' AND id != $2`,
        [app.borrower_id, loan.id]
      );
      for (const oldLoan of oldLoans) {
        const schedules = await amortizationScheduleRepo.query(
          `SELECT id, installment_no, total_due, paid_amount
           FROM amortization_schedules WHERE loan_id = $1
           AND COALESCE(paid_amount,0) < total_due ORDER BY installment_no`,
          [oldLoan.id]
        );
        if (schedules.length === 0) continue;

        // Auto-distribute advance_balance to unpaid schedules before settlement
        const advBalance = parseFloat(oldLoan.advance_balance || '0');
        if (advBalance > 0) {
          let distAdv = advBalance;
          for (const s of schedules) {
            if (distAdv <= 0) break;
            const due = Number(s.total_due);
            const currPaid = Number(s.paid_amount);
            const need = due - currPaid;
            const alloc = Math.min(distAdv, need);
            if (alloc > 0) {
              const newPaid = currPaid + alloc;
              const status = newPaid >= due - 0.01 ? 'paid' : 'partial';
              await amortizationScheduleRepo.query(
                `UPDATE amortization_schedules SET paid_amount = $1, status = $2 WHERE id = $3`,
                [newPaid, status, s.id]
              );
              distAdv -= alloc;
            }
          }
          await loanRepo.query(
            `UPDATE loans SET advance_balance = 0, updated_at = NOW() WHERE id = $1`,
            [oldLoan.id]
          );
        }

        // Re-fetch schedules after advance distribution (some may now be fully paid)
        const remainingSchedules = await amortizationScheduleRepo.query(
          `SELECT id, installment_no, total_due, paid_amount
           FROM amortization_schedules WHERE loan_id = $1
           AND COALESCE(paid_amount,0) < total_due ORDER BY installment_no`,
          [oldLoan.id]
        );
        if (remainingSchedules.length === 0) {
          await loanRepo.query(
            `UPDATE loans SET status = 'closed', outstanding_balance = 0,
             next_payment_date = NULL, updated_at = NOW() WHERE id = $1`,
            [oldLoan.id]
          );
          await loanRepo.query(
            `UPDATE collections SET status = 'closed' WHERE loan_id = $1`,
            [oldLoan.id]
          );
          continue;
        }
        let remaining = 0;
        for (const s of remainingSchedules) remaining += Number(s.total_due) - Number(s.paid_amount);
        if (remaining <= 0) continue;
        const payment = await paymentRepo.create({
          loan_id: oldLoan.id,
          borrower_id: app.borrower_id,
          amount: remaining,
          principal_amount: remaining,
          interest_amount: 0,
          penalty_amount: 0,
          penalty_waived: 0,
          advance_amount: 0,
          payment_method: 'historical',
          payment_date: relDate,
          status: 'completed',
          payment_number: 'SETTLE-' + loan.loan_number,
          notes: 'Renewal settlement',
        });
        const allocs: any[] = [];
        let distRemaining = remaining;
        for (const s of remainingSchedules) {
          const due = Number(s.total_due);
          const currPaid = Number(s.paid_amount);
          const need = due - currPaid;
          const alloc = Math.min(distRemaining, need);
          if (alloc > 0) {
            const newPaid = currPaid + alloc;
            const status = newPaid >= due - 0.01 ? 'paid' : 'partial';
            await amortizationScheduleRepo.query(
              `UPDATE amortization_schedules SET paid_amount = $1, status = $2 WHERE id = $3`,
              [newPaid, status, s.id]
            );
            allocs.push({ payment_id: payment.id, schedule_id: s.id, amount: alloc, allocated_to: 'principal' });
            distRemaining -= alloc;
          }
        }
        if (allocs.length > 0) await paymentAllocationRepo.batchCreate(allocs);
        await loanRepo.query(
          `UPDATE loans SET status = 'closed', outstanding_balance = 0,
           next_payment_date = NULL, updated_at = NOW() WHERE id = $1`,
          [oldLoan.id]
        );
        await loanRepo.query(
          `UPDATE collections SET status = 'closed' WHERE loan_id = $1`,
          [oldLoan.id]
        );
      }
    }

    return loan;
  }

  async restructureLoan(existingLoanId: string, userId: string, data: any) {
    const existing = await loanRepo.findById(existingLoanId);
    if (!existing) throw new Error('Loan not found');
    if (existing.status === 'paid' || existing.status === 'written-off' || existing.status === 'cancelled') throw new Error('Loan cannot be restructured');

    const newPrincipal = parseFloat(data.newPrincipal || existing.principal_amount);
    await this.checkCreditLimit(existing.borrower_id, newPrincipal);
    const interestRate = parseFloat(data.interestRate || existing.interest_rate);
    const interestType = data.interestType || existing.interest_type;
    const termMonths = parseInt(data.termMonths) || existing.term_months;
    const termType = data.termType || existing.term_type || 'months';
    const paymentFrequency = data.paymentFrequency || existing.payment_frequency;
    const installmentCount = data.installmentCount ? parseInt(data.installmentCount) : undefined;

    const { schedule, totalInterest, totalAmount } = calculateAmortization(
      newPrincipal, interestRate, termMonths, interestType, paymentFrequency,
      new Date(), termType, installmentCount
    );

    const loanNumber = generateLoanNumber();
    const maturityDate = (() => {
      const d = new Date();
      if (termType === 'days') d.setDate(d.getDate() + termMonths);
      else if (termType === 'weeks') d.setDate(d.getDate() + termMonths * 7);
      else d.setMonth(d.getMonth() + termMonths);
      return d;
    })();

    const product = await loanProductRepo.findById(existing.product_id);

    const newLoan = await loanRepo.create({
      loan_number: loanNumber,
      application_id: existing.application_id,
      borrower_id: existing.borrower_id,
      product_id: existing.product_id,
      principal_amount: newPrincipal,
      interest_amount: totalInterest,
      total_amount: totalAmount,
      outstanding_balance: totalAmount,
      interest_rate: interestRate,
      interest_type: interestType,
      term_months: termMonths,
      term_type: termType,
      installment_count: installmentCount || null,
      payment_frequency: paymentFrequency,
      status: 'active',
      release_date: new Date(),
      next_payment_date: schedule[0]?.dueDate || null,
      maturity_date: maturityDate,
      late_payment_fee: existing.late_payment_fee || 0,
      penalty_type: existing.penalty_type,
      penalty_value: existing.penalty_value,
      penalty_grace_period: existing.penalty_grace_period || 0,
      penalty_matured_value: existing.penalty_matured_value || 0,
      collector_id: existing.collector_id,
      released_by: userId,
      restructured_from: existingLoanId,
    });

    // Mark old loan as restructured
    await loanRepo.update(existingLoanId, { status: 'restructured' });

    // Create amortization schedule for new loan
    await amortizationScheduleRepo.batchCreate(
      schedule.map((item: any) => ({
        loan_id: newLoan.id,
        installment_no: item.installmentNo,
        due_date: item.dueDate,
        principal: item.principal,
        interest: item.interest,
        balance: item.balance,
        total_due: item.totalDue,
        status: 'pending',
      }))
    );

    // Create collection record
    await collectionRepo.create({
      loan_id: newLoan.id,
      borrower_id: existing.borrower_id,
      collector_id: existing.collector_id || null,
      status: 'active',
      total_due: totalAmount,
      total_overdue: 0,
      days_overdue: 0,
    });

    return newLoan;
  }

  async getActiveLoans(options: any) {
    return loanRepo.findAll({
      conditions: { status: 'active' },
      joins: 'JOIN borrowers b ON loans.borrower_id = b.id JOIN loan_products lp ON loans.product_id = lp.id',
      select: 'loans.*, b.first_name || \' \' || b.last_name as borrower_name, b.borrower_code, lp.name as product_name',
      ...options,
    });
  }

  async getLoanById(id: string) {
    const loans = await loanRepo.query(
      `SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name, b.borrower_code, b.mobile,
              lp.name as product_name, lp.penalty_type, lp.penalty_value, lp.penalty_grace_period, lp.penalty_matured_value, lp.late_payment_fee,
              u.first_name || ' ' || u.last_name as released_by_name,
              COALESCE(la.previous_balance, 0) as previous_balance
       FROM loans l
       JOIN borrowers b ON l.borrower_id = b.id
       JOIN loan_products lp ON l.product_id = lp.id
       LEFT JOIN users u ON l.released_by = u.id
       LEFT JOIN loan_applications la ON l.application_id = la.id
       WHERE l.id = $1`,
      [id]
    );
    if (!loans.length) throw new Error('Loan not found');

    const [scheduleResult, paymentsResult, chargesResult] = await Promise.all([
      amortizationScheduleRepo.query(
        `SELECT * FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no ASC`,
        [id]
      ),
      paymentRepo.query(
        `SELECT * FROM payments WHERE loan_id = $1 ORDER BY payment_date DESC`,
        [id]
      ),
      loanChargeRepo.query(
        `SELECT charge_name, amount FROM loan_charges WHERE loan_id = $1 ORDER BY charge_name`,
        [id]
      ),
    ]);

    return { ...loans[0], schedule: scheduleResult, payments: paymentsResult, charges: chargesResult };
  }

  async getLoanSchedule(loanId: string) {
    const result = await amortizationScheduleRepo.findAll({
      conditions: { loan_id: loanId },
      orderBy: 'installment_no ASC',
      limit: 1000,
    });
    return result.rows;
  }

  async getDashboardStats(userId?: string, roleSlug?: string) {
    const isCollector = roleSlug === 'collector' && userId;
    const cid = isCollector ? [userId] : [];
    const cf = isCollector ? ' AND collector_id = $1' : '';
    const cfl = isCollector ? ' AND l.collector_id = $1' : '';

    const aggQuery = isCollector
      ? `
        SELECT
          (SELECT COUNT(*) FROM loans WHERE status = 'active' AND collector_id = $1) as active_loans,
          (SELECT COUNT(*) FROM loans) as total_loans,
          (SELECT COALESCE(SUM(outstanding_balance), 0) FROM loans WHERE status IN ('active','delinquent','past_due') AND collector_id = $1) as outstanding_balance,
          (SELECT COALESCE(SUM(outstanding_balance), 0) FROM loans WHERE status IN ('active','delinquent') AND collector_id = $1) as total_portfolio,
          (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE status IN ('active','delinquent','past_due') AND collector_id = $1) as total_principal,
          (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id WHERE pay.status = 'completed' AND l.collector_id = $1) as total_collections,
          (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id WHERE pay.status = 'completed' AND pay.payment_date >= DATE_TRUNC('month', NOW()) AND l.collector_id = $1) as monthly_collections,
          (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE release_date >= DATE_TRUNC('month', NOW()) AND collector_id = $1) as monthly_releases,
          (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE release_date IS NOT NULL AND collector_id = $1) as total_releases,
           (SELECT COUNT(DISTINCT l2.id) FROM loans l2 WHERE l2.maturity_date >= CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND l2.collector_id = $1 AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due)) as delinquent_loans,
           (SELECT COUNT(DISTINCT l2.id) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND l2.collector_id = $1 AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due)) as overdue_count,
          (SELECT COALESCE(SUM(pay.interest_amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id WHERE l.collector_id = $1) as total_interest,
          (SELECT COALESCE(SUM(pay.penalty_amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id WHERE l.collector_id = $1) as total_penalties,
          (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND l2.collector_id = $1 AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due)) as past_due_amount,
          (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN loans l2 ON l2.id = p.loan_id WHERE l2.maturity_date < CURRENT_DATE AND l2.status != 'closed' AND l2.collector_id = $1 AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) AND p.status = 'completed' AND p.payment_date >= NOW() - INTERVAL '15 days') as past_due_collections_15d,
          (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND l2.collector_id = $1 AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) >= CURRENT_DATE - 30) as past_due_1_30,
          (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND l2.collector_id = $1 AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31) as past_due_31_60,
          (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND l2.collector_id = $1 AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61) as past_due_61_90,
          (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND l2.collector_id = $1 AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) < CURRENT_DATE - 90) as past_due_90_plus,
          (SELECT COALESCE(SUM(a.total_due), 0) FROM amortization_schedules a JOIN loans l2 ON l2.id = a.loan_id WHERE a.due_date >= DATE_TRUNC('month', NOW()) AND a.due_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month' AND l2.status != 'closed' AND l2.collector_id = $1) as total_due_this_month,
          (SELECT COUNT(*) FROM loans WHERE release_date >= DATE_TRUNC('month', NOW()) AND collector_id = $1) as monthly_loan_count,
          (SELECT COUNT(DISTINCT br.id) FROM borrowers br JOIN loans l ON l.borrower_id = br.id WHERE l.collector_id = $1) as borrower_count
      `
      : `
        SELECT
          (SELECT COUNT(*) FROM loans WHERE status = 'active') as active_loans,
          (SELECT COUNT(*) FROM loans) as total_loans,
          (SELECT COALESCE(SUM(outstanding_balance), 0) FROM loans WHERE status IN ('active','delinquent','past_due')) as outstanding_balance,
          (SELECT COALESCE(SUM(outstanding_balance), 0) FROM loans WHERE status IN ('active','delinquent')) as total_portfolio,
          (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE status IN ('active','delinquent','past_due')) as total_principal,
          (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id WHERE pay.status = 'completed') as total_collections,
          (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id WHERE pay.status = 'completed' AND pay.payment_date >= DATE_TRUNC('month', NOW())) as monthly_collections,
          (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE release_date >= DATE_TRUNC('month', NOW())) as monthly_releases,
          (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE release_date IS NOT NULL) as total_releases,
           (SELECT COUNT(DISTINCT l2.id) FROM loans l2 WHERE l2.maturity_date >= CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due)) as delinquent_loans,
           (SELECT COUNT(DISTINCT l2.id) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due)) as overdue_count,
          (SELECT COALESCE(SUM(pay.interest_amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id) as total_interest,
          (SELECT COALESCE(SUM(pay.penalty_amount), 0) FROM payments pay JOIN loans l ON l.id = pay.loan_id) as total_penalties,
           (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due)) as past_due_amount,
             (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN loans l2 ON l2.id = p.loan_id WHERE l2.maturity_date < CURRENT_DATE AND l2.status != 'closed' AND EXISTS (SELECT 1 FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) AND p.status = 'completed' AND p.payment_date >= NOW() - INTERVAL '15 days') as past_due_collections_15d,
            (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) >= CURRENT_DATE - 30) as past_due_1_30,
            (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31) as past_due_31_60,
            (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61) as past_due_61_90,
            (SELECT COALESCE(SUM(l2.outstanding_balance), 0) FROM loans l2 WHERE l2.maturity_date < CURRENT_DATE AND l2.outstanding_balance > 0 AND l2.status != 'closed' AND (SELECT MIN(a.due_date) FROM amortization_schedules a WHERE a.loan_id = l2.id AND a.due_date < CURRENT_DATE AND COALESCE(a.paid_amount,0) < a.total_due) < CURRENT_DATE - 90) as past_due_90_plus,
            (SELECT COALESCE(SUM(a.total_due), 0) FROM amortization_schedules a JOIN loans l2 ON l2.id = a.loan_id WHERE a.due_date >= DATE_TRUNC('month', NOW()) AND a.due_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month' AND l2.status != 'closed') as total_due_this_month,
           (SELECT COUNT(*) FROM loans WHERE release_date >= DATE_TRUNC('month', NOW())) as monthly_loan_count,
          (SELECT COUNT(*) FROM borrowers) as borrower_count
      `;

    const [aggResult, monthlyTrendResult, releaseTrendResult, topCollectorsResult,
      recentLoans, recentPayments] = await Promise.all([

      loanRepo.query(aggQuery, cid),

      paymentRepo.query(
        `SELECT DATE_TRUNC('month', pay.payment_date) as month,
                COALESCE(SUM(pay.amount), 0) as collected,
                COALESCE(SUM(pay.interest_amount), 0) as interest,
                COALESCE(SUM(pay.penalty_amount), 0) as penalty
         FROM payments pay
         JOIN loans l ON l.id = pay.loan_id
         WHERE pay.status = 'completed'
           AND pay.payment_date >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
           ${cfl}
         GROUP BY DATE_TRUNC('month', pay.payment_date)
         ORDER BY month ASC`,
        cid
      ),

      loanRepo.query(
        `SELECT DATE_TRUNC('month', release_date) as month,
                COALESCE(SUM(principal_amount), 0) as released
         FROM loans
         WHERE release_date IS NOT NULL
           AND release_date >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
           ${cf}
         GROUP BY DATE_TRUNC('month', release_date)
         ORDER BY month ASC`,
        cid
      ),

      isCollector ? Promise.resolve([]) : paymentRepo.query(
        `SELECT u.id, u.first_name || ' ' || u.last_name as collector_name,
                COALESCE(SUM(pay.amount), 0) as total_collected,
                COUNT(pay.id) as payment_count
         FROM payments pay
         JOIN loans l ON l.id = pay.loan_id
         JOIN users u ON u.id = l.collector_id
         WHERE pay.status = 'completed'
           AND pay.payment_date >= DATE_TRUNC('month', NOW())
         GROUP BY u.id, u.first_name, u.last_name
         ORDER BY total_collected DESC
         LIMIT 5`
      ),

      loanRepo.query(
        `SELECT l.loan_number, l.principal_amount, l.status, l.release_date,
                b.first_name || ' ' || b.last_name as borrower_name
         FROM loans l
         JOIN borrowers b ON b.id = l.borrower_id
         WHERE l.release_date IS NOT NULL${cf}
         ORDER BY l.release_date DESC
         LIMIT 5`,
        cid
      ),

      paymentRepo.query(
        `SELECT p.payment_number, p.amount, p.payment_date, p.payment_method,
                l.loan_number,
                b.first_name || ' ' || b.last_name as borrower_name
         FROM payments p
         JOIN loans l ON l.id = p.loan_id
         JOIN borrowers b ON b.id = p.borrower_id
         WHERE p.status = 'completed'${cfl}
         ORDER BY p.payment_date DESC
         LIMIT 5`,
        cid
      ),
    ]);

    const r = aggResult[0];
    const activeLoans = parseInt(r.active_loans);
    const totalLoans = parseInt(r.total_loans);
    const portfolioTotal = parseFloat(r.total_portfolio);
    const totalCollected = parseFloat(r.total_collections);
    const collectionRate = portfolioTotal > 0
      ? Math.round((totalCollected / (portfolioTotal + totalCollected)) * 100)
      : totalCollected > 0 ? 100 : 0;
    const delinquentLoans = parseInt(r.delinquent_loans);
    const totalActiveAndDelinquent = activeLoans + delinquentLoans;
    const delinquencyRate = totalActiveAndDelinquent > 0
      ? Math.round((delinquentLoans / totalActiveAndDelinquent) * 100)
      : 0;
    const pastDueAmount = parseFloat(r.past_due_amount);
    const pastDueCollections15d = parseFloat(r.past_due_collections_15d);
    const pastDue1_30 = parseFloat(r.past_due_1_30);
    const pastDue31_60 = parseFloat(r.past_due_31_60);
    const pastDue61_90 = parseFloat(r.past_due_61_90);
    const pastDue90Plus = parseFloat(r.past_due_90_plus);
    const totalDueThisMonth = parseFloat(r.total_due_this_month);
    const monthlyCollected = parseFloat(r.monthly_collections);
    const collectionEfficiency = totalDueThisMonth > 0
      ? Math.round((monthlyCollected / totalDueThisMonth) * 100)
      : monthlyCollected > 0 ? 100 : 0;
    const borrowerCount = parseInt(r.borrower_count);
    const monthlyLoanCount = parseInt(r.monthly_loan_count);
    const activePrincipal = parseFloat(r.total_principal);
    const averageLoanSize = activeLoans > 0
      ? Math.round(activePrincipal / activeLoans)
      : 0;

    return {
      pastDueAmount,
      pastDueCollections15d,
      pastDue1_30,
      pastDue31_60,
      pastDue61_90,
      pastDue90Plus,
      totalDueThisMonth,
      collectionEfficiency,
      monthlyLoanCount,
      borrowerCount,
      averageLoanSize,
      activeLoans,
      totalLoans,
      outstandingBalance: parseFloat(r.outstanding_balance),
      totalPortfolio: portfolioTotal,
      totalPrincipal: activePrincipal,
      totalCollections: totalCollected,
      monthlyCollections: parseFloat(r.monthly_collections),
      monthlyReleases: parseFloat(r.monthly_releases),
      totalReleases: parseFloat(r.total_releases),
      collectionRate,
      delinquencyRate,
      delinquentLoans,
      overdueCount: parseInt(r.overdue_count),
      interestEarned: parseFloat(r.total_interest),
      penaltyIncome: parseFloat(r.total_penalties),
      monthlyTrend: (monthlyTrendResult || []).map((r: any) => ({
        month: r.month,
        collected: parseFloat(r.collected),
        interest: parseFloat(r.interest),
        penalty: parseFloat(r.penalty),
      })),
      releaseTrend: (releaseTrendResult || []).map((r: any) => ({
        month: r.month,
        released: parseFloat(r.released),
      })),
      topCollectors: (topCollectorsResult || []).map((r: any) => ({
        id: r.id,
        name: r.collector_name,
        totalCollected: parseFloat(r.total_collected),
        paymentCount: parseInt(r.payment_count),
      })),
      recentLoans: (recentLoans || []).map((r: any) => ({
        loanNumber: r.loan_number,
        principalAmount: parseFloat(r.principal_amount),
        status: r.status,
        releaseDate: r.release_date,
        borrowerName: r.borrower_name,
      })),
      recentPayments: (recentPayments || []).map((r: any) => ({
        paymentNumber: r.payment_number,
        amount: parseFloat(r.amount),
        paymentDate: r.payment_date,
        method: r.payment_method,
        loanNumber: r.loan_number,
        borrowerName: r.borrower_name,
      })),
    };
  }
  async createHistoricalLoan(userId: string, data: any) {
    const borrower = await borrowerRepo.findById(data.borrowerId);
    if (!borrower) throw new Error('Borrower not found');

    const product = data.loanProductId ? await loanProductRepo.findById(data.loanProductId) : null;
    const principal = Number(data.principalAmount) || 0;
    const interestRate = Number(data.interestRate) || 0;
    const interestType = data.interestType || product?.interest_type || 'flat-rate';
    const termMonths = Number(data.termMonths) || 0;
    const termType = data.termType || 'months';
    const paymentFrequency = data.paymentFrequency || 'monthly';
    const installmentCount = data.installmentCount ? Number(data.installmentCount) : undefined;

    // If no manual schedule, generate via calculateAmortization
    let scheduleItems: any[];
    let excessAmount = 0;
    let hasPaidUpToDate: Date | null = null;
    if (data.schedule && data.schedule.length > 0) {
      scheduleItems = data.schedule;
    } else {
      const { schedule, totalInterest, totalAmount } = calculateAmortization(
        principal, interestRate, termMonths, interestType, paymentFrequency,
        data.releaseDate ? new Date(data.releaseDate) : new Date(),
        termType, installmentCount
      );
      const totalPaid = Number(data.totalPaid) || 0;
      const paidUpToDate = data.paidUpToDate ? new Date(data.paidUpToDate) : null;
      hasPaidUpToDate = paidUpToDate;

      let remaining = totalPaid;
      scheduleItems = schedule.map((s: any) => {
        const isDue = !paidUpToDate || s.dueDate <= paidUpToDate;
        const canPay = isDue && remaining > 0;
        let paidAmount = 0;
        let status = 'pending';
        if (canPay) {
          paidAmount = Math.min(remaining, s.totalDue);
          remaining -= paidAmount;
          status = paidAmount >= s.totalDue ? 'paid' : 'partial';
        }
        return {
          installmentNo: s.installmentNo,
          dueDate: s.dueDate.toISOString().split('T')[0],
          principal: s.principal,
          interest: s.interest,
          total_due: s.totalDue,
          balance: s.balance,
          paidAmount,
          status,
          paidAt: canPay && paidUpToDate ? paidUpToDate.toISOString() : null,
        };
      });
      excessAmount = paidUpToDate ? remaining : 0;
    }

    const totalInterest = scheduleItems.reduce((s: number, item: any) => s + Number(item.interest || 0), 0);
      const totalAmount = scheduleItems.reduce((s: number, item: any) => s + Number(item.total_due || 0), 0);

    // Also compute total overdue & max days for the collection record
    const now = new Date();
    let totalOverdue = 0;
    let maxDaysOverdue = 0;
    for (const s of scheduleItems) {
      const dueDate = new Date(s.dueDate);
      if (dueDate < now) {
        const shortage = Number(s.total_due) - Number(s.paidAmount || 0);
        if (shortage > 0) {
          totalOverdue += shortage;
          const days = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          if (days > maxDaysOverdue) maxDaysOverdue = days;
        }
      }
    }
    const loanNumber = generateLoanNumber();

    const maturityDate = (() => {
      if (!data.releaseDate) return null;
      const d = new Date(data.releaseDate);
      if (termType === 'days') d.setDate(d.getDate() + termMonths);
      else if (termType === 'weeks') d.setDate(d.getDate() + termMonths * 7);
      else d.setMonth(d.getMonth() + termMonths);
      return d;
    })();

    // Compute charges (same logic as releaseLoan)
    let totalCharges = 0;
    let chargeSource: any[] = [];
    if (data.loanProductId) {
      const productCharges = await loanProductChargeRepo.query(
        `SELECT lpc.*, c.name, c.computation_type, c.default_amount
         FROM loan_product_charges lpc
         JOIN charges c ON c.id = lpc.charge_id
         WHERE lpc.loan_product_id = $1 AND c.is_active = true`,
        [data.loanProductId]
      );
      if (productCharges.length > 0) {
        chargeSource = productCharges;
      } else {
        const allCharges = await loanProductChargeRepo.query(
          `SELECT NULL as id, NULL as loan_product_id, c.id as charge_id, NULL as amount, false as is_required,
                  c.name, c.computation_type, c.default_amount
           FROM charges c WHERE c.is_active = true ORDER BY c.name`
        );
        chargeSource = allCharges;
      }
    }
    for (const pc of chargeSource) {
      const rawAmount = parseFloat(pc.amount ?? pc.default_amount ?? 0);
      const chargeAmount = pc.computation_type === 'percentage'
        ? Math.round(principal * rawAmount / 100 * 100) / 100
        : rawAmount;
      totalCharges += chargeAmount;
    }
    const prevBalance = Number(data.previousBalance) || 0;
    const netProceeds = principal - totalCharges - prevBalance;
    const totalSchedulePaid = scheduleItems.reduce((s: number, item: any) => s + Number(item.paidAmount || 0), 0);

    const loan = await loanRepo.create({
      loan_number: loanNumber,
      borrower_id: data.borrowerId,
      product_id: data.loanProductId || null,
      principal_amount: principal,
      interest_amount: totalInterest,
      total_amount: totalAmount,
      outstanding_balance: totalAmount - totalSchedulePaid - excessAmount,
      interest_rate: interestRate,
      interest_type: interestType,
      term_months: termMonths,
      term_type: termType,
      installment_count: scheduleItems.length,
      payment_frequency: paymentFrequency,
      status: data.status || 'paid',
      release_date: data.releaseDate ? new Date(data.releaseDate) : null,
      next_payment_date: null,
      maturity_date: maturityDate,
      late_payment_fee: 0,
      net_proceeds: netProceeds,
      advance_balance: excessAmount,
      released_by: userId,
      collector_id: data.collectorId || null,
    });

    // Create loan charge records
    for (const pc of chargeSource) {
      const rawAmount = parseFloat(pc.amount ?? pc.default_amount ?? 0);
      const chargeAmount = pc.computation_type === 'percentage'
        ? Math.round(principal * rawAmount / 100 * 100) / 100
        : rawAmount;
      await loanChargeRepo.create({
        loan_id: loan.id,
        charge_id: pc.charge_id,
        charge_name: pc.name,
        amount: chargeAmount,
      });
    }

    const createdSchedules = await amortizationScheduleRepo.batchCreate(
      scheduleItems.map(item => ({
        loan_id: loan.id,
        installment_no: item.installmentNo,
        due_date: new Date(item.dueDate),
        principal: Number(item.principal) || 0,
        interest: Number(item.interest) || 0,
        total_due: Number(item.total_due) || 0,
        balance: Number(item.balance) || 0,
        paid_amount: Number(item.paidAmount) || 0,
        status: item.status || 'pending',
        paid_at: item.paidAt ? new Date(item.paidAt) : null,
      }))
    );

    const paidSchedules = createdSchedules
      .filter((s: any) => Number(s.paid_amount) > 0)
      .map((s: any) => ({ scheduleId: s.id, amount: Number(s.paid_amount), paidAt: s.paid_at }));

    const totalPaidAmount = paidSchedules.reduce((s: number, p: any) => s + p.amount, 0);
    const paymentRecordAmount = totalPaidAmount + excessAmount;
    if (paymentRecordAmount > 0) {
      const latestDate = paidSchedules.length > 0
        ? paidSchedules.reduce((latest: Date, p: any) => p.paidAt && p.paidAt > latest ? p.paidAt : latest, paidSchedules[0].paidAt || new Date())
        : (hasPaidUpToDate || new Date());
      const payment = await paymentRepo.create({
        payment_number: 'HIST-' + loan.loan_number,
        loan_id: loan.id,
        borrower_id: data.borrowerId,
        amount: paymentRecordAmount,
        principal_amount: paymentRecordAmount,
        interest_amount: 0,
        advance_amount: excessAmount,
        payment_method: 'historical',
        payment_date: latestDate,
        received_by: userId,
        receipt_number: 'HIST-' + loan.loan_number,
        status: 'completed',
      });

      if (paidSchedules.length > 0) {
        await paymentAllocationRepo.batchCreate(
          paidSchedules.map((ps: any) => ({
            payment_id: payment.id,
            schedule_id: ps.scheduleId,
            amount: ps.amount,
            allocated_to: 'principal',
          }))
        );
      }
    }

    await collectionRepo.create({
      loan_id: loan.id,
      borrower_id: data.borrowerId,
      collector_id: loan.collector_id || null,
      status: 'active',
      total_due: totalAmount,
      total_overdue: totalOverdue,
      days_overdue: maxDaysOverdue,
    });

    return loan;
  }

  async distributeAdvance(loanId: string, allocations: { scheduleId: string; amount: number }[], userId: string) {
    const pool = (await import('../database/connection')).pool;
    const loanRows = await loanRepo.query(`SELECT * FROM loans WHERE id = $1`, [loanId]);
    if (!loanRows.length) throw new Error('Loan not found');
    const loan = loanRows[0];
    const curAdvance = parseFloat(loan.advance_balance || '0');
    if (curAdvance <= 0) throw new Error('No advance balance to distribute');

    const totalRequested = allocations.reduce((s, a) => s + a.amount, 0);
    if (totalRequested <= 0) throw new Error('No amount to distribute');

    const allSchedules: any[] = await amortizationScheduleRepo.query(
      `SELECT * FROM amortization_schedules WHERE loan_id = $1 ORDER BY installment_no ASC`, [loanId]
    );

    // Find source payments (ones with advance_amount > 0) to link allocations
    const sourcePayments: any[] = await paymentRepo.query(
      `SELECT id FROM payments WHERE loan_id = $1 AND advance_amount > 0 ORDER BY created_at ASC`, [loanId]
    );

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO public');
      await client.query('BEGIN');

      let updatedTotal = 0;
      let remainingAdvance = curAdvance;
      const allocRecords: { paymentId: string; scheduleId: string; amount: number }[] = [];
      for (const alloc of allocations) {
        if (alloc.amount <= 0 || remainingAdvance <= 0) continue;
        const schedule = allSchedules.find((s: any) => s.id === alloc.scheduleId);
        if (!schedule) continue;

        const currentPaid = parseFloat(schedule.paid_amount);
        const totalDue = parseFloat(schedule.total_due);
        const shortage = Math.max(0, totalDue - currentPaid);
        const applied = Math.min(alloc.amount, shortage, remainingAdvance);

        const newPaid = currentPaid + applied;
        const newStatus = newPaid >= totalDue - 0.005 ? 'paid' : (newPaid > 0 ? 'partial' : schedule.status);

        await client.query(
          `UPDATE amortization_schedules SET paid_amount = $1, status = $2, paid_at = $3, updated_at = NOW() WHERE id = $4`,
          [newPaid, newStatus, newStatus === 'paid' ? new Date() : null, schedule.id]
        );

        updatedTotal += applied;
        remainingAdvance -= applied;
        allocRecords.push({ paymentId: sourcePayments[0]?.id || loan.id, scheduleId: schedule.id, amount: applied });
      }

      if (allocRecords.length > 0) {
        for (const ar of allocRecords) {
          await client.query(
            `INSERT INTO payment_allocations (payment_id, schedule_id, amount, allocated_to) VALUES ($1,$2,$3,'advance_distribution')`,
            [ar.paymentId, ar.scheduleId, ar.amount]
          );
        }
      }

      const newAdvance = curAdvance - updatedTotal;
      await client.query(
        `UPDATE loans SET advance_balance = $1, updated_at = NOW() WHERE id = $2`,
        [newAdvance, loanId]
      );

      await client.query('COMMIT');
      return { distributedAmount: updatedTotal, newAdvanceBalance: newAdvance, newOutstandingBalance: parseFloat(loan.outstanding_balance) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

export const loanService = new LoanService();
