import { useState } from "react";
import { Search, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";

const mockConversations = [
  { id: "1", contact: "John Doe", number: "+1234567890", lastMsg: "Sure, I'll check and get back to you", time: "2m ago", unread: 2 },
  { id: "2", contact: "Mom", number: "+0987654321", lastMsg: "🚨 Emergency! Call me ASAP", time: "5m ago", unread: 1 },
  { id: "3", contact: "Alex Smith", number: "+1122334455", lastMsg: "Meeting confirmed for 3pm", time: "12m ago", unread: 0 },
  { id: "4", contact: "Sarah Wilson", number: "+5566778899", lastMsg: "Thanks for the update!", time: "1h ago", unread: 0 },
  { id: "5", contact: "Team Lead", number: "+9988776655", lastMsg: "Please review the PR when you get a chance", time: "3h ago", unread: 3 },
];

const mockMessages = [
  { id: "m1", sender: "contact" as const, content: "Hey, are you available for a quick call?", time: "2:30 PM" },
  { id: "m2", sender: "bot" as const, content: "Hi! I'm currently busy but I'll get back to you soon. Is this urgent?", time: "2:30 PM" },
  { id: "m3", sender: "contact" as const, content: "Not urgent, just wanted to discuss the project timeline", time: "2:31 PM" },
  { id: "m4", sender: "bot" as const, content: "Got it! I'll make sure to reach out when I'm free. I'll pass along your message about the project timeline.", time: "2:31 PM" },
];

export default function Conversations() {
  const [selectedId, setSelectedId] = useState<string | null>("1");
  const [search, setSearch] = useState("");

  const filtered = mockConversations.filter(
    (c) => c.contact.toLowerCase().includes(search.toLowerCase()) || c.number.includes(search)
  );

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
                    {c.contact[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{c.contact}</span>
                      <span className="text-[10px] text-muted-foreground">{c.time}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.lastMsg}</p>
                  </div>
                  {c.unread > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full gradient-primary text-[10px] font-bold text-primary-foreground">
                      {c.unread}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="flex flex-1 flex-col">
          {selectedId ? (
            <>
              <div className="flex items-center gap-3 border-b border-border p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-display text-xs font-bold text-primary">
                  {filtered.find((c) => c.id === selectedId)?.contact[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {filtered.find((c) => c.id === selectedId)?.contact}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {filtered.find((c) => c.id === selectedId)?.number}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3">
                {mockMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === "bot" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                      msg.sender === "bot"
                        ? "bg-primary/10 text-foreground"
                        : "bg-secondary text-foreground"
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{msg.time}</p>
                    </div>
                  </div>
                ))}
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
