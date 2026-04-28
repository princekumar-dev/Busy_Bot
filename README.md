# BusyBot AI Pal

BusyBot is a full-stack WhatsApp auto-reply assistant that:

- connects to WhatsApp through Evolution API,
- stores conversations in Supabase Postgres,
- learns your message style from your own outgoing chats,
- generates context-aware replies with Gemini when Busy Mode is ON.

This repository contains:

- React + Vite frontend dashboard,
- Supabase database schema and RLS policies,
- Supabase Edge Functions for webhook processing and personality training.

## What This Project Includes

- Authentication with Supabase Auth (email/password)
- Dashboard, Conversations, Personality Training, Analytics, Settings pages
- Real-time UI updates using Supabase Realtime
- Smart auto-reply pipeline with intent/sentiment/language detection
- Fallback NLP replies when Gemini is unavailable
- Evolution API QR onboarding and webhook registration

## High-Level Architecture

```text
Frontend (Vercel / local)
  React + Vite + Tailwind + shadcn/ui
          |
          | Supabase JS client (auth, db, realtime)
          v
Supabase (backend)
  - Postgres (tables + RLS)
  - Auth
  - Edge Functions:
      1) webhook
      2) train-personality
      3) debug (optional)
          |
          | outbound HTTP calls
          v
External services
  - Evolution API (often hosted on Render)
  - Google Gemini API
```

Detailed architecture: see docs/ARCHITECTURE.md.

## Runtime Message Flow

1. A WhatsApp event reaches Evolution API.
2. Evolution forwards the event to Supabase Edge Function webhook.
3. webhook stores messages and updates conversation state.
4. If the message is from the user (fromMe=true), it is treated as training data.
5. If the message is incoming and Busy Mode is ON, webhook decides whether to auto-reply.
6. webhook generates reply:
   - Gemini-based personalized reply when gemini_api_key is available and valid.
   - NLP contextual fallback reply otherwise.
7. webhook sends the reply through Evolution API sendText endpoint.
8. Reply is stored in messages table as bot + is_auto_reply=true.
9. Frontend pages refresh live via Supabase Realtime channels.

End-to-end flow doc: see docs/WORKING_FLOW.md.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts
- Backend: Supabase (Postgres, Auth, Realtime, Edge Functions)
- AI: Gemini 2.0 Flash
- WhatsApp integration: Evolution API v2
- Typical deployment: Vercel (frontend) + Supabase + Render (Evolution API)

## Environment Variables

Create a .env file at the project root with:

```env
VITE_SUPABASE_PROJECT_ID=your_project_ref
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_anon_key
VITE_SUPABASE_URL=https://your_project_ref.supabase.co
VITE_SITE_URL=http://localhost:8080

VITE_EVO_API_URL=https://your-evolution-api-base-url/
VITE_EVO_API_KEY=your_evolution_api_key
VITE_EVO_BOT_NAME=busybot
```

Important:

- The frontend reads VITE_SUPABASE_PUBLISHABLE_KEY, not VITE_SUPABASE_ANON_KEY.
- Keep a trailing slash optional for VITE_EVO_API_URL (code normalizes it).
- Do not commit production keys.

## Supabase Edge Function Secrets

Set these in Supabase project secrets for Edge Functions:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- EVO_API_URL
- EVO_API_KEY
- EVO_BOT_NAME
- OPENROUTER_FALLBACK_API_KEY (optional, used when user did not set provider key)
- OPENROUTER_FALLBACK_MODEL (optional, defaults to tencent/hy3-preview:free)

Functions also use each user's gemini_api_key stored in public.settings.

## Local Development

```bash
npm install
npm run dev
```

App runs on port 8080 by default.

Useful scripts:

- npm run dev
- npm run build
- npm run preview
- npm run lint
- npm run test

## Database and Migrations

Schema is defined in:

- supabase/migrations/20260221075115_f7711e93-d5d3-4c93-a9be-f4608c020cd8.sql
- supabase/migrations/20260221120000_add_gemini_and_learning.sql

Core tables:

- profiles
- personality_profiles
- settings
- conversations
- messages

RLS is enabled with owner-scoped policies on user data tables.

## Deploying Supabase Functions

verify_jwt is disabled for webhook and train-personality in supabase/config.toml.

Deploy:

```bash
supabase functions deploy webhook --project-ref YOUR_PROJECT_REF
supabase functions deploy train-personality --project-ref YOUR_PROJECT_REF
supabase functions deploy debug --project-ref YOUR_PROJECT_REF
```

## Render + Supabase Setup (Evolution API Backend)

Typical production wiring:

1. Deploy Evolution API on Render.
2. Get its public base URL and API key.
3. Put those values in:
   - frontend .env (VITE_EVO_API_URL, VITE_EVO_API_KEY, VITE_EVO_BOT_NAME)
   - Supabase Edge Function secrets (EVO_API_URL, EVO_API_KEY, EVO_BOT_NAME)
4. In the app Settings page, use Evo QR Connector to connect WhatsApp and register webhook.
5. Evolution starts forwarding events to:
   https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/webhook

Full deployment checklist: see docs/DEPLOYMENT_RENDER_SUPABASE.md.

## Frontend Route Map

- / -> marketing/landing page
- /auth -> login/signup
- /dashboard -> protected dashboard
- /conversations -> protected chat viewer
- /personality -> protected AI training page
- /analytics -> protected metrics page
- /settings -> protected settings page

## Notes for Contributors

- Keep database changes in new SQL migrations.
- Keep docs aligned when env variables or function contracts change.
- When modifying webhook logic, update docs/WORKING_FLOW.md.

## Documentation Index

- docs/ARCHITECTURE.md
- docs/WORKING_FLOW.md
- docs/DEPLOYMENT_RENDER_SUPABASE.md

## License

MIT
