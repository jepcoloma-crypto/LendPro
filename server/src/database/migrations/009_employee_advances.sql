CREATE TABLE IF NOT EXISTS public.employee_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
  advance_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_advances_employee ON public.employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_date ON public.employee_advances(advance_date);
