-- Add missing columns for write-off tracking
ALTER TABLE loans ADD COLUMN IF NOT EXISTS write_off_reason TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS write_off_amount NUMERIC(15,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS written_off_by UUID REFERENCES users(id);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMPTZ;

-- Add column for restructure tracking
ALTER TABLE loans ADD COLUMN IF NOT EXISTS restructured_from UUID REFERENCES loans(id);
