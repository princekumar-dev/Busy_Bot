import { useState, useEffect } from "react";
import { MessageSquare, Bot, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { BusyModeToggle } from "@/components/BusyModeToggle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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

interface RecentMessage {
  id: string;
  content: string;
  urgency: string | null;
  created_at: string;
  sender: string;
  contact_name: string | null;
  contact_number: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalMessages, setTotalMessages] = useState(0);
  const [autoReplies, setAutoReplies] = useState(0);
  const [emergencies, setEmergencies] = useState(0);
  const [avgResponseMs, setAvgResponseMs] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentMessage[]>([]);
  const [weekMsgCount, setWeekMsgCount] = useState(0);
  const [prevWeekMsgCount, setPrevWeekMsgCount] = useState(0);
  const [weekReplyCount, setWeekReplyCount] = useState(0);
  const [prevWeekReplyCount, setPrevWeekReplyCount] = useState(0);
  const [weekEmergCount, setWeekEmergCount] = useState(0);
  const [prevWeekEmergCount, setPrevWeekEmergCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      setLoading(true);

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // All messages for this user
      const { data: allMsgs } = await supabase
        .from("messages")
        .select("id, sender, is_auto_reply, urgency, created_at")
        .eq("user_id", user.id);

      const messages = allMsgs || [];
      const incomingMsgs = messages.filter((m) => m.sender === "contact");
      const botReplies = messages.filter((m) => m.is_auto_reply === true);
      const emergencyMsgs = messages.filter((m) => m.urgency === "emergency");

      setTotalMessages(incomingMsgs.length);
      setAutoReplies(botReplies.length);
      setEmergencies(emergencyMsgs.length);

      // This week vs last week — incoming messages
      const thisWeekMsgs = incomingMsgs.filter((m) => m.created_at >= weekAgo);
      const lastWeekMsgs = incomingMsgs.filter((m) => m.created_at >= twoWeeksAgo && m.created_at < weekAgo);
      setWeekMsgCount(thisWeekMsgs.length);
      setPrevWeekMsgCount(lastWeekMsgs.length);

      // This week vs last week — auto replies
      const thisWeekReplies = botReplies.filter((m) => m.created_at >= weekAgo);
      const lastWeekReplies = botReplies.filter((m) => m.created_at >= twoWeeksAgo && m.created_at < weekAgo);
      setWeekReplyCount(thisWeekReplies.length);
      setPrevWeekReplyCount(lastWeekReplies.length);

      // This week vs last week — emergencies
      const thisWeekEmerg = emergencyMsgs.filter((m) => m.created_at >= weekAgo);
      const lastWeekEmerg = emergencyMsgs.filter((m) => m.created_at >= twoWeeksAgo && m.created_at < weekAgo);
      setWeekEmergCount(thisWeekEmerg.length);
      setPrevWeekEmergCount(lastWeekEmerg.length);

      // Avg response time — calculate from paired incoming → bot reply
      const sortedMsgs = [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const responseTimes: number[] = [];
      for (let i = 0; i < sortedMsgs.length - 1; i++) {
        if (sortedMsgs[i].sender === "contact" && sortedMsgs[i + 1].is_auto_reply) {
          const diff =
            new Date(sortedMsgs[i + 1].created_at).getTime() -
            new Date(sortedMsgs[i].created_at).getTime();
          if (diff > 0 && diff < 60000) responseTimes.push(diff);
        }
      }
      if (responseTimes.length > 0) {
        setAvgResponseMs(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
      }

      // Recent activity — last 6 incoming messages with conversation info
      const { data: recentMsgs } = await supabase
        .from("messages")
        .select("id, content, urgency, created_at, sender, conversation_id")
        .eq("user_id", user.id)
        .eq("sender", "contact")
        .order("created_at", { ascending: false })
        .limit(6);

      if (recentMsgs && recentMsgs.length > 0) {
        // Get conversation details for each message
        const convoIds = [...new Set(recentMsgs.map((m) => m.conversation_id))];
        const { data: convos } = await supabase
          .from("conversations")
          .select("id, contact_name, contact_number")
          .in("id", convoIds);

        const convoMap = new Map((convos || []).map((c) => [c.id, c]));

        const enriched: RecentMessage[] = recentMsgs.map((m) => {
          const convo = convoMap.get(m.conversation_id);
          return {
            id: m.id,
            content: m.content,
            urgency: m.urgency,
            created_at: m.created_at,
            sender: m.sender,
            contact_name: convo?.contact_name || null,
            contact_number: convo?.contact_number || "",
          };
        });
        setRecentActivity(enriched);
      }

      setLoading(false);
    };

    fetchStats();

    // Realtime refresh
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const calcTrend = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return { trend: "neutral" as const, text: "No data yet" };
    if (previous === 0) return { trend: "up" as const, text: `${current} this week` };
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct > 0) return { trend: "up" as const, text: `${pct}% vs last week` };
    if (pct < 0) return { trend: "down" as const, text: `${Math.abs(pct)}% vs last week` };
    return { trend: "neutral" as const, text: "Same as last week" };
  };

  const msgTrend = calcTrend(weekMsgCount, prevWeekMsgCount);
  const replyTrend = calcTrend(weekReplyCount, prevWeekReplyCount);
  const emergTrend = calcTrend(weekEmergCount, prevWeekEmergCount);

  const formatAvgResponse = () => {
    if (avgResponseMs === null) return "—";
    if (avgResponseMs < 1000) return `${Math.round(avgResponseMs)}ms`;
    return `${(avgResponseMs / 1000).toFixed(1)}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Welcome back<span className="text-primary">.</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's what BusyBot has been up to.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Messages Handled" value={totalMessages} icon={MessageSquare} trend={msgTrend.trend} trendValue={msgTrend.text} />
        <StatCard title="Auto Replies" value={autoReplies} icon={Bot} trend={replyTrend.trend} trendValue={replyTrend.text} />
        <StatCard title="Emergencies" value={emergencies} icon={AlertTriangle} trend={emergTrend.trend} trendValue={emergTrend.text} />
        <StatCard title="Avg Response" value={formatAvgResponse()} icon={Clock} trend="neutral" trendValue={avgResponseMs !== null ? "Auto-reply speed" : "No replies yet"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <BusyModeToggle />
        </div>

        <div className="glass rounded-xl p-6 lg:col-span-2">
          <h3 className="font-display text-lg font-semibold text-foreground">Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Activity will appear once you receive WhatsApp messages.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-lg bg-secondary/50 p-4 transition-colors hover:bg-secondary">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
                    {(item.contact_name || item.contact_number)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{item.contact_name || item.contact_number}</p>
                      {item.urgency === "emergency" && (
                        <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider">
                          Emergency
                        </span>
                      )}
                      {item.urgency === "important" && (
                        <span className="rounded-full bg-chart-4/20 px-2 py-0.5 text-[10px] font-bold text-chart-4 uppercase tracking-wider">
                          Important
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{item.content}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
