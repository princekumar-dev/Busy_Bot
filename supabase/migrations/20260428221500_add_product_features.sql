ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS policy_action TEXT,
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none';

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

CREATE TABLE IF NOT EXISTS public.contact_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_number TEXT NOT NULL,
  relationship_style TEXT DEFAULT 'friend',
  emoji_level TEXT DEFAULT 'moderate',
  max_reply_words INTEGER DEFAULT 24,
  language_preference TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_number)
);

CREATE TABLE IF NOT EXISTS public.user_data_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  consent_disclosure_enabled BOOLEAN NOT NULL DEFAULT true,
  data_retention_days INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reply_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_data_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reply events" ON public.reply_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reply events" ON public.reply_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own approval queue" ON public.approval_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own approval queue" ON public.approval_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own approval queue" ON public.approval_queue FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own contact rules" ON public.contact_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contact rules" ON public.contact_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contact rules" ON public.contact_rules FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own data controls" ON public.user_data_controls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own data controls" ON public.user_data_controls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own data controls" ON public.user_data_controls FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reply_events_user_created ON public.reply_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_queue_user_status ON public.approval_queue(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_rules_user_contact ON public.contact_rules(user_id, contact_number);
