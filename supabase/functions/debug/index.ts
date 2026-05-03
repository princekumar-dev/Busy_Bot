// deno-lint-ignore-file
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const API_AIRFORCE_API_KEY = Deno.env.get("API_AIRFORCE_API_KEY") || "sk-air-JT9fB48xGX17FCKCUgVu6OlId0dmtzxlB6ED10zutDDzc5ZfweuZLKYTMy7x5msP";
const API_AIRFORCE_BASE_URL = Deno.env.get("API_AIRFORCE_BASE_URL") || "https://api.airforce/v1";
const API_AIRFORCE_MODEL = Deno.env.get("API_AIRFORCE_MODEL") || "llama-4-scout";

function buildChatCompletionsEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (normalizedBase.endsWith("/chat/completions")) return normalizedBase;
  if (normalizedBase.endsWith("/v1")) return `${normalizedBase}/chat/completions`;
  return `${normalizedBase}/v1/chat/completions`;
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  
  if (body.action === "test_api_airforce") {
    const { data: allSettings } = await supabase
      .from("settings")
      .select("user_id, ai_api_key, ai_model, ai_base_url");
    
    const results = [];
    for (const s of (allSettings || [])) {
      const key = ((s as any).ai_api_key || API_AIRFORCE_API_KEY).trim();
      const model = ((s as any).ai_model || API_AIRFORCE_MODEL).trim();
      const baseUrl = ((s as any).ai_base_url || API_AIRFORCE_BASE_URL).trim();
      const keyInfo = {
        user_id: s.user_id,
        has_key: !!key,
        key_length: key.length,
        key_preview: key ? key.substring(0, 10) + "..." : "NONE",
        test_result: "skipped",
      };
      
      if (key && key.length > 10) {
        try {
          const res = await fetch(buildChatCompletionsEndpoint(baseUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: "Reply with exactly: WORKING" }],
              max_tokens: 10,
              temperature: 0,
            }),
          });
          
          if (res.ok) {
            const data = await res.json();
            const reply = data?.choices?.[0]?.message?.content?.trim() || "";
            keyInfo.test_result = `✅ OK: "${reply}"`;
          } else {
            const err = await res.text();
            keyInfo.test_result = `❌ ${res.status}: ${err.substring(0, 200)}`;
          }
        } catch (e) {
          keyInfo.test_result = `❌ Error: ${e.message}`;
        }
      }
      results.push(keyInfo);
    }
    
    return new Response(JSON.stringify({ api_airforce_key_tests: results }, null, 2), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const { data: settings } = await supabase.from("settings").select("user_id, busy_mode, auto_reply_text, ai_provider, ai_api_key, ai_model, ai_base_url").limit(5);
  const { data: convos } = await supabase.from("conversations").select("id, user_id, contact_name, contact_number, unread_count").limit(10);
  const { data: msgs } = await supabase.from("messages").select("id, conversation_id, sender, content").limit(10);
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 5 });

  // Mask the AI keys but show if they exist and their length.
  const maskedSettings = (settings || []).map(s => ({
    ...s,
    ai_api_key: (s as any).ai_api_key 
      ? `${((s as any).ai_api_key as string).substring(0, 8)}...(${((s as any).ai_api_key as string).length} chars)` 
      : "NOT SET",
  }));

  return new Response(JSON.stringify({
    settings: maskedSettings,
    conversations: convos,
    messages: msgs,
    users: authUsers?.users?.map(u => ({ id: u.id, email: u.email })),
  }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
