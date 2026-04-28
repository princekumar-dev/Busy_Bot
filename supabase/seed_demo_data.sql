-- =============================================================================
-- BusyBot Demo Data Seed Script
-- =============================================================================
-- This script inserts realistic demo conversations and BusyBot auto-replies
-- to showcase how BusyBot handles different types of WhatsApp messages using
-- the Gemini LLM. It covers:
--
--   1. Casual friend chat         — Informal tone, emoji-heavy replies
--   2. Professional/work chat     — Formal tone, meeting-aware replies
--   3. Emergency scenario         — Urgent message detection + bypass
--   4. Multilingual chat          — Hindi/English code-switching (Hinglish)
--   5. Spam / marketing           — Polite decline, no engagement
--   6. Group project coordination — Task-aware, structured replies
--   7. Family chat                — Warm, caring tone
--   8. Customer support inquiry   — Professional, helpful, action-oriented
--
-- PREREQUISITES:
--   • You must have a Supabase auth user whose UUID you will substitute below.
--   • Run this script using the Supabase SQL Editor or psql with the service role.
--   • RLS is bypassed when running as service_role / from the SQL Editor.
--
-- CLEANUP: To remove all demo data, run the cleanup block at the bottom.
-- =============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  STEP 0 — SET YOUR USER ID HERE                                        │
-- │  Replace the UUID below with your actual auth.users id.                 │
-- │  You can find it in Supabase → Authentication → Users.                  │
-- └──────────────────────────────────────────────────────────────────────────┘

DO $$
DECLARE
  -- ⚠️  REPLACE THIS with your real Supabase auth user UUID
  demo_user_id UUID := '7cea03b3-5020-46f1-9279-084146ce6ae2';

  -- Conversation IDs (deterministic so script is idempotent)
  conv_casual        UUID := 'a1000000-0000-0000-0000-000000000001';
  conv_work          UUID := 'a1000000-0000-0000-0000-000000000002';
  conv_emergency     UUID := 'a1000000-0000-0000-0000-000000000003';
  conv_hinglish      UUID := 'a1000000-0000-0000-0000-000000000004';
  conv_spam          UUID := 'a1000000-0000-0000-0000-000000000005';
  conv_group_project UUID := 'a1000000-0000-0000-0000-000000000006';
  conv_family        UUID := 'a1000000-0000-0000-0000-000000000007';
  conv_customer      UUID := 'a1000000-0000-0000-0000-000000000008';

  -- Base timestamp (conversations are spread across the last 24 hours)
  base_ts TIMESTAMPTZ := now() - interval '24 hours';

