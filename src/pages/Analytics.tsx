import { BarChart3, TrendingUp, MessageSquare, Bot, Clock, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, AreaChart, Area } from "recharts";

const weeklyData = [
  { day: "Mon", messages: 18, replies: 14 },
  { day: "Tue", messages: 24, replies: 20 },
  { day: "Wed", messages: 31, replies: 28 },
  { day: "Thu", messages: 22, replies: 19 },
  { day: "Fri", messages: 35, replies: 30 },
  { day: "Sat", messages: 12, replies: 10 },
  { day: "Sun", messages: 8, replies: 6 },
];

const hourlyData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  volume: Math.floor(Math.random() * 15) + (i >= 9 && i <= 17 ? 10 : 2),
}));

export default function Analytics() {
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
        <StatCard title="Total Messages" value="1,284" icon={MessageSquare} trend="up" trendValue="23% this month" />
        <StatCard title="Auto Replies" value="1,087" icon={Bot} trend="up" trendValue="84% reply rate" />
        <StatCard title="Avg Response" value="0.8s" icon={Clock} trend="up" trendValue="0.3s faster" />
        <StatCard title="Emergencies" value="12" icon={AlertTriangle} trend="down" trendValue="4 fewer" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-xl p-6">
          <h3 className="font-display text-lg font-semibold text-foreground mb-4">Weekly Overview</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
              <XAxis dataKey="day" stroke="hsl(220 10% 50%)" fontSize={12} />
              <YAxis stroke="hsl(220 10% 50%)" fontSize={12} />
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
        </div>

        <div className="glass rounded-xl p-6">
          <h3 className="font-display text-lg font-semibold text-foreground mb-4">Message Volume (24h)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
              <XAxis dataKey="hour" stroke="hsl(220 10% 50%)" fontSize={10} interval={3} />
              <YAxis stroke="hsl(220 10% 50%)" fontSize={12} />
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
        </div>
      </div>

      {/* Urgency Breakdown */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-display text-lg font-semibold text-foreground mb-4">Urgency Classification</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Normal", count: 1105, pct: 86, color: "bg-primary" },
            { label: "Important", count: 167, pct: 13, color: "bg-chart-4" },
            { label: "Emergency", count: 12, pct: 1, color: "bg-destructive" },
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
      </div>
    </div>
  );
}
