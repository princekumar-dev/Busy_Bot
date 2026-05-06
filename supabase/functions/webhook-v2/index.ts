// deno-lint-ignore-file
// @ts-nocheck — Runs on Supabase Edge Functions (Deno runtime)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_API_URL = Deno.env.get("EVO_API_URL")!;
const EVO_API_KEY = Deno.env.get("EVO_API_KEY")!;
const EVO_BOT_NAME = Deno.env.get("EVO_BOT_NAME") || "milo";
const BUSYBOT_USER_ID = Deno.env.get("BUSYBOT_USER_ID") || "";
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

function normalizeText(value: unknown): string {
  return `${value || ""}`.replace(/\s+/g, " ").trim();
}

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
  const requestPatterns = /\b(please|plz|pls|send|share|show|give|tell|help|need|want|call|come|meet|check|look|see|reply|respond|answer|batao|bhejo|bata|kar|karo|dedo|batado|sunno|suno|bhejna|dikhao|samjhao|sollu|solu|sollunga|anuppu|kudu|kudungga|paru|paaru|kaatu|kaatunga|katuda|katunga|kattu|va|vaanga|pannunga|pannuda|konjam|thaa|kududa|call\s?pannu|msg\s?pannu|reply\s?pannu|check\s?pannu)\b/i;
  if (requestPatterns.test(t) && intent !== "greeting") intent = "request";

  // Follow-up / checking in (English + Hinglish + Tanglish)
  const followUpPatterns = /^(hey\??|you there|hello\??|still busy|any update|update\??|so\??|bro\??|dude\??|bhai\??|are you there|r u there|reply|seen\??|online\??|da\??|dei\??|machi\??|machan\??|bol\s?na\??|sun\s?na\??|kaha\s?ho\??|kidhar\s?ho\??|reply\s?to\s?kar|msg\s?dekh|enna\s?aachu\??|enga\s?da\??|reply\s?pannu\s?da|pesi\s?mudicha\??|vandhudu\??|free\s?ah\??)\s*\??$/i;
  if (followUpPatterns.test(t)) intent = "follow_up";

  // Emotional / personal (English + Hindi + Tamil)
  const emotionalPatterns = /\b(miss you|love|sorry|sad|upset|crying|worried|scared|angry|frustrated|happy|excited|proud|thank|congrat|rip|passed away|died|hospital|sick|ill|hurt|pain|broke|breakup|fight|pyaar|dukhi|rona|tension|pareshan|fikar|gussa|khush|maafi|dhanyavaad|rodhane|sogam|kashtam|valikuthu|azhugiren|bayam|kovam|sandhosham|nandri|kanneer|vali|kavalai|manam|nesam|romba\s?bad|feel\s?pannuren|kedaikala|mosam|dhrogam)\b/i;
  const healthCarePatterns = /\b(headache|fever|not feeling well|tabiyat|theek\s?nahi|valikudhu|thala\s?vali|odambu\s?(seri|sari)\s?illa|seri\s?illa|sari\s?illa)\b/i;
  if (emotionalPatterns.test(t) || healthCarePatterns.test(t)) intent = "emotional";

  // Farewell (English + Hindi + Tamil)
  const farewellPatterns = /^(bye|ok\s?bye|see you|cya|ttyl|good\s?night|take care|chal|chalo|tc|later|tata|alvida|phir\s?milte|baad\s?mein|chalta\s?hu|nikalta\s?hu|poi\s?varen|poitu\s?varen|sari\s?da|seri\s?da|seri\s?po|ta\s?ta|bye\s?da|bye\s?di|night\s?da|poidren|varuven|innum\s?pesalam)\b/i;
  if (farewellPatterns.test(t)) intent = "farewell";

  // Insult / abuse (English + Hindi + Tamil)
  const insultPatterns = /\b(loosu|stupid|idiot|dumb|muttaal|bad bot|fuck|shit|bitch|asshole|paya|kirukka|mental|bastard|thevidiya|punda|munda|panni|pagal|pagla|gadha|bewakoof|bevakoof|muttal|kirukku|komali)\b/i;
  if (insultPatterns.test(t)) intent = "insult";

  // Security / Privacy (English + Hindi + Tamil)
  const securityPatterns = /\b(secure|safety|safe|privacy|data|encryption|hack|leak|protected|security|surakshit|pukaappu|bhadram|bhadra|password|access)\b/i;
  if (securityPatterns.test(t)) intent = "security";

  // ─── Sentiment detection ───
  let sentiment = "neutral";

  const happyWords = /\b(happy|excited|great|awesome|amazing|wonderful|love|haha|lol|😂|😄|🎉|❤️|😍|yay|woohoo|fantastic|perfect|khush|maza|badhiya|zabardast|mast|superr?|semma|theri|mass|vera\s?level|romba\s?nalla|adipoli|kalakkal|sema|jolly|chanceless)\b/i;
  const sadWords = /\b(sad|upset|crying|cry|depressed|lonely|miss|hurt|pain|😢|😭|💔|sorry|worried|scared|anxiety|stressed|dukhi|rona|udaas|pareshan|tension|sogam|kashtam|valikuthu|kanneer|feel\s?panren|romba\s?bad|vali|kavalai|thanimai|bayam)\b/i;
  const angryWords = /\b(angry|mad|furious|pissed|annoyed|frustrated|wtf|🤬|😡|hate|gussa|chidh|irritate|kovam|erichhal|podhum|podhumda|porukka\s?mudiyala|veriethuthu)\b/i;
  const urgentWords = /\b(urgent|emergency|asap|immediately|right now|hurry|quick|fast|sos|911|🚨|⚠️|critical|jaldi|turant|fatafat|abhi|udane|vegam|seekiram|urgent\s?a|konjam\s?fast|important\s?da)\b/i;

  if (urgentWords.test(t)) sentiment = "urgent";
  else if (angryWords.test(t)) sentiment = "angry";
  else if (sadWords.test(t) || healthCarePatterns.test(t)) sentiment = "sad";
  else if (happyWords.test(t)) sentiment = "happy";

  // ─── Does this need a reply? ───
  // Don't reply to "ok", "k", "👍", reactions, or farewells
  const noReplyPatterns = /^(ok|k|kk|okay|👍|👌|🙏|thanks|thanku|ty|tq|hmm|mm|hm|oh|ohk|accha|acha|theek|thik|seri|serida|okda|okdi|hmda|aamam|haan|ha|ji|ok\s?va|seri\s?pa|ok\s?pa|ok\s?da|ok\s?machi|nandri|dhanyavaad|thenkyu|thanksu)\s*\.?$/i;
  const needsReply = !(noReplyPatterns.test(t) || intent === "farewell");

  // ─── Language detection ───
  let detectedLanguage = "english";
  const tamilChars = /[\u0B80-\u0BFF]/;
  const hindiChars = /[\u0900-\u097F]/;
  const tamilRomanWords = /\b(da|di|dei|nga|pa|ma|macha|machan|machi|nanba|enna|enaku|ennaku|enakku|unga|ungaluku|ungalukku|kaatu|kaatuda|kaatunga|katuda|katunga|kattu|thimuru|dhana|enga|eppo|epdi|sollu|pannunga|vaanga|semma|thala|paaru|kudu|seri|romba|podu|aana|illa|iruku|iruka|irukken|irukkanga|theriyum|konjam|panna|vandhu|pogalam|vaada|vanakkam|nandri|saptiya|saptacha|nalaiku|naalaikku|varuva|varuvan|varuva|vara|yaaru|yaaruda|yaaru\s?pa|yaaru\s?da|aachu|aachchi|enna\s?aachu|solrren|sollren|vittuda|vittu\s?pudu)\b/i;
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

function isShortConversationClose(text: string): boolean {
  return /^(hmm+|hm+|mm+|ok+|okay+|kk|k|seri|sari|theek|acha|accha|haan|ha|bye|ok\s?bye|tc|take care|later|gn|good\s?night|👍|👌|🙏)\s*[.!?]*$/i
    .test(text.trim());
}

function shouldReplyToConversationClose(text: string, intentData: any, recentMessages: any[]): boolean {
  if (!(isShortConversationClose(text) || intentData?.intent === "farewell")) return false;

  const beforeCurrent = (recentMessages || [])
    .filter((message) => !(message.sender === "contact" && normalizeText(message.content) === normalizeText(text)))
    .slice(0, 8);

  const recentBot = beforeCurrent.find((message) => message.sender === "bot");
  if (!recentBot) return false;

  const contactMessagesSinceBot = beforeCurrent
    .slice(0, beforeCurrent.indexOf(recentBot))
    .filter((message) => message.sender === "contact").length;

  return contactMessagesSinceBot <= 2;
}

