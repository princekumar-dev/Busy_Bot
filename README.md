# 🤖 BusyBot — AI WhatsApp Auto-Reply Assistant

> Your personal AI that replies to WhatsApp messages **exactly like you** when you're busy. Not a robotic "I'm busy" template — real, human-like replies powered by Gemini AI with deep NLP.

**Live**: [busy-bot-eight.vercel.app](https://busy-bot-eight.vercel.app)

---

## ✨ Features

### 🧠 Smart AI Replies
- **Gemini 2.0 Flash** powered replies that sound like YOU, not a bot
- Learns your **greeting style, slang, abbreviations, emojis, and phrases** from real messages
- **Per-contact style learning** — knows you talk differently to Mom vs your best friend vs your boss
- Matches the **language** of the sender — English, Hindi, Hinglish, Tanglish, Tamil, or any mix

### 🔍 Deep NLP Engine
- **Intent Classification**: greeting, question, request, follow-up, emotional, farewell, statement
- **Sentiment Analysis**: happy, sad, angry, urgent, neutral
- **Relationship Inference**: family, friend, close personal, professional, acquaintance
- **Multi-language support**: English, Hindi, Tamil, Hinglish, Tanglish patterns built-in
- **Smart skip**: Doesn't reply to "ok", "👍", "thanks", farewells — only when needed
- **Duplicate prevention**: 3-minute cooldown per contact to avoid spam

### 📊 Real-Time Dashboard
- Live message count, auto-reply stats, emergency alerts, response times
- Week-over-week trends with percentage changes
- Recent activity feed with realtime updates

### 📈 Analytics
- 7-day message volume bar chart
- Hourly activity heatmap
- Urgency classification breakdown (normal / important / emergency)

### 🎭 Personality Training
- **One-click AI training** on your real WhatsApp messages
- **Global style** extraction: greetings, affirmatives, emojis, tone, language patterns
- **Per-contact analysis**: learns your unique style with each person
- Manual overrides for tone, formality, emoji usage, and common phrases

### 💬 Conversations
- Real-time WhatsApp conversation viewer
- Unread counts, urgency badges, search
- See exactly what BusyBot sent on your behalf

### ⚡ BusyMode Toggle
- One switch to activate/deactivate auto-replies
- Emergency message detection — skips auto-reply for urgent messages
- Configurable fallback text when Gemini is unavailable

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React + TypeScript + Vite |
| **UI** | Tailwind CSS + shadcn/ui |
| **Backend** | Supabase (PostgreSQL + Edge Functions + Realtime) |
| **WhatsApp** | Evolution API v2 |
| **AI** | Google Gemini 2.0 Flash |
| **Hosting** | Vercel (frontend) + Supabase (backend) + Render (Evolution API) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Evolution API](https://github.com/EvolutionAPI/evolution-api) instance
- A [Gemini API key](https://aistudio.google.com/apikey)

### Setup

```sh
# Clone the repo
git clone https://github.com/princekumar-dev/Busy_Bot.git
cd Busy_Bot

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Fill in your Supabase URL, Evolution API URL, API keys

# Start dev server
npm run dev
```

### Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_EVO_API_URL=https://your-evo-instance.com/
VITE_EVO_API_KEY=your-evolution-api-key
VITE_EVO_BOT_NAME=your-instance-name
```

### Deploy Edge Functions

```sh
npx supabase functions deploy webhook --no-verify-jwt --project-ref YOUR_PROJECT_REF
npx supabase functions deploy train-personality --no-verify-jwt --project-ref YOUR_PROJECT_REF
```

---

## 📁 Project Structure

```
src/
├── components/          # UI components
│   ├── AppSidebar.tsx   # Navigation sidebar
│   ├── BusyModeToggle.tsx # Main busy mode switch
│   ├── EvoQRConnector.tsx # WhatsApp QR scanner + webhook setup
│   └── ui/              # shadcn/ui components
├── pages/
│   ├── Dashboard.tsx    # Real-time stats dashboard
│   ├── Analytics.tsx    # Charts & analytics
│   ├── Conversations.tsx # WhatsApp message viewer
│   ├── Personality.tsx  # AI personality training
│   └── SettingsPage.tsx # App settings + Gemini key
├── hooks/               # Custom React hooks
├── integrations/        # Supabase client & types
└── lib/                 # Utilities

supabase/
├── functions/
│   ├── webhook/         # Main message handler (NLP + Gemini + Evolution API)
│   └── train-personality/ # Per-contact style ML analysis
└── migrations/          # Database schema
```

---

## 🧠 How the AI Works

```
Incoming WhatsApp Message
        │
        ▼
┌─────────────────────┐
│  Intent Classifier   │  → greeting / question / request / emotional / follow-up
│  Sentiment Analyzer  │  → happy / sad / angry / urgent / neutral
│  Relationship Infer  │  → family / friend / professional / acquaintance
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Cooldown Check      │  → Skip if replied to this person in last 3 min
│  needsReply Check    │  → Skip "ok", "👍", farewells
│  Emergency Check     │  → Skip if urgent + notifications enabled
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Gemini 2.0 Flash    │
│  ┌─────────────────┐ │
│  │ Global Style     │ │  ← learned greetings, slang, emojis, tone
│  │ Per-Contact Style│ │  ← how you talk to THIS specific person
│  │ Conversation Hx  │ │  ← last 20 messages for context
│  │ Intent + Sentiment│ │ ← what they want + how they feel
│  │ Relationship     │ │  ← warm for family, casual for friends
│  └─────────────────┘ │
└─────────────────────┘
        │
        ▼
   Human-like Reply
   sent via Evolution API
```

---

## 📝 License

MIT

---

Built with ❤️ by [Prince Kumar](https://github.com/princekumar-dev)
