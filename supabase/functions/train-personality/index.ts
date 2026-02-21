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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
        JSON.stringify({
          error:
            "Gemini API key not configured. Add it in Settings first.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── Get all user's outgoing messages (sender = "user") ───
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
          error:
            "Not enough messages to train. Keep chatting with BusyBot OFF — it learns from your real messages!",
          message_count: userMessages?.length || 0,
          tip: "Send at least 10-20 messages naturally while BusyBot is turned off.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── Build analysis prompt ───
    const sampleMessages = userMessages
      .map((m) => m.content)
      .join("\n");

    const prompt = `Analyze these WhatsApp messages sent by ONE person. Extract their UNIQUE communication style and personality patterns.

MESSAGES (most recent first):
${sampleMessages}

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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini error:", errText);
      return new Response(
        JSON.stringify({
          error: "Gemini API failed",
          details: errText,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiResult = await res.json();
    let rawText =
      geminiResult.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "";

    // Clean markdown code blocks if Gemini wrapped the response
    rawText = rawText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let learnedStyle;
    try {
      learnedStyle = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini response:", rawText);
      return new Response(
        JSON.stringify({
          error: "Failed to parse AI analysis",
          raw: rawText.substring(0, 500),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── Save learned style to personality profile ───
    const { error: updateErr } = await supabase
      .from("personality_profiles")
      .update({
        learned_style: learnedStyle,
        last_trained_at: new Date().toISOString(),
        training_message_count: userMessages.length,
        // Auto-update average length from analysis
        avg_length: learnedStyle.avg_word_count || 15,
      })
      .eq("user_id", user_id);

    if (updateErr) {
      console.error("Failed to save learned style:", updateErr);
      return new Response(
        JSON.stringify({
          error: "Failed to save personality data",
          details: String(updateErr),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "trained",
        messages_analyzed: userMessages.length,
        learned_style: learnedStyle,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Train error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
