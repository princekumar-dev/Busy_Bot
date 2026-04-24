import { useEffect, useState } from "react";
import { Bell, Eye, EyeOff, Key, Save, Settings, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EvoQRConnector } from "@/components/EvoQRConnector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AIProvider = "openrouter" | "custom";

const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-31b-it:free";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [emergencyNotify, setEmergencyNotify] = useState(true);
  const [autoReplyText, setAutoReplyText] = useState("");
  const [aiProvider, setAiProvider] = useState<AIProvider>("openrouter");
  const [aiProviderName, setAiProviderName] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(DEFAULT_OPENROUTER_MODEL);
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [apiValidation, setApiValidation] = useState<'unknown' | 'valid' | 'invalid' | 'inconclusive'>('unknown');

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
          setAiProvider(((data as any).ai_provider || "openrouter") as AIProvider);
          setAiProviderName((data as any).ai_provider_name || "");
          setAiApiKey((data as any).ai_api_key || (data as any).gemini_api_key || "");
          setAiModel((data as any).ai_model || DEFAULT_OPENROUTER_MODEL);
          setAiBaseUrl((data as any).ai_base_url || "");
        }
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    const trimmedBaseUrl = aiBaseUrl.trim();
    const trimmedProviderName = aiProviderName.trim();
    const trimmedModel = aiModel.trim();
    const trimmedApiKey = aiApiKey.trim();

    if (trimmedApiKey && !trimmedModel) {
      toast({
        title: "Model required",
        description: "Enter the exact model name you want BusyBot to use, or clear the API key to stay on offline fallback mode.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    if (aiProvider === "custom" && trimmedApiKey && !trimmedBaseUrl) {
      toast({
        title: "Base URL required",
        description: "Custom providers need a base URL so BusyBot knows where to send the request.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    // Validate API key where possible. If validation cannot be completed due to
    // network/CORS/timeouts we allow saving but warn the user. If the provider
    // explicitly rejects the key (401/403) we block the save.
    async function validateApiKey(): Promise<boolean | null> {
      if (!trimmedApiKey) return true; // nothing to validate

      const timeoutMs = 8000;
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);

      try {
        if (aiProvider === "openrouter") {
          // OpenRouter exposes a models listing endpoint that accepts Bearer tokens
          const res = await fetch("https://api.openrouter.ai/v1/models", {
            method: "GET",
            headers: { Authorization: `Bearer ${trimmedApiKey}` },
            signal: controller.signal,
          });
          clearTimeout(to);
          if (res.ok) return true;
          if (res.status === 401 || res.status === 403) return false;
          return null; // unknown (rate limit, CORS, etc.)
        }

        if (aiProvider === "custom") {
          const base = trimmedBaseUrl.replace(/\/+$/, "");
          // Try common OpenAI-compatible model list endpoint first
          try {
            const res = await fetch(`${base}/v1/models`, {
              method: "GET",
              headers: { Authorization: `Bearer ${trimmedApiKey}` },
              signal: controller.signal,
            });
            clearTimeout(to);
            if (res.ok) return true;
            if (res.status === 401 || res.status === 403) return false;
          } catch (e) {
            // ignore and try chat completions fallback
          }

          // Fallback: try a minimal chat/completions request (may consume quota)
          try {
            const res2 = await fetch(`${base}/v1/chat/completions`, {
              method: "POST",
              headers: { Authorization: `Bearer ${trimmedApiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: trimmedModel || "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
              signal: controller.signal,
            });
            clearTimeout(to);
            if (res2.ok) return true;
            if (res2.status === 401 || res2.status === 403) return false;
            return null;
          } catch (e) {
            clearTimeout(to);
            return null;
          }
        }

        clearTimeout(to);
        return null;
      } catch (err) {
        clearTimeout(to);
        // Abort or network/CORS error — validation inconclusive
        return null;
      }
    }

    const validation = await validateApiKey();
    if (validation === false) {
      setApiValidation('invalid');
      toast({
        title: "Invalid API key",
        description: "The API key was rejected by the provider (401/403). Please check and try again.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }
    if (validation === null && trimmedApiKey) {
      setApiValidation('inconclusive');
      toast({
        title: "Key validation inconclusive",
        description:
          "Unable to verify the API key due to network/CORS or provider response. The key will still be saved, but if generation fails you may need to recheck the key or configure a server-side validation.",
        variant: "warning",
      });
    } else if (validation === true) {
      setApiValidation('valid');
    }

    const { error } = await supabase
      .from("settings")
      .upsert(
        {
          user_id: user.id,
          voice_reply_enabled: voiceReply,
          emergency_notify: emergencyNotify,
          auto_reply_text: autoReplyText,
          ai_provider: aiProvider,
          ai_provider_name: aiProvider === "custom" ? trimmedProviderName || null : "OpenRouter",
          ai_api_key: trimmedApiKey || null,
          ai_model: trimmedModel || null,
          ai_base_url: aiProvider === "custom" ? trimmedBaseUrl || null : null,
          gemini_api_key: null,
        } as any,
        { onConflict: "user_id" }
      );

    if (error) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Settings updated" });
    }
    setSaving(false);
  };

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-secondary" />;

  const isCustomProvider = aiProvider === "custom";
  const providerLabel = isCustomProvider ? aiProviderName.trim() || "Custom provider" : "OpenRouter";
  const providerReady = isCustomProvider
    ? !!aiApiKey.trim() && !!aiModel.trim() && !!aiBaseUrl.trim()
    : !!aiApiKey.trim() && !!aiModel.trim();

  return (
    <div className="animate-slide-up max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
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
        <div className="md:col-span-2">
          <EvoQRConnector />
        </div>

        <div className="glass rounded-xl p-6">
          <div className="mb-4 flex items-center gap-3">
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

        <div className="glass rounded-xl p-6">
          <div className="mb-4 flex items-center gap-3">
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

        <div className="glass rounded-xl p-6 md:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <Key className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold text-foreground">Text Generation</h3>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="font-display text-sm text-foreground">Provider</Label>
              <Select
                value={aiProvider}
                onValueChange={(value: AIProvider) => {
                  setAiProvider(value);
                  setApiValidation('unknown');
                }}
              >
                <SelectTrigger className="border-border bg-secondary/50">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter">OpenRouter (Default)</SelectItem>
                  <SelectItem value="custom">Custom Provider</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isCustomProvider && (
              <div className="space-y-2">
                <Label className="font-display text-sm text-foreground">Provider Name</Label>
                <Input
                  className="border-border bg-secondary/50"
                  placeholder="My provider"
                  value={aiProviderName}
                  onChange={(e) => {
                    setAiProviderName(e.target.value);
                    setApiValidation('unknown');
                  }}
                />
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label className="font-display text-sm text-foreground">
                {isCustomProvider ? "API Key" : "OpenRouter API Key"}
              </Label>
              <div className="relative">
                <Input
                  type={showAiKey ? "text" : "password"}
                  className="border-border bg-secondary/50 pr-10"
                  placeholder={isCustomProvider ? "Paste your provider API key" : "sk-or-v1-..."}
                  value={aiApiKey}
                  onChange={(e) => {
                    setAiApiKey(e.target.value);
                    setApiValidation('unknown');
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowAiKey((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-display text-sm text-foreground">Model</Label>
              <Input
                className="border-border bg-secondary/50"
                placeholder={DEFAULT_OPENROUTER_MODEL}
                value={aiModel}
                onChange={(e) => {
                  setAiModel(e.target.value);
                  setApiValidation('unknown');
                }}
              />
            </div>

            {isCustomProvider && (
              <div className="space-y-2">
                <Label className="font-display text-sm text-foreground">Base URL</Label>
                <Input
                  className="border-border bg-secondary/50"
                  placeholder="https://api.example.com/v1"
                  value={aiBaseUrl}
                  onChange={(e) => {
                    setAiBaseUrl(e.target.value);
                    setApiValidation('unknown');
                  }}
                />
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            OpenRouter is the default text-generation provider. Custom mode expects an OpenAI-compatible `/chat/completions` API.
          </p>
          {!isCustomProvider && (
            <p className="mt-1 text-xs text-muted-foreground">
              Recommended starter model: `google/gemma-4-31b-it:free`
            </p>
          )}

          <div className="mt-3 flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full ${
                apiValidation === 'valid'
                  ? 'bg-green-500 animate-pulse'
                  : apiValidation === 'invalid'
                  ? 'bg-red-500'
                  : apiValidation === 'inconclusive'
                  ? 'bg-yellow-500'
                  : providerReady
                  ? 'bg-green-500 animate-pulse'
                  : 'bg-yellow-500'
              }`}
            />
            <span
              className={`text-xs font-medium ${
                apiValidation === 'valid'
                  ? 'text-green-500'
                  : apiValidation === 'invalid'
                  ? 'text-red-500'
                  : apiValidation === 'inconclusive'
                  ? 'text-yellow-500'
                  : providerReady
                  ? 'text-green-500'
                  : 'text-yellow-500'
              }`}
            >
              {apiValidation === 'valid'
                ? `API key validated — Using ${providerLabel} with model ${aiModel.trim()}`
                : apiValidation === 'invalid'
                ? 'API key invalid — check and try again'
                : apiValidation === 'inconclusive'
                ? 'Key validation inconclusive — saved anyway'
                : providerReady
                ? `Using ${providerLabel} with model ${aiModel.trim()}`
                : 'Using personalized fallback mode'}
            </span>
          </div>
        </div>

        <div className="glass rounded-xl p-6 md:col-span-2">
          <Label className="font-display text-sm text-foreground">Fallback Auto-Reply Message</Label>
          <Textarea
            className="mt-3 min-h-[100px] resize-none border-border bg-secondary/50"
            placeholder="Hey, caught up with something rn. Will text you back soon!"
            value={autoReplyText}
            onChange={(e) => setAutoReplyText(e.target.value)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Used when provider-based text generation is unavailable, plus as the last-resort backup if the style-aware fallback cannot build a reply
          </p>
        </div>

        <div className="md:col-span-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full gradient-primary font-display font-semibold text-primary-foreground glow"
          >
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
