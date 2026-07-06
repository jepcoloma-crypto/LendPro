import { BaseRepository } from './base';
import { query } from '../database/connection';

export class UserRepository extends BaseRepository { constructor() { super('users'); } }
export class RoleRepository extends BaseRepository { constructor() { super('roles'); } }
export class BranchRepository extends BaseRepository { constructor() { super('branches'); } }
export class BorrowerRepository extends BaseRepository { constructor() { super('borrowers'); } }
export class BorrowerDocumentRepository extends BaseRepository { constructor() { super('borrower_documents'); } }
export class CoMakerRepository extends BaseRepository { constructor() { super('co_makers'); } }
export class LoanProductRepository extends BaseRepository { constructor() { super('loan_products'); } }
export class InterestTypeRepository extends BaseRepository { constructor() { super('interest_types'); } }
export class LoanApplicationRepository extends BaseRepository {
  constructor() { super('loan_applications'); }

  async findById(id: string, select: string = '*'): Promise<any | null> {
    const result = await query(
      `SELECT ${select} FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findOne(conditions: Record<string, any>, select: string = '*'): Promise<any | null> {
    const whereClauses: string[] = ['deleted_at IS NULL'];
    const values: any[] = [];
    let paramIndex = 1;
    for (const [key, value] of Object.entries(conditions)) {
      whereClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    const result = await query(
      `SELECT ${select} FROM ${this.tableName} WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
      values
    );
    return result.rows[0] || null;
  }