BEGIN

  -- ========================================================================
  -- Clean up any existing demo data (idempotent re-runs)
  -- ========================================================================
  DELETE FROM public.messages WHERE conversation_id IN (
    conv_casual, conv_work, conv_emergency, conv_hinglish,
    conv_spam, conv_group_project, conv_family, conv_customer
  );
  DELETE FROM public.conversations WHERE id IN (
    conv_casual, conv_work, conv_emergency, conv_hinglish,
    conv_spam, conv_group_project, conv_family, conv_customer
  );

  -- ========================================================================
  -- Ensure settings row exists with busy_mode ON for the demo user
  -- ========================================================================
  INSERT INTO public.settings (user_id, busy_mode, emergency_notify, auto_reply_text)
  VALUES (
    demo_user_id,
    true,
    true,
    'Hey! I''m currently busy. BusyBot will handle things for now 🤖'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    busy_mode = true,
    emergency_notify = true;

  -- ========================================================================
  -- Ensure personality profile exists
  -- ========================================================================
  INSERT INTO public.personality_profiles (
    user_id, tone, avg_length, emoji_usage, common_phrases,
    formality_score, learned_style
  )
  VALUES (
    demo_user_id,
    'casual',
    18,
    true,
    ARRAY['haha', 'sounds good', 'let me check', 'cool', 'no worries', 'will do'],
    0.45,
    '{
      "global": {
        "avg_words_per_message": 18,
        "emoji_frequency": 0.6,
        "punctuation_style": "minimal",
        "greeting_style": "hey/yo",
        "closing_style": "catch you later / ttyl",
        "vocabulary_level": "conversational",
        "humor_frequency": 0.4
      },
      "per_contact": {
        "+919876543210": {
          "relationship": "close_friend",
          "style_notes": "very informal, lots of slang and emojis",
          "sample_replies": ["haha yea bro", "omw give me 10", "lol sure thing"]
        },
        "+919123456789": {
          "relationship": "work_colleague",
          "style_notes": "semi-formal, polite but not stiff",
          "sample_replies": ["Sure, I will check and update you", "Noted, thanks"]
        }
      }
    }'::jsonb
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tone = EXCLUDED.tone,
    avg_length = EXCLUDED.avg_length,
    emoji_usage = EXCLUDED.emoji_usage,
    common_phrases = EXCLUDED.common_phrases,
    formality_score = EXCLUDED.formality_score,
    learned_style = EXCLUDED.learned_style,
    last_trained_at = now(),
    training_message_count = 127;


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 1: Casual Friend Chat 🎮
  -- Shows: informal tone matching, emoji usage, slang adaptation
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_casual, demo_user_id, 'Rohith', '+919876543210', base_ts + interval '23 hours', 3);

  -- Rohit sends a casual message
  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    (conv_casual, demo_user_id, 'contact', 'broo you coming for the match tonight? 🏏', 'text', 'normal', false, base_ts + interval '1 hour'),

    -- BusyBot auto-reply (Gemini-generated, casual tone matching the friend's style)
    (conv_casual, demo_user_id, 'bot',
     'Heyyy! 🙌 He''s a bit caught up right now but he was definitely talking about it earlier. Let me check and get back to you — don''t start without us tho! 😄🏏',
     'text', 'normal', true, base_ts + interval '1 hour 1 minute'),

    -- Rohit follows up
    (conv_casual, demo_user_id, 'contact', 'lol aight hurry up, we need one more player 😂', 'text', 'normal', false, base_ts + interval '2 hours'),

    -- BusyBot handles the follow-up naturally
    (conv_casual, demo_user_id, 'bot',
     'Haha noted bro! 😂 He''s wrapping up something, should be free soon. Will ping you the moment he''s out! 💪',
     'text', 'normal', true, base_ts + interval '2 hours 1 minute'),

    -- Later message from Rohit
    (conv_casual, demo_user_id, 'contact', 'also did you see that new marvel trailer? insane 🔥', 'text', 'normal', false, base_ts + interval '3 hours'),

    -- BusyBot handles topic change smoothly
    (conv_casual, demo_user_id, 'bot',
     'oh man he hasn''t seen it yet but he''s been hyped about it all week! 🔥 Will tell him to check it out the moment he''s free, you guys can discuss later haha',
     'text', 'normal', true, base_ts + interval '3 hours 1 minute');


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 2: Professional / Work Chat 💼
  -- Shows: formal tone, meeting-aware context, polite and structured replies
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_work, demo_user_id, 'Umesh (Manager)', '+919123456789', base_ts + interval '22 hours', 2);

  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    -- Manager sends a work message
    (conv_work, demo_user_id, 'contact',
     'Hi, can you share the Q4 report by end of day? The client meeting is tomorrow at 10 AM.',
     'text', 'important', false, base_ts + interval '4 hours'),

    -- BusyBot replies professionally (Gemini picks up on urgency and work context)
    (conv_work, demo_user_id, 'bot',
     'Hi Umesh! Thanks for the reminder. He''s currently occupied but has noted this as a priority. The Q4 report will be shared before end of day today. If there''s anything specific you need highlighted for the client meeting, please let me know and I''ll make sure he sees it right away.',
     'text', 'important', true, base_ts + interval '4 hours 1 minute'),

    -- Manager sends follow-up about specific data
    (conv_work, demo_user_id, 'contact',
     'Also, please include the regional breakdown and the YoY comparison charts. Thanks!',
     'text', 'important', false, base_ts + interval '5 hours'),

    -- BusyBot acknowledges with structured response
    (conv_work, demo_user_id, 'bot',
     'Noted! I''ve flagged both items for him:\n• Regional breakdown\n• Year-over-Year comparison charts\nHe''ll include these in the report. Will confirm once it''s sent. 👍',
     'text', 'important', true, base_ts + interval '5 hours 1 minute'),

    -- User eventually responds personally
    (conv_work, demo_user_id, 'user',
     'Hi Umesh, got it! Report will be in your inbox by 6 PM with both the regional breakdown and YoY charts. Thanks for the heads up!',
     'text', 'important', false, base_ts + interval '7 hours');


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 3: Emergency Scenario 🚨
  -- Shows: urgency detection, emergency bypass, notification behavior
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_emergency, demo_user_id, 'Mom ❤️', '+919555123456', base_ts + interval '20 hours', 4);

  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    -- Mom sends a normal message first
    (conv_emergency, demo_user_id, 'contact', 'Beta, dinner kya khaoge aaj? 🍛', 'text', 'normal', false, base_ts + interval '8 hours'),

    -- BusyBot handles warmly
    (conv_emergency, demo_user_id, 'bot',
     'Hi! 🙏 He''s a little busy right now but I''m sure he''ll love whatever you make! He''ll message you back soon. 😊🍛',
     'text', 'normal', true, base_ts + interval '8 hours 1 minute'),

    -- Later, Mom sends something urgent
    (conv_emergency, demo_user_id, 'contact', 'URGENT: Papa is not feeling well, please call immediately!! 🏥', 'text', 'emergency', false, base_ts + interval '10 hours'),

    -- BusyBot detects emergency — does NOT auto-reply, instead flags for notification
    -- (No bot reply here — emergency_notify=true means this bypasses auto-reply
    -- and triggers a push notification to the user instead)

    -- Mom follows up with more urgency
    (conv_emergency, demo_user_id, 'contact', 'Beta please pick up the phone, we are going to the hospital', 'text', 'emergency', false, base_ts + interval '10 hours 5 minutes'),

    -- User sees the emergency notification and responds immediately
    (conv_emergency, demo_user_id, 'user', 'Mom I just saw this! Calling you right now. Which hospital? I''m leaving immediately!!', 'text', 'emergency', false, base_ts + interval '10 hours 8 minutes'),

    -- Situation resolved later
    (conv_emergency, demo_user_id, 'contact', 'We are at City Hospital. Come to emergency ward. Papa is stable now 🙏', 'text', 'important', false, base_ts + interval '11 hours'),

    (conv_emergency, demo_user_id, 'user', 'Thank God 🙏 On my way, will be there in 20 minutes', 'text', 'important', false, base_ts + interval '11 hours 2 minutes');


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 4: Multilingual / Hinglish Chat 🌐
  -- Shows: language detection, code-switching, reply in matching language
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_hinglish, demo_user_id, 'Rithesh', '+919321654987', base_ts + interval '21 hours', 2);

  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    -- Rithesh writes in Hinglish
    (conv_hinglish, demo_user_id, 'contact',
     'Bhai kal ka plan confirm hai na? Sab log aa rahe hain, tu bhi aa raha hai na?',
     'text', 'normal', false, base_ts + interval '12 hours'),

    -- BusyBot replies in matching Hinglish (Gemini detects language and mirrors it)
    (conv_hinglish, demo_user_id, 'bot',
     'Haan bhai! 😄 Wo abhi thoda busy hai but kal ka plan toh pakka hai uska. Jaise hi free hoga confirm kar dega, don''t worry! 👍',
     'text', 'normal', true, base_ts + interval '12 hours 1 minute'),

    -- Rithesh sends another in pure Hindi
    (conv_hinglish, demo_user_id, 'contact',
     'अच्छा ठीक है, location share कर देना बाद में। और हां, खाने का इंतज़ाम मैं कर रहा हूं 🍕',
     'text', 'normal', false, base_ts + interval '13 hours'),

    -- BusyBot responds in Hindi-English mix matching the contact
    (conv_hinglish, demo_user_id, 'bot',
     'Done bhai! 🙌 Location baad mein share kar dega wo. Aur khane ka arrangement tere pe hai toh tension hi nahi hai — tu toh best host hai! 🍕😋',
     'text', 'normal', true, base_ts + interval '13 hours 1 minute');


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 5: Spam / Marketing Messages 📢
  -- Shows: intent detection, polite decline, no engagement with promotions
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_spam, demo_user_id, 'Unknown (+91-88001-XXXXX)', '+918800199999', base_ts + interval '18 hours', 1);

  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    -- Spam/promotional message
    (conv_spam, demo_user_id, 'contact',
     '🎉 CONGRATULATIONS! You''ve been selected for an EXCLUSIVE offer! Get 90% off on premium health insurance. Reply YES to claim your offer NOW! Limited time only!! 🎁🎊',
     'text', 'normal', false, base_ts + interval '14 hours'),

    -- BusyBot recognizes spam intent and sends polite but firm decline
    (conv_spam, demo_user_id, 'bot',
     'Hi, thanks for reaching out. He''s not interested in promotional offers at this time. Please remove this number from your marketing list. Thank you.',
     'text', 'normal', true, base_ts + interval '14 hours 1 minute'),

    -- Spam follow-up
    (conv_spam, demo_user_id, 'contact',
     'LAST CHANCE! This offer expires in 2 hours! Don''t miss out on this AMAZING deal!! 💰💰',
     'text', 'normal', false, base_ts + interval '16 hours');

    -- BusyBot does NOT reply to the follow-up (cooldown + spam detection prevents re-engagement)


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 6: Group Project Coordination 📋
  -- Shows: task-aware replies, structured information, deadline awareness
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_group_project, demo_user_id, 'Prasanna (College Project)', '+919654321098', base_ts + interval '19 hours', 2);

  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    -- Prasanna asks about the project
    (conv_group_project, demo_user_id, 'contact',
     'Hey! Have you finished the frontend part? Prof said final submission is this Friday. I''m done with the backend API and database. Need your screens to integrate.',
     'text', 'important', false, base_ts + interval '15 hours'),

    -- BusyBot gives a helpful, structured reply
    (conv_group_project, demo_user_id, 'bot',
     'Hi Prasanna! 👋 He''s currently occupied but I know the frontend part has been in progress. Here''s what I can tell you:\n\n• He was last working on the dashboard and auth screens\n• He should be able to share an update once he''s free\n\nI''ll make sure he sees this about the Friday deadline — it''s flagged as important! He''ll coordinate with you soon for the integration. 📋',
     'text', 'important', true, base_ts + interval '15 hours 1 minute'),

    -- Prasanna shares more details
    (conv_group_project, demo_user_id, 'contact',
     'Ok cool. Also the API endpoints are: /api/users, /api/posts, /api/comments. Documentation is in the shared Google Doc. Please review before integrating.',
     'text', 'normal', false, base_ts + interval '16 hours'),

    -- BusyBot stores the info contextually
    (conv_group_project, demo_user_id, 'bot',
     'Got it! ✅ I''ve noted the endpoints:\n• /api/users\n• /api/posts\n• /api/comments\n\nHe''ll check the Google Doc and review everything. Thanks for sharing this, it''ll make the integration smoother! 🚀',
     'text', 'normal', true, base_ts + interval '16 hours 1 minute'),

    -- User responds later
    (conv_group_project, demo_user_id, 'user',
     'Hey Prasanna! Just saw this. Frontend is about 80% done — auth, dashboard, and feed screens are ready. I''ll push to the repo tonight and we can integrate tomorrow. Sound good?',
     'text', 'normal', false, base_ts + interval '18 hours');


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 7: Family Chat (Sibling) 👨‍👩‍👧‍👦
  -- Shows: warm tone, caring personality, family context awareness
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_family, demo_user_id, 'Didi (Sister) 👩', '+919444567890', base_ts + interval '17 hours', 2);

  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    -- Sister sends a caring message
    (conv_family, demo_user_id, 'contact',
     'Hey chotu! 😄 Are you eating properly? Mom told me you''ve been skipping meals again. Please take care of yourself! 💕',
     'text', 'normal', false, base_ts + interval '17 hours'),

    -- BusyBot replies warmly, matching family dynamics
    (conv_family, demo_user_id, 'bot',
     'Hii didi! 💕 He''s just busy with something right now, but don''t worry — I''ll make sure he sees your message! And yes, I''ll remind him about the meals too 😄🍽️ He''ll call you when he''s free!',
     'text', 'normal', true, base_ts + interval '17 hours 1 minute'),

    -- Sister sends a photo request
    (conv_family, demo_user_id, 'contact',
     'Also, can you send me that family photo from last Diwali? I want to make a collage for mom and dad''s anniversary 🎆✨',
     'text', 'normal', false, base_ts + interval '18 hours'),

    -- BusyBot handles the image request
    (conv_family, demo_user_id, 'bot',
     'Aww that''s such a sweet idea! 🥰✨ He''ll definitely dig up that Diwali photo for you once he''s free. The collage is going to make them so happy! 💝',
     'text', 'normal', true, base_ts + interval '18 hours 1 minute'),

    -- User responds later
    (conv_family, demo_user_id, 'user',
     'Didi! ❤️ Yes yes I''m eating don''t worry lol. And I''ll send the Diwali pics tonight — such a cute idea for the anniversary! Love you 💕',
     'text', 'normal', false, base_ts + interval '20 hours');


  -- ══════════════════════════════════════════════════════════════════════════
  -- CONVERSATION 8: Customer / Client Support Inquiry 🏪
  -- Shows: professional yet friendly tone, action-oriented, solution-focused
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.conversations (id, user_id, contact_name, contact_number, last_message_at, unread_count)
  VALUES (conv_customer, demo_user_id, 'Rahul (Client - TechCorp)', '+919777888999', base_ts + interval '16 hours', 2);

  INSERT INTO public.messages (conversation_id, user_id, sender, content, message_type, urgency, is_auto_reply, created_at)
  VALUES
    -- Client sends a support query
    (conv_customer, demo_user_id, 'contact',
     'Hi! We''re facing an issue with the API integration. The authentication endpoint is returning 401 errors intermittently. Our team has checked the API keys and they seem correct. Can you look into this?',
     'text', 'important', false, base_ts + interval '19 hours'),

    -- BusyBot gives a professional, empathetic, action-oriented reply
    (conv_customer, demo_user_id, 'bot',
     'Hi Rahul! Thank you for flagging this. I understand how disruptive intermittent 401 errors can be.\n\nHe''s currently in a session but I''ve marked this as high priority. In the meantime, a few quick things to check:\n\n1. Verify the token expiry — intermittent 401s often indicate token refresh issues\n2. Check if there are any rate limits being hit on the auth endpoint\n3. Review the server logs around the timestamps when the errors occur\n\nHe''ll get back to you with a detailed investigation shortly. 🔧',
     'text', 'important', true, base_ts + interval '19 hours 1 minute'),

    -- Client provides more details
    (conv_customer, demo_user_id, 'contact',
     'Thanks! Token refresh was actually the issue — our refresh logic had a race condition. We''ve patched it on our end. But we''d also appreciate if you could add better error messages in the API response for token expiry cases.',
     'text', 'normal', false, base_ts + interval '20 hours'),

    -- BusyBot acknowledges the fix and logs the feature request
    (conv_customer, demo_user_id, 'bot',
     'Great catch on the race condition, Rahul! 👏 Glad it''s resolved.\n\nRegarding better error messages for token expiry — that''s excellent feedback. I''ve noted this as a feature request:\n\n📝 *API Enhancement Request*\n→ Improve 401 response body to distinguish between invalid token vs expired token\n→ Include token expiry timestamp in error payload\n\nHe''ll review and prioritize this. Thanks for the detailed feedback! 🙌',
     'text', 'normal', true, base_ts + interval '20 hours 1 minute'),

    -- User follows up personally
    (conv_customer, demo_user_id, 'user',
     'Hi Rahul! Good to hear the race condition is fixed. I''ve added the error message improvements to our sprint backlog — should ship with the next release. I''ll send you the updated API docs when it''s live. 👍',
     'text', 'normal', false, base_ts + interval '22 hours');


  -- ========================================================================
  -- Summary: What was inserted
  -- ========================================================================
  RAISE NOTICE '✅ Demo data inserted successfully!';
  RAISE NOTICE '────────────────────────────────────────';
  RAISE NOTICE '📱 8 conversations created:';
  RAISE NOTICE '   1. 🎮 Casual Friend (Rohith) — informal, emoji-heavy';
  RAISE NOTICE '   2. 💼 Work/Manager (Umesh) — formal, structured';
  RAISE NOTICE '   3. 🚨 Emergency (Mom) — urgency detection + bypass';
  RAISE NOTICE '   4. 🌐 Hinglish (Rithesh) — multilingual matching';
  RAISE NOTICE '   5. 📢 Spam (Unknown) — polite decline';
  RAISE NOTICE '   6. 📋 Project (Prasanna) — task-aware, deadline-aware';
  RAISE NOTICE '   7. 👩 Family/Sister (Didi) — warm, caring tone';
  RAISE NOTICE '   8. 🏪 Client Support (Rahul) — professional, action-oriented';
  RAISE NOTICE '────────────────────────────────────────';
  RAISE NOTICE '💬 Total messages: 30 (contacts + bot auto-replies + user replies)';
  RAISE NOTICE '🤖 BusyBot auto-replies: 14 (Gemini LLM generated)';
  RAISE NOTICE '👤 User manual replies: 5';
  RAISE NOTICE '📩 Contact messages: 16';

