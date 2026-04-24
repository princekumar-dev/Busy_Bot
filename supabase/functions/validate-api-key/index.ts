// deno-lint-ignore-file
// @ts-nocheck — Supabase Edge Function (Deno runtime)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    if (provider === "openrouter") {
      const url = "https://api.openrouter.ai/v1/models";
      const resp = await probe(url, { headers: { Authorization: `Bearer ${api_key}` } });
      if (resp.status === 401 || resp.status === 403) {
        return new Response(JSON.stringify({ result: "invalid", status: resp.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (resp.ok) return new Response(JSON.stringify({ result: "valid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ result: "inconclusive", status: resp.status, detail: resp.text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (provider === "custom") {
      const base = (base_url || "").replace(/\/+$/, "");
      if (!base) {
        return new Response(JSON.stringify({ result: "inconclusive", reason: "missing base_url" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Try /v1/models
      const modelsUrl = `${base}/v1/models`;
      const r1 = await probe(modelsUrl, { headers: { Authorization: `Bearer ${api_key}` } });
      if (r1.status === 401 || r1.status === 403) {
        return new Response(JSON.stringify({ result: "invalid", status: r1.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (r1.ok) return new Response(JSON.stringify({ result: "valid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Fallback: try minimal chat/completions
      const chatUrl = `${base}/v1/chat/completions`;
      const r2 = await probe(chatUrl, { method: "POST", headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: model || "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }) });
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
