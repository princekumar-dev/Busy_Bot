import { useState, useEffect } from "react";
import { BarChart3, MessageSquare, Bot, Clock, AlertTriangle, Loader2, Users } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, AreaChart, Area } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DayBucket {
  day: string;
  messages: number;
  replies: number;
}

interface HourBucket {
  hour: string;
  volume: number;
}

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalMessages, setTotalMessages] = useState(0);
  const [totalAutoReplies, setTotalAutoReplies] = useState(0);
  const [totalEmergencies, setTotalEmergencies] = useState(0);
  const [totalImportant, setTotalImportant] = useState(0);
  const [totalNormal, setTotalNormal] = useState(0);
  const [avgResponseMs, setAvgResponseMs] = useState<number | null>(null);
  const [replyRate, setReplyRate] = useState(0);
  const [weeklyData, setWeeklyData] = useState<DayBucket[]>([]);
  const [hourlyData, setHourlyData] = useState<HourBucket[]>([]);
  const [uniqueContacts, setUniqueContacts] = useState(0);
  const [monthMsgTrend, setMonthMsgTrend] = useState({ trend: "neutral" as "up" | "down" | "neutral", text: "No data" });

  useEffect(() => {
    if (!user) return;

    const fetchAnalytics = async () => {
      setLoading(true);

      // ─── Fetch all messages ───
      const { data: allMsgs } = await supabase
        .from("messages")
        .select("id, sender, is_auto_reply, urgency, created_at, conversation_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      const messages = allMsgs || [];
      const incomingMsgs = messages.filter((m) => m.sender === "contact");
      const botReplies = messages.filter((m) => m.is_auto_reply === true);

      setTotalMessages(incomingMsgs.length);
      setTotalAutoReplies(botReplies.length);
      setReplyRate(incomingMsgs.length > 0 ? Math.round((botReplies.length / incomingMsgs.length) * 100) : 0);

      // Urgency breakdown
      const emergCount = incomingMsgs.filter((m) => m.urgency === "emergency").length;
      const importCount = incomingMsgs.filter((m) => m.urgency === "important").length;
      const normalCount = incomingMsgs.filter((m) => m.urgency === "normal" || !m.urgency).length;
      setTotalEmergencies(emergCount);
      setTotalImportant(importCount);
      setTotalNormal(normalCount);

      // Unique contacts
      const uniqueConvos = new Set(incomingMsgs.map((m) => m.conversation_id));
      setUniqueContacts(uniqueConvos.size);

      // Month trend
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const thisMonth = incomingMsgs.filter((m) => m.created_at >= monthAgo).length;
      const lastMonth = incomingMsgs.filter((m) => m.created_at >= twoMonthsAgo && m.created_at < monthAgo).length;
      if (lastMonth === 0 && thisMonth === 0) {
        setMonthMsgTrend({ trend: "neutral", text: "No data yet" });
      } else if (lastMonth === 0) {
        setMonthMsgTrend({ trend: "up", text: `${thisMonth} this month` });
      } else {
        const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
        setMonthMsgTrend({
          trend: pct >= 0 ? "up" : "down",
          text: `${Math.abs(pct)}% ${pct >= 0 ? "more" : "fewer"} this month`,
        });
      }

      // ─── Avg response time ───
      const responseTimes: number[] = [];
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].sender === "contact" && messages[i + 1].is_auto_reply) {
          const diff =
            new Date(messages[i + 1].created_at).getTime() -
            new Date(messages[i].created_at).getTime();
          if (diff > 0 && diff < 60000) responseTimes.push(diff);
        }
      }
      if (responseTimes.length > 0) {
        setAvgResponseMs(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
      }

      // ─── Weekly chart data (last 7 days) ───
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weekly: DayBucket[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

        const dayMsgs = incomingMsgs.filter((m) => m.created_at >= dayStart && m.created_at < dayEnd).length;
        const dayReplies = botReplies.filter((m) => m.created_at >= dayStart && m.created_at < dayEnd).length;

        weekly.push({
          day: dayNames[d.getDay()],
          messages: dayMsgs,
          replies: dayReplies,
        });
      }
      setWeeklyData(weekly);

      // ─── Hourly chart data (last 24 hours) ───
      const hourly: HourBucket[] = [];
      for (let h = 0; h < 24; h++) {
        const hourStart = new Date(now);
        hourStart.setHours(h, 0, 0, 0);
        const hourEnd = new Date(now);
        hourEnd.setHours(h + 1, 0, 0, 0);

        // Only count today's messages for the hourly chart
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayMsgs = incomingMsgs.filter((m) => {
          const t = new Date(m.created_at);
          return t >= today && t.getHours() === h;
        });

        hourly.push({
          hour: `${h}:00`,
          volume: todayMsgs.length,
        });
      }
      setHourlyData(hourly);

      setLoading(false);
    };

    fetchAnalytics();
  }, [user]);

  const formatAvgResponse = () => {
    if (avgResponseMs === null) return "—";
    if (avgResponseMs < 1000) return `${Math.round(avgResponseMs)}ms`;
    return `${(avgResponseMs / 1000).toFixed(1)}s`;
  };

  const totalIncoming = totalNormal + totalImportant + totalEmergencies;
  const normalPct = totalIncoming > 0 ? Math.round((totalNormal / totalIncoming) * 100) : 0;
  const importantPct = totalIncoming > 0 ? Math.round((totalImportant / totalIncoming) * 100) : 0;
  const emergencyPct = totalIncoming > 0 ? Math.round((totalEmergencies / totalIncoming) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Analytics<span className="text-primary">.</span>
          </h1>
          <p className="text-sm text-muted-foreground">BusyBot performance insights</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Messages" value={totalMessages} icon={MessageSquare} trend={monthMsgTrend.trend} trendValue={monthMsgTrend.text} />
        <StatCard title="Auto Replies" value={totalAutoReplies} icon={Bot} trend="up" trendValue={`${replyRate}% reply rate`} />
        <StatCard title="Avg Response" value={formatAvgResponse()} icon={Clock} trend="neutral" trendValue={avgResponseMs !== null ? "Auto-reply speed" : "No data yet"} />
        <StatCard title="Unique Contacts" value={uniqueContacts} icon={Users} trend="neutral" trendValue={`${totalEmergencies} emergencies`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-xl p-6">
          <h3 className="font-display text-lg font-semibold text-foreground mb-4">Last 7 Days</h3>
          {weeklyData.every((d) => d.messages === 0 && d.replies === 0) ? (
            <div className="flex flex-col items-center justify-center h-[280px] text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No message data for the past week</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                <XAxis dataKey="day" stroke="hsl(220 10% 50%)" fontSize={12} />
                <YAxis stroke="hsl(220 10% 50%)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(220 18% 7%)",
                    border: "1px solid hsl(220 14% 16%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(0 0% 95%)" }}
                />
                <Bar dataKey="messages" fill="hsl(220 14% 20%)" radius={[4, 4, 0, 0]} name="Messages" />
                <Bar dataKey="replies" fill="hsl(142 72% 50%)" radius={[4, 4, 0, 0]} name="Auto Replies" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-xl p-6">
          <h3 className="font-display text-lg font-semibold text-foreground mb-4">Today's Message Volume</h3>
          {hourlyData.every((d) => d.volume === 0) ? (
            <div className="flex flex-col items-center justify-center h-[280px] text-center">
              <Clock className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No messages received today</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                <XAxis dataKey="hour" stroke="hsl(220 10% 50%)" fontSize={10} interval={3} />
                <YAxis stroke="hsl(220 10% 50%)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(220 18% 7%)",
                    border: "1px solid hsl(220 14% 16%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 72% 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142 72% 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="volume" stroke="hsl(142 72% 50%)" fill="url(#colorVolume)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Urgency Breakdown */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-display text-lg font-semibold text-foreground mb-4">Urgency Classification</h3>
        {totalIncoming === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No messages to classify yet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Normal", count: totalNormal, pct: normalPct, color: "bg-primary" },
              { label: "Important", count: totalImportant, pct: importantPct, color: "bg-chart-4" },
              { label: "Emergency", count: totalEmergencies, pct: emergencyPct, color: "bg-destructive" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-secondary/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="font-display text-lg font-bold text-foreground">{item.count}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div className={`h-2 rounded-full ${item.color} transition-all`} style={{ width: `${item.pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.pct}% of total</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
