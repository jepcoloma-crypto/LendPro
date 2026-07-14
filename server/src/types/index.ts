export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role_id: string;
  branch_id: string | null;
  is_active: boolean;
  phone: string | null;
  avatar_url: string | null;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  permissions: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Borrower {
  id: string;
  borrower_code: string;
  user_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  date_of_birth: Date | null;
  gender: string | null;
  civil_status: string | null;
  nationality: string | null;
  mobile: string;
  email: string | null;
  present_address: string | null;
  present_city: string | null;
  present_province: string | null;
  permanent_address: string | null;
  permanent_city: string | null;
  permanent_province: string | null;
  employment_status: string | null;
  employer_name: string | null;
  employer_address: string | null;
  position: string | null;
  monthly_income: number | null;
  business_name: string | null;
  business_type: string | null;
  business_address: string | null;
  government_id_type: string | null;
  government_id_number: string | null;
  status: string;
  branch_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LoanProduct {
  id: string;
  name: string;
  description: string | null;
  interest_type: string;
  interest_rate: number;
  min_amount: number;
  max_amount: number;
  min_term: number;
  max_term: number;
  term_type: string;
  penalty_type: string | null;
  penalty_value: number | null;
  penalty_grace_period: number | null;
  penalty_matured_value: number | null;
  processing_fee: number;
  service_charge: number;
  late_payment_fee: number;
  requires_co_maker: boolean;
  requires_collateral: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface LoanApplication {
  id: string;
  application_number: string;
  borrower_id: string;
  loan_product_id: string;
  principal_amount: number;
  term_months: number;
  interest_rate: number;
  interest_type: string;
  status: string;
  purpose: string | null;
  payment_frequency: string;
  co_maker_id: string | null;
  assigned_officer_id: string | null;
  risk_score: number | null;
  risk_notes: string | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Loan {
  id: string;
  loan_number: string;
  application_id: string;
  borrower_id: string;
  product_id: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  outstanding_balance: number;
  interest_rate: number;
  interest_type: string;
  term_months: number;
  payment_frequency: string;
  status: string;
  release_date: Date | null;
  maturity_date: Date | null;
  next_payment_date: Date | null;
  processing_fee: number;
  service_charge: number;
  late_payment_fee: number;
  penalty_type: string | null;
  penalty_value: number | null;
  penalty_grace_period: number | null;
  penalty_matured_value: number | null;
  approved_by: string | null;
  released_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AmortizationSchedule {
  id: string;
  loan_id: string;
  installment_no: number;
  due_date: Date;
  principal: number;
  interest: number;
  balance: number;
  total_due: number;
  paid_amount: number;
  penalty_amount: number;
  status: string;
  paid_at: Date | null;
  created_at: Date;
}

export interface Payment {
  id: string;
  payment_number: string;
  loan_id: string;
  borrower_id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  penalty_waived: number;
  advance_amount: number;
  payment_method: string;
  reference_number: string | null;
  payment_date: Date;
  received_by: string | null;
  receipt_number: string | null;
  notes: string | null;
  status: string;
  created_at: Date;
}

export interface Collection {
  id: string;
  loan_id: string;
  borrower_id: string;
  collector_id: string | null;
  status: string;
  promise_to_pay_date: Date | null;
  promise_to_pay_amount: number | null;
  last_visit_date: Date | null;
  last_visit_notes: string | null;
  next_visit_date: Date | null;
  total_due: number;
  total_overdue: number;
  days_overdue: number;
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: string;
  user_id: string | null;
  borrower_id: string | null;
  type: string;
  channel: string;
  subject: string;
  message: string;
  recipient: string;
  status: string;
  sent_at: Date | null;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: any | null;
  new_values: any | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface JwtPayload {
  userId: string;
  role: string;
  roleSlug: string;
  branchId: string | null;
  permissions: string[];
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
