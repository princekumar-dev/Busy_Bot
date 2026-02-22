// deno-lint-ignore-file
// @ts-nocheck — Runs on Supabase Edge Functions (Deno runtime)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_API_URL = Deno.env.get("EVO_API_URL")!;
const EVO_API_KEY = Deno.env.get("EVO_API_KEY")!;
const EVO_BOT_NAME = Deno.env.get("EVO_BOT_NAME") || "busybot";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ──────────────────────────────────────────────────────────
   1. INTENT & SENTIMENT CLASSIFIER
   Classifies the incoming message BEFORE generating a reply
   so the AI knows exactly what kind of response is needed.
   ────────────────────────────────────────────────────────── */

function classifyIntent(text: string): {
  intent: string;
  sentiment: string;
  needsReply: boolean;
  detectedLanguage: string;
} {
  const t = text.toLowerCase().trim();

  // ─── Intent detection ───
  let intent = "statement";

  // Greeting patterns (English + Hinglish + Tanglish + multi-language)
  const greetingPatterns = /^(hi|hey|hello|yo|sup|hii+|heyy+|oyee?|oi|assalam|salam|namaste|hola|howdy|wassup|whats\s?up|good\s?(morning|afternoon|evening|night)|gm|gn|vanakkam|vannakam|da|di|dei|machi|machan|machii?|nanba|bha+i|kya\s?hal|kaise\s?ho|theek|kem\s?cho|aur\s?bata|bolo|bol\s?na|haan\s?bhai|arey?|yov|enna\s?da|eppadi|sollu|vaanga|vaa|pa|maapla|ji|helo+)\b/i;
  if (greetingPatterns.test(t) && t.split(/\s+/).length <= 6) intent = "greeting";

  // Question patterns (English + Hindi + Tamil)
  const questionPatterns = /(\?|^(what|when|where|why|how|who|which|can|could|would|will|do|does|did|is|are|have|has|kya|kab|kahan|kaun|kaise|kidhar|kitna|kithe|enna|enga|yaar|yaaru|eppo|epdi|ethuku|evlo|ethana|yenda|yen|enge|sollu|panna|mudiyuma|theriyuma|unaku|neenga|romba))\b/i;
  if (questionPatterns.test(t)) intent = "question";

  // Request / ask for action (English + Hindi + Tamil)
  const requestPatterns = /\b(please|plz|pls|send|share|give|tell|help|need|want|call|come|meet|check|look|see|reply|respond|answer|batao|bhejo|bata|kar|karo|dedo|batado|sunno|suno|bhejna|dikhao|samjhao|sollu|solu|sollunga|anuppu|kudu|kudungga|paru|paaru|va|vaanga|pannunga|pannuda|konjam|thaa|kududa|call\s?pannu|msg\s?pannu|reply\s?pannu|check\s?pannu)\b/i;
  if (requestPatterns.test(t) && intent !== "greeting") intent = "request";

  // Follow-up / checking in (English + Hinglish + Tanglish)
  const followUpPatterns = /^(hey\??|you there|hello\??|still busy|any update|update\??|so\??|bro\??|dude\??|bhai\??|are you there|r u there|reply|seen\??|online\??|da\??|dei\??|machi\??|machan\??|bol\s?na\??|sun\s?na\??|kaha\s?ho\??|kidhar\s?ho\??|reply\s?to\s?kar|msg\s?dekh|enna\s?aachu\??|enga\s?da\??|reply\s?pannu\s?da|pesi\s?mudicha\??|vandhudu\??|free\s?ah\??)\s*\??$/i;
  if (followUpPatterns.test(t)) intent = "follow_up";

  // Emotional / personal (English + Hindi + Tamil)
  const emotionalPatterns = /\b(miss you|love|sorry|sad|upset|crying|worried|scared|angry|frustrated|happy|excited|proud|thank|congrat|rip|passed away|died|hospital|sick|ill|hurt|pain|broke|breakup|fight|pyaar|dukhi|rona|tension|pareshan|fikar|gussa|khush|maafi|dhanyavaad|rodhane|sogam|kashtam|valikuthu|azhugiren|bayam|kovam|sandhosham|nandri|kanneer|vali|kavalai|manam|nesam|romba\s?bad|feel\s?pannuren|kedaikala|mosam|dhrogam)\b/i;
  if (emotionalPatterns.test(t)) intent = "emotional";

  // Farewell (English + Hindi + Tamil)
  const farewellPatterns = /^(bye|ok\s?bye|see you|cya|ttyl|good\s?night|take care|chal|chalo|tc|later|tata|alvida|phir\s?milte|baad\s?mein|chalta\s?hu|nikalta\s?hu|poi\s?varen|poitu\s?varen|sari\s?da|seri\s?da|seri\s?po|ta\s?ta|bye\s?da|bye\s?di|night\s?da|poidren|varuven|innum\s?pesalam)\b/i;
  if (farewellPatterns.test(t)) intent = "farewell";

  // ─── Sentiment detection ───
  let sentiment = "neutral";

  const happyWords = /\b(happy|excited|great|awesome|amazing|wonderful|love|haha|lol|😂|😄|🎉|❤️|😍|yay|woohoo|fantastic|perfect|khush|maza|badhiya|zabardast|mast|superr?|semma|theri|mass|vera\s?level|romba\s?nalla|adipoli|kalakkal|sema|jolly|chanceless)\b/i;
  const sadWords = /\b(sad|upset|crying|cry|depressed|lonely|miss|hurt|pain|😢|😭|💔|sorry|worried|scared|anxiety|stressed|dukhi|rona|udaas|pareshan|tension|sogam|kashtam|valikuthu|kanneer|feel\s?panren|romba\s?bad|vali|kavalai|thanimai|bayam)\b/i;
  const angryWords = /\b(angry|mad|furious|pissed|annoyed|frustrated|wtf|🤬|😡|hate|gussa|chidh|irritate|kovam|erichhal|podhum|podhumda|porukka\s?mudiyala|veriethuthu)\b/i;
  const urgentWords = /\b(urgent|emergency|asap|immediately|right now|hurry|quick|fast|sos|911|🚨|⚠️|critical|jaldi|turant|fatafat|abhi|udane|vegam|seekiram|urgent\s?a|konjam\s?fast|important\s?da)\b/i;

  if (urgentWords.test(t)) sentiment = "urgent";
  else if (angryWords.test(t)) sentiment = "angry";
  else if (sadWords.test(t)) sentiment = "sad";
  else if (happyWords.test(t)) sentiment = "happy";

  // ─── Does this need a reply? ───
  // Don't reply to "ok", "k", "👍", reactions, or farewells
  const noReplyPatterns = /^(ok|k|kk|okay|👍|👌|🙏|thanks|thanku|ty|tq|hmm|mm|hm|oh|ohk|accha|acha|theek|thik|seri|serida|okda|okdi|hmda|aamam|haan|ha|ji|ok\s?va|seri\s?pa|ok\s?pa|ok\s?da|ok\s?machi|nandri|dhanyavaad|thenkyu|thanksu)\s*\.?$/i;
  const needsReply = !(noReplyPatterns.test(t) || intent === "farewell");

  // ─── Language detection ───
  let detectedLanguage = "english";
  const tamilChars = /[\u0B80-\u0BFF]/;
  const hindiChars = /[\u0900-\u097F]/;
  const tamilRomanWords = /\b(da|di|dei|machi|machan|nanba|enna|enga|eppo|epdi|sollu|pannunga|vaanga|semma|thala|paaru|kudu|seri|romba|podu|aana|illa|iruku|theriyum|konjam|panna|vandhu|pogalam|vaada|vanakkam|nandri)\b/i;
  const hindiRomanWords = /\b(kya|kab|kaise|kahan|kaun|kitna|bhai|yaar|acha|theek|haan|nahi|batao|bhejo|karo|dekho|sunno|arey|chalo|abhi|jaldi|matlab|wala|mein|hai|toh|bhi|lekin|bohot|bahut|tera|mera|apna|humara)\b/i;

  if (tamilChars.test(t)) detectedLanguage = "tamil";
  else if (hindiChars.test(t)) detectedLanguage = "hindi";
  else {
    const tamilHits = (t.match(tamilRomanWords) || []).length;
    const hindiHits = (t.match(hindiRomanWords) || []).length;
    if (tamilHits > 0 && hindiHits > 0) detectedLanguage = "mixed";
    else if (tamilHits >= 2) detectedLanguage = "tanglish";
    else if (tamilHits === 1) detectedLanguage = "tanglish_light";
    else if (hindiHits >= 2) detectedLanguage = "hinglish";
    else if (hindiHits === 1) detectedLanguage = "hinglish_light";
  }

  return { intent, sentiment, needsReply, detectedLanguage };
}