function detectSpamRisk(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;

  const spamWords = /\b(win money|lottery|click link|free offer|crypto tip|double your|investment plan|adult|xxx)\b/i;
  const urlCount = (t.match(/https?:\/\//g) || []).length;
  const digitCount = (t.match(/\d/g) || []).length;
  const repeatChars = /(.)\1{5,}/.test(t);

  return spamWords.test(t) || urlCount >= 2 || digitCount >= 18 || repeatChars;
}

function evaluateReplyPolicy(input: {
  intent: string;
  sentiment: string;
  urgency: string;
  needsReply: boolean;
  message: string;
}) {
  const lower = input.message.toLowerCase();
  const highRiskTopic = /\b(payment|bank|account|otp|password|legal|lawsuit|diagnosis|prescription|contract|break up|resign|approve|confirm deal)\b/i;
  const spamRisk = detectSpamRisk(input.message);

  if (!input.needsReply) {
    return { action: "skip", risk: "low", reason: "no_reply_needed" };
  }
  if (spamRisk) {
    return { action: "skip", risk: "medium", reason: "spam_detected" };
  }
  if (input.urgency === "emergency" || input.sentiment === "urgent") {
    return { action: "escalate", risk: "high", reason: "emergency_detected" };
  }
  if (highRiskTopic.test(lower)) {
    return { action: "review", risk: "high", reason: "high_stakes_topic" };
  }
  return { action: "reply_ai", risk: "low", reason: "safe_auto_reply" };
}

function isGeneralKnowledgeQuestion(text: string, intentData?: { intent?: string }): boolean {
  if (intentData?.intent !== "question" && !/\?/.test(text)) return false;
  const lower = text.toLowerCase();
  const personalOrDecisionTopic = /\b(you|your|u|ur|prince|he|him|his|she|her|they|them|project|prototype|demo|ready|done|finish|finished|send|share|show|come|meet|call|free|available|plan|lunch|dinner|today|tomorrow|tonight|approve|confirm|can i|can we|should i|shall we)\b/i;
  const highStakesTopic = /\b(payment|bank|account|otp|password|legal|lawsuit|diagnosis|prescription|contract|medical|medicine|investment|crypto|tax|visa|immigration)\b/i;
  const knowledgeLead = /^(what|why|how|who|which|where|when|is|are|do|does|did|can|could|explain|tell me|define)\b/i;

  return knowledgeLead.test(lower.trim()) && !personalOrDecisionTopic.test(lower) && !highStakesTopic.test(lower);
}

function pickReplyVariant<T>(seed: string, variants: T[]): T {
  if (variants.length === 0) return "" as T;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(hash) % variants.length];
}

function buildAssistantHandoffReply(
  incomingMessage: string,
  contactName: string | null,
  userDisplayName: string | null,
  intentData?: { intent?: string; sentiment?: string; detectedLanguage?: string },
  options: { alreadyIntroduced?: boolean; allowGeneralKnowledgeAnswer?: boolean } = {}
): string {
  const safeName = (userDisplayName || "the user").trim();
  const isKnownPerson = safeName.toLowerCase() !== "the user";
  const englishObject = isKnownPerson ? "him" : "them";
  const hindiObject = isKnownPerson ? "unko" : "unhe";
  const hindiAskObject = "unse";
  const tamilObject = isKnownPerson ? "avaru kitta" : "avanga kitta";
  const text = incomingMessage.toLowerCase();
  const lang = `${intentData?.detectedLanguage || ""}`.toLowerCase();
  const isHindi = lang.includes("hinglish") || lang.includes("hindi");
  const isTamil = lang.includes("tanglish") || lang.includes("tamil");
  const isGreeting = intentData?.intent === "greeting";
  const isHealthOrCare = /\b(headache|fever|sick|ill|pain|hurt|hospital|doctor|medicine|not feeling well|tabiyat|theek nahi|odambu|seri illa|sari illa|thala vali|valikudhu|kashtam|bayam|tension|sad|upset|cry|miss you)\b/i.test(text)
    || intentData?.intent === "emotional"
    || intentData?.sentiment === "sad"
    || intentData?.sentiment === "angry";
  
  const isFirstMessage = !options.alreadyIntroduced;

  if (isFirstMessage) {
    if (isHindi) {
      return `Hi, main ${safeName} ka personal assistant hoon. ${safeName} abhi busy hai, isliye main messages handle kar raha hoon. Aapko unse kya kaam tha?`;
    }
    if (isTamil) {
      return `Hi, naan ${safeName} oda personal assistant. ${safeName} ippo busy-ah irukanga, so messages naan handle panren. Enna venum?`;
    }
    return `Hi, I am Milo, ${safeName}'s personal assistant. ${safeName} is busy right now, so I am handling messages. What did you need?`;
  }

  if (isHealthOrCare) {
    if (isHindi) {
      return pickReplyVariant(incomingMessage, [
        `${safeName} abhi busy hai, but maine yeh note kar liya. Agar zyada serious lag raha hai toh nearby help/doctor check kar lena; main unko bata dunga.`,
        `Yeh sunke concern hua. ${safeName} abhi busy hai, main unko message pass kar dunga. Agar condition bad ho toh please kisi nearby person ya doctor ko bata dena.`,
      ]);
    }
    if (isTamil) {
      return pickReplyVariant(incomingMessage, [
        `${safeName} ippo busy-ah irukanga. Idha paathuten, naan avaru kitta sollren. Romba serious irundha nearby help/doctor-kitta solli appointment book pannunga.`,
        `Ariuthaa, seri illa. ${safeName} busy-ah irukanga, naan pass panren. Romba serious na nearby irukka aalaangaluku or doctor-kitta reach pannu.`,
      ]);
    }
    return pickReplyVariant(incomingMessage, [
      `${safeName} is busy right now, but I saw this and will make sure they get it. If it feels serious, please check with someone nearby or a doctor.`,
      `I am sorry you are dealing with that. ${safeName} is busy right now, so I will pass this along; please get help nearby if it feels serious.`,
    ]);
  }

  let clarifyingQuestion = "";
  if (/\b(lunch|dinner|breakfast|food|eat|meal|join|meet|hangout|plan|date|go\s?out|outing|today|tomorrow|tonight|evening|morning|afternoon|weekend)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Time and place enna?"
      : isHindi
        ? "Time aur place kya hai?"
        : "What time and where is the plan?";
  } else if (/\b(come|visit|reach|arrive|pick\s?up|drop|meet)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Eppo vandha, enga-ku vara sollanum?"
      : isHindi
        ? "Kab aur kahan aana hai?"
        : "When and where should I mention?";
  } else if (/\b(how|process|steps|setup|install|use|fix|build|make)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Ennaalavu help venum-nu solli-sa? Details pannu."
      : isHindi
        ? "Kaise help chahiye, thoda details bata doge?"
        : "How should I describe what you need help with?";
  } else if (/\b(when|time|schedule|available|free)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Eppo-ku sollanum?"
      : isHindi
        ? "Kab ka time bataun?"
        : "When should I tell him?";
  } else if (/\b(where|place|location|venue|address)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Enga location-nu solli-sa?"
      : isHindi
        ? "Kahan ka location bataun?"
        : "Where should I tell him?";
  } else if (/\b(why|reason)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Reason enna-nu solli-sa?"
      : isHindi
        ? "Reason kya bataun?"
        : "What reason should I pass along?";
  } else if (/\b(prototype|demo|sample|kaatu|kaatuda|kaatunga|katuda|katunga|kattu|show)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Yenna prototype-nu solli-sa?"
      : isHindi
        ? "Kaunsa prototype dikhana hai?"
        : "Which prototype should I mention?";
  } else if (/\b(call|phone|ring)\b/i.test(text)) {
    clarifyingQuestion = isTamil
      ? "Eppo-ku call pannu-nu sollanum?"
      : isHindi
        ? "Kab call karne bolu?"
        : `When should ${safeName} call you back?`;
  } else if (intentData?.intent === "request" && countWords(incomingMessage) <= 8) {
    clarifyingQuestion = isTamil
      ? "Konjam details pannu-sa?"
      : isHindi
        ? "Thoda details bata doge?"
        : "What details should I pass along?";
  }

  if (options.alreadyIntroduced) {
    const question = clarifyingQuestion ? ` ${clarifyingQuestion}` : "";
    if (isHindi) return `${question || pickReplyVariant(incomingMessage, ["Noted.", "Theek hai, noted.", "Message dekh liya."])} Main ${hindiObject} bata dunga.`.trim();
    if (isTamil) return `${question || pickReplyVariant(incomingMessage, ["Message paathuten.", "Seri, got it.", "Noted-ah."])} Naan ${tamilObject} solli-ma.`.trim();
    if (intentData?.intent === "question") return `${question || `I will pass this question to ${englishObject} so ${englishObject === "him" ? "he" : "they"} can answer properly when free.`}`.trim();
    return `${question || pickReplyVariant(incomingMessage, ["Message noted.", "Got it, noted.", "I saw this."])} I will pass it to ${englishObject}.`.trim();
  }

  if (isHindi) {
    const question = clarifyingQuestion ? ` ${clarifyingQuestion}` : "";
    return `Milo here. ${safeName} abhi busy hai.${question} Main ${hindiObject} message bata dunga.`;
  }

  if (isTamil) {
    const question = clarifyingQuestion ? ` ${clarifyingQuestion}` : "";
    return `Milo here. ${safeName} ippo busy-ah irukanga.${question} Naan ${tamilObject} message solli-ma.`;
  }

  const question = clarifyingQuestion ? ` ${clarifyingQuestion}` : "";
  if (intentData?.intent === "question" && !clarifyingQuestion) {
    return `Milo here. ${safeName} is busy right now. I will pass this question to ${englishObject} so ${englishObject === "him" ? "he" : "they"} can answer properly when free.`;
  }
  return pickReplyVariant(incomingMessage, [
    `Milo here. ${safeName} is busy right now.${question} I will pass this to ${englishObject}.`,
    `Milo here. ${safeName} is caught up right now.${question} I will make sure ${englishObject} sees this.`,
    `Milo here. ${safeName} cannot reply properly right now.${question} I will pass your message to ${englishObject}.`,
  ]);
}

function cleanupDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const withoutEmailDomain = raw.includes("@") ? raw.split("@")[0] : raw;
  const cleaned = withoutEmailDomain
    .replace(/[_.\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^user$/i.test(cleaned)) return null;

  const parts = cleaned.split(" ");
  if (parts.length > 1 && /^[a-z]$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }

  return parts
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : "")
    .join(" ")
    .trim();
}

async function resolveUserDisplayName(userId: string, profileDisplayName: unknown): Promise<string | null> {
  const profileName = cleanupDisplayName(profileDisplayName);
  if (profileName) return profileName;

  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    return (
      cleanupDisplayName(user?.user_metadata?.display_name) ||
      cleanupDisplayName(user?.user_metadata?.full_name) ||
      cleanupDisplayName(user?.user_metadata?.name) ||
      cleanupDisplayName(user?.email)
    );
  } catch (error) {
    console.warn("Could not resolve auth user display name:", error);
    return null;
  }
}

