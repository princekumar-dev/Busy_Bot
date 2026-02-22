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

async function callGeminiJSON(prompt: string, geminiKey: string): Promise<any> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const result = await res.json();
  let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  rawText = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  return JSON.parse(rawText);
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
    const { data: userMessages, error: msgErr } = await supabase
      .from("messages")
      .select("content, created_at, conversation_id")
      .eq("user_id", user_id)
      .eq("sender", "user")
      .order("created_at", { ascending: false })
      .limit(500);

    if (msgErr || !userMessages || userMessages.length < 3) {
      return new Response(
        JSON.stringify({
          error: "Not enough messages to train. Keep chatting with BusyBot OFF — it learns from your real messages!",
          message_count: userMessages?.length || 0,
          tip: "Send at least 10-20 messages naturally while BusyBot is turned off.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ═══════════════════════════════════════════════════════
       PHASE 1: GLOBAL STYLE ANALYSIS
       Analyze all messages together for overall personality
       ═══════════════════════════════════════════════════════ */

    const allMessagesText = userMessages.map((m) => m.content).join("\n");

    const globalPrompt = `Analyze these WhatsApp messages sent by ONE person. Extract their UNIQUE communication style and personality patterns.

MESSAGES (most recent first):
${allMessagesText}

Analyze carefully and return ONLY a valid JSON object (no markdown, no code blocks, no explanation) with these fields:
{
  "greetings": ["list of greetings they actually use, e.g. hey, oyee, yo, hi bro"],
  "affirmatives": ["how they say yes/okay, e.g. hmm, mm, yeah, acha, haan, ok"],
  "negatives": ["how they say no, e.g. nah, nahi, nope, na"],
  "fillers": ["filler words/sounds they use, e.g. like, basically, actually, arrey"],
  "closings": ["how they end conversations, e.g. bye, chal, ok bye, ttyl"],
  "emoji_favorites": ["their most used emojis"],
  "avg_word_count": 8,
  "language_mix": "description of language patterns e.g. 'English with Hindi slang'",
  "tone_summary": "brief description of their communication tone and energy",
  "signature_phrases": ["unique phrases they frequently use"],
  "abbreviation_style": "how they shorten words, e.g. 'u' for 'you', 'msg' for 'message'"
}

IMPORTANT: Base this ONLY on the actual messages above. Don't invent patterns that aren't there. If a field has no matches, use an empty array [].`;

    let learnedStyle;
    try {
      learnedStyle = await callGeminiJSON(globalPrompt, geminiKey);
    } catch (err) {
      console.error("Global analysis failed:", err);
      return new Response(
        JSON.stringify({ error: "Failed to analyze global style", details: String(err) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

THEIR MESSAGES TO ${contact.name}:
${messages.slice(0, 50).join("\n")}

${pairs.length > 0 ? `CONVERSATION PAIRS (what ${contact.name} said → how this person replied):\n${pairs.slice(0, 20).join("\n")}` : ""}

Return ONLY a valid JSON (no markdown, no code blocks):
{
  "tone": "how they talk to this specific person (e.g. very casual, formal, affectionate, professional, playful)",
  "language": "language they use with this person (e.g. pure English, Hinglish, Hindi, mix)",
  "emoji_usage": "how they use emojis with this person (heavy, moderate, rarely, never)",
  "sample_replies": ["3-5 short examples of how they'd typically reply to this person"],
  "relationship_hint": "inferred relationship (friend, close friend, family, colleague, boss, romantic, acquaintance)",
  "unique_patterns": "any special way they talk to THIS person that differs from their general style"
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

    const { error: updateErr } = await supabase
      .from("personality_profiles")
      .update({
        learned_style: learnedStyle,
        last_trained_at: new Date().toISOString(),
        training_message_count: userMessages.length,
        avg_length: learnedStyle.avg_word_count || 15,
      })
      .eq("user_id", user_id);

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
