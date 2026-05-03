ALTER TABLE public.settings
  ALTER COLUMN ai_provider SET DEFAULT 'api_airforce',
  ALTER COLUMN ai_model SET DEFAULT 'llama-4-scout';

UPDATE public.settings
SET
  ai_provider = 'api_airforce',
  ai_provider_name = COALESCE(NULLIF(ai_provider_name, 'G4FGPT'), 'Claude'),
  ai_model = CASE
    WHEN ai_model IN ('google/gemma-4-31b-it:free', 'tencent/hy3-preview:free', 'gpt-4o-mini', 'claude-opus-4-6') THEN 'llama-4-scout'
    ELSE ai_model
  END
WHERE ai_provider IS DISTINCT FROM 'api_airforce'
   OR ai_provider_name IS NULL
   OR ai_provider_name = 'G4FGPT'
   OR ai_model IN ('google/gemma-4-31b-it:free', 'tencent/hy3-preview:free', 'gpt-4o-mini', 'claude-opus-4-6');
