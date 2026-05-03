# BusyBot Working Flow

## 1. Authentication and Session Bootstrap

1. User signs in or signs up on `/auth`.
2. On sign-up, the frontend calls `supabase.auth.signUp(...)` with an email confirmation redirect to `/dashboard`.
3. The UI only shows "Check your email" when Supabase actually returns a confirmation-email signup state.
4. If the email is already registered, the UI switches the user back to sign-in instead of falsely reporting success.
5. After the user clicks the confirmation email, Supabase completes the session bootstrap and redirects to `/dashboard`.
6. Supabase Auth session is persisted in localStorage.
7. AuthProvider publishes user/session state.
8. Protected routes become accessible only for authenticated users.

## 2. WhatsApp Connection Setup

1. In Settings page, Evo QR Connector calls Evolution API endpoints.
2. User scans QR to connect the WhatsApp instance.
3. Connector registers webhook URL:
   https://<project>.supabase.co/functions/v1/webhook
4. Evolution starts sending events to Supabase webhook function.

## 3. Incoming Event Processing (webhook function)

For every event payload:

1. Ignore non-message events (except logs/debug results).
2. Ignore group chats.
3. Extract sender number, message text, message type, and contact metadata.
4. Compute intent/sentiment/language classification.
5. Compute urgency (normal/important/emergency).

## 4. Conversation Persistence

For each user settings row:

1. Find conversation by user_id + contact_number.
2. Create conversation if missing.
3. Update unread counters and last_message_at.
4. Insert message row into messages table.

## 5. Learning Path (fromMe=true)

When the event is from the account owner:

1. Save message as sender=user.
2. No auto-reply logic is executed.
3. Check if enough new user messages exist since last training.
4. If threshold reached (50+), trigger train-personality in background.

## 6. Auto-Reply Decision Path (incoming messages)

Auto-reply runs only when settings.busy_mode is true.

Decision gates:

1. If busy_mode is false: store-only.
2. Policy engine classifies action as reply/review/escalate/skip.
3. If spam or no-reply message: skip.
4. If emergency and emergency_notify=true: escalate to user and skip auto send.
5. If high-stakes topic (financial/legal/medical/commitment): mark as manual review.
6. If a recent auto-reply exists in last 3 minutes: skip.

If all gates pass, generate a personalized assistant reply.

## 7. Reply Generation

Primary path (API Airforce):

1. Load personality_profiles (manual settings + learned_style).
2. Load recent conversation history for that exact contact.
3. Pull recent real replies written by the user.
4. Pull per-contact learned patterns and sample replies when available.
5. Infer relationship context.
4. Build rich prompt with:
   - style profile
   - recent real user replies
   - per-contact reply examples
   - intent/sentiment guidance
   - language-matching rule
   - relationship signal
   - recent context
6. Call API Airforce using an OpenAI-compatible chat completions API.
7. If API Airforce is unavailable, build a local style-aware backup reply.
8. Validate response and clean output.
9. Strict assistant mode sanitizes unsafe commitment phrases.

Fallback path (NLP templates):

- If the provider key is missing/invalid or the provider call fails, build a style-aware fallback from learned phrases, language mix, emojis, and recent user replies.
- Only if personalized fallback cannot be built, use the older intent-aware fallback behavior.

## 8. Outbound Send and Store

If busy_test_mode is enabled, BusyBot generates draft-only responses and does not send to WhatsApp.

1. Send reply through Evolution sendText endpoint.
2. On success, insert bot message with is_auto_reply=true.
3. Return per-user processing summary in webhook response.

## 9. Personality Training Flow

Triggered manually from Personality page, or automatically by webhook threshold.

1. train-personality receives user_id.
2. Reads user settings for `ai_provider`, `ai_api_key`, `ai_model`, and `ai_base_url`.
3. Loads outgoing user messages.
4. If the configured provider is available, run AI-based global and per-contact style analysis.
5. If the provider is missing or fails, run heuristic local style analysis from real user messages instead.
6. Merge global style + per-contact style into learned_style JSON.
7. Upsert personality_profiles with training metadata so webhook fallback stays personalized.

## 10. Frontend Realtime Updates

Supabase Realtime subscriptions propagate backend updates to UI:

- Dashboard cards and recent activity
- Conversations list and unread counts
- Active chat thread message stream

No custom socket server is required.
