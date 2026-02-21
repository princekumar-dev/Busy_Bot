import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Bot, ArrowRight, Zap, Shield, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">
            Busy<span className="text-primary">Bot</span>
          </span>
        </div>
        <Link to="/auth">
          <Button variant="outline" className="font-display text-sm border-border text-foreground hover:bg-secondary">
            Sign In
          </Button>
        </Link>
      </nav>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-32 text-center lg:pt-36">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground mb-8">
          <Zap className="h-3 w-3 text-primary" />
          AI-Powered WhatsApp Assistant
        </div>

        <h1 className="font-display text-5xl font-extrabold leading-tight text-foreground lg:text-7xl">
          Never miss a<br />
          message<span className="text-primary glow-text">.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-lg text-lg text-muted-foreground">
          BusyBot analyzes, classifies, and replies to your WhatsApp messages with your personality — while you focus on what matters.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <Link to="/auth">
            <Button className="gradient-primary font-display font-semibold text-primary-foreground glow px-8 py-6 text-base">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: Brain, title: "Personality AI", desc: "Learns your tone, style, and common phrases to reply just like you" },
            { icon: Shield, title: "Smart Urgency", desc: "Classifies messages as normal, important, or emergency in real-time" },
            { icon: Zap, title: "Instant Replies", desc: "Sub-second response times with voice message support" },
          ].map((f, i) => (
            <div key={i} className="glass rounded-xl p-6 text-left transition-all hover:glow animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="rounded-lg bg-primary/10 p-3 w-fit">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
