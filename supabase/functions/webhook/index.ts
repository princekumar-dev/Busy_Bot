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
   Gemini-powered smart reply generator
   ────────────────────────────────────────────────────────── */

async function generateSmartReply(
  incomingMessage: string,
  contactName: string | null,
  personality: any,
  conversationHistory: any[],
  geminiKey: string,
  fallbackText: string
): Promise<string> {
  // Build readable conversation history
  const historyLines = conversationHistory.map((m) => {
    const who = m.sender === "user" ? "You" : contactName || "Contact";
    return `${who}: ${m.content}`;
  });
  const historyStr =
    historyLines.join("\n") || "(First conversation — no history yet)";

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

  const prompt = `You are acting as a REAL PERSON on WhatsApp. You MUST reply exactly as this person would — never reveal you're AI or a bot.

YOUR PERSONALITY:
- Tone: ${tone}
- Formality: ${Math.round(formality * 100)}% (0%=super casual slang, 100%=very formal)
- Typical message length: ~${avgLength} words
- Emojis: ${useEmoji ? "Use naturally like this person would, don't overdo" : "Rarely or never use emojis"}
${commonPhrases ? `- Your common phrases: ${commonPhrases}` : ""}${learnedContext}

CRITICAL RULES:
1. You ARE this person. Match their exact style — same slang, abbreviations, tone, and vibe.
2. You are currently BUSY or OCCUPIED. Naturally weave this in WITHOUT sounding like a template.
3. ABSOLUTELY DO NOT say "I am busy I will get back to you soon" — that's robotic and obvious.
4. If they greet you (hi/hello/hey), greet them back in YOUR style (use your learned greetings), then casually mention you're caught up.
5. If they ask something specific, briefly acknowledge it and say you'll reply properly later.
6. Match their language — if they write in Hindi/Hinglish/any language, reply in the same.
7. Keep it SHORT — 1-2 sentences max, like a real quick WhatsApp message.
8. Show EMOTION and personality — you're a real person with feelings, not a machine.
9. Use sentiment awareness — if they seem sad/worried, be warm and caring; if casual, be chill.
10. NEVER use formal phrases like "I acknowledge your message" or "I will respond at my earliest convenience".

RECENT CONVERSATION HISTORY WITH ${contactName || "this contact"} (learn style from "You:" messages):
${historyStr}

THEIR NEW MESSAGE: "${incomingMessage}"

Reply as this person would (natural, short, human):`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
   Main webhook handler
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

    const contactName = data.pushName || null;

    // Message type detection
    let messageType = "text";
    if (messageContent?.imageMessage) messageType = "image";
    else if (messageContent?.audioMessage) messageType = "voice";
    else if (messageContent?.videoMessage) messageType = "image";

    // Urgency detection (incoming only)
    const lowerText = text.toLowerCase();
    let urgency = "normal";
    if (!isFromMe) {
      const emergencyWords = [
        "emergency", "urgent", "asap", "help", "911",
        "sos", "critical", "🚨", "⚠️",
      ];
      const importantWords = [
        "important", "priority", "need", "please call", "call me",
      ];
      if (emergencyWords.some((w) => lowerText.includes(w)))
        urgency = "emergency";
      else if (importantWords.some((w) => lowerText.includes(w)))
        urgency = "important";
    }

    // ─── Fetch all users with settings ───
    const { data: allSettings, error: settingsError } = await supabase
      .from("settings")
      .select(
        "user_id, busy_mode, auto_reply_text, emergency_notify, gemini_api_key"
      )
      .order("updated_at", { ascending: false });

    if (settingsError || !allSettings || allSettings.length === 0) {
      console.error("No user settings found:", settingsError);
      return new Response(
        JSON.stringify({ status: "error", message: "No users" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
          console.error(
            `Failed to create convo for ${userId}:`,
            createError
          );
          continue;
        }
        conversation = newConvo;
      } else if (!isFromMe) {
        // Update unread count & timestamp for incoming messages
        await supabase
          .from("conversations")
          .update({
            contact_name: contactName || conversation.contact_name,
            unread_count: (conversation.unread_count || 0) + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }

      /* ═══════════════════════════════════════
         fromMe = true → LEARNING MODE
         Store the user's own messages so the AI
         can learn their communication style.
         ═══════════════════════════════════════ */
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

        // Keep conversation timestamp up to date
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation.id);

        results.push({
          user_id: userId,
          action: "learned",
          snippet: text.substring(0, 50),
        });
        continue; // Never auto-reply to our own messages
      }

      /* ═══════════════════════════════════════
         Incoming message → store it
         ═══════════════════════════════════════ */
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        user_id: userId,
        sender: "contact",
        content: text,
        message_type: messageType,
        urgency,
        is_auto_reply: false,
      });

      /* ═══════════════════════════════════════
         Auto-reply logic (only if busy_mode ON)
         ═══════════════════════════════════════ */
      if (!settings.busy_mode) {
        results.push({
          user_id: userId,
          action: "stored",
          busy_mode: false,
        });
        continue;
      }

      // Emergency skip
      if (urgency === "emergency" && settings.emergency_notify) {
        console.log("Emergency message — skipping auto-reply");
        results.push({ user_id: userId, action: "emergency_skip" });
        continue;
      }

      // Fetch personality profile (with learned style)
      const { data: personality } = await supabase
        .from("personality_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      // Fetch recent conversation history for context
      const { data: recentMessages } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(30);

      // ─── Generate smart reply ───
      const fallback =
        settings.auto_reply_text ||
        "Hey, caught up with something rn. Will text you back soon!";

      let replyText: string;

      if (settings.gemini_api_key) {
        // Use Gemini AI for human-like, personality-matched replies
        replyText = await generateSmartReply(
          text,
          contactName,
          personality,
          (recentMessages || []).reverse(), // chronological order
          settings.gemini_api_key,
          fallback
        );
      } else {
        // No Gemini key — use fallback text
        if (urgency === "important") {
          replyText = `${fallback} Noted that it seems important — will prioritize it.`;
        } else {
          replyText = fallback;
        }
      }

      // ─── Send reply via Evolution API ───
      const evoBase = EVO_API_URL.endsWith("/")
        ? EVO_API_URL.slice(0, -1)
        : EVO_API_URL;
      const delay = personality?.response_delay_ms || 2000;

      try {
        const sendRes = await fetch(
          `${evoBase}/message/sendText/${EVO_BOT_NAME}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: EVO_API_KEY,
            },
            body: JSON.stringify({
              number: contactNumber,
              text: replyText,
              delay,
            }),
          }
        );

        if (sendRes.ok) {
          // Store the bot reply
          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            user_id: userId,
            sender: "bot",
            content: replyText,
            message_type: "text",
            urgency: "normal",
            is_auto_reply: true,
          });

          console.log(
            `Smart reply sent to ${contactNumber}: "${replyText}"`
          );
          results.push({
            user_id: userId,
            action: "smart_reply",
            reply: replyText.substring(0, 80),
          });
        } else {
          const errText = await sendRes.text();
          console.error("Send failed:", sendRes.status, errText);
          results.push({
            user_id: userId,
            action: "send_failed",
            error: errText.substring(0, 100),
          });
        }
      } catch (sendErr) {
        console.error("Send error:", sendErr);
        results.push({ user_id: userId, action: "send_error" });
      }
    } // end for-loop

    return new Response(
      JSON.stringify({
        status: "ok",
        urgency,
        fromMe: isFromMe,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
