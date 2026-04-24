ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'openrouter',
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'google/gemma-4-31b-it:free',
  ADD COLUMN IF NOT EXISTS ai_base_url TEXT,
  ADD COLUMN IF NOT EXISTS ai_provider_name TEXT;
