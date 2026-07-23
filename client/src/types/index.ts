export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
  role_id: string;
  branch_id?: string;
  is_active: boolean;
  last_login?: string;
  role_name?: string;
  role_slug?: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
}

export interface Borrower {
  id: string;
  borrower_code: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  date_of_birth?: string;
  gender?: string;
  civil_status?: string;
  nationality?: string;
  mobile: string;
  email?: string;
  present_address?: string;
  present_city?: string;
  present_province?: string;
  permanent_address?: string;
  permanent_city?: string;
  permanent_province?: string;
  employment_status?: string;
  employer_name?: string;
  employer_address?: string;
  employer_phone?: string;
  position?: string;
  monthly_income?: number;
  credit_limit?: number;
  business_name?: string;
  business_type?: string;
  business_address?: string;
  government_id_type?: string;
  government_id_number?: string;
  photo_url?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  branch_id?: string;
  branch_name?: string;
  documents?: BorrowerDocument[];
  coMakers?: CoMaker[];
  created_at: string;
  whatsapp_phone?: string;
}

export interface BorrowerDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  is_verified: boolean;
}

export interface CoMaker {
  id: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email?: string;
  relationship?: string;
}

export interface LoanProduct {
  id: string;
  name: string;
  description?: string;
  interest_type: string;
  interest_rate: number;
  min_amount: number;
  max_amount: number;
  min_term: number;
  max_term: number;
  term_type: string;
  penalty_type?: string;
  penalty_value?: number;
  penalty_matured_value?: number;
  processing_fee: number;
  service_charge: number;
  late_payment_fee: number;
  requires_co_maker: boolean;
  is_active: boolean;
}

export interface LoanApplication {
  id: string;
  application_number: string;
  borrower_id: string;
  loan_product_id: string;
  principal_amount: number;
  term_months: number;
  term_type?: string;
  installment_count?: number;
  interest_rate: number;
  interest_type: string;
  status: string;
  purpose?: string;
  payment_frequency: string;
  borrower_name?: string;
  borrower_code?: string;
  product_name?: string;
  collector_id?: string;
  collector_name?: string;
  officer_name?: string;
  risk_score?: number;
  risk_notes?: string;
  mobile?: string;
  created_at: string;
  submitted_at?: string;
  application_type?: string;
  deleted_at?: string;
  previous_balance?: number;
}

export interface Loan {
  id: string;
  loan_number: string;
  application_id: string;
  borrower_id: string;
  borrower_name?: string;
  borrower_code?: string;
  mobile?: string;
  product_name?: string;
  principal_amount: number;
  net_proceeds?: number;
  charges?: { charge_name: string; amount: number }[];
  interest_amount: number;
  total_amount: number;
  outstanding_balance: number;
  interest_rate: number;
  interest_type: string;
  term_months: number;
  term_type?: string;
  payment_frequency: string;
  status: string;
  release_date?: string;
  maturity_date?: string;
  next_payment_date?: string;
  processing_fee: number;
  collector_id?: string;
  collector_name?: string;
  previous_balance?: number;
  advance_balance?: number;
  schedule?: AmortizationSchedule[];
  payments?: Payment[];
}

export interface AmortizationSchedule {
  id: string;
  loan_id: string;
  installment_no: number;
  due_date: string;
  principal: number;
  interest: number;
  balance: number;
  total_due: number;
  paid_amount: number;
  penalty_amount: number;
  status: string;
  paid_at?: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  loan_id: string;
  borrower_id: string;
  borrower_name?: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  penalty_waived: number;
  payment_method: string;
  reference_number?: string;
  payment_date: string;
  received_by?: string;
  receipt_number?: string;
  notes?: string;
  status: string;
  collector_id?: string;
  remittance_status?: string;
  remitted_at?: string;
  pickup_id?: string;
  cancellation_reason?: string;
}

export interface Collection {
  id: string;
  loan_id: string;
  borrower_id: string;
  borrower_name?: string;
  mobile?: string;
  loan_number?: string;
  outstanding_balance?: number;
  collector_id?: string;
  collector_name?: string;
  status: string;
  promise_to_pay_date?: string;
  promise_to_pay_amount?: number;
  last_visit_date?: string;
  last_visit_notes?: string;
  next_visit_date?: string;
  total_due: number;
  total_overdue: number;
  days_overdue: number;
  visits?: CollectionVisit[];
}

export interface CollectionVisit {
  id: string;
  visit_date: string;
  visit_type: string;
  notes?: string;
  result?: string;
}

export interface DashboardStats {
  pastDueAmount: number;
  pastDueCollections30d: number;
  borrowerCount: number;
  averageLoanSize: number;
  activeLoans: number;
  totalLoans: number;
  outstandingBalance: number;
  totalPortfolio: number;
  totalPrincipal: number;
  totalCollections: number;
  monthlyCollections: number;
  monthlyReleases: number;
  totalReleases: number;
  collectionRate: number;
  delinquencyRate: number;
  delinquentLoans: number;
  overdueCount: number;
  interestEarned: number;
  penaltyIncome: number;
  monthlyTrend: { month: string; collected: number; interest: number; penalty: number }[];
  releaseTrend: { month: string; released: number }[];
  topCollectors: { id: string; name: string; totalCollected: number; paymentCount: number }[];
  recentLoans: { loanNumber: string; principalAmount: number; status: string; releaseDate: string; borrowerName: string }[];
  recentPayments: { paymentNumber: string; amount: number; paymentDate: string; method: string; loanNumber: string; borrowerName: string }[];
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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
