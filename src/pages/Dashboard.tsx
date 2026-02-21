import { MessageSquare, Bot, AlertTriangle, Clock } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { BusyModeToggle } from "@/components/BusyModeToggle";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();

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
        <StatCard title="Messages Handled" value="128" icon={MessageSquare} trend="up" trendValue="12% this week" />
        <StatCard title="Auto Replies" value="94" icon={Bot} trend="up" trendValue="8% this week" />
        <StatCard title="Emergencies" value="3" icon={AlertTriangle} trend="down" trendValue="2 less than last week" />
        <StatCard title="Avg Response" value="1.2s" icon={Clock} trend="neutral" trendValue="Stable" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <BusyModeToggle />
        </div>

        <div className="glass rounded-xl p-6 lg:col-span-2">
          <h3 className="font-display text-lg font-semibold text-foreground">Recent Activity</h3>
          <div className="mt-4 space-y-3">
            {[
              { name: "John Doe", msg: "Hey, are you free for a call?", time: "2m ago", urgency: "normal" },
              { name: "Mom", msg: "🚨 Emergency! Please call me ASAP", time: "5m ago", urgency: "emergency" },
              { name: "Alex", msg: "Meeting tomorrow at 3pm?", time: "12m ago", urgency: "important" },
              { name: "Sarah", msg: "Thanks for the update!", time: "1h ago", urgency: "normal" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 rounded-lg bg-secondary/50 p-4 transition-colors hover:bg-secondary">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
                  {item.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
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
                  <p className="truncate text-xs text-muted-foreground">{item.msg}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