/* ──────────────────────────────────────────────────────────
   2. RELATIONSHIP INFERRER
   Guesses the relationship based on conversation patterns
   ────────────────────────────────────────────────────────── */

function inferRelationship(
  contactName: string | null,
  history: any[]
): string {
  const name = (contactName || "").toLowerCase();

  // Name-based hints (English + Hindi + Tamil)
  if (/\b(mom|mum|mama|amma|dad|papa|baba|sis|bro|brother|sister|bhai|didi|bhaiya|appa|aththai|chitthi|chitappa|periappa|periamma|thatha|paatti|anna|akka|thambi|thangai|maama|maami|chachi|chacha|tai|masi|nani|dada|dadi|athai|maman)\b/i.test(name))
    return "family";
  if (/\b(sir|ma'am|prof|boss|manager|dr|doctor|teacher|principal|HOD|madam)\b/i.test(name))
    return "professional";

  // Analyze message formality from history
  if (history.length < 3) return "unknown";

  const userMsgs = history.filter((m) => m.sender === "user").map((m) => m.content.toLowerCase());
  const allText = userMsgs.join(" ");

  // Check for formal language → professional
  const formalMarkers = (allText.match(/\b(sir|ma'am|please|kindly|regards|thank you|noted|will do|madam|respected|acknowledge)\b/gi) || []).length;
  // Check for casual language → friend (Hindi + Tamil + English slang)
  const casualMarkers = (allText.match(/\b(bro|dude|yaar|bhai|lol|haha|bruh|omg|wtf|lmao|oye|da|di|dei|machi|machan|nanba|thala|thambi|anna|pa|vaa|po|semma|mass|vera\s?level|scene|seri|okda|hmda|machaa)\b/gi) || []).length;
  // Check for affection → close friend or family
  const affectionMarkers = (allText.match(/\b(love|miss|baby|jaan|darling|sweetheart|❤️|😘|🥰|kannu|chellam|kutty|bangaram|ra|raa|pyaar|kaadhal)\b/gi) || []).length;

  if (affectionMarkers > 2) return "close_personal";
  if (formalMarkers > casualMarkers + 2) return "professional";
  if (casualMarkers > formalMarkers + 1) return "friend";
  return "acquaintance";
}

/* ──────────────────────────────────────────────────────────
   3. SMART REPLY GENERATOR (enhanced with NLP context)
   ────────────────────────────────────────────────────────── */

async function generateSmartReply(
  incomingMessage: string,
  contactName: string | null,
  personality: any,
  conversationHistory: any[],
  geminiKey: string,
  fallbackText: string,
  intentData: { intent: string; sentiment: string; detectedLanguage: string },
  relationship: string
): Promise<string> {
  // Build readable conversation history (last 20 for context window)
  const recentHistory = conversationHistory.slice(-20);
  const historyLines = recentHistory.map((m) => {
    const who = m.sender === "user" ? "You" : contactName || "Contact";
    return `${who}: ${m.content}`;
  });
  const historyStr =
    historyLines.join("\n") || "(First message from this contact)";

  // Extract personality traits
  const tone = personality?.tone || "casual";
  const avgLength = personality?.avg_length || 15;
  const useEmoji = personality?.emoji_usage !== false;
  const commonPhrases = (personality?.common_phrases || []).join(", ");
  const formality = personality?.formality_score || 0.5;
  const learnedStyle = personality?.learned_style || {};

  // Build rich context from ML-learned patterns
  let learnedContext = "";
  if (learnedStyle.greetings?.length)
    learnedContext += `\n- How you greet people: ${learnedStyle.greetings.join(", ")}`;
  if (learnedStyle.affirmatives?.length)
    learnedContext += `\n- How you say yes/agree: ${learnedStyle.affirmatives.join(", ")}`;
  if (learnedStyle.negatives?.length)
    learnedContext += `\n- How you say no/disagree: ${learnedStyle.negatives.join(", ")}`;
  if (learnedStyle.fillers?.length)
    learnedContext += `\n- Filler words you use: ${learnedStyle.fillers.join(", ")}`;
  if (learnedStyle.closings?.length)
    learnedContext += `\n- How you end chats: ${learnedStyle.closings.join(", ")}`;
  if (learnedStyle.emoji_favorites?.length)
    learnedContext += `\n- Your favorite emojis: ${learnedStyle.emoji_favorites.join(" ")}`;
  if (learnedStyle.signature_phrases?.length)
    learnedContext += `\n- Signature phrases: ${learnedStyle.signature_phrases.join(", ")}`;
  if (learnedStyle.language_mix)
    learnedContext += `\n- Language style: ${learnedStyle.language_mix}`;
  if (learnedStyle.tone_summary)
    learnedContext += `\n- Overall tone: ${learnedStyle.tone_summary}`;
  if (learnedStyle.abbreviation_style)
    learnedContext += `\n- Abbreviation style: ${learnedStyle.abbreviation_style}`;
  if (learnedStyle.detected_languages?.length)
    learnedContext += `\n- Languages you speak: ${learnedStyle.detected_languages.join(", ")}`;
  if (learnedStyle.primary_language)
    learnedContext += `\n- Your primary language: ${learnedStyle.primary_language}`;
  if (learnedStyle.code_switching_pattern)
    learnedContext += `\n- Code-switching habit: ${learnedStyle.code_switching_pattern}`;

  // Per-contact learned patterns (fuzzy key matching)
  const contactKey = contactName?.toLowerCase().replace(/\s+/g, "_") || "unknown";
  let perContact = learnedStyle.per_contact?.[contactKey];
  // Fuzzy match — try partial name match if exact key doesn't work
  if (!perContact && contactName && learnedStyle.per_contact) {
    const nameLower = contactName.toLowerCase();
    for (const [key, val] of Object.entries(learnedStyle.per_contact)) {
      if (key.includes(nameLower) || nameLower.includes(key) ||
          (val as any).contact_name?.toLowerCase().includes(nameLower)) {
        perContact = val;
        break;
      }
    }
  }
  let perContactContext = "";
  if (perContact) {
    perContactContext = `\n\nHOW YOU SPECIFICALLY TALK TO ${contactName || "this person"}:`;
    if (perContact.tone) perContactContext += `\n- Your tone with them: ${perContact.tone}`;
    if (perContact.sample_replies?.length)
      perContactContext += `\n- Example replies to them: "${perContact.sample_replies.join('", "')}"`;
    if (perContact.language) perContactContext += `\n- Language with them: ${perContact.language}`;
    if (perContact.emoji_usage) perContactContext += `\n- Emoji usage with them: ${perContact.emoji_usage}`;
  }

  // Relationship context
  const relationshipMap: Record<string, string> = {
    family: "This is a FAMILY member — be warm, caring, and natural. You can be brief but never cold.",
    close_personal: "This is someone very CLOSE to you — be warm, affectionate, and real.",
    friend: "This is a FRIEND — be casual, fun, use slang freely, be yourself.",
    professional: "This is a PROFESSIONAL contact — be slightly more polished but still natural. Don't use too much slang.",
    acquaintance: "This is an ACQUAINTANCE — be polite but not overly formal. Keep it friendly.",
    unknown: "Respond naturally based on their tone.",
  };
  const relationshipGuide = relationshipMap[relationship] || relationshipMap.unknown;

  // Intent-specific guidance
  const intentGuide: Record<string, string> = {
    greeting: "They're greeting you. Greet them back using YOUR greeting style, then naturally mention you're busy/caught up.",
    question: "They asked a question. Briefly acknowledge it (don't ignore the question entirely), and say you'll answer properly later.",
    request: "They want something from you. Acknowledge what they need, and tell them you'll handle it / get back to them.",
    follow_up: "They're checking if you're there / following up. Reassure them briefly — you're just busy, not ignoring them.",
    emotional: "They're sharing something EMOTIONAL. Show you CARE — be warm, empathetic. Don't just brush it off with 'I'm busy'. Acknowledge their feelings FIRST, then mention you'll talk properly soon.",
    statement: "They said something general. Respond naturally and briefly, weaving in that you're occupied.",
    farewell: "They're saying bye. Say bye back in your style.",
  };
  const intentAdvice = intentGuide[intentData.intent] || intentGuide.statement;

  // Sentiment-specific guidance
  const sentimentGuide: Record<string, string> = {
    happy: "They seem HAPPY/EXCITED — match their energy a bit, respond positively.",
    sad: "They seem SAD/DOWN — be EXTRA warm and caring. Don't dismiss their feelings. Show empathy first.",
    angry: "They seem UPSET/ANGRY — be calm, understanding. Don't be dismissive. Acknowledge their frustration.",
    urgent: "This feels URGENT to them — take it seriously, don't be too casual about it.",
    neutral: "Normal mood — respond naturally.",
  };
  const sentimentAdvice = sentimentGuide[intentData.sentiment] || sentimentGuide.neutral;

  const prompt = `You are a REAL PERSON chatting on WhatsApp. You must reply EXACTLY as this person would — never reveal you're AI.

YOUR PERSONALITY PROFILE:
- Base Tone: ${tone}
- Formality: ${Math.round(formality * 100)}% (0%=max casual, 100%=max formal)
- Typical message length: ~${avgLength} words
- Emojis: ${useEmoji ? "Use naturally — match this person's emoji habits" : "Rarely/never use emojis"}
${commonPhrases ? `- Common phrases: ${commonPhrases}` : ""}${learnedContext}${perContactContext}

RELATIONSHIP: ${relationshipGuide}

DETECTED LANGUAGE: ${intentData.detectedLanguage}
- If "tanglish" or "tamil": Reply in Tamil-English mix (Tanglish) using Roman script.
- If "hinglish" or "hindi": Reply in Hindi-English mix (Hinglish) using Roman script.
- If "english": Reply in English matching your natural style.
- If "mixed": Match whatever mix they used.
- ALWAYS match the language of the incoming message, not your default.

NLP ANALYSIS OF THEIR MESSAGE:
- Detected Intent: ${intentData.intent} → ${intentAdvice}
- Detected Sentiment: ${intentData.sentiment} → ${sentimentAdvice}

CRITICAL RULES:
1. You ARE this person. Match their EXACT style — slang, abbreviations, language, vibe.
2. You are currently BUSY/OCCUPIED. Weave this in naturally — DON'T sound like a template or bot.
3. NEVER say "I am busy I will get back to you soon" — that's obviously robotic.
4. NEVER use corporate phrases like "I acknowledge", "at my earliest convenience", "I've noted".
5. Match their language — if they write Hindi/Hinglish/Tamil/any language, reply in the SAME language.
6. Keep it SHORT — 1-3 sentences MAX, like a real quick WhatsApp message.
7. Show REAL emotion — you're human with feelings, not a machine processing text.
8. If they're sad/emotional, acknowledge feelings FIRST, THEN mention being busy.
9. If they ask a specific question, briefly reference what they asked (don't ignore it).
10. If they're following up, reassure them — you're busy, not ignoring them.
11. Look at the conversation history to understand CONTEXT of what's being discussed.

CONVERSATION HISTORY WITH ${contactName || "this contact"}:
${historyStr}

THEIR NEW MESSAGE: "${incomingMessage}"

Reply as this person would — natural, short, human, context-aware:`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 150,
            topP: 0.95,
            topK: 40,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Gemini API error:", res.status, errBody);
      return fallbackText;
    }

    const result = await res.json();
    const reply = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!reply) {
      console.error("Gemini returned empty response");
      return fallbackText;
    }

    // Clean up — remove surrounding quotes / backticks Gemini sometimes adds
    return reply.replace(/^["'`]+|["'`]+$/g, "").trim();
  } catch (err) {
    console.error("Gemini API call failed:", err);
    return fallbackText;
  }
}

/* ──────────────────────────────────────────────────────────
   4. DUPLICATE REPLY PREVENTION
   Don't spam the same contact with busy replies
   ────────────────────────────────────────────────────────── */

async function hasRecentAutoReply(
  conversationId: string,
  userId: string,
  cooldownMinutes: number = 3
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("is_auto_reply", true)
    .gte("created_at", cutoff)
    .limit(1);

  return (data?.length || 0) > 0;
}

/* ──────────────────────────────────────────────────────────
   5. MAIN WEBHOOK HANDLER
   ────────────────────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body, null, 2));

    const event = body.event;

    // Only process message events
    if (event !== "messages.upsert") {
      return new Response(
        JSON.stringify({ status: "ignored", event }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = body.data;
    if (!data) {
      return new Response(
        JSON.stringify({ status: "no data" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const key = data.key;
    const messageContent = data.message;
    const isFromMe = key?.fromMe === true;

    // Skip group messages
    const remoteJid = key?.remoteJid || "";
    if (remoteJid.endsWith("@g.us")) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "group" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract phone number
    const contactNumber = remoteJid.replace("@s.whatsapp.net", "");
    if (!contactNumber) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "no number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text content
    const text =
      messageContent?.conversation ||
      messageContent?.extendedTextMessage?.text ||
      messageContent?.imageMessage?.caption ||
      messageContent?.videoMessage?.caption ||
      "[media message]";

    // pushName is the SENDER's name. When fromMe=true, that's our own name — not the contact's.
    const contactName = isFromMe ? null : (data.pushName || null);

    // Message type detection
    let messageType = "text";
    if (messageContent?.imageMessage) messageType = "image";
    else if (messageContent?.audioMessage) messageType = "voice";
    else if (messageContent?.videoMessage) messageType = "image";

    // Skip auto-reply for media without text
    const isMediaOnly = text === "[media message]";

    // ─── NLP: Classify intent & sentiment ───
    const intentData = isMediaOnly
      ? { intent: "media", sentiment: "neutral", needsReply: false, detectedLanguage: "unknown" }
      : classifyIntent(text);
    console.log(`NLP classification: intent=${intentData.intent}, sentiment=${intentData.sentiment}, needsReply=${intentData.needsReply}, lang=${intentData.detectedLanguage}`);

    // Urgency detection (incoming only)
    const lowerText = text.toLowerCase();
    let urgency = "normal";
    if (!isFromMe) {
      if (intentData.sentiment === "urgent") {
        urgency = "emergency";
      } else {
        const emergencyWords = ["emergency", "urgent", "asap", "help", "911", "sos", "critical", "🚨", "⚠️"];
        const importantWords = ["important", "priority", "need", "please call", "call me"];
        if (emergencyWords.some((w) => lowerText.includes(w))) urgency = "emergency";
        else if (importantWords.some((w) => lowerText.includes(w))) urgency = "important";
      }
    }

    // ─── Fetch all users with settings ───
    const { data: allSettings, error: settingsError } = await supabase
      .from("settings")
      .select("user_id, busy_mode, auto_reply_text, emergency_notify, gemini_api_key")
      .order("updated_at", { ascending: false });

    if (settingsError || !allSettings || allSettings.length === 0) {
      console.error("No user settings found:", settingsError);
      return new Response(
        JSON.stringify({ status: "error", message: "No users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Process for each user ───
    const results = [];

    for (const settings of allSettings) {
      const userId = settings.user_id;

      // Find or create conversation
      let { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("contact_number", contactNumber)
        .single();

      if (!conversation) {
        const { data: newConvo, error: createError } = await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            contact_number: contactNumber,
            contact_name: contactName,
            unread_count: isFromMe ? 0 : 1,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError) {
          console.error(`Failed to create convo for ${userId}:`, createError);
          continue;
        }
        conversation = newConvo;
      } else if (!isFromMe) {
        await supabase
          .from("conversations")
          .update({
            contact_name: contactName || conversation.contact_name,
            unread_count: (conversation.unread_count || 0) + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }

      /* ═══ fromMe = true → LEARNING MODE ═══ */
      if (isFromMe) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          user_id: userId,
          sender: "user",
          content: text,
          message_type: messageType,
          urgency: "normal",
          is_auto_reply: false,
        });
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation.id);

        results.push({ user_id: userId, action: "learned", snippet: text.substring(0, 50) });

        // Auto-retrain check: if 50+ new messages since last training, trigger background retrain
        try {
          const { data: profile } = await supabase
            .from("personality_profiles")
            .select("training_message_count, last_trained_at")
            .eq("user_id", userId)
            .single();

          const { count: totalUserMsgs } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("sender", "user");

          const lastTrainedCount = (profile as any)?.training_message_count || 0;
          const newMsgsSinceTraining = (totalUserMsgs || 0) - lastTrainedCount;

          if (newMsgsSinceTraining >= 50) {
            // Get Gemini key
            const { data: userSettings } = await supabase
              .from("settings")
              .select("gemini_api_key")
              .eq("user_id", userId)
              .single();

            if (userSettings?.gemini_api_key) {
              console.log(`Auto-retrain triggered for ${userId}: ${newMsgsSinceTraining} new msgs`);
              // Fire and forget — don't await
              fetch(`${SUPABASE_URL}/functions/v1/train-personality`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId }),
              }).catch((e) => console.error("Auto-retrain fire-and-forget error:", e));
            }
          }
        } catch (e) {
          console.error("Auto-retrain check error:", e);
        }

        continue;
      }

      /* ═══ Incoming message → store it ═══ */
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        user_id: userId,
        sender: "contact",
        content: text,
        message_type: messageType,
        urgency,
        is_auto_reply: false,
      });

      /* ═══ Auto-reply logic (only if busy_mode ON) ═══ */
      if (!settings.busy_mode) {
        results.push({ user_id: userId, action: "stored", busy_mode: false });
        continue;
      }

      // Skip if message doesn't need a reply (reactions, "ok", "thanks", farewells)
      if (!intentData.needsReply) {
        console.log(`Skipping reply — "${text}" doesn't need one (intent: ${intentData.intent})`);
        results.push({ user_id: userId, action: "no_reply_needed", intent: intentData.intent });
        continue;
      }

      // Emergency skip
      if (urgency === "emergency" && settings.emergency_notify) {
        console.log("Emergency message — skipping auto-reply");
        results.push({ user_id: userId, action: "emergency_skip" });
        continue;
      }

      // Duplicate reply prevention — don't spam the same person
      const recentlyReplied = await hasRecentAutoReply(conversation.id, userId, 3);
      if (recentlyReplied) {
        console.log(`Cooldown active — already replied to ${contactNumber} recently`);
        results.push({ user_id: userId, action: "cooldown_skip" });
        continue;
      }

      // Fetch personality profile (with learned style)
      const { data: personality } = await supabase
        .from("personality_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      // Fetch recent conversation history for this SPECIFIC contact
      const { data: recentMessages } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(30);

      // Infer relationship from conversation patterns
      const relationship = inferRelationship(contactName, recentMessages || []);
      console.log(`Relationship with ${contactName}: ${relationship}`);

      // ─── Generate smart reply ───
      const fallback = settings.auto_reply_text || "Hey, caught up with something rn. Will text you back soon!";

      let replyText: string;

      if (settings.gemini_api_key) {
        replyText = await generateSmartReply(
          text,
          contactName,
          personality,
          (recentMessages || []).reverse(),
          settings.gemini_api_key,
          fallback,
          intentData,
          relationship
        );
      } else {
        // No Gemini — contextual fallback based on intent
        if (intentData.intent === "greeting") {
          replyText = `Hey! Kinda caught up rn, will text you back soon 👋`;
        } else if (intentData.intent === "emotional" && intentData.sentiment === "sad") {
          replyText = `Hey, I see your message. I'll call you back soon, just in something rn ❤️`;
        } else if (intentData.intent === "question") {
          replyText = `${fallback} Will answer that properly when I'm free.`;
        } else if (urgency === "important") {
          replyText = `${fallback} Noted this seems important — will prioritize it.`;
        } else {
          replyText = fallback;
        }
      }

      // ─── Send reply via Evolution API ───
      const evoBase = EVO_API_URL.endsWith("/") ? EVO_API_URL.slice(0, -1) : EVO_API_URL;
      const delay = personality?.response_delay_ms || 2000;

      try {
        const sendRes = await fetch(`${evoBase}/message/sendText/${EVO_BOT_NAME}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVO_API_KEY },
          body: JSON.stringify({ number: contactNumber, text: replyText, delay }),
        });

        if (sendRes.ok) {
          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            user_id: userId,
            sender: "bot",
            content: replyText,
            message_type: "text",
            urgency: "normal",
            is_auto_reply: true,
          });
          console.log(`Smart reply → ${contactNumber} [${intentData.intent}/${intentData.sentiment}/${relationship}]: "${replyText}"`);
          results.push({
            user_id: userId,
            action: "smart_reply",
            intent: intentData.intent,
            sentiment: intentData.sentiment,
            relationship,
            reply: replyText.substring(0, 80),
          });
        } else {
          const errText = await sendRes.text();
          console.error("Send failed:", sendRes.status, errText);
          results.push({ user_id: userId, action: "send_failed", error: errText.substring(0, 100) });
        }
      } catch (sendErr) {
        console.error("Send error:", sendErr);
        results.push({ user_id: userId, action: "send_error" });
      }
    } // end for-loop

    return new Response(
      JSON.stringify({ status: "ok", urgency, fromMe: isFromMe, intent: intentData.intent, sentiment: intentData.sentiment, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
