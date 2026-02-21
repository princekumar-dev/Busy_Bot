import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Save, Volume2, Bell, Key, Eye, EyeOff } from "lucide-react";
import { EvoQRConnector } from "@/components/EvoQRConnector";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [emergencyNotify, setEmergencyNotify] = useState(true);
  const [autoReplyText, setAutoReplyText] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);

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
          setGeminiApiKey((data as any).gemini_api_key || "");
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
        gemini_api_key: geminiApiKey || null,
      } as any)
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* API QR Connection - Spans full width */}
        <div className="md:col-span-2">
          <EvoQRConnector />
        </div>
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

        {/* Gemini API Key */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Key className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold text-foreground">Gemini AI</h3>
          </div>
          <Label className="text-foreground font-display text-sm">Gemini API Key</Label>
          <div className="relative mt-2">
            <Input
              type={showGeminiKey ? "text" : "password"}
              className="bg-secondary/50 border-border pr-10"
              placeholder="AIzaSy... (get from aistudio.google.com)"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey(!showGeminiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Powers smart AI replies that match your personality. Get a free key from{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-primary underline">Google AI Studio</a>.
          </p>
          {geminiApiKey && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-500 font-medium">AI replies active</span>
            </div>
          )}
          {!geminiApiKey && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-xs text-yellow-500 font-medium">Using fallback text (no AI)</span>
            </div>
          )}
        </div>

        {/* Auto Reply Text */}
        <div className="glass rounded-xl p-6">
          <Label className="text-foreground font-display text-sm">Fallback Auto-Reply Message</Label>
          <Textarea
            className="mt-3 min-h-[100px] bg-secondary/50 border-border resize-none"
            placeholder="Hey, caught up with something rn. Will text you back soon!"
            value={autoReplyText}
            onChange={(e) => setAutoReplyText(e.target.value)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Used only when Gemini AI is not configured or fails
          </p>
        </div>

        <div className="md:col-span-2">
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
    </div>
  );
}
