// deno-lint-ignore-file
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async () => {
  const { data: settings } = await supabase.from("settings").select("user_id, busy_mode").limit(5);
  const { data: convos } = await supabase.from("conversations").select("id, user_id, contact_name, contact_number, unread_count").limit(10);
  const { data: msgs } = await supabase.from("messages").select("id, conversation_id, sender, content").limit(10);
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 5 });

  return new Response(JSON.stringify({
    settings,
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
