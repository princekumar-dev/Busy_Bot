ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reply_tone TEXT NOT NULL DEFAULT 'friendly';

COMMENT ON COLUMN public.settings.reply_tone IS 'Selected BusyBot assistant tone: friendly, professional, casual, warm, concise, or playful.';
