// deno-lint-ignore-file
// @ts-nocheck - Runs on Supabase Edge Functions (Deno runtime)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_AIRFORCE_API_KEY = Deno.env.get("API_AIRFORCE_API_KEY") || "sk-air-JT9fB48xGX17FCKCUgVu6OlId0dmtzxlB6ED10zutDDzc5ZfweuZLKYTMy7x5msP";
const API_AIRFORCE_PROVIDER_NAME = Deno.env.get("API_AIRFORCE_PROVIDER_NAME") || "Claude";
const API_AIRFORCE_MODEL = Deno.env.get("API_AIRFORCE_MODEL") || "llama-4-scout";
const API_AIRFORCE_BASE_URL = Deno.env.get("API_AIRFORCE_BASE_URL") || "https://api.airforce/v1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = normalizeText(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (limit && result.length >= limit) break;
  }

  return result;
}

function countWords(text: string): number {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function detectLanguageStyle(text: string): string {
  const t = text.toLowerCase();
  const tamilChars = /[\u0B80-\u0BFF]/;
  const hindiChars = /[\u0900-\u097F]/;
  const tamilRomanWords = /\b(da|di|dei|machi|machan|nanba|enna|enga|eppo|epdi|sollu|seri|romba|illa|iruku|konjam|vaanga|nandri)\b/g;
  const hindiRomanWords = /\b(kya|kab|kaise|kahan|bhai|yaar|acha|theek|haan|nahi|batao|bhejo|dekho|arey|chalo|abhi|jaldi|matlab)\b/g;

  if (tamilChars.test(t)) return "tamil";
  if (hindiChars.test(t)) return "hindi";

  const tamilHits = (t.match(tamilRomanWords) || []).length;
  const hindiHits = (t.match(hindiRomanWords) || []).length;

  if (tamilHits > 0 && hindiHits > 0) return "mixed";
  if (tamilHits >= 2) return "tanglish";
  if (hindiHits >= 2) return "hinglish";
  if (tamilHits === 1) return "tanglish_light";
  if (hindiHits === 1) return "hinglish_light";
  return "english";
}

function topMatches(messages: string[], pattern: RegExp, limit: number = 5): string[] {
  const matches: string[] = [];

  for (const message of messages) {
    const found = message.match(pattern);
    if (!found) continue;
    matches.push(...found.map((value) => normalizeText(value)));
  }

  return uniqueStrings(matches, limit);
}

function extractConversationEndings(messages: string[], limit: number = 8): string[] {
  return uniqueStrings(
    messages
      .map((message) => normalizeText(message))
      .filter((message) => /^(hmm+|hm+|mm+|ok+|okay+|kk|k|seri|sari|theek|acha|accha|haan|ha|bye|ok\s?bye|tc|take care|later|gn|good\s?night)\s*[.!?]*$/i.test(message)),
    limit
  );
}

function extractTopicMemories(messages: string[], limit: number = 10): string[] {
  const topicWords = /\b(project|progress|prototype|demo|feature|bug|task|deadline|client|lead|manager|status|update|work|deployment|deploy|release|issue|fix|build|completed|pending|stuck|blocked|testing)\b/i;
  return uniqueStrings(
    messages
      .map((message) => normalizeText(message))
      .filter((message) => topicWords.test(message))
      .map((message) => message.length > 160 ? `${message.substring(0, 160).trim()}...` : message),
    limit
  );
}

function summarizeTone(messages: string[]): string {
  const joined = messages.join(" ").toLowerCase();
  const formalHits = (joined.match(/\b(please|kindly|regards|thank you|sir|ma'am|noted|will do)\b/g) || []).length;
  const playfulHits = (joined.match(/\b(lol|haha|hehe|bro|yaar|da|dei|machi|semma|mass)\b/g) || []).length;
  const warmHits = (joined.match(/\b(miss|love|take care|jaan|chellam|kutty|sorry|thanks)\b/g) || []).length;

  if (formalHits > playfulHits + warmHits) return "polite and fairly formal";
  if (warmHits > formalHits && warmHits >= playfulHits) return "warm, caring, and personal";
  if (playfulHits > formalHits) return "casual, playful, and chatty";
  return "casual and direct";
}

function describeLanguageMix(languageCounts: Record<string, number>) {
  const entries = Object.entries(languageCounts).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    return {
      detected: ["english"],
      primary: "english",
      mix: "Mostly English",
      codeSwitching: "Mostly single-language messages",
    };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const detected = entries.map(([language]) => language);
  const primary = entries[0][0];
  const mixedCount = (languageCounts.mixed || 0) + (languageCounts.tanglish || 0) + (languageCounts.hinglish || 0);

  let mix = `Mostly ${primary}`;
  if (mixedCount > 0) {
    mix = `${primary} with regular code-switching`;
  } else if (entries.length > 1) {
    mix = `Mostly ${primary} with some ${entries[1][0]}`;
  }

  const codeSwitching = mixedCount > 0
    ? "Frequently switches between languages in the same conversation"
    : entries.length > 1
      ? "Mostly changes language between messages depending on the contact"
      : "Mostly single-language messages";

  return { detected, primary, mix, codeSwitching };
}

function buildHeuristicGlobalStyle(userMessages: Array<{ content: string }>) {
  const texts = userMessages.map((message) => normalizeText(message.content)).filter(Boolean);
  const joined = texts.join(" ");
  const avgWordCount = texts.length > 0
    ? Math.max(1, Math.round(texts.reduce((sum, text) => sum + countWords(text), 0) / texts.length))
    : 8;

  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const emojiCounts: Record<string, number> = {};
  for (const emoji of joined.match(emojiRegex) || []) {
    emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
  }

  const languageCounts: Record<string, number> = {};
  for (const text of texts) {
    const language = detectLanguageStyle(text);
    languageCounts[language] = (languageCounts[language] || 0) + 1;
  }
  const languageSummary = describeLanguageMix(languageCounts);

  const shortReplies = texts.filter((text) => countWords(text) <= 8);
  const shortReplyCounts: Record<string, number> = {};
  for (const text of shortReplies) {
    const key = text.toLowerCase();
    shortReplyCounts[key] = (shortReplyCounts[key] || 0) + 1;
  }

  const signaturePhrases = uniqueStrings(
    Object.entries(shortReplyCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([text]) => text),
    6
  );

  const abbreviationPatterns = [];
  if (/\bu\b/i.test(joined)) abbreviationPatterns.push('"u" for "you"');
  if (/\burn\b/i.test(joined)) abbreviationPatterns.push('"rn" for "right now"');
  if (/\bmsg\b/i.test(joined)) abbreviationPatterns.push('"msg" for "message"');
  if (/\bpls\b|\bplz\b/i.test(joined)) abbreviationPatterns.push('"pls/plz" for "please"');
  if (/\bthx\b|\bty\b/i.test(joined)) abbreviationPatterns.push('short thank-you forms');

  return {
    greetings: topMatches(texts, /\b(hi|hey+|hello|yo|oyee?|vanakkam|namaste|gm|gn|bro|bhai|machi|da|dei)\b/gi),
    affirmatives: topMatches(texts, /\b(haan|ha|yes|yep|yeah|sure|okay|ok|seri|serida|theek|done|cool)\b/gi),
    negatives: topMatches(texts, /\b(no|nah|nahi|illa|vendam|can't|cannot|later)\b/gi),
    fillers: topMatches(texts, /\b(like|yaar|bro|da|dei|actually|basically|matlab|acha|seri)\b/gi),
    closings: topMatches(texts, /\b(bye|tc|take care|good night|gn|ttyl|later|seri da|poi varen|see you)\b/gi),
    emoji_favorites: Object.entries(emojiCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([emoji]) => emoji),
    avg_word_count: avgWordCount,
    detected_languages: languageSummary.detected,
    primary_language: languageSummary.primary,
    language_mix: languageSummary.mix,
    tone_summary: summarizeTone(texts),
    signature_phrases: signaturePhrases,
    conversation_endings: extractConversationEndings(texts),
    topic_memories: extractTopicMemories(texts),
    abbreviation_style: abbreviationPatterns.join(", "),
    code_switching_pattern: languageSummary.codeSwitching,
    analysis_mode: "heuristic",
  };
}

function inferHeuristicRelationship(contactName: string, messages: string[]): string {
  const name = (contactName || "").toLowerCase();
  if (/\b(mom|mum|amma|dad|appa|bro|sis|anna|akka|thambi|family)\b/i.test(name)) return "family";
  if (/\b(sir|madam|boss|manager|prof|teacher|doctor)\b/i.test(name)) return "professional";

  const joined = messages.join(" ").toLowerCase();
  const affectionate = (joined.match(/\b(love|miss|jaan|chellam|kutty|take care)\b/g) || []).length;
  const formal = (joined.match(/\b(please|kindly|sir|ma'am|regards|noted)\b/g) || []).length;
  const casual = (joined.match(/\b(bro|yaar|da|dei|lol|haha|machi|scene)\b/g) || []).length;

  if (affectionate >= 2) return "close friend";
  if (formal > casual) return "colleague";
  if (casual >= 2) return "friend";
  return "acquaintance";
}

function buildHeuristicContactStyle(contactName: string, messages: string[]) {
  const cleaned = messages.map((message) => normalizeText(message)).filter(Boolean);
  const joined = cleaned.join(" ");
  const emojiCount = (joined.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;

  const languageCounts: Record<string, number> = {};
  for (const message of cleaned) {
    const language = detectLanguageStyle(message);
    languageCounts[language] = (languageCounts[language] || 0) + 1;
  }
  const languageSummary = describeLanguageMix(languageCounts);

  const emojiUsage = emojiCount >= cleaned.length
    ? "heavy"
    : emojiCount >= Math.max(1, Math.round(cleaned.length / 3))
      ? "moderate"
      : emojiCount > 0
        ? "rarely"
        : "never";

  const uniquePatterns = uniqueStrings([
    ...topMatches(cleaned, /\b(da|dei|bro|bhai|machi|yaar|please|kindly|take care|miss you)\b/gi, 4),
    ...topMatches(cleaned, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, 2),
  ], 5).join(", ");

  return {
    tone: summarizeTone(cleaned),
    language: languageSummary.mix,
    emoji_usage: emojiUsage,
    sample_replies: uniqueStrings([...cleaned].reverse(), 5),
    closing_replies: extractConversationEndings(cleaned, 5),
    topic_memory: extractTopicMemories(cleaned, 8),
    relationship_hint: inferHeuristicRelationship(contactName, cleaned),
    unique_patterns: uniquePatterns || "No strong contact-specific pattern detected yet",
    analysis_mode: "heuristic",
  };
}

function buildChatCompletionsEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (normalizedBase.endsWith("/chat/completions")) return normalizedBase;
  if (normalizedBase.endsWith("/v1")) return `${normalizedBase}/chat/completions`;
  return `${normalizedBase}/v1/chat/completions`;
}

function buildAIConfig(settings: any) {
  const apiKey = typeof settings?.ai_api_key === "string" ? settings.ai_api_key.trim() : "";
  const model = typeof settings?.ai_model === "string" ? settings.ai_model.trim() : "";
  const baseUrl = typeof settings?.ai_base_url === "string" ? settings.ai_base_url.trim() : "";
  const providerName = typeof settings?.ai_provider_name === "string" && settings.ai_provider_name.trim()
    ? settings.ai_provider_name.trim()
    : API_AIRFORCE_PROVIDER_NAME;

  const resolvedApiKey = apiKey || API_AIRFORCE_API_KEY;
  const resolvedModel = ["google/gemma-4-31b-it:free", "tencent/hy3-preview:free", "gpt-4o-mini", "claude-opus-4-6"].includes(model) ? API_AIRFORCE_MODEL : model || API_AIRFORCE_MODEL;
  const resolvedBaseUrl = baseUrl || API_AIRFORCE_BASE_URL;
  if (!resolvedApiKey || !resolvedModel) return null;

  return {
    provider: "api_airforce",
    providerName,
    apiKey: resolvedApiKey,
    model: resolvedModel,
    endpoint: buildChatCompletionsEndpoint(resolvedBaseUrl),
    headers: {
      Authorization: `Bearer ${resolvedApiKey}`,
      "Content-Type": "application/json",
    },
  };
}

async function callProviderText(prompt: string, aiConfig: any, retries: number = 2): Promise<string> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const waitMs = attempt === 1 ? 1500 : 3000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(aiConfig.endpoint, {
        method: "POST",
        headers: aiConfig.headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          temperature: 0.3,
          reasoning: { exclude: true },
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        lastErr = new Error(`${aiConfig.providerName} API error ${res.status}: ${errText.substring(0, 300)}`);
        if (attempt < retries && (res.status === 429 || res.status >= 500)) continue;
        throw lastErr;
      }

      const result = await res.json();
      const content = result?.choices?.[0]?.message?.content?.trim() || "";
      if (!content) {
        lastErr = new Error(`${aiConfig.providerName} returned empty content`);
        if (attempt < retries) continue;
        throw lastErr;
      }

      return content;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt >= retries) throw lastErr;
    }
  }

  throw lastErr || new Error("Unknown provider error");
}

async function callProviderJSON(prompt: string, aiConfig: any): Promise<any> {
  const rawText = await callProviderText(prompt, aiConfig);
  const cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(
        jsonMatch[0]
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
      );
    }
    throw new Error(`Provider JSON parse failed: ${String(parseErr)}`);
  }
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

    const { data: settings } = await supabase
      .from("settings")
      .select("ai_provider, ai_api_key, ai_model, ai_base_url, ai_provider_name")
      .eq("user_id", user_id)
      .single();

    const aiConfig = buildAIConfig(settings);
    const aiAvailable = !!aiConfig;

    const { data: rawMessages, error: msgErr } = await supabase
      .from("messages")
      .select("content, created_at, conversation_id")
      .eq("user_id", user_id)
      .eq("sender", "user")
      .order("created_at", { ascending: false })
      .limit(200);

    const userMessages = (rawMessages || []).filter(
      (message) =>
        message.content &&
        message.content !== "[media message]" &&
        normalizeText(message.content).length > 0
    );

    if (msgErr || userMessages.length < 3) {
      return new Response(
        JSON.stringify({
          error: "Not enough messages to train. Keep chatting with BusyBot OFF so it can learn from your real replies.",
          message_count: userMessages.length,
          tip: "Send at least 10 to 20 natural messages first.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allMessagesText = userMessages
      .map((message) =>
        message.content.length > 200 ? `${message.content.substring(0, 200)}...` : message.content
      )
      .join("\n");

    const globalPrompt = `Analyze these WhatsApp messages sent by ONE person. Extract their UNIQUE communication style and personality patterns.

IMPORTANT: This person may use MULTIPLE LANGUAGES including English, Hindi, Tamil, Hinglish, Tanglish, and code-switching.
Also extract:
- "conversation_endings": exact short replies they use to close or acknowledge chats, like hmm/ok/bye/seri.
- "topic_memories": factual project/work/status updates they have mentioned. Keep these short and factual; do not invent.

MESSAGES (most recent first):
${allMessagesText}

Return ONLY valid JSON with:
{
  "greetings": [],
  "affirmatives": [],
  "negatives": [],
  "fillers": [],
  "closings": [],
  "emoji_favorites": [],
  "avg_word_count": 8,
  "detected_languages": [],
  "primary_language": "",
  "language_mix": "",
  "tone_summary": "",
  "signature_phrases": [],
  "conversation_endings": [],
  "topic_memories": [],
  "abbreviation_style": "",
  "code_switching_pattern": ""
}`;

    let learnedStyle;
    try {
      learnedStyle = aiAvailable
        ? await callProviderJSON(globalPrompt, aiConfig)
        : buildHeuristicGlobalStyle(userMessages);
    } catch (err) {
      console.error("Global analysis failed:", err);
      learnedStyle = {
        ...buildHeuristicGlobalStyle(userMessages),
        _fallback: true,
        _fallback_reason: String(err).substring(0, 200),
      };
    }
    const heuristicStyle = buildHeuristicGlobalStyle(userMessages);
    learnedStyle.conversation_endings = Array.isArray(learnedStyle.conversation_endings) && learnedStyle.conversation_endings.length
      ? learnedStyle.conversation_endings
      : heuristicStyle.conversation_endings;
    learnedStyle.topic_memories = Array.isArray(learnedStyle.topic_memories) && learnedStyle.topic_memories.length
      ? learnedStyle.topic_memories
      : heuristicStyle.topic_memories;

    const byConversation: Record<string, string[]> = {};
    for (const message of userMessages) {
      const conversationId = message.conversation_id;
      if (!byConversation[conversationId]) byConversation[conversationId] = [];
      byConversation[conversationId].push(message.content);
    }

    const conversationIds = Object.keys(byConversation);
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_number")
      .in("id", conversationIds);

    const conversationMap: Record<string, { name: string; number: string }> = {};
    for (const conversation of conversations || []) {
      conversationMap[conversation.id] = {
        name: conversation.contact_name || conversation.contact_number,
        number: conversation.contact_number,
      };
    }

    const perContact: Record<string, any> = {};
    const topConversations = Object.entries(byConversation)
      .filter(([, messages]) => messages.length >= 5)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    for (const [conversationId, messages] of topConversations) {
      const contact = conversationMap[conversationId];
      if (!contact) continue;

      const { data: contactMessages } = await supabase
        .from("messages")
        .select("sender, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(100);

      const pairs: string[] = [];
      const allContactContext: string[] = [];
      if (contactMessages) {
        for (const message of contactMessages) {
          if (message.content && message.content !== "[media message]") {
            allContactContext.push(`${message.sender === "user" ? "You" : "They"}: ${message.content}`);
          }
        }

        for (let i = 0; i < contactMessages.length - 1; i++) {
          if (contactMessages[i].sender === "contact" && contactMessages[i + 1]?.sender === "user") {
            pairs.push(`They: "${contactMessages[i].content}" -> You: "${contactMessages[i + 1].content}"`);
          }
        }
      }

      let contactStyle;
      if (aiAvailable) {
        const contactPrompt = `Analyze how this person talks to "${contact.name}" specifically on WhatsApp.

THEIR MESSAGES TO ${contact.name}:
${messages.slice(0, 50).join("\n")}

${pairs.length > 0 ? `CONVERSATION PAIRS:\n${pairs.slice(0, 20).join("\n")}` : ""}

Return ONLY JSON. Include:
- "closing_replies": exact short ways this user ends chats with this contact.
- "topic_memory": factual project/work/status context discussed with this contact, especially progress, blockers, demos, deadlines, and current state.
{
  "tone": "",
  "language": "",
  "emoji_usage": "",
  "sample_replies": [],
  "closing_replies": [],
  "topic_memory": [],
  "relationship_hint": "",
  "unique_patterns": ""
}`;

        try {
          contactStyle = await callProviderJSON(contactPrompt, aiConfig);
        } catch (err) {
          console.error(`Per-contact provider analysis failed for ${contact.name}:`, err);
          contactStyle = {
            ...buildHeuristicContactStyle(contact.name, messages),
            _fallback: true,
            _fallback_reason: String(err).substring(0, 200),
          };
        }
      } else {
        contactStyle = buildHeuristicContactStyle(contact.name, messages);
      }
      const heuristicContactStyle = buildHeuristicContactStyle(contact.name, messages);
      contactStyle.closing_replies = Array.isArray(contactStyle.closing_replies) && contactStyle.closing_replies.length
        ? contactStyle.closing_replies
        : heuristicContactStyle.closing_replies;
      const contextTopicMemory = extractTopicMemories(allContactContext, 8);
      contactStyle.topic_memory = Array.isArray(contactStyle.topic_memory) && contactStyle.topic_memory.length
        ? contactStyle.topic_memory
        : (contextTopicMemory.length ? contextTopicMemory : heuristicContactStyle.topic_memory);

      const contactKey = contact.name.toLowerCase().replace(/\s+/g, "_");
      perContact[contactKey] = {
        ...contactStyle,
        contact_name: contact.name,
        messages_analyzed: messages.length,
      };
    }

    learnedStyle.per_contact = perContact;
    learnedStyle.contacts_analyzed = Object.keys(perContact).length;
    learnedStyle.analysis_mode = aiAvailable && !learnedStyle._fallback ? "provider" : "heuristic";

    const toneSummary = typeof learnedStyle.tone_summary === "string" ? learnedStyle.tone_summary.toLowerCase() : "";
    const signaturePhrases = Array.isArray(learnedStyle.signature_phrases) ? learnedStyle.signature_phrases : [];
    const emojiFavorites = Array.isArray(learnedStyle.emoji_favorites) ? learnedStyle.emoji_favorites : [];

    const { error: updateErr } = await supabase
      .from("personality_profiles")
      .upsert(
        {
          user_id,
          learned_style: learnedStyle,
          last_trained_at: new Date().toISOString(),
          training_message_count: userMessages.length,
          avg_length: learnedStyle.avg_word_count || 15,
          tone: toneSummary.includes("formal") ? "formal" : "casual",
          emoji_usage: emojiFavorites.length > 0,
          common_phrases: signaturePhrases.slice(0, 5),
          formality_score: toneSummary.includes("formal") ? 0.75 : toneSummary.includes("polite") ? 0.65 : 0.35,
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
        training_mode: learnedStyle.analysis_mode,
        ai_available: aiAvailable,
        messages_analyzed: userMessages.length,
        contacts_analyzed: Object.keys(perContact).length,
        per_contact_summary: Object.values(perContact).map((value: any) => ({
          contact: value.contact_name,
          messages: value.messages_analyzed,
          tone: value.tone,
          relationship: value.relationship_hint,
          analysis_mode: value.analysis_mode || learnedStyle.analysis_mode,
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
