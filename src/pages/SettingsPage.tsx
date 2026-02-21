import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Save, Volume2, Bell } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [emergencyNotify, setEmergencyNotify] = useState(true);
  const [autoReplyText, setAutoReplyText] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("settings")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setVoiceReply(data.voice_reply_enabled);
          setEmergencyNotify(data.emergency_notify);
          setAutoReplyText(data.auto_reply_text || "");
        }
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({
        voice_reply_enabled: voiceReply,
        emergency_notify: emergencyNotify,
        auto_reply_text: autoReplyText,
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Settings updated" });
    }
    setSaving(false);
  };

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-secondary" />;

  return (
    <div className="animate-slide-up max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-lg bg-primary/10 p-2">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Settings<span className="text-primary">.</span>
          </h1>
          <p className="text-sm text-muted-foreground">Configure BusyBot behavior</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Voice Reply */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Volume2 className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold text-foreground">Voice Replies</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Enable voice replies</p>
              <p className="text-xs text-muted-foreground">Convert text replies to voice messages</p>
            </div>
            <Switch checked={voiceReply} onCheckedChange={setVoiceReply} />
          </div>
        </div>

        {/* Emergency Notifications */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold text-foreground">Notifications</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Emergency alerts</p>
              <p className="text-xs text-muted-foreground">Get notified for urgent messages instead of auto-replying</p>
            </div>
            <Switch checked={emergencyNotify} onCheckedChange={setEmergencyNotify} />
          </div>
        </div>

        {/* Auto Reply Text */}
        <div className="glass rounded-xl p-6">
          <Label className="text-foreground font-display text-sm">Default Auto-Reply Message</Label>
          <Textarea
            className="mt-3 min-h-[100px] bg-secondary/50 border-border resize-none"
            placeholder="I am currently busy. I will get back to you soon."
            value={autoReplyText}
            onChange={(e) => setAutoReplyText(e.target.value)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Fallback message when AI cannot generate a contextual reply
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary font-display font-semibold text-primary-foreground glow">
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
