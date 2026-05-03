CREATE TABLE IF NOT EXISTS public.webhook_event_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_locks_created_at
  ON public.webhook_event_locks(created_at);

ALTER TABLE public.webhook_event_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhook locks"
  ON public.webhook_event_locks
  FOR SELECT
  USING (auth.uid() = user_id);
