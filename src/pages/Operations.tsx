import { useEffect, useMemo, useState, useCallback } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Download, Pencil,
  RotateCcw, ScrollText, Search, ShieldAlert, Filter, X, RefreshCw, Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

/* ── types ── */
type EventRow = {
  id: string; stage: string; status: string; reason: string | null;
  risk_level: string | null; confidence_score: number | null;
  payload: any; conversation_id: string | null; message_id: string | null; created_at: string;
};
type ApprovalRow = {
  id: string; conversation_id: string; incoming_message: string;
  draft_reply: string; status: string; risk_level: string;
};
type EmergencyRow = { id: string; conversation_id: string; content: string; created_at: string; urgency: string | null; };

/* ── style maps ── */
const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  draft_only: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  blocked: "bg-red-500/15 text-red-400 border-red-500/30",
  needs_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  attention_required: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  escalate: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  emergency_escalation: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};
const RISK_BADGE: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-red-500/15 text-red-400 border-red-500/30",
};

const PAGE_SIZE = 20;

function fmtTs(d: string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Operations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // tab
  const [tab, setTab] = useState<"queue" | "log">("queue");

  // queue + emergencies
  const [queue, setQueue] = useState<ApprovalRow[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyRow[]>([]);
  const [attentionEvents, setAttentionEvents] = useState<EventRow[]>([]);
  const [busyMode, setBusyMode] = useState(false);
  const [editedReplies, setEditedReplies] = useState<Record<string, string>>({});

  // audit log
  const [events, setEvents] = useState<EventRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [logLoading, setLogLoading] = useState(false);

  /* ── debounce search ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  useEffect(() => { setPage(0); }, [statusFilter, riskFilter, debouncedSearch]);

  const [dbWarning, setDbWarning] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ── fetch queue data — resilient: each query fails independently ── */
  const fetchQueue = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Run all queries independently so one 404 doesn't break others
    const [qRes, mRes, sRes, eRes] = await Promise.all([
      supabase.from("approval_queue").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("messages").select("id,conversation_id,content,created_at,urgency").eq("user_id", user.id).eq("urgency", "emergency").order("created_at", { ascending: false }).limit(20),
      supabase.from("settings").select("busy_mode").eq("user_id", user.id).maybeSingle(),
      supabase.from("reply_events").select("*").eq("user_id", user.id).eq("status", "attention_required").order("created_at", { ascending: false }).limit(10),
    ]);

    // Flag if core tables are missing (404 = table doesn't exist yet)
    const missingTables = [qRes, eRes].some(r => (r.error as any)?.code === "42P01" || (r.error as any)?.message?.includes("does not exist") || r.status === 404);
    setDbWarning(missingTables);

    const pending = ((qRes.data as ApprovalRow[]) || []).filter(i => i.status === "pending");
    setQueue(pending);
    setEditedReplies(prev => {
      const next = { ...prev };
      pending.forEach(i => { if (!(i.id in next)) next[i.id] = i.draft_reply; });
      return next;
    });
    setEmergencies((mRes.data as EmergencyRow[]) || []);
    setBusyMode(!!(sRes.data as any)?.busy_mode);
    setAttentionEvents((eRes.data as EventRow[]) || []);
    setLoading(false);
  }, [user]);

  /* ── fetch audit log ── */
  const fetchLog = useCallback(async () => {
    if (!user) return;
    setLogLoading(true);
    let q = supabase.from("reply_events").select("*", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (riskFilter !== "all") q = q.eq("risk_level", riskFilter);
    if (debouncedSearch.trim()) q = q.ilike("reason", `%${debouncedSearch.trim()}%`);
    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data, count } = await q;
    setEvents((data as EventRow[]) || []);
    setTotalCount(count || 0);
    setLogLoading(false);
  }, [user, statusFilter, riskFilter, debouncedSearch, page]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useEffect(() => { if (tab === "log") fetchLog(); }, [tab, fetchLog]);

  /* ── realtime ── */
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("ops-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "approval_queue", filter: `user_id=eq.${user.id}` }, fetchQueue)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reply_events", filter: `user_id=eq.${user.id}` }, () => { fetchQueue(); if (tab === "log") fetchLog(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchQueue, fetchLog, tab]);

  /* ── helpers ── */
  const getReply = (item: ApprovalRow) => editedReplies[item.id] ?? item.draft_reply;
  const isEdited = (item: ApprovalRow) => { const c = editedReplies[item.id]; return c !== undefined && c !== item.draft_reply; };
  const setReply = (id: string, text: string) => setEditedReplies(p => ({ ...p, [id]: text }));

  const approve = async (item: ApprovalRow) => {
    if (!user) return;
    const body: any = { action: "approve", user_id: user.id, queue_id: item.id };
    if (isEdited(item)) body.edited_reply = getReply(item);
    const { error } = await supabase.functions.invoke("assistant-actions", { body });
    if (error) toast({ title: "Approve failed", description: error.message, variant: "destructive" });
    else toast({ title: isEdited(item) ? "Edited reply sent" : "Approved" });
    fetchQueue();
  };

  const reject = async (item: ApprovalRow) => {
    if (!user) return;
    await supabase.functions.invoke("assistant-actions", { body: { action: "reject", user_id: user.id, queue_id: item.id } });
    toast({ title: "Rejected" });
    fetchQueue();
  };

  const sendCallback = async (conversationId: string) => {
    if (!user) return;
    const { error } = await supabase.functions.invoke("assistant-actions", {
      body: { action: "quick_reply", user_id: user.id, conversation_id: conversationId, text: "This looks urgent. I've been informed and will get back to you soon." },
    });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else toast({ title: "Callback sent" });
    fetchQueue();
  };

  const exportCSV = () => {
    if (!events.length) return;
    const hdr = ["Timestamp", "Stage", "Status", "Risk", "Confidence", "Reason"];
    const rows = events.map(e => [e.created_at, e.stage, e.status, e.risk_level || "", e.confidence_score !== null ? Math.round(e.confidence_score * 100) + "%" : "", (e.reason || "").replace(/"/g, '""')]);
    const csv = hdr.join(",") + "\n" + rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `busybot-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasFilters = statusFilter !== "all" || riskFilter !== "all" || debouncedSearch.trim() !== "";
  const pendingCount = queue.length;
  const urgentCount = attentionEvents.length + emergencies.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">
            Operations<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Queue, emergencies &amp; audit trail</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status pill */}
          <div className={`rounded-full px-3 py-1 text-xs font-semibold ${busyMode ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {busyMode ? "● Busy" : "○ Off"}
          </div>
        </div>
      </div>

      {/* ── DB warning banner ── */}
      {dbWarning && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-400 text-base mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-300">Database tables missing</p>
            <p className="text-[11px] text-amber-200/70 mt-0.5">
              Some features need a schema update. Open <strong>Supabase → SQL Editor</strong> and run the file <code className="bg-amber-500/20 px-1 rounded">supabase/fix_missing_tables.sql</code> from your project folder.
            </p>
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-foreground">{pendingCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Pending</p>
        </div>
        <div className={`glass rounded-xl p-3 text-center ${urgentCount > 0 ? "border border-amber-500/30" : ""}`}>
          <p className={`font-display text-xl font-bold ${urgentCount > 0 ? "text-amber-400" : "text-foreground"}`}>{urgentCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Urgent</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-foreground">{totalCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Events</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl bg-secondary/60 p-1">
        <button
          onClick={() => setTab("queue")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${tab === "queue" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Queue {pendingCount > 0 && <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">{pendingCount}</span>}
        </button>
        <button
          onClick={() => setTab("log")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${tab === "log" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Audit Log
        </button>
      </div>

      {/* ══════════════ QUEUE TAB ══════════════ */}
      {tab === "queue" && (
        <div className="space-y-4">
          {/* Attention events */}
          {attentionEvents.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <p className="text-xs font-semibold text-amber-300">Needs Attention</p>
              </div>
              {attentionEvents.slice(0, 4).map(ev => (
                <button
                  key={ev.id}
                  onClick={() => ev.conversation_id && navigate(`/conversations?conversation=${ev.conversation_id}`)}
                  className="w-full rounded-lg bg-amber-500/10 p-2.5 text-left hover:bg-amber-500/15 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {ev.payload?.contact_name || ev.payload?.contact_number || "New chat"}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(ev.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {ev.payload?.incoming_preview || ev.reason || "BusyBot engaged this contact."}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Emergencies */}
          {emergencies.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <p className="text-xs font-semibold text-red-300">Emergencies</p>
              </div>
              {emergencies.slice(0, 5).map(msg => (
                <div key={msg.id} className="rounded-lg bg-red-500/10 p-2.5">
                  <p className="text-xs text-foreground line-clamp-2">{msg.content}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{timeAgo(msg.created_at)}</span>
                    <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => sendCallback(msg.conversation_id)}>
                      Quick reply
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Approval queue */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Approval Queue</p>
              <span className="text-xs text-muted-foreground">{pendingCount} pending</span>
            </div>

            {queue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">All clear — no drafts pending review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {queue.map(item => (
                  <div key={item.id} className="glass rounded-xl p-4 space-y-3">
                    {/* Incoming */}
                    <div className="flex items-start gap-2">
                      <p className="text-xs text-muted-foreground flex-1">
                        <span className="font-semibold text-foreground/80">Incoming: </span>
                        {item.incoming_message}
                      </p>
                      {item.risk_level && (
                        <Badge variant="outline" className={`shrink-0 text-[9px] font-semibold uppercase ${RISK_BADGE[item.risk_level] || ""}`}>
                          {item.risk_level}
                        </Badge>
                      )}
                    </div>

                    {/* Draft reply editor */}
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
                          <button onClick={() => setReply(item.id, item.draft_reply)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                            <RotateCcw className="h-3 w-3" /> Reset
                          </button>
                        )}
                      </div>
                      <Textarea
                        value={getReply(item)}
                        onChange={e => setReply(item.id, e.target.value)}
                        className="min-h-[56px] resize-none border-border bg-background/50 text-sm"
                        placeholder="Edit reply before approving..."
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approve(item)} className="flex-1 sm:flex-none gradient-primary text-primary-foreground glow gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {isEdited(item) ? "Send Edited" : "Approve"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => reject(item)} className="flex-1 sm:flex-none">Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ LOG TAB ══════════════ */}
      {tab === "log" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by reason..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 bg-secondary/50 border-border text-sm h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-36 border-border bg-secondary/50 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="draft_only">Draft only</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="attention_required">Attention</SelectItem>
                <SelectItem value="escalate">Escalated</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-9 w-full sm:w-28 border-border bg-secondary/50 text-xs"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risks</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1.5">
              {hasFilters && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setRiskFilter("all"); setSearchQuery(""); }} className="h-9 gap-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></Button>}
              <Button variant="outline" size="sm" onClick={fetchLog} className="h-9 gap-1"><RefreshCw className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={!events.length} className="h-9 gap-1"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">CSV</span></Button>
            </div>
          </div>

          {/* Events list */}
          {logLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-12 text-center">
              <ScrollText className="mx-auto h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">{hasFilters ? "No events match your filters" : "No events recorded yet"}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {events.map(ev => (
                <div key={ev.id} className="glass rounded-lg px-3 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{ev.stage.replace(/_/g, " → ")}</span>
                      <Badge variant="outline" className={`text-[9px] font-semibold uppercase tracking-wider shrink-0 ${STATUS_BADGE[ev.status] || "bg-secondary/50 text-muted-foreground"}`}>
                        {ev.status.replace(/_/g, " ")}
                      </Badge>
                      {ev.risk_level && (
                        <Badge variant="outline" className={`text-[9px] font-semibold uppercase tracking-wider shrink-0 ${RISK_BADGE[ev.risk_level] || ""}`}>
                          {ev.risk_level}
                        </Badge>
                      )}
                    </div>
                    {ev.reason && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{ev.reason}</p>}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTs(ev.created_at)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-8 px-3 text-xs">Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-8 px-3 text-xs">Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
