import {
  loanRepo,
  loanApplicationRepo,
  amortizationScheduleRepo,
  paymentRepo,
  collectionRepo,
  loanProductRepo,
  borrowerRepo,
  loanProductChargeRepo,
  loanChargeRepo,
} from '../repositories';
import { calculateAmortization, generateLoanNumber, generateApplicationNumber, generatePaymentNumber } from '../utils/helpers';

export class LoanService {
  async createApplication(data: any, userId: string) {
    const product = await loanProductRepo.findById(data.loanProductId);
    if (!product) throw new Error('Loan product not found');

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
      status: 'draft',
      purpose: data.purpose || null,
      payment_frequency: data.paymentFrequency || 'monthly',
      co_maker_id: data.coMakerId || null,
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

    const delinquentLoans = await loanRepo.query(
      `SELECT COUNT(*) as count FROM loans WHERE borrower_id = $1 AND status = 'delinquent'`,
      [app.borrower_id]
    );
    const delinquentCount = parseInt(delinquentLoans[0]?.count || '0', 10);
    if (delinquentCount > 0) throw new Error('Borrower has delinquent loan(s). Please settle outstanding debts before applying.');

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
    if (Object.keys(fields).length === 0) throw new Error('No fields to update');
    return loanApplicationRepo.update(id, fields);
  }

