-- Add Gemini API key to settings for AI-powered smart replies
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

-- Add learned style patterns (JSONB) to personality profiles for ML-based learning
ALTER TABLE public.personality_profiles ADD COLUMN IF NOT EXISTS learned_style JSONB DEFAULT '{}';

-- Track when the personality was last trained
ALTER TABLE public.personality_profiles ADD COLUMN IF NOT EXISTS last_trained_at TIMESTAMPTZ;

-- Track how many messages were used for training
ALTER TABLE public.personality_profiles ADD COLUMN IF NOT EXISTS training_message_count INTEGER DEFAULT 0;
