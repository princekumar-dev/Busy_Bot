import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Download, ShieldAlert, Trash2, ScrollText, Pencil, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

type EventRow = {
  id: string;
  stage: string;
  status: string;
  reason: string | null;
  risk_level: string | null;
  confidence_score: number | null;
  payload: any;
  conversation_id: string | null;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  conversation_id: string;
  incoming_message: string;
  draft_reply: string;
  status: string;
  risk_level: string;
};

type EmergencyRow = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  urgency: string | null;
};

type ContactRule = {
  id: string;
  contact_number: string;
  relationship_style: string;
  emoji_level: string;
  max_reply_words: number;
  language_preference: string;
};

const EVENT_LABELS: Record<string, string> = {
  sent: "sent",
  draft_only: "draft-only",
  blocked: "blocked",
  needs_review: "needs review",
  attention_required: "attention required",
  escalate: "emergency",
  emergency_escalation: "emergency",
};

const RISK_BADGE: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-red-500/15 text-red-400 border-red-500/30",
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  draft_only: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  blocked: "bg-red-500/15 text-red-400 border-red-500/30",
  needs_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  attention_required: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  escalate: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  emergency_escalation: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function Operations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [queue, setQueue] = useState<ApprovalRow[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyRow[]>([]);
  const [rules, setRules] = useState<ContactRule[]>([]);
  const [busyMode, setBusyMode] = useState(false);
  const [shadowMode, setShadowMode] = useState(false);
  const [contactNumber, setContactNumber] = useState("");
  const [retentionDays, setRetentionDays] = useState(90);
  const [newRule, setNewRule] = useState({
    relationship_style: "friend",
    emoji_level: "moderate",
    max_reply_words: 24,
    language_preference: "auto",
  });

  // Edit-before-approve state: track edited text per queue item
  const [editedReplies, setEditedReplies] = useState<Record<string, string>>({});

  const setEditedReply = (id: string, text: string) => {
    setEditedReplies((prev) => ({ ...prev, [id]: text }));
  };

  const resetReply = (item: ApprovalRow) => {
    setEditedReplies((prev) => ({ ...prev, [item.id]: item.draft_reply }));
  };

  const isEdited = (item: ApprovalRow) => {
    const current = editedReplies[item.id];
    return current !== undefined && current !== item.draft_reply;
  };

  const getReplyText = (item: ApprovalRow) => {
    return editedReplies[item.id] ?? item.draft_reply;
  };

  const fetchAll = async () => {
    if (!user) return;
    const [e, q, m, s, r, d] = await Promise.all([
      supabase.from("reply_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("approval_queue").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("messages").select("id,conversation_id,content,created_at,urgency").eq("user_id", user.id).eq("urgency", "emergency").order("created_at", { ascending: false }).limit(50),
      supabase.from("settings").select("busy_mode,busy_test_mode").eq("user_id", user.id).single(),
      supabase.from("contact_rules").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.from("user_data_controls").select("data_retention_days").eq("user_id", user.id).single(),
    ]);

    setEvents((e.data as EventRow[]) || []);
    const pendingQueue = ((q.data as ApprovalRow[]) || []).filter((item) => item.status === "pending");
    setQueue(pendingQueue);
    // Initialize edited replies for new queue items
    setEditedReplies((prev) => {
      const next = { ...prev };
      pendingQueue.forEach((item) => {
        if (!(item.id in next)) {
          next[item.id] = item.draft_reply;
        }
      });
      return next;
    });
    setEmergencies((m.data as EmergencyRow[]) || []);
    setBusyMode(!!s.data?.busy_mode);
    setShadowMode(!!s.data?.busy_test_mode);
    setRules((r.data as ContactRule[]) || []);
    setRetentionDays(d.data?.data_retention_days || 90);
  };

  useEffect(() => {
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const queueHealth = useMemo(() => {
    const pending = queue.length;
    if (pending === 0) return "Healthy";
    if (pending < 5) return "Moderate";
    return "High backlog";
  }, [queue.length]);

  const attentionEvents = useMemo(
    () => events.filter((event) => event.status === "attention_required"),
    [events]
  );

  const approve = async (item: ApprovalRow) => {
    if (!user) return;
    const editedText = getReplyText(item);
    const body: any = { action: "approve", user_id: user.id, queue_id: item.id };
    // Send edited_reply if user changed the draft
    if (editedText !== item.draft_reply) {
      body.edited_reply = editedText;
    }
    const { error } = await supabase.functions.invoke("assistant-actions", { body });
    if (error) toast({ title: "Approve failed", description: error.message, variant: "destructive" });
    else toast({ title: "Approved", description: isEdited(item) ? "Edited reply sent successfully." : "Reply sent successfully." });
    fetchAll();
  };

  const reject = async (item: ApprovalRow) => {
    if (!user) return;
    await supabase.functions.invoke("assistant-actions", {
      body: { action: "reject", user_id: user.id, queue_id: item.id, review_note: "Rejected manually" },
    });
    fetchAll();
  };

  const sendEmergencyCallback = async (conversationId: string) => {
    if (!user) return;
    const { error } = await supabase.functions.invoke("assistant-actions", {
      body: { action: "quick_reply", user_id: user.id, conversation_id: conversationId, text: "This looks urgent. I have informed the user and they will get back to you soon." },
    });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else toast({ title: "Sent", description: "Urgent callback message sent." });
    fetchAll();
  };

  const saveRule = async () => {
    if (!user || !contactNumber.trim()) return;
    await supabase.from("contact_rules").upsert({
      user_id: user.id,
      contact_number: contactNumber.trim(),
      ...newRule,
    }, { onConflict: "user_id,contact_number" });
    setContactNumber("");
    fetchAll();
  };

  const saveRetention = async () => {
    if (!user) return;
    await supabase.from("user_data_controls").upsert({ user_id: user.id, data_retention_days: retentionDays }, { onConflict: "user_id" });
    toast({ title: "Saved", description: "Data retention updated." });
  };

  const exportData = async () => {
    if (!user) return;
    const { data, error } = await supabase.functions.invoke("assistant-actions", {
      body: { action: "export_data", user_id: user.id },
    });
    if (error) return toast({ title: "Export failed", description: error.message, variant: "destructive" });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `busybot-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  const deleteData = async () => {
    if (!user) return;
    await supabase.functions.invoke("assistant-actions", {
      body: { action: "delete_data", user_id: user.id },
    });
    toast({ title: "Deleted", description: "Your synced assistant data has been removed." });
    fetchAll();
  };

  return (
    <div className="animate-slide-up space-y-6">
      <h1 className="font-display text-2xl font-bold text-foreground">Operations<span className="text-primary">.</span></h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className={`rounded-xl p-4 ${busyMode ? "bg-primary/15" : "bg-secondary/60"}`}>
          <p className="text-xs text-muted-foreground">Assistant Mode</p>
          <p className="font-semibold">{busyMode ? "Busy Active" : "Draft/Observe"}</p>
        </div>
        <div className={`rounded-xl p-4 ${shadowMode ? "bg-amber-500/15" : "bg-secondary/60"}`}>
          <p className="text-xs text-muted-foreground">Shadow Test</p>
          <p className="font-semibold">{shadowMode ? "ON (draft-only)" : "OFF"}</p>
        </div>
        <div className="rounded-xl bg-secondary/60 p-4">
          <p className="text-xs text-muted-foreground">Queue Health</p>
          <p className="font-semibold">{queueHealth}</p>
        </div>
        <div className={`rounded-xl p-4 ${attentionEvents.length ? "bg-amber-500/15" : "bg-secondary/60"}`}>
          <p className="text-xs text-muted-foreground">Attention Required</p>
          <p className="font-semibold">{attentionEvents.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className="font-semibold">Attention Required</h2>
            </div>
            <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">
              {attentionEvents.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {attentionEvents.length === 0 && <p className="text-sm text-muted-foreground">No chats need attention.</p>}
            {attentionEvents.slice(0, 6).map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => event.conversation_id && navigate(`/conversations?conversation=${event.conversation_id}`)}
                className="w-full rounded-lg bg-amber-500/10 p-3 text-left transition-colors hover:bg-amber-500/15"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {event.payload?.contact_name || event.payload?.contact_number || "New chat"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {event.payload?.incoming_preview || event.reason || "BusyBot engaged this contact."}
                </p>
              </button>
            ))}
          </div>
        </div>
        {/* Compact Audit Summary — replaces the old large Reply Transparency section */}
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Recent Activity</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/audit-log")} className="gap-1 text-xs text-primary hover:text-primary">
              View full Audit Log →
            </Button>
          </div>
          <div className="space-y-2">
            {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
            {events.slice(0, 5).map((event) => (
              <div key={event.id} className="rounded-lg bg-secondary/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{event.stage.replace("_", " → ")}</span>
                  <Badge variant="outline" className={`text-[9px] font-semibold uppercase tracking-wider ${STATUS_BADGE[event.status] || "bg-secondary/50 text-muted-foreground"}`}>
                    {EVENT_LABELS[event.status] || event.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.reason || "No reason"} • risk: {event.risk_level || "low"} • confidence: {event.confidence_score ? `${Math.round(event.confidence_score * 100)}%` : "n/a"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Approval Queue — with edit-before-approve */}
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Approval Queue</h2>
            <span className="text-xs text-muted-foreground">{queue.length} pending</span>
          </div>
          <div className="space-y-3">
            {queue.length === 0 && <p className="text-sm text-muted-foreground">No risky drafts pending.</p>}
            {queue.map((item) => (
              <div key={item.id} className="rounded-lg bg-secondary/40 p-4 space-y-3">
                {/* Incoming message */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted-foreground flex-1">
                    <span className="font-semibold text-foreground/80">Incoming:</span> {item.incoming_message}
                  </p>
                  {item.risk_level && (
                    <Badge variant="outline" className={`shrink-0 text-[9px] font-semibold uppercase tracking-wider ${RISK_BADGE[item.risk_level] || ""}`}>
                      {item.risk_level} risk
                    </Badge>
                  )}
                </div>

                {/* Editable draft reply */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Draft Reply</span>
                      {isEdited(item) && (
                        <span className="rounded-full bg-amber-500/15 text-amber-400 px-1.5 py-0.5 text-[9px] font-semibold">edited</span>
                      )}
                    </div>
                    {isEdited(item) && (
                      <button onClick={() => resetReply(item)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </button>
                    )}
                  </div>
                  <Textarea
                    value={getReplyText(item)}
                    onChange={(e) => setEditedReply(item.id, e.target.value)}
                    className="min-h-[60px] resize-none border-border bg-background/50 text-sm"
                    placeholder="Edit the reply before approving..."
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {getReplyText(item).length} chars
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approve(item)} className="gap-1 gradient-primary text-primary-foreground glow">
                    <CheckCircle2 className="h-3 w-3" />
                    {isEdited(item) ? "Approve Edited" : "Approve"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => reject(item)}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Emergency Panel</h2>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </div>
          <div className="space-y-2">
            {emergencies.length === 0 && <p className="text-sm text-muted-foreground">No emergencies right now.</p>}
            {emergencies.slice(0, 10).map((message) => (
              <div key={message.id} className="rounded-lg bg-red-500/10 p-3">
                <p className="text-sm">{message.content}</p>
                <Button size="sm" className="mt-2" onClick={() => sendEmergencyCallback(message.conversation_id)}>
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  One-tap callback
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <h2 className="mb-3 font-semibold">Tone Presets + Contact Rules</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="Contact number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
            <Select value={newRule.relationship_style} onValueChange={(v) => setNewRule((p) => ({ ...p, relationship_style: v }))}>
              <SelectTrigger><SelectValue placeholder="Relationship" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="family">Family</SelectItem>
                <SelectItem value="friend">Friend</SelectItem>
                <SelectItem value="work">Work</SelectItem>
              </SelectContent>
            </Select>
            <Select value={newRule.emoji_level} onValueChange={(v) => setNewRule((p) => ({ ...p, emoji_level: v }))}>
              <SelectTrigger><SelectValue placeholder="Emoji level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="heavy">Heavy</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" min={5} max={80} value={newRule.max_reply_words} onChange={(e) => setNewRule((p) => ({ ...p, max_reply_words: Number(e.target.value) }))} />
            <Select value={newRule.language_preference} onValueChange={(v) => setNewRule((p) => ({ ...p, language_preference: v }))}>
              <SelectTrigger><SelectValue placeholder="Language" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="hinglish">Hinglish</SelectItem>
                <SelectItem value="tanglish">Tanglish</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="mt-3" onClick={saveRule}>Save rule</Button>
          <div className="mt-3 space-y-1">
            {rules.slice(0, 6).map((rule) => (
              <p key={rule.id} className="text-xs text-muted-foreground">
                {rule.contact_number}{" -> "}{rule.relationship_style}, emoji {rule.emoji_level}, {rule.max_reply_words} words, {rule.language_preference}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        <h2 className="mb-3 font-semibold">Safety & Compliance</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Data retention days</p>
            <Input type="number" min={7} max={365} value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value))} />
            <Button size="sm" variant="secondary" className="mt-2" onClick={saveRetention}>
              <Clock3 className="mr-1 h-3 w-3" />
              Save retention
            </Button>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={exportData}><Download className="mr-1 h-3 w-3" />Export data</Button>
          </div>
          <div className="flex items-end">
            <Button variant="destructive" onClick={deleteData}><Trash2 className="mr-1 h-3 w-3" />Delete my data</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
