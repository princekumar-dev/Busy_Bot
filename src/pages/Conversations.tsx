import { useState, useEffect } from "react";
import { Search, MessageSquare, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Conversation {
  id: string;
  contact_name: string | null;
  contact_number: string;
  last_message_at: string | null;
  unread_count: number | null;
  created_at: string;
}

interface Message {
  id: string;
  sender: "contact" | "bot" | "user";
  content: string;
  created_at: string;
  is_auto_reply: boolean | null;
  urgency: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Conversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});

  // Fetch conversations from Supabase
  useEffect(() => {
    if (!user) return;

    const fetchConversations = async () => {
      setLoadingConvos(true);
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) {
        console.error("Error fetching conversations:", error);
      } else {
        setConversations(data || []);

        // Fetch the last message for each conversation
        const msgMap: Record<string, string> = {};
        for (const convo of data || []) {
          const { data: msgData } = await supabase
            .from("messages")
            .select("content")
            .eq("conversation_id", convo.id)
            .order("created_at", { ascending: false })
            .limit(1);
          if (msgData && msgData.length > 0) {
            msgMap[convo.id] = msgData[0].content;
          }
        }
        setLastMessages(msgMap);

        // Auto-select the first conversation
        if (data && data.length > 0 && !selectedId) {
          setSelectedId(data[0].id);
        }
      }
      setLoadingConvos(false);
    };

    fetchConversations();

    // Subscribe to realtime changes on conversations
    const channel = supabase
      .channel("conversations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch messages when a conversation is selected
  useEffect(() => {
    if (!selectedId || !user) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMsgs(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
      } else {
        setMessages((data as Message[]) || []);
      }
      setLoadingMsgs(false);

      // Mark conversation as read
      await supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", selectedId);
    };

    fetchMessages();

    // Subscribe to realtime new messages in this conversation
    const channel = supabase
      .channel(`messages-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, user]);

  const filtered = conversations.filter(
    (c) =>
      (c.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
      c.contact_number.includes(search)
  );

  const selectedConvo = conversations.find((c) => c.id === selectedId);

  return (
    <div className="animate-slide-up">
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">
        Conversations<span className="text-primary">.</span>
      </h1>

      <div className="glass rounded-xl overflow-hidden flex" style={{ height: "calc(100vh - 200px)" }}>
        {/* List */}
        <div className="w-80 shrink-0 border-r border-border overflow-auto">
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-secondary/50 border-border text-sm"
              />
            </div>
          </div>

          {loadingConvos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "No conversations match your search" : "No conversations yet"}
              </p>
              {!search && (
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Conversations will appear here once messages are received via WhatsApp.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full p-4 text-left transition-colors hover:bg-secondary/50 ${
                    selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
                      {(c.contact_name || c.contact_number)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {c.contact_name || c.contact_number}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {c.last_message_at ? timeAgo(c.last_message_at) : ""}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {lastMessages[c.id] || c.contact_number}
                      </p>
                    </div>
                    {(c.unread_count ?? 0) > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full gradient-primary text-[10px] font-bold text-primary-foreground">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="flex flex-1 flex-col">
          {selectedConvo ? (
            <>
              <div className="flex items-center gap-3 border-b border-border p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-display text-xs font-bold text-primary">
                  {(selectedConvo.contact_name || selectedConvo.contact_number)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedConvo.contact_name || selectedConvo.contact_number}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedConvo.contact_number}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === "bot" || msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        msg.sender === "bot" || msg.sender === "user"
                          ? "bg-primary/10 text-foreground"
                          : "bg-secondary text-foreground"
                      }`}>
                        <p className="text-sm">{msg.content}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <p className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</p>
                          {msg.is_auto_reply && (
                            <span className="text-[9px] text-primary/70 font-medium">• auto-reply</span>
                          )}
                          {msg.urgency === "emergency" && (
                            <span className="text-[9px] text-red-400 font-medium">• 🚨 emergency</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">Select a conversation</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
