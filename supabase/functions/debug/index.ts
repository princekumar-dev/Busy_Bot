// deno-lint-ignore-file
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  
  // If action=test_gemini, test all users' Gemini keys
  if (body.action === "test_gemini") {
    const { data: allSettings } = await supabase
      .from("settings")
      .select("user_id, gemini_api_key");
    
    const results = [];
    for (const s of (allSettings || [])) {
      const key = ((s as any).gemini_api_key || "").trim();
      const keyInfo = {
        user_id: s.user_id,
        has_key: !!key,
        key_length: key.length,
        key_preview: key ? key.substring(0, 10) + "..." : "NONE",
        test_result: "skipped",
      };
      
      if (key && key.length > 10) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "Reply with exactly: WORKING" }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 10 },
                safetySettings: [
                  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
                  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
                ],
              }),
            }
          );
          
          if (res.ok) {
            const data = await res.json();
            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
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
    
    return new Response(JSON.stringify({ gemini_key_tests: results }, null, 2), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Default: show all data including gemini key status  
  const { data: settings } = await supabase.from("settings").select("user_id, busy_mode, auto_reply_text, gemini_api_key").limit(5);
  const { data: convos } = await supabase.from("conversations").select("id, user_id, contact_name, contact_number, unread_count").limit(10);
  const { data: msgs } = await supabase.from("messages").select("id, conversation_id, sender, content").limit(10);
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 5 });

  // Mask the gemini keys but show if they exist and their length
  const maskedSettings = (settings || []).map(s => ({
    ...s,
    gemini_api_key: (s as any).gemini_api_key 
      ? `${((s as any).gemini_api_key as string).substring(0, 8)}...(${((s as any).gemini_api_key as string).length} chars)` 
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
