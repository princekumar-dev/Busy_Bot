import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Bot, Mail, Lock, User, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Auth() {
  const { user, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email.trim(), password);

        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }

        return;
      }

      const { error, status } = await signUp(email.trim(), password, displayName.trim());

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else if (status === "confirmation_sent") {
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link. Open it to finish your sign up.",
        });
        setIsLogin(true);
      } else if (status === "already_registered") {
        toast({
          title: "Account already exists",
          description: "This email is already registered. Try signing in instead.",
          variant: "destructive",
        });
        setIsLogin(true);
      } else if (status === "signed_in") {
        toast({
          title: "Account created",
          description: "Your account is ready and you have been signed in.",
        });
      } else {
        toast({
          title: "Sign up submitted",
          description:
            "Your account request was received. If no email arrives, check your Supabase Auth email settings.",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong while processing your request.";

      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary glow">
            <Bot className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Busy<span className="text-primary glow-text">Bot</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            AI-powered WhatsApp auto-reply assistant
          </p>
        </div>

        <div className="glass rounded-2xl p-8">
          <h2 className="mb-6 font-display text-xl font-semibold text-foreground">
            {isLogin ? "Welcome back" : "Create account"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-muted-foreground">
                  Display Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="border-border bg-secondary/50 pl-10"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-border bg-secondary/50 pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="border-border bg-secondary/50 pl-10"
                />
              </div>
            </div>

            {!isLogin && (
              <p className="text-sm text-muted-foreground">
                After creating your account, open the confirmation email to finish signing in.
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full font-display font-semibold text-primary-foreground glow gradient-primary"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <>
                  {isLogin ? "Sign In" : "Create Account"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => setIsLogin((current) => !current)}
              className="text-sm text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
