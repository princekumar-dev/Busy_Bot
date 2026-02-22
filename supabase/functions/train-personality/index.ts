// deno-lint-ignore-file
// @ts-nocheck — Runs on Supabase Edge Functions (Deno runtime)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ──────────────────────────────────────────────────────────
   Helper: Call Gemini with a prompt and parse JSON response
   ────────────────────────────────────────────────────────── */

async function callGeminiJSON(prompt: string, geminiKey: string, retries: number = 2): Promise<any> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Wait before retry: 2s, then 5s
      const waitMs = attempt === 1 ? 2000 : 5000;
      console.log(`Gemini retry ${attempt}/${retries} — waiting ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      clearTimeout(timeout);

      if (res.status === 429) {
        lastErr = new Error("Gemini API rate limit hit (429). Your free quota may be exhausted — wait a minute and try again, or check your API key at aistudio.google.com.");
        if (attempt < retries) continue; // retry
        throw lastErr;
      }

      if (res.status === 400) {
        const errText = await res.text();
        throw new Error(`Gemini API key invalid or request rejected (400): ${errText.substring(0, 200)}`);
      }

      if (!res.ok) {
        const errText = await res.text();
        lastErr = new Error(`Gemini API error ${res.status}: ${errText.substring(0, 300)}`);
        if (attempt < retries) continue;
        throw lastErr;
      }

      const result = await res.json();
      let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      if (!rawText) {
        lastErr = new Error("Gemini returned empty response");
        if (attempt < retries) continue;
        throw lastErr;
      }

      // Clean up common Gemini formatting issues
      rawText = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .replace(/,\s*}/g, "}")    // trailing commas before }
        .replace(/,\s*]/g, "]")    // trailing commas before ]
        .trim();

      try {
        return JSON.parse(rawText);
      } catch (parseErr) {
        // Try to extract JSON object from the response
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleaned = jsonMatch[0]
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]");
          return JSON.parse(cleaned);
        }
        console.error("Raw Gemini text that failed to parse:", rawText.substring(0, 500));
        lastErr = new Error(`JSON parse failed: ${String(parseErr)}`);
        if (attempt < retries) continue;
        throw lastErr;
      }
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        lastErr = new Error("Gemini API timed out after 20s — try again or reduce message count");
        if (attempt < retries) continue;
        throw lastErr;
      }
      if (lastErr && err === lastErr) throw err; // already handled above
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt >= retries) throw lastErr;
    }
  }

  throw lastErr || new Error("Unknown Gemini error after retries");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Get user's Gemini API key ───
    const { data: settings } = await supabase
      .from("settings")
      .select("gemini_api_key")
      .eq("user_id", user_id)
      .single();

    const geminiKey = settings?.gemini_api_key;
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured. Add it in Settings first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Get all user's outgoing messages with conversation context ───
    const { data: rawMessages, error: msgErr } = await supabase
      .from("messages")
      .select("content, created_at, conversation_id")
      .eq("user_id", user_id)
      .eq("sender", "user")
      .order("created_at", { ascending: false })
      .limit(200);

    // Filter out media-only messages
    const userMessages = (rawMessages || []).filter(
      (m) => m.content && m.content !== "[media message]" && m.content.trim().length > 0
    );

    if (msgErr || userMessages.length < 3) {
      return new Response(
        JSON.stringify({
          error: "Not enough messages to train. Keep chatting with BusyBot OFF — it learns from your real messages!",
          message_count: userMessages.length,
          tip: "Send at least 10-20 messages naturally while BusyBot is turned off.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ═══════════════════════════════════════════════════════
       PHASE 1: GLOBAL STYLE ANALYSIS
       Analyze all messages together for overall personality
       ═══════════════════════════════════════════════════════ */

    // Truncate individual messages to 200 chars to keep prompt within limits
    const allMessagesText = userMessages
      .map((m) => m.content.length > 200 ? m.content.substring(0, 200) + "..." : m.content)
      .join("\n");

    const globalPrompt = `Analyze these WhatsApp messages sent by ONE person. Extract their UNIQUE communication style and personality patterns.

IMPORTANT: This person may use MULTIPLE LANGUAGES including:
- English
- Hindi (Devanagari or Roman script: kya, kaise, haan, nahi, acha, bhai)
- Tamil (Tamil script or Roman: da, di, machi, sollu, enna, epdi, seri)
- Hinglish (Hindi-English mix: "acha sounds good", "kal milte hai bro")
- Tanglish (Tamil-English mix: "seri da", "romba good", "enna pannura")
- Any other language or code-switching

Capture ALL language patterns — DO NOT ignore non-English words.

MESSAGES (most recent first):
${allMessagesText}

Analyze carefully and return ONLY a valid JSON object (no markdown, no code blocks, no explanation) with these fields:
{
  "greetings": ["ALL greetings in ANY language they use, e.g. hey, oyee, yo, vanakkam, namaste, dei, kya re"],
  "affirmatives": ["ALL ways they say yes in ANY language, e.g. hmm, haan, acha, seri, ok da, theek hai, aamam"],
  "negatives": ["ALL ways they say no in ANY language, e.g. nah, nahi, venda, illa, na bro"],
  "fillers": ["ALL filler words in ANY language, e.g. like, arrey, da, yaar, basically, aana, matlab"],
  "closings": ["ALL conversation endings in ANY language, e.g. bye, chal, seri da, ok bye, poi varen, ttyl"],
  "emoji_favorites": ["their most used emojis"],
  "avg_word_count": 8,
  "detected_languages": ["list of languages detected, e.g. english, hindi, tamil, hinglish, tanglish"],
  "primary_language": "the language they use MOST, e.g. tanglish, hinglish, english",
  "language_mix": "description of language patterns e.g. 'Tanglish with English slang' or 'Mostly Hinglish'",
  "tone_summary": "brief description of their communication tone and energy",
  "signature_phrases": ["unique phrases they frequently use, in ANY language"],
  "abbreviation_style": "how they shorten words, e.g. 'u' for 'you', 'msg' for 'message'",
  "code_switching_pattern": "how they switch between languages mid-sentence or per-message"
}

IMPORTANT: Base this ONLY on the actual messages above. Don't invent patterns that aren't there. If a field has no matches, use an empty array []. Include words from ALL languages they use — not just English.`;

    let learnedStyle;
    try {
      learnedStyle = await callGeminiJSON(globalPrompt, geminiKey);
    } catch (err) {
      console.error("Global analysis failed:", err);
      // Fallback: build a basic style from raw message analysis instead of failing entirely
      const errMsg = String(err);
      if (errMsg.includes("429") || errMsg.includes("rate limit") || errMsg.includes("quota")) {
        return new Response(
          JSON.stringify({
            error: "Gemini API rate limit reached. Wait 1-2 minutes and try again. If this keeps happening, check your API key quota at aistudio.google.com.",
            details: errMsg,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (errMsg.includes("400") || errMsg.includes("invalid")) {
        return new Response(
          JSON.stringify({
            error: "Your Gemini API key appears to be invalid. Go to Settings and update it with a valid key from aistudio.google.com/apikey.",
            details: errMsg,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // For other errors: build basic fallback style from raw messages
      console.log("Building fallback style from raw message analysis...");
      const allTexts = userMessages.map((m) => m.content.toLowerCase());
      const allJoined = allTexts.join(" ");
      const wordCounts = userMessages.map((m) => m.content.split(/\s+/).length);
      const avgWords = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);

      // Detect emojis
      const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
      const allEmojis = allJoined.match(emojiRegex) || [];
      const emojiFreq: Record<string, number> = {};
      for (const e of allEmojis) { emojiFreq[e] = (emojiFreq[e] || 0) + 1; }
      const topEmojis = Object.entries(emojiFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e);

      learnedStyle = {
        greetings: [],
        affirmatives: [],
        negatives: [],
        fillers: [],
        closings: [],
        emoji_favorites: topEmojis,
        avg_word_count: avgWords,
        detected_languages: ["unknown"],
        primary_language: "unknown",
        language_mix: "Could not analyze — Gemini API failed",
        tone_summary: "Could not analyze — Gemini API failed. Retry training.",
        signature_phrases: [],
        abbreviation_style: "",
        code_switching_pattern: "",
        _fallback: true,
        _fallback_reason: errMsg.substring(0, 200),
      };
    }

    /* ═══════════════════════════════════════════════════════
       PHASE 2: PER-CONTACT STYLE ANALYSIS
       Group messages by conversation → analyze how user talks
       to each specific contact differently.
       ═══════════════════════════════════════════════════════ */

    // Group messages by conversation_id
    const byConversation: Record<string, string[]> = {};
    for (const msg of userMessages) {
      const cid = msg.conversation_id;
      if (!byConversation[cid]) byConversation[cid] = [];
      byConversation[cid].push(msg.content);
    }

    // Get conversation details (contact names)
    const conversationIds = Object.keys(byConversation);
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_number")
      .in("id", conversationIds);

    const convoMap: Record<string, { name: string; number: string }> = {};
    for (const c of conversations || []) {
      convoMap[c.id] = { name: c.contact_name || c.contact_number, number: c.contact_number };
    }

    // Analyze top contacts (those with 5+ messages — enough data)
    const perContact: Record<string, any> = {};
    const topConversations = Object.entries(byConversation)
      .filter(([_, msgs]) => msgs.length >= 5)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10); // Top 10 contacts max

    for (const [convoId, messages] of topConversations) {
      const contact = convoMap[convoId];
      if (!contact) continue;

      // Also fetch what the CONTACT sends (to understand conversation pairs)
      const { data: contactMsgs } = await supabase
        .from("messages")
        .select("sender, content")
        .eq("conversation_id", convoId)
        .order("created_at", { ascending: true })
        .limit(100);

      // Build conversation pairs: what they said → what user replied
      const pairs: string[] = [];
      if (contactMsgs) {
        for (let i = 0; i < contactMsgs.length - 1; i++) {
          if (contactMsgs[i].sender === "contact" && contactMsgs[i + 1]?.sender === "user") {
            pairs.push(`They: "${contactMsgs[i].content}" → You: "${contactMsgs[i + 1].content}"`);
          }
        }
      }

      const contactPrompt = `Analyze how this person talks to "${contact.name}" specifically on WhatsApp.

NOTE: Messages may be in English, Hindi, Tamil, Hinglish (Hindi+English), Tanglish (Tamil+English), or any mix. Capture the ACTUAL language used.

THEIR MESSAGES TO ${contact.name}:
${messages.slice(0, 50).join("\n")}

${pairs.length > 0 ? `CONVERSATION PAIRS (what ${contact.name} said → how this person replied):\n${pairs.slice(0, 20).join("\n")}` : ""}

Return ONLY a valid JSON (no markdown, no code blocks):
{
  "tone": "how they talk to this specific person (e.g. very casual, formal, affectionate, professional, playful)",
  "language": "EXACT language with this person (e.g. Tanglish, Hinglish, pure Tamil, pure Hindi, English, mixed). Be specific.",
  "emoji_usage": "how they use emojis with this person (heavy, moderate, rarely, never)",
  "sample_replies": ["3-5 short examples of how they'd typically reply to this person — keep in their ORIGINAL language, don't translate"],
  "relationship_hint": "inferred relationship (friend, close friend, family, colleague, boss, romantic, acquaintance)",
  "unique_patterns": "any special way they talk to THIS person that differs from their general style, including language switches"
}`;

      try {
        const contactStyle = await callGeminiJSON(contactPrompt, geminiKey);
        const contactKey = contact.name.toLowerCase().replace(/\s+/g, "_");
        perContact[contactKey] = {
          ...contactStyle,
          contact_name: contact.name,
          messages_analyzed: messages.length,
        };
        console.log(`Per-contact analysis done for ${contact.name}: ${messages.length} messages`);
      } catch (err) {
        console.error(`Per-contact analysis failed for ${contact.name}:`, err);
        // Non-fatal — continue with other contacts
      }
    }

    // Merge per-contact data into learned style
    learnedStyle.per_contact = perContact;
    learnedStyle.contacts_analyzed = Object.keys(perContact).length;

    /* ═══════════════════════════════════════════════════════
       SAVE TO DATABASE
       ═══════════════════════════════════════════════════════ */

    // Upsert — create row if it doesn't exist, update if it does
    const { error: updateErr } = await supabase
      .from("personality_profiles")
      .upsert(
        {
          user_id: user_id,
          learned_style: learnedStyle,
          last_trained_at: new Date().toISOString(),
          training_message_count: userMessages.length,
          avg_length: learnedStyle.avg_word_count || 15,
          tone: learnedStyle.tone_summary ? (learnedStyle.tone_summary.toLowerCase().includes("formal") ? "formal" : "casual") : "casual",
          emoji_usage: (learnedStyle.emoji_favorites?.length || 0) > 0,
        },
        { onConflict: "user_id" }
      );

    if (updateErr) {
      console.error("Failed to save learned style:", updateErr);
      return new Response(
        JSON.stringify({ error: "Failed to save personality data", details: String(updateErr) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "trained",
        messages_analyzed: userMessages.length,
        contacts_analyzed: Object.keys(perContact).length,
        per_contact_summary: Object.entries(perContact).map(([key, val]: [string, any]) => ({
          contact: val.contact_name,
          messages: val.messages_analyzed,
          tone: val.tone,
          relationship: val.relationship_hint,
        })),
        learned_style: learnedStyle,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Train error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
