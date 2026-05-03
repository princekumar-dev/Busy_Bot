-- CAUTION: This will permanently delete all chat data and personality training.
-- Execute this in the Supabase SQL Editor.

-- 1. Remove all messages
TRUNCATE TABLE public.messages CASCADE;

-- 2. Remove all conversations
TRUNCATE TABLE public.conversations CASCADE;

-- 3. Remove all training data (Personality Profiles)
TRUNCATE TABLE public.personality_profiles CASCADE;

-- 4. Remove all reply events (Audit logs)
TRUNCATE TABLE public.reply_events CASCADE;

-- 5. Remove all items in the approval queue
TRUNCATE TABLE public.approval_queue CASCADE;

-- 6. Remove all contact-specific rules (Optional, but usually part of "history")
-- TRUNCATE TABLE public.contact_rules CASCADE;

-- 7. Reset user settings (Optional: keep if you want to preserve model selection)
-- TRUNCATE TABLE public.settings CASCADE;

-- If you want to delete everything EXCEPT your own user profile:
-- DELETE FROM auth.users WHERE email != 'your-email@example.com'; 
-- (Note: auth.users can only be modified by service_role or from the Dashboard)

SELECT 'Cleanup Complete' as status;