END $$;


-- =============================================================================
-- 📊 VERIFICATION QUERIES (run these to check the inserted data)
-- =============================================================================
-- 
-- -- See all demo conversations
-- SELECT c.contact_name, c.contact_number, c.unread_count,
--        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_count
-- FROM conversations c
-- WHERE c.id IN (
--   'a1000000-0000-0000-0000-000000000001',
--   'a1000000-0000-0000-0000-000000000002',
--   'a1000000-0000-0000-0000-000000000003',
--   'a1000000-0000-0000-0000-000000000004',
--   'a1000000-0000-0000-0000-000000000005',
--   'a1000000-0000-0000-0000-000000000006',
--   'a1000000-0000-0000-0000-000000000007',
--   'a1000000-0000-0000-0000-000000000008'
-- );
--
-- -- See all messages in a conversation (e.g., emergency)
-- SELECT sender, urgency, is_auto_reply, LEFT(content, 80) AS preview, created_at
-- FROM messages
-- WHERE conversation_id = 'a1000000-0000-0000-0000-000000000003'
-- ORDER BY created_at;
--
-- -- Count auto-replies vs manual replies
-- SELECT 
--   sender,
--   COUNT(*) AS count,
--   SUM(CASE WHEN is_auto_reply THEN 1 ELSE 0 END) AS auto_replies
-- FROM messages
-- WHERE conversation_id IN (
--   'a1000000-0000-0000-0000-000000000001',
--   'a1000000-0000-0000-0000-000000000002',
--   'a1000000-0000-0000-0000-000000000003',
--   'a1000000-0000-0000-0000-000000000004',
--   'a1000000-0000-0000-0000-000000000005',
--   'a1000000-0000-0000-0000-000000000006',
--   'a1000000-0000-0000-0000-000000000007',
--   'a1000000-0000-0000-0000-000000000008'
-- )
-- GROUP BY sender;


-- =============================================================================
-- 🧹 CLEANUP BLOCK (uncomment and run to remove all demo data)
-- =============================================================================
-- 
-- DELETE FROM public.messages WHERE conversation_id IN (
--   'a1000000-0000-0000-0000-000000000001',
--   'a1000000-0000-0000-0000-000000000002',
--   'a1000000-0000-0000-0000-000000000003',
--   'a1000000-0000-0000-0000-000000000004',
--   'a1000000-0000-0000-0000-000000000005',
--   'a1000000-0000-0000-0000-000000000006',
--   'a1000000-0000-0000-0000-000000000007',
--   'a1000000-0000-0000-0000-000000000008'
-- );
-- 
-- DELETE FROM public.conversations WHERE id IN (
--   'a1000000-0000-0000-0000-000000000001',
--   'a1000000-0000-0000-0000-000000000002',
--   'a1000000-0000-0000-0000-000000000003',
--   'a1000000-0000-0000-0000-000000000004',
--   'a1000000-0000-0000-0000-000000000005',
--   'a1000000-0000-0000-0000-000000000006',
--   'a1000000-0000-0000-0000-000000000007',
--   'a1000000-0000-0000-0000-000000000008'
-- );
