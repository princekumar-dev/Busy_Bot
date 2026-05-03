-- SAFE CLEANUP: Checks for table existence before truncating.
-- Execute this in the Supabase SQL Editor.

DO $$ 
BEGIN
    -- 1. Messages
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
        TRUNCATE TABLE public.messages CASCADE;
    END IF;

    -- 2. Conversations
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations') THEN
        TRUNCATE TABLE public.conversations CASCADE;
    END IF;

    -- 3. Personality Profiles
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'personality_profiles') THEN
        TRUNCATE TABLE public.personality_profiles CASCADE;
    END IF;

    -- 4. Reply Events
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_events') THEN
        TRUNCATE TABLE public.reply_events CASCADE;
    END IF;

    -- 5. Approval Queue
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'approval_queue') THEN
        TRUNCATE TABLE public.approval_queue CASCADE;
    END IF;

    -- 6. Contact Rules
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_rules') THEN
        TRUNCATE TABLE public.contact_rules CASCADE;
    END IF;

END $$;

SELECT 'Cleanup Complete (Skipped missing tables)' as status;
