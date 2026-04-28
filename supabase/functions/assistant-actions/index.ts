// deno-lint-ignore-file
// @ts-nocheck
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendText(number: string, text: string, delay = 500) {
  const evoBase = EVO_API_URL.endsWith("/") ? EVO_API_URL.slice(0, -1) : EVO_API_URL;
  return fetch(`${evoBase}/message/sendText/${EVO_BOT_NAME}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_API_KEY },
    body: JSON.stringify({ number, text, delay }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action;
    const userId = body.user_id;
    if (!action || !userId) {
      return new Response(JSON.stringify({ error: "action and user_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "approve") {
      const queueId = body.queue_id;
      if (!queueId) throw new Error("queue_id is required for approve");
      const { data: queue, error: qErr } = await supabase
        .from("approval_queue")
        .select("*")
        .eq("id", queueId)
        .eq("user_id", userId)
        .single();
      if (qErr || !queue) throw new Error("Approval queue item not found");

      const finalReply = `${body.edited_reply || queue.edited_reply || queue.draft_reply}`.trim();
      const res = await sendText(queue.contact_number, finalReply);
      if (!res.ok) {
        const errText = await res.text();
        await supabase.from("approval_queue").update({ status: "failed", review_note: errText.substring(0, 200), updated_at: new Date().toISOString() }).eq("id", queueId);
        return new Response(JSON.stringify({ status: "failed", error: errText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabase.from("messages").insert({
        conversation_id: queue.conversation_id,
        user_id: userId,
        sender: "bot",
        content: finalReply,
        message_type: "text",
        urgency: "normal",
        is_auto_reply: true,
        delivery_status: "sent",
        approval_status: "approved",
      });
      await supabase.from("approval_queue").update({
        status: "approved",
        edited_reply: finalReply,
        updated_at: new Date().toISOString(),
      }).eq("id", queueId);
      return new Response(JSON.stringify({ status: "approved" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reject") {
      const queueId = body.queue_id;
      await supabase.from("approval_queue").update({
        status: "rejected",
        review_note: body.review_note || "Rejected by user",
        updated_at: new Date().toISOString(),
      }).eq("id", queueId).eq("user_id", userId);
      return new Response(JSON.stringify({ status: "rejected" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "quick_reply") {
      const conversationId = body.conversation_id;
      const text = `${body.text || "I have flagged this as important. The user will get back to you as soon as possible."}`.trim();
      const { data: convo } = await supabase.from("conversations").select("contact_number").eq("id", conversationId).eq("user_id", userId).single();
      if (!convo) throw new Error("Conversation not found");

      const res = await sendText(convo.contact_number, text);
      if (!res.ok) throw new Error(await res.text());
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        sender: "bot",
        content: text,
        message_type: "text",
        urgency: "important",
        is_auto_reply: false,
        delivery_status: "sent",
        approval_status: "none",
      });
      return new Response(JSON.stringify({ status: "sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "export_data") {
      const [messages, convos, approvals, events, rules] = await Promise.all([
        supabase.from("messages").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000),
        supabase.from("conversations").select("*").eq("user_id", userId),
        supabase.from("approval_queue").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000),
        supabase.from("reply_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000),
        supabase.from("contact_rules").select("*").eq("user_id", userId),
      ]);
      return new Response(JSON.stringify({
        exported_at: new Date().toISOString(),
        messages: messages.data || [],
        conversations: convos.data || [],
        approval_queue: approvals.data || [],
        reply_events: events.data || [],
        contact_rules: rules.data || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_data") {
      await supabase.from("approval_queue").delete().eq("user_id", userId);
      await supabase.from("reply_events").delete().eq("user_id", userId);
      await supabase.from("contact_rules").delete().eq("user_id", userId);
      await supabase.from("messages").delete().eq("user_id", userId);
      await supabase.from("conversations").delete().eq("user_id", userId);
      return new Response(JSON.stringify({ status: "deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