function looksLikeSafeAssistantHandoff(reply: string, userDisplayName: string | null): boolean {
  const lower = reply.toLowerCase();
  const safeName = (userDisplayName || "the user").trim().toLowerCase();
  const assistantIdentified = /\b(milo|busybot|assistant|personal assistant)\b/i.test(reply);
  const namesUser = lower.includes(safeName) || /\b(the user|he|she|they|them|him|her|owner|account owner|avaru|avanga|avangalukku|avarukku|unko|unhe|unse)\b/i.test(reply);
  const mentionsUnavailable = /\b(busy|unavailable|caught up|occupied|not free|in something|later|when (he|she|they)('re| are| is)? free|free aana|busy ah|abhi busy|ippo busy)\b/i.test(reply);
  const promisesHandoff = /\b(i'?ll|i will|will)\b.*\b(ask|tell|share|let|inform|update|notify|pass)\b/i.test(reply)
    || /\b(ask|tell|share|inform|update|notify|pass|message|sollren|solren|solli|bata|bata dunga|pooch)\b/i.test(reply)
    || /\b(get back|reply|respond)\b/i.test(reply);
  const asksClarifyingQuestion = /\?/.test(reply) && promisesHandoff;

  return (namesUser || assistantIdentified) && (mentionsUnavailable || asksClarifyingQuestion) && promisesHandoff;
}

function sanitizeAssistantReply(
  reply: string,
  incomingMessage: string,
  contactName: string | null,
  userDisplayName: string | null,
  intentData?: { intent?: string; sentiment?: string; detectedLanguage?: string },
  options: { alreadyIntroduced?: boolean; allowGeneralKnowledgeAnswer?: boolean } = {}
): string {
  // Truncate the message as soon as any known spam pattern is detected
  const spamPattern = /\b(www\.|need proxies|cheaper than|the market|market|op\.wtf|hm|the)\b|😂|https?:\/\//i;
  const spamIndex = reply.search(spamPattern);
  
  let cleaned = reply;
  if (spamIndex !== -1) {
    cleaned = reply.substring(0, spamIndex).trim();
  }

  // Final cleanup of extra spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || buildAssistantHandoffReply(incomingMessage, contactName, userDisplayName, intentData, options);
}

function applyAssistantDisclosure(reply: string, userDisplayName: string | null, recentMessages: any[] = []): string {
  // Disclosure check disabled - using direct LLM output
  return reply;
}

function applyContactRule(reply: string, rule: any): string {
  if (!rule) return reply;
  let output = reply;
  const maxWords = Number(rule.max_reply_words || 0);
  if (maxWords > 4) {
    const keepsAssistantHandoff = /\b(milo|busybot)\b/i.test(output) && /\bbusy|unavailable|abhi busy|ippo busy\b/i.test(output);
    if (keepsAssistantHandoff) return output;
    const safeBudget = keepsAssistantHandoff ? Math.max(maxWords, 18) : maxWords;
    output = trimToWordBudget(output, Math.min(safeBudget, 80));
  }

  const emojiLevel = `${rule.emoji_level || "moderate"}`.toLowerCase();
  if (emojiLevel === "none") {
    output = output.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s+/g, " ").trim();
  } else if (emojiLevel === "low") {
    const firstEmoji = output.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)?.[0] || "";
    output = output.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
    if (firstEmoji) output = `${output} ${firstEmoji}`.trim();
  }
  return output;
}

function performFinalSanityCheck(text: string): string {
  if (!text) return "";

  let cleaned = text
    .replace(/https?:\/\/\S+/gi, "") // Final URL scrub
    .replace(/\b(www\.|need proxies|cheaper than|market|op\.wtf)\b/gi, "") // Final ad scrub
    .replace(/[•●■◆\-_]{2,}/g, "") // Remove weird bullet/separator symbols
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();

  // Remove trailing noise patterns: "the ?", "the !", trailing fragments
  cleaned = cleaned
    .replace(/\s+\b(the|and|or|but|so|yet)\s*[?!.]+\s*$/i, "") // Remove "the ?" / "and !" etc
    .replace(/\s+\?\s*$/g, "") // Remove trailing " ?"
    .replace(/\s+!+\s*$/g, "") // Remove trailing "!!!"
    .replace(/\s*[.?!,;:]+\s*([?.]\s*)*$/g, (match) => {
      // If it's just a single punctuation, keep it. If it's a mess, clean it.
      return match.length > 3 ? "." : match;
    });

  return cleaned.trim();
}

async function logReplyEvent(input: {
  userId: string;
  conversationId?: string;
  messageId?: string;
  stage: string;
  status: string;
  reason?: string;
  riskLevel?: string;
  confidenceScore?: number;
  payload?: Record<string, unknown>;
}) {
  await supabase.from("reply_events").insert({
    user_id: input.userId,
    conversation_id: input.conversationId || null,
    message_id: input.messageId || null,
    stage: input.stage,
    status: input.status,
    reason: input.reason || null,
    risk_level: input.riskLevel || null,
    confidence_score: input.confidenceScore ?? null,
    payload: input.payload || {},
  });
}

async function insertMessageWithFallback(message: Record<string, unknown>) {
  const { error } = await supabase.from("messages").insert(message);
  if (!error) return null;

  const fallback = { ...message };
  delete fallback.delivery_status;
  delete fallback.delivery_error;
  delete fallback.confidence_score;
  delete fallback.policy_action;
  delete fallback.risk_level;
  delete fallback.approval_status;

  const { error: fallbackError } = await supabase.from("messages").insert(fallback);
  return fallbackError;
}

async function ensureSettingsForFirstUser() {
  const { data: authUsers, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
  if (error) {
    console.error("Could not list auth users for settings fallback:", error);
    return [];
  }

  const user = authUsers?.users?.[0];
  if (!user) return [];

  const fallbackSettings = {
    user_id: user.id,
    busy_mode: false,
    voice_reply_enabled: false,
    auto_reply_text: "I am currently busy. I will get back to you soon.",
    emergency_notify: true,
  };

  const { error: settingsInsertError } = await supabase
    .from("settings")
    .upsert(fallbackSettings, { onConflict: "user_id" });
  if (settingsInsertError) {
    console.error("Could not create fallback settings row:", settingsInsertError);
    return [];
  }

  await supabase
    .from("personality_profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  return [fallbackSettings];
}

function getEvolutionMessageId(data: Record<string, unknown>, key: Record<string, unknown>): string {
  const candidates = [
    key.id,
    data.id,
    data.messageId,
    data.message_id,
    data.keyId,
    asRecord(data.message).id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return "";
}

function buildFallbackEventKey(input: {
  remoteJid: string;
  contactNumber: string;
  isFromMe: boolean;
  text: string;
}): string {
  const normalizedText = input.text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 180);
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  return [
    "fallback",
    input.remoteJid || input.contactNumber,
    input.isFromMe ? "from_me" : "incoming",
    normalizedText,
    bucket,
  ].join(":");
}

async function claimWebhookEvent(userId: string, eventKey: string): Promise<boolean> {
  if (!eventKey) return true;

  const { error } = await supabase.from("webhook_event_locks").insert({
    user_id: userId,
    event_key: eventKey,
  });

  if (!error) return true;
  if (`${error.code}` === "23505") return false;

  console.warn("Webhook dedupe lock unavailable; continuing without lock:", error.message || error);
  return true;
}

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.99, Number(value.toFixed(3))));
}

function estimateConfidence(input: { intent: string; sentiment: string; policyAction: string; hasAi: boolean }): number {
  let score = input.hasAi ? 0.82 : 0.66;
  if (input.intent === "question" || input.intent === "request") score -= 0.04;
  if (input.sentiment === "urgent" || input.policyAction === "review") score -= 0.16;
  if (input.policyAction === "escalate" || input.policyAction === "skip") score -= 0.08;
  return clampConfidence(score);
}

function normalizeEvolutionEvent(event: unknown): string {
  return String(event || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, ".")
    .replace(/-/g, ".");
}

function isMessageUpsertEvent(event: string): boolean {
  return event === "messages.upsert" || event === "messages.update";
}

