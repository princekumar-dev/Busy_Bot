import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue }: StatCardProps) {
  return (
    <div className="glass rounded-xl p-3 sm:p-6 transition-all hover:glow">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-sm text-muted-foreground truncate">{title}</p>
          <p className="mt-1 sm:mt-2 font-display text-2xl sm:text-3xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          {trendValue && (
            <p className={`mt-1 sm:mt-2 text-[10px] sm:text-xs font-medium ${
              trend === "up" ? "text-primary" : trend === "down" ? "text-destructive" : "text-muted-foreground"
            }`}>
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-primary/10 p-2 sm:p-3 ml-2 shrink-0">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
