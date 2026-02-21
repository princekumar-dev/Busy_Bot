import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Power } from "lucide-react";

export function BusyModeToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("settings")
      .select("busy_mode")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setBusy(data.busy_mode);
        setLoading(false);
      });
  }, [user]);

  const toggle = async () => {
    if (!user) return;
    const newVal = !busy;
    setBusy(newVal);
    const { error } = await supabase
      .from("settings")
      .update({ busy_mode: newVal })
      .eq("user_id", user.id);

    if (error) {
      setBusy(!newVal);
      toast({ title: "Error", description: "Failed to update busy mode", variant: "destructive" });
    } else {
      toast({ title: newVal ? "Busy Mode ON" : "Busy Mode OFF", description: newVal ? "BusyBot will handle your messages" : "Auto-replies disabled" });
    }
  };

  if (loading) return <div className="h-48 animate-pulse rounded-xl bg-secondary" />;

  return (
    <div className={`glass rounded-xl p-8 text-center transition-all ${busy ? "glow-strong" : ""}`}>
      <button
        onClick={toggle}
        className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full border-4 transition-all duration-500 ${
          busy
            ? "border-primary bg-primary/20 animate-pulse-glow"
            : "border-border bg-secondary hover:border-muted-foreground"
        }`}
      >
        <Power className={`h-10 w-10 transition-colors ${busy ? "text-primary" : "text-muted-foreground"}`} />
      </button>
      <h3 className="mt-6 font-display text-xl font-bold text-foreground">
        {busy ? "BusyBot Active" : "BusyBot Inactive"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {busy ? "Automatically handling your messages" : "Click to activate auto-replies"}
      </p>
    </div>
  );
}
