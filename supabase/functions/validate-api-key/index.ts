// deno-lint-ignore-file
// @ts-nocheck — Supabase Edge Function (Deno runtime)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_API_AIRFORCE_API_KEY = Deno.env.get("API_AIRFORCE_API_KEY") || "sk-air-JT9fB48xGX17FCKCUgVu6OlId0dmtzxlB6ED10zutDDzc5ZfweuZLKYTMy7x5msP";
const DEFAULT_API_AIRFORCE_BASE_URL = Deno.env.get("API_AIRFORCE_BASE_URL") || "https://api.airforce/v1";
const DEFAULT_API_AIRFORCE_MODEL = Deno.env.get("API_AIRFORCE_MODEL") || "llama-4-scout";

function buildChatCompletionsEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (normalizedBase.endsWith("/chat/completions")) return normalizedBase;
  if (normalizedBase.endsWith("/v1")) return `${normalizedBase}/chat/completions`;
  return `${normalizedBase}/v1/chat/completions`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { provider, api_key, base_url, model } = await req.json();

    if (!provider) {
      return new Response(JSON.stringify({ result: "inconclusive", reason: "missing provider" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper to safe-fetch and return status/text
    async function probe(url: string, options: any = {}) {
      try {
        const res = await fetch(url, options);
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      } catch (e) {
        return { ok: false, status: 0, text: String(e) };
      }
    }

    if (provider === "api_airforce") {
      const base = (base_url || DEFAULT_API_AIRFORCE_BASE_URL).replace(/\/+$/, "");
      if (!base) {
        return new Response(JSON.stringify({ result: "inconclusive", reason: "missing base_url" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const chatUrl = buildChatCompletionsEndpoint(base);
      const chatHeaders: Record<string, string> = { "Content-Type": "application/json" };
      chatHeaders.Authorization = `Bearer ${api_key || DEFAULT_API_AIRFORCE_API_KEY}`;
      const r2 = await probe(chatUrl, { method: "POST", headers: chatHeaders, body: JSON.stringify({ model: model || DEFAULT_API_AIRFORCE_MODEL, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }) });
      if (r2.status === 401 || r2.status === 403) {
        return new Response(JSON.stringify({ result: "invalid", status: r2.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (r2.ok) return new Response(JSON.stringify({ result: "valid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      return new Response(JSON.stringify({ result: "inconclusive", status: r2.status, detail: r2.text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ result: "inconclusive", reason: "unsupported provider" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ result: "inconclusive", error: String(err) }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
