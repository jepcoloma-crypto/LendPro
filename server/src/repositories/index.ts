import { BaseRepository } from './base';

export class UserRepository extends BaseRepository { constructor() { super('users'); } }
export class RoleRepository extends BaseRepository { constructor() { super('roles'); } }
export class BranchRepository extends BaseRepository { constructor() { super('branches'); } }
export class BorrowerRepository extends BaseRepository { constructor() { super('borrowers'); } }
export class BorrowerDocumentRepository extends BaseRepository { constructor() { super('borrower_documents'); } }
export class CoMakerRepository extends BaseRepository { constructor() { super('co_makers'); } }
export class LoanProductRepository extends BaseRepository { constructor() { super('loan_products'); } }
export class InterestTypeRepository extends BaseRepository { constructor() { super('interest_types'); } }
export class LoanApplicationRepository extends BaseRepository { constructor() { super('loan_applications'); } }
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
