# Deployment Guide: Render + Supabase + Vercel

This guide explains the expected production topology:

- Frontend on Vercel
- Backend on Supabase
- Evolution API on Render

## 1. Deploy Evolution API on Render

1. Create a new Render web service for Evolution API.
2. Configure required Evolution env vars from its official docs.
3. Expose public base URL (example: https://your-evo-service.onrender.com).
4. Create/get Evolution API key and instance name.

## 2. Configure Supabase

### Database

1. Create a Supabase project.
2. Run migrations from supabase/migrations in order.
3. Verify tables exist: profiles, personality_profiles, settings, conversations, messages.

### Edge Function Secrets

Set secrets for function runtime:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- EVO_API_URL
- EVO_API_KEY
- EVO_BOT_NAME

### Deploy Functions

```bash
supabase functions deploy webhook --project-ref <project_ref>
supabase functions deploy train-personality --project-ref <project_ref>
supabase functions deploy debug --project-ref <project_ref>
```

Note:

- webhook and train-personality are configured with verify_jwt = false in supabase/config.toml.

## 3. Configure Frontend (Vercel)

Set Vercel environment variables:

```env
VITE_SUPABASE_PROJECT_ID=<project_ref>
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase_publishable_anon_key>
VITE_SUPABASE_URL=https://<project_ref>.supabase.co
VITE_SITE_URL=https://<your-vercel-domain>

VITE_EVO_API_URL=https://<your-render-evo-url>/
VITE_EVO_API_KEY=<evolution_api_key>
VITE_EVO_BOT_NAME=<instance_name>
```

Deploy frontend build.

## 4. Connect WhatsApp and Register Webhook

1. Login to BusyBot.
2. Open Settings page.
3. Use Evo QR Connector to connect WhatsApp instance.
4. Confirm webhook registration to Supabase function endpoint:
   https://<project_ref>.supabase.co/functions/v1/webhook

## 5. Enable AI Replies

Per user:

1. Open Settings.
2. Set the API Airforce API key.
3. Optionally customize fallback auto-reply text.
4. Turn Busy Mode ON from Dashboard.

## 6. Verify End-to-End

Checklist:

1. Send a message from another phone to the connected WhatsApp.
2. Confirm new conversation/message row appears in Supabase.
3. Confirm auto-reply is sent when Busy Mode is ON.
4. Confirm bot reply row saved with is_auto_reply=true.
5. Confirm dashboard and conversations UI update without refresh.

## 7. Common Production Pitfalls

1. Missing ai_api_key or API_AIRFORCE_API_KEY for that user.
2. Evolution URL mismatch between frontend and function secrets.
3. Missing trailing route segment in webhook URL.
4. Not applying latest migration that adds learned_style and AI provider columns.
5. Rate-limited API Airforce key causing local backup replies.

## 8. Security Recommendations

1. Rotate leaked keys immediately.
2. Keep service role key only in Supabase function secrets.
3. Keep VITE_* values limited to publishable frontend-safe data.
4. Review RLS policies before production launch.
