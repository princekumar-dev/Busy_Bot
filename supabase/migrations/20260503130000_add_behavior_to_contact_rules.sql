-- Migration: Add behavior and contact_name to contact_rules
ALTER TABLE public.contact_rules 
  ADD COLUMN IF NOT EXISTS behavior TEXT DEFAULT 'auto_reply',
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- Update types or comments
COMMENT ON COLUMN public.contact_rules.behavior IS 'Can be: auto_reply, ignore, manual_review';