  async deleteApplication(id: string) {
    const app = await loanApplicationRepo.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'draft') throw new Error('Only draft applications can be deleted');
    return loanApplicationRepo.delete(id);
  }

  async releaseLoan(applicationId: string, userId: string, method: string = 'cash', reference?: string) {
    const app = await loanApplicationRepo.findById(applicationId);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'approved') throw new Error('Application is not approved');
    if (app.borrower_id) {
      await this.checkCreditLimit(app.borrower_id, Number(app.principal_amount), applicationId, false);
    }

    const product = await loanProductRepo.findById(app.loan_product_id);

    const { schedule, totalInterest, totalAmount } = calculateAmortization(
      parseFloat(app.principal_amount),
      parseFloat(app.interest_rate),
      app.term_months,
      app.interest_type,
      app.payment_frequency,
      new Date(),
      app.term_type || 'months',
      app.installment_count || undefined
    );

    const loanNumber = generateLoanNumber();

    const maturityDate = schedule.length > 0
      ? new Date(schedule[schedule.length - 1].dueDate)
      : new Date();

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
      payment_frequency: app.payment_frequency,
      status: 'active',
      release_date: new Date(),
      next_payment_date: schedule[0]?.dueDate || null,
      maturity_date: maturityDate,
      late_payment_fee: product?.late_payment_fee || 0,
      penalty_type: product?.penalty_type || null,
      penalty_value: product?.penalty_value || null,
      penalty_grace_period: product?.penalty_grace_period || 0,
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

    const netProceeds = parseFloat(app.principal_amount) - totalCharges;
    await loanRepo.update(loan.id, { net_proceeds: netProceeds });

    await loanApplicationRepo.query(
      `INSERT INTO loan_disbursements (loan_id, disbursement_method, amount, reference_number, disbursed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [loan.id, method, netProceeds, reference || null, userId]
    );

    for (const item of schedule) {
      await amortizationScheduleRepo.create({
        loan_id: loan.id,
        installment_no: item.installmentNo,
        due_date: item.dueDate,
        principal: item.principal,
        interest: item.interest,
        balance: item.balance,
        total_due: item.totalDue,
        status: 'pending',
      });
    }

    await collectionRepo.create({
      loan_id: loan.id,
      borrower_id: app.borrower_id,
      collector_id: loan.collector_id || null,
      status: 'active',
      total_due: totalAmount,
      total_overdue: 0,
      days_overdue: 0,
    });

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
    const maturityDate = schedule.length > 0 ? new Date(schedule[schedule.length - 1].dueDate) : new Date();

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
      collector_id: existing.collector_id,
      released_by: userId,
      restructured_from: existingLoanId,
    });

    // Mark old loan as restructured
    await loanRepo.update(existingLoanId, { status: 'restructured' });

    // Create amortization schedule for new loan
    for (const item of schedule) {
      await amortizationScheduleRepo.create({
        loan_id: newLoan.id,
        installment_no: item.installmentNo,
        due_date: item.dueDate,
        principal: item.principal,
        interest: item.interest,
        balance: item.balance,
        total_due: item.totalDue,
        status: 'pending',
      });
    }

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
              lp.name as product_name, lp.penalty_type, lp.penalty_value, lp.penalty_grace_period, lp.late_payment_fee,
              u.first_name || ' ' || u.last_name as released_by_name
       FROM loans l
       JOIN borrowers b ON l.borrower_id = b.id
       JOIN loan_products lp ON l.product_id = lp.id
       LEFT JOIN users u ON l.released_by = u.id
       WHERE l.id = $1`,
      [id]
    );
    if (!loans.length) throw new Error('Loan not found');

    const schedule = await amortizationScheduleRepo.findAll({
      conditions: { loan_id: id },
      orderBy: 'installment_no ASC',
      limit: 1000,
    });

    const payments = await paymentRepo.findAll({
      conditions: { loan_id: id },
      orderBy: 'payment_date DESC',
      limit: 1000,
    });

    const charges = await loanChargeRepo.query(
      `SELECT charge_name, amount FROM loan_charges WHERE loan_id = $1 ORDER BY charge_name`,
      [id]
    );

    return { ...loans[0], schedule: schedule.rows, payments: payments.rows, charges };
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
    const loanFilter = isCollector ? ` AND collector_id = '${userId}'` : '';
    const paymentLoanFilter = isCollector ? ` AND l.id IN (SELECT id FROM loans WHERE collector_id = '${userId}')` : '';

    const activeLoans = isCollector
      ? parseInt((await loanRepo.query(`SELECT COUNT(*) as c FROM loans WHERE status = 'active'${loanFilter}`))[0]?.c || '0')
      : await loanRepo.count({ status: 'active' });
    const totalLoans = await loanRepo.count({});
    const totalOutstanding = await loanRepo.query(
      `SELECT COALESCE(SUM(outstanding_balance), 0) as total FROM loans l WHERE status = 'active'${loanFilter}`
    );
    const totalPortfolio = await loanRepo.query(
      `SELECT COALESCE(SUM(outstanding_balance), 0) as total FROM loans l WHERE status IN ('active', 'delinquent')${loanFilter}`
    );
    const totalPrincipal = await loanRepo.query(
      `SELECT COALESCE(SUM(principal_amount), 0) as total FROM loans l WHERE status = 'active'${loanFilter}`
    );
    const totalPayments = await paymentRepo.query(
      `SELECT COALESCE(SUM(pay.amount), 0) as total FROM payments pay
       JOIN loans l ON l.id = pay.loan_id
       WHERE pay.status = 'completed'${paymentLoanFilter}`
    );
    const monthlyPayments = await paymentRepo.query(
      `SELECT COALESCE(SUM(pay.amount), 0) as total FROM payments pay
       JOIN loans l ON l.id = pay.loan_id
       WHERE pay.status = 'completed' AND pay.payment_date >= DATE_TRUNC('month', NOW())${paymentLoanFilter}`
    );
    const monthlyReleases = await loanRepo.query(
      `SELECT COALESCE(SUM(principal_amount), 0) as total FROM loans
       WHERE release_date >= DATE_TRUNC('month', NOW())${loanFilter}`
    );
    const totalReleases = await loanRepo.query(
      `SELECT COALESCE(SUM(principal_amount), 0) as total FROM loans
       WHERE release_date IS NOT NULL${loanFilter}`
    );
    const delinquentLoans = isCollector
      ? parseInt((await loanRepo.query(`SELECT COUNT(*) as c FROM loans WHERE status = 'delinquent'${loanFilter}`))[0]?.c || '0')
      : await loanRepo.count({ status: 'delinquent' });
    const overdueCount = isCollector
      ? parseInt((await amortizationScheduleRepo.query(
          `SELECT COUNT(*) as c FROM amortization_schedules a
           JOIN loans l ON l.id = a.loan_id
           WHERE a.status = 'overdue'${loanFilter}`
        ))[0]?.c || '0')
      : await amortizationScheduleRepo.count({ status: 'overdue' });
    const totalInterestEarned = await paymentRepo.query(
      `SELECT COALESCE(SUM(pay.interest_amount), 0) as total FROM payments pay
       JOIN loans l ON l.id = pay.loan_id${paymentLoanFilter}`
    );
    const totalPenalties = await paymentRepo.query(
      `SELECT COALESCE(SUM(pay.penalty_amount), 0) as total FROM payments pay
       JOIN loans l ON l.id = pay.loan_id${paymentLoanFilter}`
    );
    const portfolioTotal = parseFloat(totalPortfolio[0]?.total || '0');
    const totalCollected = parseFloat(totalPayments[0]?.total || '0');
    const collectionRate = portfolioTotal > 0
      ? Math.round((totalCollected / (portfolioTotal + totalCollected)) * 100)
      : totalCollected > 0 ? 100 : 0;
    const totalActiveAndDelinquent = activeLoans + delinquentLoans;
    const delinquencyRate = totalActiveAndDelinquent > 0
      ? Math.round((delinquentLoans / totalActiveAndDelinquent) * 100)
      : 0;

    // 6-month trend data (collections per month)
    const monthlyTrendResult = await paymentRepo.query(
      `SELECT DATE_TRUNC('month', pay.payment_date) as month,
              COALESCE(SUM(pay.amount), 0) as collected,
              COALESCE(SUM(pay.interest_amount), 0) as interest,
              COALESCE(SUM(pay.penalty_amount), 0) as penalty
       FROM payments pay
       JOIN loans l ON l.id = pay.loan_id
       WHERE pay.status = 'completed'
         AND pay.payment_date >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
         ${paymentLoanFilter}
       GROUP BY DATE_TRUNC('month', pay.payment_date)
       ORDER BY month ASC`
    );

    // Monthly releases trend
    const releaseTrendResult = await loanRepo.query(
      `SELECT DATE_TRUNC('month', release_date) as month,
              COALESCE(SUM(principal_amount), 0) as released
       FROM loans
       WHERE release_date IS NOT NULL
         AND release_date >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
         ${loanFilter}
       GROUP BY DATE_TRUNC('month', release_date)
       ORDER BY month ASC`
    );

    // Top collectors by collection amount
    const topCollectorsResult = isCollector ? [] : await paymentRepo.query(
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
    );

    // Recent loans
    const recentLoans = await loanRepo.query(
      `SELECT l.loan_number, l.principal_amount, l.status, l.release_date,
              b.first_name || ' ' || b.last_name as borrower_name
       FROM loans l
       JOIN borrowers b ON b.id = l.borrower_id
       WHERE l.release_date IS NOT NULL ${loanFilter}
       ORDER BY l.release_date DESC
       LIMIT 5`
    );

    // Recent payments
    const recentPayments = await paymentRepo.query(
      `SELECT p.payment_number, p.amount, p.payment_date, p.payment_method,
              l.loan_number,
              b.first_name || ' ' || b.last_name as borrower_name
       FROM payments p
       JOIN loans l ON l.id = p.loan_id
       JOIN borrowers b ON b.id = p.borrower_id
       WHERE p.status = 'completed' ${paymentLoanFilter}
       ORDER BY p.payment_date DESC
       LIMIT 5`
    );

    return {
      activeLoans,
      totalLoans,
      outstandingBalance: parseFloat(totalOutstanding[0]?.total || '0'),
      totalPortfolio: portfolioTotal,
      totalPrincipal: parseFloat(totalPrincipal[0]?.total || '0'),
      totalCollections: totalCollected,
      monthlyCollections: parseFloat(monthlyPayments[0]?.total || '0'),
      monthlyReleases: parseFloat(monthlyReleases[0]?.total || '0'),
      totalReleases: parseFloat(totalReleases[0]?.total || '0'),
      collectionRate,
      delinquencyRate,
      delinquentLoans,
      overdueCount,
      interestEarned: parseFloat(totalInterestEarned[0]?.total || '0'),
      penaltyIncome: parseFloat(totalPenalties[0]?.total || '0'),
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
}

export const loanService = new LoanService();
