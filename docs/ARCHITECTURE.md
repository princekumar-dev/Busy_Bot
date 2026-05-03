# BusyBot Architecture

## System Overview

BusyBot is split into three major runtime zones:

1. Frontend app (React + Vite)
2. Supabase backend (Postgres + Auth + Edge Functions + Realtime)
3. External integrations (Evolution API and API Airforce)

```text
+---------------------------+       +----------------------------+
| Frontend (React/Vite)     |       | Evolution API (Render)     |
|                           |       |                            |
| - Auth pages              |       | - WhatsApp session/QR      |
| - Dashboard/Analytics     |       | - Event webhooks           |
| - Conversations           |       | - sendText API             |
| - Personality/Settings    |       +-------------+--------------+
+-------------+-------------+                     |
              | Supabase JS                        |
              v                                    |
+-------------+------------------------------------v-----------+
| Supabase                                                 |
| - Auth                                                   |
| - Postgres tables + RLS                                 |
| - Realtime channels                                     |
| - Edge Function: webhook                                |
| - Edge Function: train-personality                      |
| - Edge Function: debug                                  |
+-------------+--------------------------------------------+
              |
              | outbound HTTP
              v
     +--------+----------------+
     | API Airforce            |
     | - chat completions      |
     +-------------------------+
```

## Frontend Architecture

## Entry and Providers

- src/main.tsx mounts the app.
- src/App.tsx wraps app with:
  - QueryClientProvider
  - TooltipProvider
  - Toast providers
  - BrowserRouter
  - AuthProvider

## Routing and Protection

Public routes:

- /
- /auth

Protected routes (wrapped by ProtectedRoute + DashboardLayout):

- /dashboard
- /conversations
- /personality
- /analytics
- /settings

ProtectedRoute blocks unauthenticated access until session loading completes.

## State and Data

- Authentication state: custom hook in hooks/useAuth.tsx using Supabase auth events.
- Data access: direct Supabase queries from page components.
- Realtime updates: Supabase channels listening for messages/conversations table changes.

## UI Composition

- DashboardLayout provides sidebar + top bar layout.
- AppSidebar contains route navigation and sign-out action.
- Feature pages each own their query logic and rendering.

## Backend Architecture (Supabase)

## Database Tables

profiles

- One row per auth user profile.

personality_profiles

- User-configurable style settings.
- learned_style JSONB from training function.
- last_trained_at and training_message_count for retraining logic.

settings

- busy_mode, emergency_notify, voice_reply_enabled, auto_reply_text.
- ai_api_key, ai_model, ai_base_url, and ai_provider_name for API Airforce.

conversations

- Contact-level thread index per user.
- Stores unread_count and last_message_at.

messages

- Message log for inbound, user, and bot messages.
- sender in {contact, bot, user}.
- urgency and is_auto_reply flags.

## Security

- RLS enabled on user-facing tables.
- Policies restrict users to their own rows.
- Edge functions use service role key for server-side operations.

## Edge Functions

webhook

Responsibilities:

- Receives Evolution webhook events.
- Filters unsupported/group events.
- Parses message content and metadata.
- Creates/updates conversations and messages.
- Runs intent/sentiment/language classification.
- Applies auto-reply decision rules.
- Calls API Airforce for personalized output (when available).
- Uses local contextual backup replies if API Airforce fails.
- Sends outgoing replies via Evolution API sendText.
- Triggers retraining after enough new user messages.

train-personality

Responsibilities:

- Reads user's outgoing messages.
- Runs API Airforce JSON analysis for:
  - global writing style
  - per-contact style patterns
- Writes learned_style JSON and derived profile fields.

debug

Responsibilities:

- Operational debug endpoint for key and data checks.

## External Integration Responsibilities

Evolution API

- Manages WhatsApp connectivity/session.
- Sends inbound events to webhook endpoint.
- Accepts outbound sendText calls from webhook function.

API Airforce

- Produces personalized replies.
- Produces structured style analysis during training.

## Realtime Behavior

Frontend subscribes to Postgres changes for near-live UX:

- Dashboard refreshes stats on messages table changes.
- Conversations list refreshes on conversations updates.
- Active conversation appends new messages on insert events.

## Operational Notes

- Busy Mode is checked per user in settings table.
- Duplicate auto-reply cooldown is enforced per conversation (~3 minutes).
- Emergency messages can bypass auto-replies when emergency_notify is enabled.
- If API Airforce is unavailable or key is invalid, webhook uses contextual local reply logic.