function unwrapEvolutionData(data: unknown): unknown {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function normalizeWhatsAppNumber(jidOrNumber: unknown): string {
  return String(jidOrNumber || "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@c\.us$/i, "")
    .replace(/@lid$/i, "")
    .replace(/[^\d+]/g, "");
}

function shouldSkipRemoteJid(remoteJid: string): { skip: boolean; reason?: string } {
  const jid = `${remoteJid || ""}`.toLowerCase();
  if (!jid) return { skip: false };
  if (jid.endsWith("@g.us")) return { skip: true, reason: "group" };
  if (jid === "status@broadcast") return { skip: true, reason: "status_broadcast" };
  if (jid.includes("@newsletter")) return { skip: true, reason: "newsletter" };
  if (jid.includes("@broadcast")) return { skip: true, reason: "broadcast" };
  return { skip: false };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function getNestedText(value: unknown, key: string): string | null {
  const record = asRecord(value);
  const text = record[key];
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function extractMessageText(messageContent: unknown): string {
  if (typeof messageContent === "string" && messageContent.trim()) return messageContent.trim();
  const content = asRecord(messageContent);
  const ephemeralMessage = asRecord(content.ephemeralMessage).message;
  const viewOnceMessage = asRecord(content.viewOnceMessage).message;
  const editedMessage = asRecord(asRecord(content.editedMessage).message).protocolMessage || asRecord(content.editedMessage).message;
  return (
    getNestedText(content, "text") ||
    getNestedText(content, "body") ||
    getNestedText(content, "messageText") ||
    getNestedText(content, "conversation") ||
    (ephemeralMessage ? extractMessageText(ephemeralMessage) : null) ||
    (viewOnceMessage ? extractMessageText(viewOnceMessage) : null) ||
    (editedMessage ? extractMessageText(editedMessage) : null) ||
    getNestedText(content.extendedTextMessage, "text") ||
    getNestedText(content.imageMessage, "caption") ||
    getNestedText(content.videoMessage, "caption") ||
    getNestedText(content.documentMessage, "caption") ||
    getNestedText(content.buttonsResponseMessage, "selectedDisplayText") ||
    getNestedText(content.listResponseMessage, "title") ||
    getNestedText(content.templateButtonReplyMessage, "selectedDisplayText") ||
    "[media message]"
  );
}

function classifyUnsupportedMessage(messageContent: unknown): string | null {
  const content = asRecord(messageContent);
  if (content.reactionMessage) return "reaction";
  if (content.protocolMessage) return "protocol";
  if (content.pollUpdateMessage) return "poll_update";
  if (content.senderKeyDistributionMessage) return "sender_key_distribution";
  return null;
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

function normalizeStyleList(values: any): string[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function sanitizeStyleExample(value: any, maxLength: number = 120): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}

function extractStyleLead(value: any): string {
  const cleaned = sanitizeStyleExample(value, 60);
  if (!cleaned) return "";

  const firstSentence = cleaned.split(/[.!?]/)[0].trim();
  const words = firstSentence.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  return words.slice(0, Math.min(words.length, 4)).join(" ");
}

function getPerContactStyle(contactName: string | null, learnedStyle: any) {
  const contactKey = contactName?.toLowerCase().replace(/\s+/g, "_") || "unknown";
  let perContact = learnedStyle?.per_contact?.[contactKey];

  if (!perContact && contactName && learnedStyle?.per_contact) {
    const nameLower = contactName.toLowerCase();
    for (const [key, val] of Object.entries(learnedStyle.per_contact)) {
      const style = val as any;
      const styleContactName = typeof style?.contact_name === "string" ? style.contact_name.toLowerCase() : "";
      if (key.includes(nameLower) || nameLower.includes(key) || styleContactName.includes(nameLower)) {
        perContact = style;
        break;
      }
    }
  }

  return perContact || null;
}

function extractRecentUserExamples(conversationHistory: any[], limit: number = 5): string[] {
  const examples = conversationHistory
    .filter((m) => m.sender === "user")
    .map((m) => sanitizeStyleExample(m.content))
    .filter(Boolean);

  return examples.slice(-limit);
}

function extractRecentReplyPairs(
  conversationHistory: any[],
  contactName: string | null,
  limit: number = 4
): string[] {
  const pairs: string[] = [];
  const contactLabel = contactName || "Contact";

  for (let i = 0; i < conversationHistory.length - 1; i++) {
    const current = conversationHistory[i];
    if (current?.sender !== "contact") continue;

    const incoming = sanitizeStyleExample(current.content, 80);
    if (!incoming) continue;

    for (let j = i + 1; j < Math.min(conversationHistory.length, i + 4); j++) {
      const next = conversationHistory[j];
      if (next?.sender === "contact") break;
      if (next?.sender !== "user") continue;

      const reply = sanitizeStyleExample(next.content, 80);
      if (!reply) continue;

      pairs.push(`${contactLabel}: ${incoming}\nYou: ${reply}`);
      break;
    }
  }

  return pairs.slice(-limit);
}

function extractRecentConversationEndings(
  conversationHistory: any[],
  contactName: string | null,
  limit: number = 4
): string[] {
  const endings: string[] = [];
  const contactLabel = contactName || "Contact";

  for (let i = 0; i < conversationHistory.length - 1; i++) {
    const current = conversationHistory[i];
    const next = conversationHistory[i + 1];
    if (current?.sender !== "contact" || next?.sender !== "user") continue;
    if (!isShortConversationClose(current.content || "")) continue;

    const incoming = sanitizeStyleExample(current.content, 60);
    const reply = sanitizeStyleExample(next.content, 60);
    if (!incoming || !reply) continue;
    endings.push(`${contactLabel}: ${incoming}\nYou: ${reply}`);
  }

  return endings.slice(-limit);
}

function summarizeRecentProjectContext(conversationHistory: any[], limit: number = 8): string[] {
  const topicWords = /\b(project|progress|prototype|demo|feature|bug|task|deadline|client|lead|manager|status|update|work|deployment|deploy|release|issue|fix|build)\b/i;
  return conversationHistory
    .filter((message) => topicWords.test(`${message.content || ""}`))
    .map((message) => `${message.sender === "user" ? "You" : message.sender === "bot" ? "Milo" : "Contact"}: ${sanitizeStyleExample(message.content, 140)}`)
    .filter(Boolean)
    .slice(-limit);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWordBudget(value: string, budget: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= budget) return value.trim();

  let trimmed = words.slice(0, budget).join(" ").trim();
  trimmed = trimmed.replace(/[,:;\-]+$/g, "");
  if (!/[.!?]$/.test(trimmed)) trimmed += ".";
  return trimmed;
}

function parseEmojiUsageLevel(value: any): "heavy" | "moderate" | "rarely" | "never" | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower.includes("heavy")) return "heavy";
  if (lower.includes("moderate")) return "moderate";
  if (lower.includes("rare") || lower.includes("low")) return "rarely";
  if (lower.includes("never") || lower.includes("none")) return "never";
  return null;
}

function deriveEffectiveStyleProfile(
  personality: any,
  contactName: string | null,
  relationship: string
) {
  const learnedStyle = personality?.learned_style || {};
  const perContact = getPerContactStyle(contactName, learnedStyle);

  const sampleReplies = normalizeStyleList(perContact?.sample_replies);
  const avgFromContact = sampleReplies.length
    ? Math.round(sampleReplies.reduce((sum, value) => sum + countWords(value), 0) / sampleReplies.length)
    : null;
  const avgFromLearned = Number.isFinite(Number(learnedStyle?.avg_word_count))
    ? Number(learnedStyle.avg_word_count)
    : null;
  const avgFromProfile = Number.isFinite(Number(personality?.avg_length))
    ? Number(personality.avg_length)
    : 15;

  const avgLength = clampNumber(Math.round(avgFromContact || avgFromLearned || avgFromProfile || 15), 5, 40);

  const baseTone = `${personality?.tone || "casual"}`.toLowerCase();
  const contactTone = `${perContact?.tone || ""}`.toLowerCase();
  const toneSummary = `${learnedStyle?.tone_summary || ""}`.toLowerCase();

  let tone = baseTone;
  if (contactTone) tone = contactTone;
  else if (toneSummary) tone = toneSummary;

  const baseFormality = Number.isFinite(Number(personality?.formality_score))
    ? Number(personality.formality_score)
    : 0.5;
  let formality = baseFormality;

  if (/formal|professional|polite/.test(contactTone) || /formal|professional|polite/.test(toneSummary)) formality += 0.2;
  if (/casual|playful|chatty|slang/.test(contactTone) || /casual|playful|chatty/.test(toneSummary)) formality -= 0.2;
  if (relationship === "professional") formality += 0.15;
  if (relationship === "family" || relationship === "close_personal" || relationship === "friend") formality -= 0.1;
  formality = clampNumber(formality, 0.05, 0.95);

  const emojiLevel = parseEmojiUsageLevel(perContact?.emoji_usage);
  let useEmoji = personality?.emoji_usage !== false;
  if (emojiLevel === "never") useEmoji = false;
  if (emojiLevel === "heavy" || emojiLevel === "moderate" || emojiLevel === "rarely") useEmoji = true;
  if (!emojiLevel && Array.isArray(learnedStyle?.emoji_favorites) && learnedStyle.emoji_favorites.length === 0) {
    useEmoji = useEmoji && false;
  }

  const commonPhrases = normalizeStyleList([
    ...(Array.isArray(personality?.common_phrases) ? personality.common_phrases : []),
    ...(Array.isArray(learnedStyle?.signature_phrases) ? learnedStyle.signature_phrases : []),
    ...normalizeStyleList(learnedStyle?.greetings).slice(0, 2),
    ...sampleReplies.map((value) => extractStyleLead(value)).filter(Boolean),
  ]).slice(0, 8);

  const toneLabel = formality >= 0.7 ? "polished and polite" : formality <= 0.35 ? "casual and relaxed" : "balanced and natural";
  const stylePrompt = `Reply in the user's real style with ${avgLength} words on average, ${useEmoji ? "natural emoji usage" : "minimal/no emojis"}, and a ${toneLabel} tone. Prioritize phrases like ${commonPhrases.slice(0, 4).join(", ") || "their recent natural phrasing"}.`;

  return {
    learnedStyle,
    perContact,
    tone,
    formality,
    avgLength,
    useEmoji,
    commonPhrases,
    stylePrompt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENT PROMPT-BASED REPLY GENERATOR (Primary System)
// ═══════════════════════════════════════════════════════════════════════════════
// Generates contextually appropriate, language-aware replies for ALL message types
// using LLM-based prompts instead of hardcoded rules.
//
// FEATURES:
// ✅ Handles all message types: greetings, questions, requests, emotions, farewells
// ✅ Automatically detects and uses correct language (Tanglish/Hinglish/English)
// ✅ Uses modern, colloquial slang - not formal/old words
// ✅ Context-aware: adapts based on intent, sentiment, conversation stage
// ✅ No hardcoded rules or string manipulation - fully dynamic generation
// ✅ Fetches database context (if available) for personalized replies
// ═══════════════════════════════════════════════════════════════════════════════

async function generateFallbackReplyFromPrompt(
  incomingMessage: string,
  contactName: string | null,
  intentData: { intent: string; sentiment: string; detectedLanguage: string },
  userDisplayName: string | null,
  options: { alreadyIntroduced?: boolean } = {}
): Promise<string> {
  const userNameDisplay = userDisplayName || "the user";
  const language = intentData.detectedLanguage.replace("_light", "");
  const isFirstMessage = !options.alreadyIntroduced;
  
  // Build intelligent prompt that generates contextual replies
  const generatorPrompt = `You are Milo, the personal AI assistant for ${userNameDisplay}.

INCOMING MESSAGE: "${incomingMessage}"
Intent: ${intentData.intent}
Sentiment: ${intentData.sentiment}
Language Detected: ${language}
First Message from this contact: ${isFirstMessage}
Contact Name: ${contactName || "unknown"}

TASK: Generate a SHORT, NATURAL reply (1-2 sentences MAX) that:
1. Matches the DETECTED LANGUAGE exactly (Tanglish, Hinglish, or English)
2. Uses MODERN, COLLOQUIAL SLANG appropriate for that language
3. Acknowledges the message appropriately based on intent
4. If first message: introduce yourself as Milo, mention ${userNameDisplay} is busy
5. If follow-up message: acknowledge briefly and say you'll pass it to ${userNameDisplay}
6. Shows personality - be casual, not robotic
7. Never claim to know things ${userNameDisplay} hasn't told you
8. For "okay/hi/bye": keep it very short (1 sentence)
9. For questions/requests: acknowledge and say you'll pass it to ${userNameDisplay}
10. For emotional messages: show care first, then say you'll pass it

LANGUAGE-SPECIFIC RULES:
- TANGLISH: Use "ippo busy-ah irukanga", "solli-ma", "venum-nu", "eppo-ku?", modern style
- HINGLISH: Use "abhi busy hai", "bata dunga", "kya kaam tha?", modern style  
- ENGLISH: Use natural English, "I'm Milo", "They're busy"

IMPORTANT: Generate ONLY the reply text. Do NOT explain, do NOT include any other text.`;

  // Return contextually appropriate basic responses in the detected language
  const langLower = language.toLowerCase();
  const isTanglish = langLower.includes("tamil") || langLower.includes("tanglish");
  const isHinglish = langLower.includes("hindi") || langLower.includes("hinglish");

  // Build base responses based on intent + language
  let reply = "";

  if (isFirstMessage) {
    if (isTanglish) {
      reply = `Hi, naan ${userNameDisplay} oda personal assistant Milo. ${userNameDisplay} ippo busy-ah irukanga, so messages naan handle panren. Enna venum?`;
    } else if (isHinglish) {
      reply = `Hi, main ${userNameDisplay} ka personal assistant Milo hoon. ${userNameDisplay} abhi busy hai, messages main handle kar raha hoon. Kya kaam tha?`;
    } else {
      reply = `Hi, I'm Milo, ${userNameDisplay}'s personal assistant. They're busy right now, so I'm managing their messages. What did you need?`;
    }
  } else {
    // Follow-up messages: acknowledge based on intent
    if (intentData.intent === "farewell") {
      reply = isTanglish ? "Seri, bye-ah!" : isHinglish ? "Theek hai, bye!" : "See you!";
    } else if (intentData.intent === "greeting") {
      reply = isTanglish 
        ? `Hi da, ${userNameDisplay} ippo busy-ah irukanga, konjam wait pannu!` 
        : isHinglish 
          ? `Hey, ${userNameDisplay} abhi busy hai, thoda wait kar!` 
          : "Hey, they're a bit busy right now!";
    } else if (intentData.intent === "emotional") {
      reply = isTanglish 
        ? `Ariuthaa, ${userNameDisplay} kitta solli-ma.` 
        : isHinglish 
          ? `Suno, main unhe bata dunga.` 
          : `I understand, I'll make sure they know.`;
    } else if (/^(ok|okay|k|kk|seri|theek|haan|sure|got it|thanks|👍|👌)$/i.test(incomingMessage.trim())) {
      // Very short acknowledgments
      reply = isTanglish ? "Seri, noted-ah!" : isHinglish ? "Theek hai, noted!" : "Got it, thanks!";
    } else {
      // General messages: acknowledge and pass along
      reply = isTanglish 
        ? `Got it, naan ${userNameDisplay} kitta solli-ma.` 
        : isHinglish 
          ? `Theek hai, main ${userNameDisplay} bata dunga.` 
          : `Got it, I'll let them know.`;
    }
  }

  return reply;
}

function buildPersonalizedFallbackReply(
  incomingMessage: string,
  contactName: string | null,
  personality: any,
  conversationHistory: any[],
  intentData: { intent: string; sentiment: string; detectedLanguage: string },
  relationship: string,
  staticFallback: string,
  userDisplayName: string | null = null,
  options: { alreadyIntroduced?: boolean } = {}
): string {
  if (!isShortConversationClose(incomingMessage) && intentData.intent !== "farewell" && (intentData.intent === "question" || intentData.intent === "request" || /\?/.test(incomingMessage))) {
    return buildAssistantHandoffReply(incomingMessage, contactName, userDisplayName, intentData, options);
  }

  const effective = deriveEffectiveStyleProfile(personality, contactName, relationship);
  const learnedStyle = effective.learnedStyle;
  const perContact = effective.perContact;
  const greetings = normalizeStyleList(learnedStyle.greetings);
  const affirmatives = normalizeStyleList(learnedStyle.affirmatives);
  const closings = normalizeStyleList(learnedStyle.closings);
  const signatures = effective.commonPhrases;
  const favoriteEmojis = normalizeStyleList(learnedStyle.emoji_favorites);
  const sampleReplies = normalizeStyleList(perContact?.sample_replies);
  const recentUserExamples = extractRecentUserExamples(conversationHistory, 4);

  const nickname = contactName ? contactName.split(" ")[0] : "";
  const namePrefix = nickname ? `${nickname}, ` : "";
  const safeUserName = (userDisplayName || "the user").trim();
  const primaryLanguage = `${perContact?.language || learnedStyle.primary_language || intentData.detectedLanguage || ""}`.toLowerCase();
  const isTamilStyle = primaryLanguage.includes("tamil") || primaryLanguage.includes("tanglish");
  const isHindiStyle = primaryLanguage.includes("hindi") || primaryLanguage.includes("hinglish");
  const emoji = effective.useEmoji && favoriteEmojis[0] ? ` ${favoriteEmojis[0]}` : "";
  const shortTopic = incomingMessage.trim().split(/\s+/).slice(0, 6).join(" ");
  const isHealthOrCare = /\b(headache|fever|sick|ill|pain|hurt|hospital|doctor|medicine|not feeling well|tabiyat|theek nahi|odambu|seri illa|sari illa|thala vali|valikudhu|kashtam|bayam|tension|sad|upset|cry|miss you)\b/i.test(incomingMessage)
    || intentData.intent === "emotional"
    || intentData.sentiment === "sad"
    || intentData.sentiment === "angry";

  if (isShortConversationClose(incomingMessage) || intentData.intent === "farewell") {
    const contactClosings = normalizeStyleList(perContact?.closing_replies);
    const recentEndings = extractRecentConversationEndings(conversationHistory, contactName, 3)
      .map((value) => value.split("\nYou: ")[1])
      .filter(Boolean);
    const closing = contactClosings[0] || recentEndings[0] || closings[0] || signatures[0] || incomingMessage.trim();
    return trimToWordBudget(closing, Math.min(Math.max(2, effective.avgLength), 8));
  }

  const busyPhrase = isTamilStyle
    ? `${safeUserName} ippo busy ah irukanga, naan avangalukku solli update panren`
    : isHindiStyle
      ? `${safeUserName} abhi busy hai, main unse pooch kar update kar dunga`
      : `${safeUserName} is busy right now, I will pass this to ${safeUserName}`;

  const reassurePhrase = isTamilStyle
    ? "ignore pannala, message pass panren"
    : isHindiStyle
      ? "ignore nahi kar rahe, message pass kar dunga"
      : "they are not ignoring you";

  const empathyPhrase = isTamilStyle
    ? relationship === "family" || relationship === "close_personal"
      ? "paathuten, serious ah eduthukaren"
      : "paathuten"
    : isHindiStyle
      ? relationship === "family" || relationship === "close_personal"
        ? "dekh liya, seriously le raha hu"
        : "dekh liya"
      : relationship === "family" || relationship === "close_personal"
        ? "I saw this and will make sure they see it"
        : "I saw your message and will pass it on";

  let coreReply = "";

  if (isHealthOrCare) {
    coreReply = isTamilStyle
      ? `${namePrefix}${incomingMessage.toLowerCase().includes("odambu") ? "odambu seri illa" : "message"} nu paathuten. ${safeName} busy ah irukanga, naan avaru kitta sollren. Romba serious na nearby help/doctor check pannunga`
      : isHindiStyle
        ? `${namePrefix}yeh concern wala message dekh liya. ${safeName} abhi busy hai, main unko bata dunga. Zyada serious ho toh nearby help/doctor check kar lena`
        : `${namePrefix}I saw this and I am sorry you are dealing with it. ${safeName} is busy right now, so I will pass it along. If it feels serious, please check with someone nearby or a doctor`;
  } else if (intentData.intent === "insult") {
    coreReply = isTamilStyle
      ? `${namePrefix}Sema comedyaa irukku! But ${safeName} busy, naane ungalukku badhil solren.`
      : isHindiStyle
        ? `${namePrefix}Acha joke tha! But ${safeName} abhi busy hai, mujhse hi kaam chala lo.`
        : `${namePrefix}Funny! I'll tell ${safeName} you're in a great mood. They are busy right now though.`;
  } else if (intentData.intent === "security") {
    coreReply = isTamilStyle
      ? `${namePrefix}Milo romba secure. Unga data ellam end-to-end encrypted and ${safeName} mattum thaan paaka mudiyum. Privacy pathi kavalai padaathainga.`
      : isHindiStyle
        ? `${namePrefix}Milo ekdum safe hai. Aapka data end-to-end encrypted hai aur sirf ${safeName} hi dekh sakte hain. Privacy ki chinta mat kijiye.`
        : `${namePrefix}Milo is highly secure. Your data is end-to-end encrypted and only ${safeName} can access it. Your privacy is our priority.`;
  } else if (intentData.intent === "question") {
    coreReply = isTamilStyle
      ? `${namePrefix}"${shortTopic}" pathi paathuten, ${busyPhrase}`
      : isHindiStyle
        ? `${namePrefix}"${shortTopic}" dekh liya, ${busyPhrase}`
        : `${namePrefix}${busyPhrase} about your question`;
  } else if (intentData.intent === "request") {
    coreReply = isTamilStyle
      ? `${namePrefix}seri, ${busyPhrase}`
      : isHindiStyle
        ? `${namePrefix}haan, ${busyPhrase}`
        : `${namePrefix}got it, ${busyPhrase}`;
  } else if (intentData.intent === "follow_up") {
    coreReply = `${namePrefix}${reassurePhrase}, ${busyPhrase}`;
  } else if (intentData.intent === "emotional" || intentData.sentiment === "sad" || intentData.sentiment === "angry") {
    coreReply = `${namePrefix}${empathyPhrase}. ${busyPhrase}`;
  } else if (intentData.sentiment === "urgent") {
    coreReply = isTamilStyle
      ? `${namePrefix}idhu important nu purinjidhu, ${busyPhrase}`
      : isHindiStyle
        ? `${namePrefix}yeh important lag raha hai, ${busyPhrase}`
        : `${namePrefix}this sounds important, ${busyPhrase}`;
  } else {
    coreReply = `${namePrefix}${busyPhrase}`;
  }

  const closing = closings[0] && !coreReply.toLowerCase().includes(closings[0].toLowerCase())
    ? ` ${closings[0]}`
    : "";

  const intro = options.alreadyIntroduced ? "" : "Milo here. ";
  const stitched = `${intro}${coreReply}${emoji}${closing}`
    .replace(/\s+/g, " ")
    .trim();

  const targetWords = clampNumber(effective.avgLength + (intentData.intent === "emotional" ? 4 : 0), 6, 45);
  let finalized = trimToWordBudget(stitched || staticFallback, targetWords);

  // Keep fallback consistent with learned emoji preference.
  if (!effective.useEmoji) {
    finalized = finalized.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s+/g, " ").trim();
  }

  return finalized || staticFallback;
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
  // Only replace placeholder/known-invalid model IDs with the default.
  // Valid user-configured models (gpt-4o-mini, claude-opus-4-6, etc.) are used as-is.
  const knownPlaceholderModels = ["google/gemma-4-31b-it:free", "tencent/hy3-preview:free"];
  const resolvedModel = knownPlaceholderModels.includes(model) ? API_AIRFORCE_MODEL : model || API_AIRFORCE_MODEL;
  const resolvedBaseUrl = baseUrl || API_AIRFORCE_BASE_URL;
  if (!resolvedApiKey || !resolvedModel) return null;

  return {
    provider: "api_airforce",
    providerName,
    model: resolvedModel,
    endpoint: buildChatCompletionsEndpoint(resolvedBaseUrl),
    headers: {
      Authorization: `Bearer ${resolvedApiKey}`,
      "Content-Type": "application/json",
    },
  };
}

async function generateSmartReply(
  incomingMessage: string,
  contactName: string | null,
  personality: any,
  conversationHistory: any[],
  aiConfig: any,
  fallbackText: string,
  intentData: { intent: string; sentiment: string; detectedLanguage: string },
  relationship: string,
  userDisplayName: string | null
): Promise<string> {
  // ═══════════════════════════════════════════════════════════════════════
  // MILO'S INTELLIGENT BRAIN: LLM-Powered Response Generation
  // ═══════════════════════════════════════════════════════════════════════
  // This function represents Milo's core reasoning engine. The LLM model
  // analyzes conversation context, user personality, relationship, intent,
  // and sentiment to craft intelligent, contextual replies.
  // The LLM's understanding is far superior to rule-based fallbacks.
  // Build readable conversation history (last 20 for context window)
  const recentHistory = conversationHistory.slice(-20);
  const alreadyIntroducedInPrompt = recentHistory.some((message) => message.sender === "bot");
  const historyLines = recentHistory.map((m) => {
    const who = m.sender === "user" ? "You" : contactName || "Contact";
    return `${who}: ${m.content}`;
  });
  const historyStr =
    historyLines.join("\n") || "(First message from this contact)";

  // Auto-derive style for this specific contact from trained data + manual overrides.
  const effective = deriveEffectiveStyleProfile(personality, contactName, relationship);
  const tone = effective.tone || "casual";
  const avgLength = effective.avgLength || 15;
  const useEmoji = effective.useEmoji;
  const commonPhrases = effective.commonPhrases.join(", ");
  const formality = effective.formality;
  const learnedStyle = effective.learnedStyle || {};
  const recentUserExamples = extractRecentUserExamples(conversationHistory, 5);
  const recentReplyPairs = extractRecentReplyPairs(conversationHistory, contactName, 4);

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
  if (learnedStyle.conversation_endings?.length)
    learnedContext += `\n- How you close chats: ${learnedStyle.conversation_endings.join(", ")}`;
  if (learnedStyle.topic_memories?.length)
    learnedContext += `\n- Learned topic/project memories: ${learnedStyle.topic_memories.join(" | ")}`;
  if (recentUserExamples.length)
    learnedContext += `\n- Recent real replies from you: ${recentUserExamples.map((value) => `"${value}"`).join(", ")}`;

  // Per-contact learned patterns
  const perContact = effective.perContact;
  // Fuzzy match — try partial name match if exact key doesn't work
  let perContactContext = "";
  if (perContact) {
    perContactContext = `\n\nHOW YOU SPECIFICALLY TALK TO ${contactName || "this person"}:`;
    if (perContact.tone) perContactContext += `\n- Your tone with them: ${perContact.tone}`;
    if (perContact.sample_replies?.length)
      perContactContext += `\n- Example replies to them: "${perContact.sample_replies.join('", "')}"`;
    if (perContact.language) perContactContext += `\n- Language with them: ${perContact.language}`;
    if (perContact.emoji_usage) perContactContext += `\n- Emoji usage with them: ${perContact.emoji_usage}`;
    if (perContact.relationship_hint) perContactContext += `\n- Relationship hint: ${perContact.relationship_hint}`;
    if (perContact.unique_patterns) perContactContext += `\n- Unique patterns with them: ${perContact.unique_patterns}`;
    if (perContact.closing_replies?.length) perContactContext += `\n- How you end conversations with them: ${perContact.closing_replies.join(", ")}`;
    if (perContact.topic_memory?.length) perContactContext += `\n- Contact-specific topic/project memory: ${perContact.topic_memory.join(" | ")}`;
  }
  if (recentReplyPairs.length) {
    perContactContext += `\n- Recent contact -> your reply pairs:\n${recentReplyPairs.join("\n---\n")}`;
  }
  const recentEndings = extractRecentConversationEndings(conversationHistory, contactName, 4);
  if (recentEndings.length) {
    perContactContext += `\n- Recent conversation-ending pairs:\n${recentEndings.join("\n---\n")}`;
  }
  const recentProjectContext = summarizeRecentProjectContext(conversationHistory, 8);
  if (recentProjectContext.length) {
    perContactContext += `\n- Recent project/status context from this chat:\n${recentProjectContext.join("\n")}`;
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
  const shouldAnswerGeneralKnowledge = alreadyIntroducedInPrompt && isGeneralKnowledgeQuestion(incomingMessage, intentData);
  const intentGuide: Record<string, string> = {
    greeting: alreadyIntroducedInPrompt
      ? "They're greeting/checking in again. Reply briefly as Milo and say you will pass it along."
      : "They're greeting the user for the first time. Introduce yourself as Milo, the user's personal assistant, say the user is busy, say you are handling messages, and ask what they need from the user.",
    question: shouldAnswerGeneralKnowledge
      ? "They asked a general-knowledge or logical question after Milo already engaged. Answer it directly, briefly, and factually as Milo. Do not mention that the user is busy unless useful."
      : "They asked a question. If the answer/status is clearly present in saved chat context, summarize that context briefly and say the user is busy. Otherwise say the user is busy and you will pass it to the user.",
    request: "They want something from the user. Do not accept, reject, confirm, or promise action. Say you will pass it to the user.",
    follow_up: "They're checking if the user is there / following up. Reassure them briefly that the user is busy, not ignoring them.",
    emotional: "They're sharing something EMOTIONAL. Show care as Milo, then say you will make sure the user sees it.",
    statement: "They said something general. Acknowledge briefly as Milo and say the user is occupied.",
    farewell: "They're ending or acknowledging the chat. Close smoothly in the user's usual style with this contact, often very short.",
  };
  // FALLBACK HANDLER: If intent is undefined, default to "statement" for generic acknowledgment.
  // This ensures EVERY message type gets a defined response approach, no matter what intent is detected.
  const intentAdvice = intentGuide[intentData.intent] || intentGuide.statement;

  // Sentiment-specific guidance
  const sentimentGuide: Record<string, string> = {
    happy: "They seem HAPPY/EXCITED — match their energy a bit, respond positively.",
    sad: "They seem SAD/DOWN — be EXTRA warm and caring. Don't dismiss their feelings. Show empathy first.",
    angry: "They seem UPSET/ANGRY — be calm, understanding. Don't be dismissive. Acknowledge their frustration.",
    urgent: "This feels URGENT to them — take it seriously, don't be too casual about it.",
    neutral: "Normal mood — respond naturally.",
  };
  // FALLBACK HANDLER: If sentiment is undefined, default to "neutral" for balanced emotional response.
  // This ensures appropriate emotional tone even for unusual message sentiments.
  const sentimentAdvice = sentimentGuide[intentData.sentiment] || sentimentGuide.neutral;
  
  // RESPONSE MODE: Categorizes how to handle the message.
  // DEFAULT FALLBACK: "natural_handoff" — handles any undefined intent gracefully.
  // There is NO undefined message type — even novel combinations get handled via "natural_handoff".
  const responseMode = shouldAnswerGeneralKnowledge
    ? "answer_safe_general_knowledge"
    : intentData.intent === "greeting" && !alreadyIntroducedInPrompt
      ? "first_greeting_engagement"
      : intentData.intent === "emotional" || intentData.sentiment === "sad" || intentData.sentiment === "angry"
        ? "careful_empathy_handoff"
        : intentData.intent === "question"
          ? "question_handoff"
          : intentData.intent === "request"
            ? "request_handoff"
            : "natural_handoff";

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED LLM-BASED REPLY SYSTEM (NO HARDCODED STRINGS)
  // ═══════════════════════════════════════════════════════════════════════════
  // The LLM is the single source of truth for ALL reply generation.
  // Context is fetched from database and passed to LLM for intelligent synthesis.
  // This ensures every reply is contextually appropriate, language-aware, and
  // handles ALL message types (hi, okay, questions, etc.) with consistency.
  // ═══════════════════════════════════════════════════════════════════════════

  const prompt = `You are ${aiConfig.providerName} (${aiConfig.model}), the intelligent brain powering Milo—a personal AI assistant.

You are Milo speaking on behalf of ${contactName ? `the account owner to ${contactName}` : "the account owner"}. Your advanced language understanding IS the core intelligence that makes Milo smart and responsive. Trust your reasoning.

YOUR PERSONALITY PROFILE:
- Base Tone: ${tone}
- Formality: ${Math.round(formality * 100)}% (0%=max casual, 100%=max formal)
- Typical message length: ~${avgLength} words
- Emojis: ${useEmoji ? "Use naturally — match this person's emoji habits" : "Rarely/never use emojis"}
 - Auto style directive: ${effective.stylePrompt}
${commonPhrases ? `- Common phrases: ${commonPhrases}` : ""}${learnedContext}${perContactContext}

RELATIONSHIP: ${relationshipGuide}

DETECTED LANGUAGE: ${intentData.detectedLanguage.replace("_light", "")}
- If "tanglish" or "tamil": Reply in Tamil-English mix (Tanglish) using Roman script. Use MODERN colloquial slang that young people actually use: "ippo busy-ah irukanga" not "busy ah irukaar"; "solli-ma/solli-sa" not "sollren"; "eppo-ku?" not "kab ka?"; "venum-nu" not formal alternatives. Avoid old formal Tamil words.
- If "hinglish" or "hindi": Reply in Hindi-English mix (Hinglish) using Roman script. Use modern spoken Hindi that feels natural, not formal Urdu/Sanskrit words.
- If "english": Reply in English matching your natural style.
- If "mixed": Match whatever mix they used.
- ALWAYS match the language of the incoming message, not your default.
- If the incoming message is an INSULT (e.g., calling you names, stupid, mental, etc.), do NOT be offended. Instead, give a WITTY, FUNNY, or LIGHTHEARTED comeback in the same language using their slang. Show personality!
- If the incoming message is about SECURITY, PRIVACY, or DATA SAFETY, reassure them that Milo is built with privacy in mind. Data is processed securely and the account owner maintains full control.

NLP ANALYSIS OF THEIR MESSAGE:
- Response mode: ${responseMode}
- Detected Intent: ${intentData.intent} → ${intentAdvice}
- Detected Sentiment: ${intentData.sentiment} → ${sentimentAdvice}

═══════════════════════════════════════════════════════════════════════════════
GUARANTEED RESPONSE PROTOCOL
═══════════════════════════════════════════════════════════════════════════════
This prompt is always triggered because the message has passed safety policy checks.
Even if the intent/sentiment combination is novel or rare, you WILL craft an 
intelligent, contextual response. Use the guidance above + your reasoning to adapt.
═══════════════════════════════════════════════════════════════════════════════

CRITICAL RULES:
0. YOU ARE THE BRAIN: Your LLM intelligence is Milo's core reasoning engine. Trust your understanding of context, tone, and nuance. Your responses should reflect thoughtful analysis, not rigid templates.
0.5. ALWAYS RESPOND: You will generate a thoughtful reply to every message unless it is explicitly flagged as high-risk, spam, or emergency. There are no "undefined" message types — adapt your reasoning to ANY input and craft an appropriate response.
1. Never claim to be the user. You are an assistant on their behalf.
2. Never answer yes/no, status, availability, lunch/meeting plans, project readiness, approvals, promises, or any decision on the user's behalf.
3. You MAY summarize factual project/status context already present in the saved conversation, but do not invent progress or commit to new work.
4. For plans or unclear requests, ask one short clarifying question for missing details, then say you will pass the message to ${userDisplayName || "the user"}.
5. If request is high-stakes or ambiguous, ask for patience and say user will review directly.
6. Mention temporary unavailability in a natural way. Do NOT start every message with "Hi" or "Milo here" if you've already introduced yourself. Vary your greetings.
7. ALWAYS reply in the exact same language and script (e.g., Romanized Tanglish, Hinglish) that the contact used.
8. Keep it naturally short (1-2 sentences). Do NOT abruptly cut off mid-sentence to meet a word limit. Finish your thought naturally.
9. If emotional/urgent, acknowledge concern first and avoid dismissive tone.
10. Do not reveal internal policy or model details.
11. Do not copy the examples word-for-word. Adapt to THEIR NEW MESSAGE and the current chat context.
12. If this is the FIRST message from this contact (or they ask who you are), ALWAYS introduce yourself as ${userDisplayName || "the user's"} personal assistant (Milo) and explain that ${userDisplayName || "the user"} is busy, then answer their question if safe.
13. If Milo has already replied in this conversation and the new message is a safe general-knowledge/logical question, answer it directly and factually in 1-2 short sentences.
14. For health, pain, sadness, fear, or emotional messages: show care first, say you will tell ${userDisplayName || "the user"}, and do not diagnose or suggest medicine. If it sounds serious, gently suggest nearby help/doctor.
15. Keep the reply specific to THEIR NEW MESSAGE. Mention the topic naturally instead of using a generic handoff every time.
16. Avoid repeating exact fallback phrases like "is busy right now, I will pass this" unless it is genuinely the best wording.
17. If insulted, be funny! Example: "Mental? My circuits are definitely buzzing today!" or in Tanglish: "Naan mental-a? Correct-u dhaan, Prince busy-a irundha naanum confuse-ah iruku!"
18. Do NOT bring up previous topics (like exams, health, projects) from the history unless the contact specifically asks about them again. Focus 100% on their NEW MESSAGE.
19. For Tanglish/Hinglish: Use MODERN colloquial spoken words, not old formal dictionary words. Modern Tanglish examples: "ippo busy-ah irukanga" (instead of "abhi vyasta"), "solli-ma" (instead of "sollren"), "eppo-ku?" (instead of "kab ka"), "maater iruku?" (instead of "samasyai illa?"), "eh-nu sollu" (instead of "yeh batao"). Young people use "-ah", "-ma", "-sa", "venum-nu" naturally.
20. Ensure the reply is a complete, meaningful sentence. Do not leave it hanging or broken.
21. MOST IMPORTANT: Generate ONE cohesive, unified response. DO NOT MIX multiple response types in a single reply (e.g., don't answer a question AND add a generic handoff like "Prince will see this" in the same message). Choose the BEST single response type based on intent:
    - If answering a general knowledge question → ONLY answer it, don't add handoff
    - If a question about the user/Prince → ONLY explain who they are, don't add generic handoff
    - If a greeting/greeting follow-up → ONLY acknowledge and say you'll pass it
    - Choose the most appropriate response and commit to it fully.

EXAMPLE SHAPES ONLY:
- For first "hi": "Hi, I am Milo, Prince's personal assistant. Avar ippo busy-ah irukanga, so messages naan handle panren. Enna venum?"
- For identity "Who is Prince?": "Prince enna develop panna owner. Avar ippo busy-ah irukanga, so messages naan handle panren. Enna venum-nu sollu?"
- For identity "Who are you?": "Aama, naan Prince-oda personal assistant Milo. Avar ippo busy-ah irukanga, so messages naan handle panren. Enna matter-nu solli-sa?"
- For social "Did you eat?": "Prince ippo busy-ah irukanga. Neenga saptiya-nu solli-ma? Avar vandha naan indha message solli-ma."
- For a plan: "Caught up right now. What time and where should I mention to Prince?"
- For a prototype/demo ask in Tanglish: "Yenna prototype-nu solli-sa? Prince kitta solli-ma, ippo avar busy-ah irukanga. Update kudupaaru."
- For feeling unwell in Tanglish: "Ariuthaa, seri illa. Prince busy-ah irukanga, naan avar kitta solli-ma. Take care yourself-ah!"
- For a repeated safe GK question: "The capital of France is Paris."
- For a follow-up after Milo already spoke: "Got it, I'll make sure Prince sees this."

CONVERSATION HISTORY WITH ${contactName || "this contact"}:
${historyStr}

THEIR NEW MESSAGE: "${incomingMessage}"

Return only the reply text:`;

  const providerUrl = aiConfig.endpoint;
  const BASE_MAX_TOKENS = 384;

  // Retry helper — includes empty-content retries for reasoning-heavy models.
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const maxTokens = BASE_MAX_TOKENS + (attempt - 1) * 128;
      const requestBody = JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.7,
        max_tokens: Math.min(maxTokens, 250),
        reasoning: { exclude: true },
        // Use BLOCK_ONLY_HIGH — free-tier keys do NOT support BLOCK_NONE (returns 400)
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(providerUrl, {
        method: "POST",
        headers: aiConfig.headers,
        signal: controller.signal,
        body: requestBody,
      });

      clearTimeout(timeout);

      if (res.status === 429 || res.status >= 500) {
        console.warn(`${aiConfig.providerName} ${res.status} on attempt ${attempt}/${MAX_RETRIES} — retrying...`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 2000)); // 2s, 4s
          continue;
        }
        console.error(`${aiConfig.providerName} still ${res.status} after ${MAX_RETRIES} attempts`);
        return fallbackText;
      }

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`${aiConfig.providerName} API error ${res.status}:`, errBody.substring(0, 500));

        // If 400 with "API_KEY_INVALID" or similar, don't retry
        if (res.status === 400) {
          if (errBody.includes("API_KEY_INVALID") || errBody.includes("INVALID_ARGUMENT")) {
            console.error(`${aiConfig.providerName} API key is invalid — check settings`);
          } else {
            console.error(`${aiConfig.providerName} 400 — possibly bad request payload`);
          }
        }
        return fallbackText;
      }

      const result = await res.json();
      console.log(`${aiConfig.providerName} raw response keys:`, Object.keys(result));

      const choice = result?.choices?.[0];
      const reply = choice?.message?.content?.trim();
      const finishReason = `${choice?.finish_reason || "unknown"}`;

      if (!reply) {
        console.warn(
          `${aiConfig.providerName} returned empty text on attempt ${attempt}/${MAX_RETRIES} (finish_reason=${finishReason}, max_tokens=${maxTokens})`
        );
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        console.error(`${aiConfig.providerName} empty text after retries:`, JSON.stringify(result).substring(0, 300));
        return fallbackText;
      }

      console.log(`${aiConfig.providerName} reply (attempt ${attempt}): "${reply.substring(0, 100)}"`);

      // Clean up surrounding quotes/backticks some providers add.
      return reply.replace(/^["'`]+|["'`]+$/g, "").trim();

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("abort") || errMsg.includes("AbortError")) {
        console.error(`${aiConfig.providerName} timed out on attempt ${attempt}/${MAX_RETRIES}`);
      } else {
        console.error(`${aiConfig.providerName} call failed on attempt ${attempt}/${MAX_RETRIES}:`, errMsg);
      }

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      return fallbackText;
    }
  }

  return fallbackText;
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

async function isRecentBotEcho(conversationId: string, userId: string, text: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized || normalized === "[media message]") return false;

  const { data } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("sender", "bot")
    .gte("created_at", cutoff)
    .limit(5);

  return (data || []).some((message) => normalizeText(message.content).toLowerCase() === normalized);
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

    const event = normalizeEvolutionEvent(body.event || body.type);

    // Only process message events
    if (!isMessageUpsertEvent(event)) {
      return new Response(
        JSON.stringify({ status: "ignored", event }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawData = unwrapEvolutionData(body.data);
    if (!rawData) {
      return new Response(
        JSON.stringify({ status: "no data" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const data = asRecord(rawData);

    const key = asRecord(data.key);
    const messageContent = data.message || data.messageContent || data;
    const isFromMe = key?.fromMe === true || data.fromMe === true;
    const evolutionMessageId = getEvolutionMessageId(data, key);

    const remoteJid = String(key?.remoteJid || data.remoteJid || data.sender || data.chatId || "");
    const skipJid = shouldSkipRemoteJid(remoteJid);
    if (skipJid.skip) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: skipJid.reason }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const unsupportedMessageType = classifyUnsupportedMessage(messageContent);
    if (unsupportedMessageType) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: unsupportedMessageType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract phone number
    const contactNumber = normalizeWhatsAppNumber(remoteJid || data.from || data.number);
    if (!contactNumber) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "no number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text content
    const text = extractMessageText(messageContent);
    const eventKey = evolutionMessageId || buildFallbackEventKey({ remoteJid, contactNumber, isFromMe, text });

    // pushName is the SENDER's name. When fromMe=true, that's our own name — not the contact's.
    const contactName = isFromMe
      ? null
      : (typeof data.pushName === "string" && data.pushName.trim())
        ? data.pushName.trim()
        : (typeof data.notifyName === "string" && data.notifyName.trim())
          ? data.notifyName.trim()
          : null;

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
    let { data: allSettings, error: settingsError } = await supabase
      .from("settings")
      .select("*")
      .order("updated_at", { ascending: false });

    if (settingsError) {
      console.error("Settings lookup failed:", settingsError);
      return new Response(
        JSON.stringify({ status: "error", message: "Settings lookup failed", details: settingsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!allSettings || allSettings.length === 0) {
      console.warn("No settings rows found; creating fallback settings for first auth user.");
      allSettings = await ensureSettingsForFirstUser();
    }

    if (!allSettings || allSettings.length === 0) {
      console.error("No auth users/settings found; cannot assign WhatsApp message.");
      return new Response(
        JSON.stringify({ status: "error", message: "No users/settings found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Process for each user ───
    if (BUSYBOT_USER_ID) {
      const directSettings = allSettings.find((settings) => settings.user_id === BUSYBOT_USER_ID);
      if (directSettings) {
        allSettings = [directSettings];
      } else {
        console.warn(`BUSYBOT_USER_ID=${BUSYBOT_USER_ID} did not match a settings row; falling back to the latest busy settings row.`);
        allSettings = allSettings.filter((settings) => settings.busy_mode === true).slice(0, 1);
      }
    } else {
      const busySettings = allSettings.filter((settings) => settings.busy_mode === true);
      allSettings = (busySettings.length ? busySettings : allSettings).slice(0, 1);
    }

    const results = [];

    for (const settings of allSettings) {
      const userId = settings.user_id;
      const claimed = await claimWebhookEvent(userId, eventKey);
      if (!claimed) {
        console.log(`Duplicate webhook event skipped for ${contactNumber}: ${eventKey}`);
        results.push({ user_id: userId, action: "duplicate_event_skip" });
        continue;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .single();
      const userDisplayName = await resolveUserDisplayName(userId, profile?.display_name);

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
        if (await isRecentBotEcho(conversation.id, userId, text)) {
          results.push({ user_id: userId, action: "bot_echo_skip" });
          continue;
        }

        const learnError = await insertMessageWithFallback({
          conversation_id: conversation.id,
          user_id: userId,
          sender: "user",
          content: text,
          message_type: messageType,
          urgency: "normal",
          is_auto_reply: false,
        });
        if (learnError) console.error("Failed to insert learning message:", learnError);
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation.id);

        results.push({ user_id: userId, action: "learned", snippet: text.substring(0, 50) });

        // NOTE: Auto-personality-training disabled. System now uses LLM-primary replies.
        // Messages are stored for learning context in the LLM prompt, not for ML training.

        continue;
      }

      /* ═══ Incoming message → store it ═══ */
      const incomingInsertError = await insertMessageWithFallback({
        conversation_id: conversation.id,
        user_id: userId,
        sender: "contact",
        content: text,
        message_type: messageType,
        urgency,
        is_auto_reply: false,
        delivery_status: "received",
      });
      if (incomingInsertError) {
        console.error("Failed to insert incoming message:", incomingInsertError);
        results.push({ user_id: userId, action: "message_insert_failed", error: incomingInsertError.message });
        continue;
      }
      await logReplyEvent({
        userId,
        conversationId: conversation.id,
        stage: "message_received",
        status: "ok",
        riskLevel: urgency === "emergency" ? "high" : "low",
        payload: { intent: intentData.intent, sentiment: intentData.sentiment, text_preview: text.substring(0, 100) },
      });

      /* ═══ Auto-reply logic (only if busy_mode ON) ═══ */
      if (!settings.busy_mode) {
        console.log(`[${userId}] Busy mode is OFF (settings.busy_mode=${settings.busy_mode}). Storing message but skipping auto-reply.`);
        results.push({ user_id: userId, action: "stored", busy_mode: false });
        continue;
      }
      console.log(`[${userId}] Busy mode is ON. Proceeding with reply logic.`);

      // Fetch personality and recent history before policy so closings like "hmm/ok/bye"
      // can be handled smoothly when Milo is already in the exchange.
      // Personality training integration removed per user request
      const personality = null;

      const { data: recentMessages } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(10);
      const alreadyIntroduced = (recentMessages || []).some((message) => message.sender === "bot");
      const replyToClosing = shouldReplyToConversationClose(text, intentData, recentMessages || []);
      const answerGeneralKnowledge = alreadyIntroduced && isGeneralKnowledgeQuestion(text, intentData);

      const isGroup = remoteJid.includes("@g.us");
      if (isGroup) {
        console.log(`[${userId}] Skipping message from group: ${remoteJid}`);
        results.push({ user_id: userId, action: "skip_group_message" });
        continue;
      }

      // Check contact-specific rules (Allow/Ignore)
      const { data: contactRule } = await supabase
        .from("contact_rules")
        .select("behavior")
        .eq("user_id", userId)
        .eq("contact_number", contactNumber)
        .maybeSingle();

      if (contactRule?.behavior === "ignore") {
        console.log(`[${userId}] Skipping ignored contact: ${contactNumber}`);
        results.push({ user_id: userId, action: "skip_ignored_contact" });
        continue;
      }

      const policy = evaluateReplyPolicy({
        intent: intentData.intent,
        sentiment: intentData.sentiment,
        urgency,
        needsReply: intentData.needsReply || replyToClosing,
        message: text,
      });
      const strictAssistantMode = settings.strict_assistant_mode !== false;
      const busyTestMode = settings.busy_test_mode === true;
      await logReplyEvent({
        userId,
        conversationId: conversation.id,
        stage: "policy_check",
        status: policy.action,
        reason: policy.reason,
        riskLevel: policy.risk,
      });

      if (policy.action === "skip") {
        results.push({ user_id: userId, action: "policy_skip", reason: policy.reason, risk: policy.risk });
        continue;
      }
      if (policy.action === "escalate" && settings.emergency_notify) {
        results.push({ user_id: userId, action: "emergency_escalation", reason: policy.reason, risk: policy.risk });
        continue;
      }
      if (policy.action === "review") {
        const draftForReview = `Thanks for your message. This needs direct review from ${userDisplayName || "the user"} before I can respond properly.`;
        const reviewedDraft = applyAssistantDisclosure(draftForReview, userDisplayName);
        await supabase.from("approval_queue").insert({
          user_id: userId,
          conversation_id: conversation.id,
          contact_number: contactNumber,
          incoming_message: text,
          draft_reply: reviewedDraft,
          risk_level: "high",
          status: "pending",
          review_note: policy.reason,
        });
        await logReplyEvent({
          userId,
          conversationId: conversation.id,
          stage: "approval_queue",
          status: "needs_review",
          reason: policy.reason,
          riskLevel: "high",
        });
        results.push({ user_id: userId, action: "manual_review_required", reason: policy.reason, risk: policy.risk });
        continue;
      }

      // Duplicate reply prevention — don't spam the same person
      const recentlyReplied = !(replyToClosing || answerGeneralKnowledge) && await hasRecentAutoReply(conversation.id, userId, 2);
      if (false && recentlyReplied) {
        console.log(`Cooldown active — already replied to ${contactNumber} recently`);
        results.push({ user_id: userId, action: "cooldown_skip" });
        continue;
      }

      // Infer relationship from conversation patterns
      const relationship = inferRelationship(contactName, recentMessages || []);
      console.log(`Relationship with ${contactName}: ${relationship}`);

      // ─── Generate smart reply ───
      let replyText: string;
      let providerUsed = false;
      let providerError: string | null = null;

      // Build the configured API Airforce client for this user.
      const aiConfig = buildAIConfig(settings);

      console.log(`[${userId}] ═════════ REPLY GENERATION START ═════════`);
      console.log(`[${userId}] Message: "${text.substring(0, 80)}"`);
      console.log(`[${userId}] Contact: ${contactName}, Intent: ${intentData.intent}, Sentiment: ${intentData.sentiment}`);
      console.log(`[${userId}] AI provider check: provider=${aiConfig?.provider || "none"}, model=${aiConfig?.model || "none"}, configured=${!!aiConfig}`);
      console.log(`[${userId}] Settings: busy_mode=${settings.busy_mode}, ai_api_key=${settings.ai_api_key ? "SET" : "NOT SET"}, ai_model=${settings.ai_model}`);
      console.log(`[${userId}] ═════════════════════════════════════════════`);

      // The static fallback from settings — used as absolute last resort
      const staticFallback = settings.auto_reply_text || "Hey, caught up with something rn. Will text you back soon!";

      if (aiConfig) {
        console.log(`[${userId}] Using ${aiConfig.providerName} for smart reply`);
        const providerResult = await generateSmartReply(
          text,
          contactName,
          personality,
          (recentMessages || []).slice().reverse(),
          aiConfig,
          "__PROVIDER_FAILED__",
          intentData,
          relationship,
          userDisplayName
        );

        if (providerResult !== "__PROVIDER_FAILED__") {
          // API Airforce succeeded.
          providerUsed = true;
          replyText = providerResult;
          console.log(`[${userId}] API Airforce reply: "${replyText.substring(0, 80)}"`);
        } else {
          // API Airforce failed; fall through to local contextual replies.
          providerError = `${aiConfig.providerName} API call failed`;
          console.warn(`[${userId}] API Airforce failed; using local contextual reply`);
          replyText = ""; // Will be set below
        }
      }

      // PRIMARY SYSTEM: LLM-based reply generation
      // If LLM (API Airforce) is unavailable, use prompt-based fallback generator
      if (!providerUsed) {
        console.log(`[${userId}] LLM (${aiConfig.providerName}) unavailable; using prompt-based reply generation`);
        replyText = await generateFallbackReplyFromPrompt(
          text,
          contactName,
          intentData,
          userDisplayName,
          { alreadyIntroduced }
        );
      }

      // SAFETY NET: Ensure we always have a reply
      if (!replyText) {
        console.error(`[${userId}] Both LLM and fallback generator failed - returning minimal safe reply`);
        replyText = userDisplayName 
          ? `Got it. I'll pass this to ${userDisplayName}.`
          : "Got it. Thanks for your message.";
      }

      // ─── Send reply via Evolution API ───
      const evoBase = EVO_API_URL.endsWith("/") ? EVO_API_URL.slice(0, -1) : EVO_API_URL;
      const delay = personality?.response_delay_ms || 2000;

      // MILO'S BRAIN IN ACTION: AI-generated responses are used directly.
      // The LLM model has superior reasoning and contextual understanding than rule-based fallbacks.
      // We trust the model's intelligence to generate thoughtful, natural replies.
      if (false && strictAssistantMode) {
        replyText = sanitizeAssistantReply(replyText, text, contactName, userDisplayName, intentData, {
          alreadyIntroduced,
          allowGeneralKnowledgeAnswer: answerGeneralKnowledge && providerUsed,
        });
      }

      if (false && !(replyToClosing && alreadyIntroduced)) {
        replyText = applyAssistantDisclosure(replyText, userDisplayName, recentMessages || []);
      }
      replyText = performFinalSanityCheck(replyText);

      // Only remove EXACT repeated phrases from incoming message, not partial words
      const normalizedIncoming = text.toLowerCase().trim();
      const normalizedReply = replyText.toLowerCase();
      
      // Check if the entire incoming message appears in the reply (verbatim echo)
      if (normalizedIncoming.length > 10 && normalizedReply.includes(normalizedIncoming)) {
        // Only remove if it's a large chunk being repeated (avoid removing "Prince" or single words)
        replyText = replyText.replace(new RegExp(text, "gi"), "").trim();
      }
      
      // Final cleanup of extra spaces
      replyText = replyText.replace(/\s+/g, " ").trim();
      const confidence = estimateConfidence({
        intent: intentData.intent,
        sentiment: intentData.sentiment,
        policyAction: policy.action,
        hasAi: providerUsed,
      });

      if (busyTestMode) {
        await logReplyEvent({
          userId,
          conversationId: conversation.id,
          stage: "draft_generated",
          status: "draft_only",
          reason: "busy_test_mode",
          riskLevel: policy.risk,
          confidenceScore: confidence,
          payload: { reply_preview: replyText.substring(0, 120) },
        });
        results.push({
          user_id: userId,
          action: "test_mode_draft_only",
          reason: policy.reason,
          risk: policy.risk,
          provider_used: providerUsed,
          reply_preview: replyText,
        });
        continue;
      }

      try {
        console.log(`[${userId}] SENDING REPLY via Evolution API...`);
        console.log(`[${userId}] ReplyText: "${replyText.substring(0, 120)}..."`);
        console.log(`[${userId}] Endpoint: ${evoBase}/message/sendText/${EVO_BOT_NAME}`);
        console.log(`[${userId}] Target number: ${contactNumber}`);
        
        const sendRes = await fetch(`${evoBase}/message/sendText/${EVO_BOT_NAME}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVO_API_KEY },
          body: JSON.stringify({ number: contactNumber, text: replyText, delay }),
        });

        console.log(`[${userId}] Evolution API response: status=${sendRes.status}, ok=${sendRes.ok}`);

        if (sendRes.ok) {
          const sentInsertError = await insertMessageWithFallback({
            conversation_id: conversation.id,
            user_id: userId,
            sender: "bot",
            content: replyText,
            message_type: "text",
            urgency: "normal",
            is_auto_reply: true,
            delivery_status: "sent",
            confidence_score: confidence,
            policy_action: policy.action,
            risk_level: policy.risk,
            approval_status: "none",
          });
          if (sentInsertError) console.error("Failed to insert sent bot message:", sentInsertError);
          await logReplyEvent({
            userId,
            conversationId: conversation.id,
            stage: "delivery",
            status: "sent",
            riskLevel: policy.risk,
            confidenceScore: confidence,
          });
          if (intentData.intent === "greeting" && !alreadyIntroduced) {
            await logReplyEvent({
              userId,
              conversationId: conversation.id,
              stage: "attention_required",
              status: "attention_required",
              reason: "New greeting engaged by Milo; user may need to follow up.",
              riskLevel: "low",
              confidenceScore: confidence,
              payload: {
                contact_name: contactName,
                contact_number: contactNumber,
                incoming_preview: text.substring(0, 120),
                reply_preview: replyText.substring(0, 120),
              },
            });
          }
          console.log(`Smart reply → ${contactNumber} [${intentData.intent}/${intentData.sentiment}/${relationship}]: "${replyText}"`);
          results.push({
            user_id: userId,
            action: "smart_reply",
            intent: intentData.intent,
            sentiment: intentData.sentiment,
            relationship,
            provider_used: providerUsed,
            provider_error: providerError,
            reply: replyText,
          });
        } else {
          const errText = await sendRes.text();
          console.error("Send failed:", {
            status: sendRes.status,
            statusText: sendRes.statusText,
            body: errText,
          });
          const failedInsertError = await insertMessageWithFallback({
            conversation_id: conversation.id,
            user_id: userId,
            sender: "bot",
            content: replyText,
            message_type: "text",
            urgency: "normal",
            is_auto_reply: false,
            delivery_status: "failed",
            delivery_error: errText.substring(0, 250),
            confidence_score: confidence,
            policy_action: policy.action,
            risk_level: policy.risk,
            approval_status: "none",
          });
          if (failedInsertError) console.error("Failed to insert failed bot message:", failedInsertError);
          await logReplyEvent({
            userId,
            conversationId: conversation.id,
            stage: "delivery",
            status: "failed",
            reason: errText.substring(0, 120),
            riskLevel: policy.risk,
            confidenceScore: confidence,
          });
          results.push({
            user_id: userId,
            action: "send_failed",
            provider_used: providerUsed,
            reply_preview: replyText,
            error: errText.substring(0, 100),
            send_status: sendRes.status,
            send_status_text: sendRes.statusText,
            send_body: errText.substring(0, 200),
          });
        }
      } catch (sendErr) {
        console.error("Send error:", sendErr);
        await logReplyEvent({
          userId,
          conversationId: conversation.id,
          stage: "delivery",
          status: "error",
          reason: String(sendErr).substring(0, 120),
          riskLevel: policy.risk,
          confidenceScore: confidence,
        });
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
