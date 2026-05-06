-- ============================================================
-- BusyBot: Apply all missing schema to live Supabase
-- Paste this entire script into the Supabase SQL Editor and RUN IT
-- All statements are safe (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- 1. Settings: add missing columns
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS strict_assistant_mode BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS busy_test_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_tone TEXT DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'api_airforce',
  ADD COLUMN IF NOT EXISTS ai_provider_name TEXT DEFAULT 'Claude',
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'llama-4-scout',
  ADD COLUMN IF NOT EXISTS ai_base_url TEXT DEFAULT 'https://api.airforce/v1';

-- 2. Messages: add missing columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS policy_action TEXT,
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none';

-- 3. reply_events table
CREATE TABLE IF NOT EXISTS public.reply_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  risk_level TEXT,
  confidence_score NUMERIC(4,3),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reply_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reply_events' AND policyname = 'Users can view own reply events') THEN
    CREATE POLICY "Users can view own reply events" ON public.reply_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reply_events' AND policyname = 'Users can insert own reply events') THEN
    CREATE POLICY "Users can insert own reply events" ON public.reply_events FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reply_events_user_created ON public.reply_events(user_id, created_at DESC);

-- 4. approval_queue table
CREATE TABLE IF NOT EXISTS public.approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  contact_number TEXT NOT NULL,
  incoming_message TEXT NOT NULL,
  draft_reply TEXT NOT NULL,
  edited_reply TEXT,
  risk_level TEXT DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'approval_queue' AND policyname = 'Users can view own approval queue') THEN
    CREATE POLICY "Users can view own approval queue" ON public.approval_queue FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'approval_queue' AND policyname = 'Users can insert own approval queue') THEN
    CREATE POLICY "Users can insert own approval queue" ON public.approval_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'approval_queue' AND policyname = 'Users can update own approval queue') THEN
    CREATE POLICY "Users can update own approval queue" ON public.approval_queue FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_approval_queue_user_status ON public.approval_queue(user_id, status, created_at DESC);

-- 5. contact_rules: add contact_name and behavior columns
ALTER TABLE public.contact_rules
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS behavior TEXT DEFAULT 'auto_reply';

-- 6. user_data_controls table
CREATE TABLE IF NOT EXISTS public.user_data_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  consent_disclosure_enabled BOOLEAN NOT NULL DEFAULT true,
  data_retention_days INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_data_controls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_data_controls' AND policyname = 'Users can view own data controls') THEN
    CREATE POLICY "Users can view own data controls" ON public.user_data_controls FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_data_controls' AND policyname = 'Users can insert own data controls') THEN
    CREATE POLICY "Users can insert own data controls" ON public.user_data_controls FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_data_controls' AND policyname = 'Users can update own data controls') THEN
    CREATE POLICY "Users can update own data controls" ON public.user_data_controls FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 7. webhook_event_locks table (if missing)
CREATE TABLE IF NOT EXISTS public.webhook_event_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_event_locks ENABLE ROW LEVEL SECURITY;

-- Done!
SELECT 'All missing schema applied successfully' AS result;
