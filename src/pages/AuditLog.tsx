import { useEffect, useState, useCallback } from "react";
import { ScrollText, Search, Download, ChevronLeft, ChevronRight, X, Filter, RefreshCw, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

type AuditEvent = {
  id: string; stage: string; status: string; reason: string | null;
  risk_level: string | null; confidence_score: number | null;
  conversation_id: string | null; message_id: string | null;
  payload: any; created_at: string;
};

const PAGE_SIZE = 25;

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  draft_only: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  blocked: "bg-red-500/15 text-red-400 border-red-500/30",
  needs_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  attention_required: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  escalate: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  emergency_escalation: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-red-500/15 text-red-400 border-red-500/30",
};

function fmtTs(d: string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtFull(d: string) {
  return new Date(d).toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
}

export default function AuditLog() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchQuery), 300); return () => clearTimeout(t); }, [searchQuery]);
  useEffect(() => { setPage(0); }, [statusFilter, riskFilter, debouncedSearch]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("reply_events").select("*", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (riskFilter !== "all") q = q.eq("risk_level", riskFilter);
    if (debouncedSearch.trim()) q = q.ilike("reason", `%${debouncedSearch.trim()}%`);
    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data, count } = await q;
    setEvents((data as AuditEvent[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [user, statusFilter, riskFilter, debouncedSearch, page]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("audit-log-rt").on("postgres_changes", { event: "INSERT", schema: "public", table: "reply_events", filter: `user_id=eq.${user.id}` }, () => fetchEvents()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchEvents]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasFilters = statusFilter !== "all" || riskFilter !== "all" || debouncedSearch.trim() !== "";

  const clearFilters = () => { setStatusFilter("all"); setRiskFilter("all"); setSearchQuery(""); };

  const exportCSV = () => {
    if (!events.length) return;
    const hdr = ["Timestamp","Stage","Status","Risk","Confidence","Reason","ConversationID","MessageID"];
    const rows = events.map(e => [e.created_at, e.stage, e.status, e.risk_level||"", e.confidence_score!==null?Math.round(e.confidence_score*100)+"%":"", (e.reason||"").replace(/"/g,'""'), e.conversation_id||"", e.message_id||""]);
    const csv = hdr.join(",")+"\n"+rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = `busybot-audit-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div className="animate-slide-up space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><ScrollText className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Audit Log<span className="text-primary">.</span></h1>
            <p className="text-sm text-muted-foreground">Complete trail of every BusyBot decision</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchEvents} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!events.length} className="gap-1.5"><Download className="h-3.5 w-3.5" />Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Total Events", totalCount], ["Filtered", hasFilters ? events.length : totalCount], ["Page", totalPages > 0 ? `${page+1}/${totalPages}` : "—"], ["Per Page", PAGE_SIZE]].map(([l,v]) => (
          <div key={String(l)} className="rounded-xl bg-secondary/60 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{String(l)}</p>
            <p className="font-display text-lg font-bold text-foreground">{String(v)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center">
        <Filter className="hidden h-4 w-4 text-muted-foreground sm:block" />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by reason..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-secondary/50 border-border text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 border-border bg-secondary/50"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="draft_only">Draft only</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            <SelectItem value="attention_required">Attention required</SelectItem>
            <SelectItem value="escalate">Escalated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-full sm:w-36 border-border bg-secondary/50"><SelectValue placeholder="Risk" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risks</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" />Clear</Button>}
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ScrollText className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">{hasFilters ? "No events match your filters" : "No audit events recorded yet"}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{hasFilters ? "Try adjusting your filters" : "Events will appear here as BusyBot processes messages."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-xs font-semibold text-muted-foreground">Timestamp</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Stage</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Confidence</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground min-w-[200px]">Reason</TableHead>
                  <TableHead className="text-xs w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map(ev => (
                  <TableRow key={ev.id} className="cursor-pointer border-border transition-colors hover:bg-secondary/40" onClick={() => { setSelectedEvent(ev); setDrawerOpen(true); }}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtTs(ev.created_at)}</TableCell>
                    <TableCell className="text-xs font-medium text-foreground whitespace-nowrap">{ev.stage.replace(/_/g, " → ")}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLORS[ev.status]||"bg-secondary/50 text-muted-foreground"}`}>{ev.status.replace(/_/g," ")}</Badge></TableCell>
                    <TableCell>{ev.risk_level && <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${RISK_COLORS[ev.risk_level]||""}`}>{ev.risk_level}</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ev.confidence_score!==null?`${Math.round(ev.confidence_score*100)}%`:"—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{ev.reason||"—"}</TableCell>
                    <TableCell><Info className="h-3.5 w-3.5 text-muted-foreground/50" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Showing {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE, totalCount)} of {totalCount}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(p=>p-1)} className="gap-1"><ChevronLeft className="h-3.5 w-3.5" />Previous</Button>
            <Button variant="outline" size="sm" disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)} className="gap-1">Next<ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="border-border bg-background w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle className="font-display text-lg">Event Detail</SheetTitle></SheetHeader>
          {selectedEvent && (
            <div className="mt-6 space-y-5">
              {([["Timestamp", fmtFull(selectedEvent.created_at)], ["Stage", selectedEvent.stage.replace(/_/g," → ")], ["Reason", selectedEvent.reason||"No reason provided"], ["Conversation ID", selectedEvent.conversation_id||"—"], ["Message ID", selectedEvent.message_id||"—"]] as const).map(([l,v])=>(
                <div key={l}><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{l}</p><p className="text-sm text-foreground">{v}</p></div>
              ))}
              <div><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Status</p><Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLORS[selectedEvent.status]||""}`}>{selectedEvent.status.replace(/_/g," ")}</Badge></div>
              <div><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Risk Level</p>{selectedEvent.risk_level ? <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${RISK_COLORS[selectedEvent.risk_level]||""}`}>{selectedEvent.risk_level}</Badge> : <span className="text-sm text-muted-foreground">—</span>}</div>
              <div><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Confidence</p><p className="text-sm text-foreground">{selectedEvent.confidence_score!==null?`${Math.round(selectedEvent.confidence_score*100)}%`:"—"}</p></div>
              {selectedEvent.payload && <div><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Raw Payload</p><pre className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground overflow-auto max-h-60 font-mono">{JSON.stringify(selectedEvent.payload,null,2)}</pre></div>}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