  async findAll(options: {
    conditions?: Record<string, any>;
    joins?: string;
    select?: string;
    orderBy?: string;
    limit?: number;
    offset?: number;
    alias?: string;
  } = {}): Promise<{ rows: any[]; total: number }> {
    const { conditions = {}, joins = '', select = '*', orderBy = 'created_at DESC', limit = 10, offset = 0, alias } = options;
    const from = alias ? `${this.tableName} ${alias}` : this.tableName;
    const whereClauses: string[] = ['deleted_at IS NULL'];
    const values: any[] = [];
    let paramIndex = 1;
    for (const [key, value] of Object.entries(conditions)) {
      if (value !== undefined && value !== null) {
        whereClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const countResult = await query(`SELECT COUNT(*) FROM ${from} ${joins} ${where}`, values);
    const total = parseInt(countResult.rows[0].count, 10);
    const dataResult = await query(
      `SELECT ${select} FROM ${from} ${joins} ${where} ORDER BY ${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );
    return { rows: dataResult.rows, total };
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async restore(id: string): Promise<any | null> {
    const result = await query(
      `UPDATE ${this.tableName} SET deleted_at = NULL WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findDeleted(options: {
    joins?: string;
    select?: string;
    orderBy?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ rows: any[]; total: number }> {
    const { joins = '', select = '*', orderBy = 'deleted_at DESC', limit = 10, offset = 0 } = options;
    const countResult = await query(
      `SELECT COUNT(*) FROM ${this.tableName} ${joins} WHERE deleted_at IS NOT NULL`
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const dataResult = await query(
      `SELECT ${select} FROM ${this.tableName} ${joins} WHERE deleted_at IS NOT NULL ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { rows: dataResult.rows, total };
  }

  async findAllIncludingDeleted(options: {
    conditions?: Record<string, any>;
    joins?: string;
    select?: string;
    orderBy?: string;
    limit?: number;
    offset?: number;
    alias?: string;
  } = {}): Promise<{ rows: any[]; total: number }> {
    const { conditions = {}, joins = '', select = '*', orderBy = 'created_at DESC', limit = 10, offset = 0, alias } = options;
    const from = alias ? `${this.tableName} ${alias}` : this.tableName;
    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    for (const [key, value] of Object.entries(conditions)) {
      if (value !== undefined && value !== null) {
        whereClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countResult = await query(`SELECT COUNT(*) FROM ${from} ${joins} ${where}`, values);
    const total = parseInt(countResult.rows[0].count, 10);
    const dataResult = await query(
      `SELECT ${select} FROM ${from} ${joins} ${where} ORDER BY ${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );
    return { rows: dataResult.rows, total };
  }
}
export class ApplicationDocumentRepository extends BaseRepository { constructor() { super('application_documents'); } }
export class LoanApprovalRepository extends BaseRepository { constructor() { super('loan_approvals'); } }
export class LoanRepository extends BaseRepository { constructor() { super('loans'); } }
export class LoanDisbursementRepository extends BaseRepository { constructor() { super('loan_disbursements'); } }
export class AmortizationScheduleRepository extends BaseRepository { constructor() { super('amortization_schedules'); } }
export class PaymentRepository extends BaseRepository { constructor() { super('payments'); } }
export class PaymentAllocationRepository extends BaseRepository { constructor() { super('payment_allocations'); } }
export class PenaltyRepository extends BaseRepository { constructor() { super('penalties'); } }
export class PenaltyRuleRepository extends BaseRepository { constructor() { super('penalty_rules'); } }
export class CollectionRepository extends BaseRepository { constructor() { super('collections'); } }
export class CollectionVisitRepository extends BaseRepository { constructor() { super('collection_visits'); } }
export class NotificationRepository extends BaseRepository { constructor() { super('notifications'); } }
export class EmailLogRepository extends BaseRepository { constructor() { super('email_logs'); } }
export class SmsLogRepository extends BaseRepository { constructor() { super('sms_logs'); } }
export class AuditLogRepository extends BaseRepository { constructor() { super('audit_logs'); } }
export class CancellationRequestRepository extends BaseRepository { constructor() { super('cancellation_requests'); } }
export class CashierSessionRepository extends BaseRepository { constructor() { super('cashier_sessions'); } }
export class CashTransactionRepository extends BaseRepository { constructor() { super('cash_transactions'); } }
export class CashCountRepository extends BaseRepository { constructor() { super('cash_counts'); } }
export class CashReconciliationRepository extends BaseRepository { constructor() { super('cash_reconciliations'); } }
export class ApprovalHistoryRepository extends BaseRepository { constructor() { super('approval_history'); } }
export class ChargeRepository extends BaseRepository { constructor() { super('charges'); } }
export class LoanProductChargeRepository extends BaseRepository { constructor() { super('loan_product_charges'); } }
export class LoanChargeRepository extends BaseRepository { constructor() { super('loan_charges'); } }

export class SystemSettingRepository extends BaseRepository { constructor() { super('system_settings'); } }

export const userRepo = new UserRepository();
export const roleRepo = new RoleRepository();
export const branchRepo = new BranchRepository();
export const borrowerRepo = new BorrowerRepository();
export const borrowerDocumentRepo = new BorrowerDocumentRepository();
export const coMakerRepo = new CoMakerRepository();
export const loanProductRepo = new LoanProductRepository();
export const interestTypeRepo = new InterestTypeRepository();
export const loanApplicationRepo = new LoanApplicationRepository();
export const applicationDocumentRepo = new ApplicationDocumentRepository();
export const loanApprovalRepo = new LoanApprovalRepository();
export const loanRepo = new LoanRepository();
export const loanDisbursementRepo = new LoanDisbursementRepository();
export const amortizationScheduleRepo = new AmortizationScheduleRepository();
export const paymentRepo = new PaymentRepository();
export const paymentAllocationRepo = new PaymentAllocationRepository();
export const cancellationRequestRepo = new CancellationRequestRepository();
export const cashierSessionRepo = new CashierSessionRepository();
export const cashTransactionRepo = new CashTransactionRepository();
export const cashCountRepo = new CashCountRepository();
export const cashReconciliationRepo = new CashReconciliationRepository();
export const approvalHistoryRepo = new ApprovalHistoryRepository();
export const penaltyRepo = new PenaltyRepository();
export const penaltyRuleRepo = new PenaltyRuleRepository();
export const collectionRepo = new CollectionRepository();
export const collectionVisitRepo = new CollectionVisitRepository();
export const notificationRepo = new NotificationRepository();
export const emailLogRepo = new EmailLogRepository();
export const smsLogRepo = new SmsLogRepository();
export const auditLogRepo = new AuditLogRepository();
export const chargeRepo = new ChargeRepository();
export const loanProductChargeRepo = new LoanProductChargeRepository();
export const loanChargeRepo = new LoanChargeRepository();
export const systemSettingRepo = new SystemSettingRepository();
