// deno-lint-ignore-file
// @ts-nocheck — This file runs on Supabase Edge Functions (Deno runtime), not Node.js
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body, null, 2));

    const event = body.event;

    // Only process incoming messages
    if (event !== "messages.upsert") {
      return new Response(JSON.stringify({ status: "ignored", event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = body.data;
    if (!data) {
      return new Response(JSON.stringify({ status: "no data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract message info from Evolution API payload
    const key = data.key;
    const messageContent = data.message;

    // Skip messages sent by us (fromMe = true)
    if (key?.fromMe) {
      return new Response(JSON.stringify({ status: "skipped", reason: "fromMe" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip group messages
    const remoteJid = key?.remoteJid || "";
    if (remoteJid.endsWith("@g.us")) {
      return new Response(JSON.stringify({ status: "skipped", reason: "group" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract the phone number (remove @s.whatsapp.net)
    const contactNumber = remoteJid.replace("@s.whatsapp.net", "");
    if (!contactNumber) {
      return new Response(JSON.stringify({ status: "skipped", reason: "no number" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text content
    const text =
      messageContent?.conversation ||
      messageContent?.extendedTextMessage?.text ||
      messageContent?.imageMessage?.caption ||
      messageContent?.videoMessage?.caption ||
      "[media message]";

    // Get the contact push name
    const contactName = data.pushName || null;

    // Determine message type
    let messageType = "text";
    if (messageContent?.imageMessage) messageType = "image";
    else if (messageContent?.audioMessage) messageType = "voice";
    else if (messageContent?.videoMessage) messageType = "image";

    // Determine urgency based on content
    const lowerText = text.toLowerCase();
    let urgency = "normal";
    const emergencyWords = ["emergency", "urgent", "asap", "help", "911", "sos", "critical", "🚨", "⚠️"];
    const importantWords = ["important", "priority", "need", "please call", "call me"];
    if (emergencyWords.some((w) => lowerText.includes(w))) {
      urgency = "emergency";
    } else if (importantWords.some((w) => lowerText.includes(w))) {
      urgency = "important";
    }

    // Get all users with settings — process message for users who have busy_mode enabled
    // If no user has busy_mode on, store for the most recently active user
    const { data: allSettings, error: settingsError } = await supabase
      .from("settings")
      .select("user_id, busy_mode, auto_reply_text, emergency_notify")
      .order("updated_at", { ascending: false });

    if (settingsError || !allSettings || allSettings.length === 0) {
      console.error("Could not find user settings:", settingsError);
      return new Response(JSON.stringify({ status: "error", message: "No user found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process for all users — store the conversation/message for each user
    const results = [];
    for (const settings of allSettings) {
      const userId = settings.user_id;
      const busyMode = settings.busy_mode;
      const autoReplyText = settings.auto_reply_text || "I'm currently busy. I'll get back to you soon.";

      // Find or create conversation for this user
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
            unread_count: 1,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError) {
          console.error(`Failed to create conversation for user ${userId}:`, createError);
          continue;
        }
        conversation = newConvo;
      } else {
        // Update existing conversation
        await supabase
          .from("conversations")
          .update({
            contact_name: contactName || conversation.contact_name,
            unread_count: (conversation.unread_count || 0) + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }

      // Store the incoming message
      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        user_id: userId,
        sender: "contact",
        content: text,
        message_type: messageType,
        urgency,
        is_auto_reply: false,
      });

      if (msgError) {
        console.error(`Failed to store message for user ${userId}:`, msgError);
      }

      // Send auto-reply if busy mode is on (only send once to avoid duplicate replies)
      let autoReplied = false;
      if (busyMode && !autoReplied) {
        // Don't auto-reply to emergency messages if emergency_notify is on
        if (urgency === "emergency" && settings.emergency_notify) {
          console.log("Emergency message — skipping auto-reply, user will be notified");
        } else {
          // Build the auto-reply text
          let replyText = autoReplyText;

          // If the message is urgent/important, acknowledge it
          if (urgency === "important") {
            replyText = `${autoReplyText} I've noted that your message seems important and will prioritize it.`;
          }

          // Send reply via Evolution API
          const evoBaseUrl = EVO_API_URL.endsWith("/") ? EVO_API_URL.slice(0, -1) : EVO_API_URL;
          try {
            const sendRes = await fetch(`${evoBaseUrl}/message/sendText/${EVO_BOT_NAME}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: EVO_API_KEY,
              },
              body: JSON.stringify({
                number: contactNumber,
                text: replyText,
                delay: 1500,
              }),
            });

            if (sendRes.ok) {
              await supabase.from("messages").insert({
                conversation_id: conversation.id,
                user_id: userId,
                sender: "bot",
                content: replyText,
                message_type: "text",
                urgency: "normal",
                is_auto_reply: true,
              });
              autoReplied = true;
              console.log("Auto-reply sent to", contactNumber);
            } else {
              const errText = await sendRes.text();
              console.error("Failed to send auto-reply:", sendRes.status, errText);
            }
          } catch (sendError) {
            console.error("Error sending auto-reply:", sendError);
          }
        }
      }

      results.push({
        user_id: userId,
        conversation_id: conversation.id,
        auto_replied: autoReplied,
      });
    } // end for loop

    return new Response(
      JSON.stringify({
        status: "ok",
        urgency,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ status: "error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
