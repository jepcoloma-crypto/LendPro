-- Enterprise Lending Management System - PostgreSQL Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- USERS & AUTHENTICATION
-- =====================================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  address TEXT,
  city VARCHAR(100),
  province VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role_id UUID REFERENCES roles(id),
  branch_id UUID REFERENCES branches(id),
  is_active BOOLEAN DEFAULT true,
  phone VARCHAR(50),
  avatar_url TEXT,
  last_login TIMESTAMPTZ,
  refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- BORROWER MANAGEMENT
-- =====================================================

CREATE TABLE borrowers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_code VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  suffix VARCHAR(20),
  date_of_birth DATE,
  gender VARCHAR(20),
  civil_status VARCHAR(50),
  nationality VARCHAR(100) DEFAULT 'Filipino',
  mobile VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  present_address TEXT,
  present_city VARCHAR(100),
  present_province VARCHAR(100),
  permanent_address TEXT,
  permanent_city VARCHAR(100),
  permanent_province VARCHAR(100),
  employment_status VARCHAR(50),
  employer_name VARCHAR(200),
  employer_address TEXT,
  employer_phone VARCHAR(50),
  position VARCHAR(100),
  monthly_income NUMERIC(15,2),
  business_name VARCHAR(200),
  business_type VARCHAR(100),
  business_address TEXT,
  credit_limit NUMERIC(15,2),
  government_id_type VARCHAR(100),
  government_id_number VARCHAR(100),
  photo_url TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  status VARCHAR(50) DEFAULT 'active',
  branch_id UUID REFERENCES branches(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE borrower_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID REFERENCES borrowers(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE co_makers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrower_id UUID REFERENCES borrowers(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  mobile VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  government_id_type VARCHAR(100),
  government_id_number VARCHAR(100),
  relationship VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- LOAN PRODUCTS
-- =====================================================

CREATE TABLE interest_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  formula TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loan_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  interest_type VARCHAR(100) NOT NULL,
  interest_rate NUMERIC(5,2) NOT NULL,
  min_amount NUMERIC(15,2) DEFAULT 0,
  max_amount NUMERIC(15,2) DEFAULT 99999999.99,
  min_term INTEGER DEFAULT 1,
  max_term INTEGER DEFAULT 60,
  term_type VARCHAR(50) DEFAULT 'months',
  penalty_type VARCHAR(50),
  penalty_value NUMERIC(10,2),
  penalty_grace_period INTEGER DEFAULT 0,
  penalty_matured_value NUMERIC(10,2) DEFAULT 0,
  processing_fee NUMERIC(10,2) DEFAULT 0,
  service_charge NUMERIC(10,2) DEFAULT 0,
  late_payment_fee NUMERIC(10,2) DEFAULT 0,
  requires_co_maker BOOLEAN DEFAULT false,
  requires_collateral BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- LOAN APPLICATIONS
-- =====================================================

CREATE TABLE loan_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_number VARCHAR(50) UNIQUE NOT NULL,
  borrower_id UUID REFERENCES borrowers(id),
  loan_product_id UUID REFERENCES loan_products(id),
  principal_amount NUMERIC(15,2) NOT NULL,
  term_months INTEGER NOT NULL,
  term_type VARCHAR(10) DEFAULT 'months',
  installment_count INTEGER,
  interest_rate NUMERIC(5,2) NOT NULL,
  interest_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  purpose TEXT,
  payment_frequency VARCHAR(50) DEFAULT 'monthly',
  co_maker_id UUID REFERENCES co_makers(id),
  assigned_officer_id UUID REFERENCES users(id),
  collector_id UUID REFERENCES users(id),
  risk_score INTEGER,
  risk_notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE application_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES loan_applications(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loan_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES loan_applications(id),
  approver_id UUID REFERENCES users(id),
  approval_level INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  comments TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- LOANS
-- =====================================================

CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_number VARCHAR(50) UNIQUE NOT NULL,
  application_id UUID REFERENCES loan_applications(id),
  borrower_id UUID REFERENCES borrowers(id),
  product_id UUID REFERENCES loan_products(id),
  principal_amount NUMERIC(15,2) NOT NULL,
  interest_amount NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL,
  outstanding_balance NUMERIC(15,2) NOT NULL,
  interest_rate NUMERIC(5,2) NOT NULL,
  interest_type VARCHAR(100) NOT NULL,
  term_months INTEGER NOT NULL,
  term_type VARCHAR(10) DEFAULT 'months',
  installment_count INTEGER,
  payment_frequency VARCHAR(50) DEFAULT 'monthly',
  status VARCHAR(50) DEFAULT 'active',
  release_date TIMESTAMPTZ,
  maturity_date TIMESTAMPTZ,
  next_payment_date DATE,
  processing_fee NUMERIC(10,2) DEFAULT 0,
  service_charge NUMERIC(10,2) DEFAULT 0,
  late_payment_fee NUMERIC(10,2) DEFAULT 0,
  net_proceeds NUMERIC(15,2),
  penalty_type VARCHAR(50),
  penalty_value NUMERIC(10,2),
  penalty_grace_period INTEGER DEFAULT 0,
  penalty_matured_value NUMERIC(10,2) DEFAULT 0,
  collector_id UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  released_by UUID REFERENCES users(id),
  write_off_reason TEXT,
  write_off_amount NUMERIC(15,2),
  written_off_by UUID REFERENCES users(id),
  written_off_at TIMESTAMPTZ,
  restructured_from UUID REFERENCES loans(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loan_disbursements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id),
  disbursement_method VARCHAR(50) NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  reference_number VARCHAR(100),
  disbursed_by UUID REFERENCES users(id),
  disbursed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- AMORTIZATION SCHEDULE
-- =====================================================

CREATE TABLE amortization_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal NUMERIC(15,2) NOT NULL,
  interest NUMERIC(15,2) NOT NULL,
  balance NUMERIC(15,2) NOT NULL,
  total_due NUMERIC(15,2) NOT NULL,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  penalty_amount NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PAYMENTS
-- =====================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_number VARCHAR(50) UNIQUE NOT NULL,
  loan_id UUID REFERENCES loans(id),
  borrower_id UUID REFERENCES borrowers(id),
  amount NUMERIC(15,2) NOT NULL,
  principal_amount NUMERIC(15,2) DEFAULT 0,
  interest_amount NUMERIC(15,2) DEFAULT 0,
  penalty_amount NUMERIC(15,2) DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL,
  reference_number VARCHAR(100),
  payment_date TIMESTAMPTZ NOT NULL,
  received_by UUID REFERENCES users(id),
  receipt_number VARCHAR(50),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES amortization_schedules(id),
  amount NUMERIC(15,2) NOT NULL,
  allocated_to VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PENALTIES
-- =====================================================

CREATE TABLE penalty_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_product_id UUID REFERENCES loan_products(id),
  penalty_type VARCHAR(50) NOT NULL,
  penalty_value NUMERIC(10,2) NOT NULL,
  grace_period INTEGER DEFAULT 0,
  max_penalty_amount NUMERIC(15,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id),
  schedule_id UUID REFERENCES amortization_schedules(id),
  penalty_type VARCHAR(50) NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  calculated_at DATE NOT NULL,
  is_waived BOOLEAN DEFAULT false,
  waived_by UUID REFERENCES users(id),
  waived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- COLLECTIONS
-- =====================================================

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id),
  borrower_id UUID REFERENCES borrowers(id),
  collector_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',
  promise_to_pay_date DATE,
  promise_to_pay_amount NUMERIC(15,2),
  last_visit_date TIMESTAMPTZ,
  last_visit_notes TEXT,
  next_visit_date DATE,
  total_due NUMERIC(15,2) DEFAULT 0,
  total_overdue NUMERIC(15,2) DEFAULT 0,
  days_overdue INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE collection_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  collector_id UUID REFERENCES users(id),
  visit_date TIMESTAMPTZ NOT NULL,
  visit_type VARCHAR(50),
  notes TEXT,
  location_coordinates JSONB,
  result VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  borrower_id UUID REFERENCES borrowers(id),
  type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  subject VARCHAR(255),
  message TEXT NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES notifications(id),
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  body TEXT,
  status VARCHAR(50),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES notifications(id),
  recipient VARCHAR(50) NOT NULL,
  message TEXT,
  status VARCHAR(50),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- LOAN CHARGES
-- =====================================================

CREATE TABLE IF NOT EXISTS charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  computation_type VARCHAR(50) NOT NULL DEFAULT 'fixed',
  default_amount NUMERIC(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_product_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_product_id UUID REFERENCES loan_products(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES charges(id) ON DELETE CASCADE,
  amount NUMERIC(15,2),
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(loan_product_id, charge_id)
);

CREATE TABLE IF NOT EXISTS loan_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES charges(id),
  charge_name VARCHAR(200) NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- AUDIT & SETTINGS
-- =====================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(200) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);

CREATE INDEX IF NOT EXISTS idx_borrowers_code ON borrowers(borrower_code);
CREATE INDEX IF NOT EXISTS idx_borrowers_mobile ON borrowers(mobile);
CREATE INDEX IF NOT EXISTS idx_borrowers_branch ON borrowers(branch_id);
CREATE INDEX IF NOT EXISTS idx_borrowers_status ON borrowers(status);

CREATE INDEX IF NOT EXISTS idx_borrower_documents_borrower ON borrower_documents(borrower_id);
CREATE INDEX IF NOT EXISTS idx_co_makers_borrower ON co_makers(borrower_id);

CREATE INDEX IF NOT EXISTS idx_loan_products_active ON loan_products(is_active);
CREATE INDEX IF NOT EXISTS idx_interest_types_slug ON interest_types(slug);

CREATE INDEX IF NOT EXISTS idx_applications_borrower ON loan_applications(borrower_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON loan_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_officer ON loan_applications(assigned_officer_id);

CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_product ON loans(product_id);
CREATE INDEX IF NOT EXISTS idx_loans_next_payment ON loans(next_payment_date);
CREATE INDEX IF NOT EXISTS idx_loans_maturity ON loans(maturity_date);

CREATE INDEX IF NOT EXISTS idx_amortization_loan ON amortization_schedules(loan_id);
CREATE INDEX IF NOT EXISTS idx_amortization_status ON amortization_schedules(status);
CREATE INDEX IF NOT EXISTS idx_amortization_due_date ON amortization_schedules(due_date);

CREATE INDEX IF NOT EXISTS idx_payments_loan ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_borrower ON payments(borrower_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

CREATE INDEX IF NOT EXISTS idx_collections_loan ON collections(loan_id);
CREATE INDEX IF NOT EXISTS idx_collections_collector ON collections(collector_id);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- =====================================================
-- DEFAULT SEED DATA (uses ON CONFLICT for idempotency)
-- =====================================================

INSERT INTO roles (name, slug, description, permissions) VALUES
  ('Super Admin', 'super-admin', 'Full system access', '["*"]'::jsonb),
  ('Admin', 'admin', 'Access all modules except users and settings', '["*"]'::jsonb),
  ('Branch Manager', 'branch-manager', 'Manage branch operations', '["loans.approve","reports.view","staff.manage","borrowers.view","payments.view"]'::jsonb),
  ('Loan Officer', 'loan-officer', 'Process loan applications', '["borrowers.create","borrowers.edit","applications.create","applications.submit","documents.upload","borrowers.view"]'::jsonb),
  ('Credit Investigator', 'credit-investigator', 'Verify and assess applications', '["applications.view","applications.verify","applications.assess"]'::jsonb),
  ('Cashier', 'cashier', 'Accept payments', '["payments.create","payments.view","receipts.generate"]'::jsonb),
  ('Collector', 'collector', 'Field collections', '["collections.view","collections.manage","visits.create"]'::jsonb),
  ('Borrower', 'borrower', 'Self-service portal', '["portal.view","portal.loans","portal.payments","portal.statements"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO interest_types (name, slug, formula, description) VALUES
  ('Flat Rate', 'flat-rate', 'principal * rate * term', 'Simple flat interest rate calculation'),
  ('Diminishing Balance', 'diminishing-balance', 'remaining_balance * monthly_rate', 'Interest based on remaining balance'),
  ('Add-On Interest', 'add-on-interest', '(principal * rate * term) / term_months', 'Add-on interest evenly distributed'),
  ('Daily Interest', 'daily-interest', 'principal * (rate / 365) * days', 'Per-day interest calculation'),
  ('Monthly Interest', 'monthly-interest', 'principal * rate', 'Monthly recurring interest'),
  ('Seasonal Interest', 'seasonal-interest', 'principal * rate * season_months / 12', 'Seasonal payment period interest'),
  ('Custom Formula', 'custom-formula', '(principal * rate * term) + service_fee', 'Custom configurable formula')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO system_settings (key, value, description) VALUES
  ('company_name', 'Enterprise Lending Inc.', 'Company display name'),
  ('company_address', '123 Business District, Manila', 'Company address'),
  ('company_phone', '+632 1234 5678', 'Company phone number'),
  ('company_email', 'info@enterpriselending.com', 'Company email'),
  ('logo_url', '', 'Company logo URL'),
  ('default_currency', 'PHP', 'Default currency'),
  ('currency_symbol', '₱', 'Currency symbol'),
  ('business_permit_number', '', 'Business permit / SEC number'),
  ('tax_id', '', 'Tax identification number'),
  ('loan_approval_levels', '1', 'Number of approval levels required'),
  ('enable_sms_notifications', 'true', 'Enable SMS notifications'),
  ('enable_email_notifications', 'true', 'Enable email notifications'),
  ('auto_generate_loan_number', 'true', 'Auto-generate loan numbers'),
  ('loan_number_prefix', 'LN-', 'Loan number prefix'),
  ('application_number_prefix', 'APP-', 'Application number prefix'),
  ('payment_number_prefix', 'PAY-', 'Payment number prefix'),
  ('borrower_code_prefix', 'B-', 'Borrower code prefix'),
  ('receipt_prefix', 'RCT-', 'Receipt number prefix')
ON CONFLICT (key) DO NOTHING;
