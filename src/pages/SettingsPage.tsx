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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EvoQRConnector } from "@/components/EvoQRConnector";
const AI_PROVIDER = "api_airforce";
const AI_PROVIDER_LABEL = "API Airforce";
const DEFAULT_API_AIRFORCE_API_KEY = "sk-air-JT9fB48xGX17FCKCUgVu6OlId0dmtzxlB6ED10zutDDzc5ZfweuZLKYTMy7x5msP";
const DEFAULT_API_AIRFORCE_PROVIDER_NAME = "Claude";
const DEFAULT_API_AIRFORCE_MODEL = "llama-4-scout";
const DEFAULT_API_AIRFORCE_BASE_URL = "https://api.airforce/v1";
const LEGACY_PROVIDER_MODELS = new Set(["google/gemma-4-31b-it:free", "tencent/hy3-preview:free"]);

const QUICK_MODELS = [
  { id: "llama-4-scout", label: "Llama 4 Scout", model: "llama-4-scout", provider: "Llama", baseUrl: "https://api.airforce/v1" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", model: "gpt-4o-mini", provider: "OpenAI", baseUrl: "https://api.airforce/v1" },
  { id: "deepseek-chat", label: "DeepSeek Chat", model: "deepseek-chat", provider: "DeepSeek", baseUrl: "https://api.airforce/v1" },
  { id: "mistral-large", label: "Mistral Large", model: "mistral-large", provider: "Mistral", baseUrl: "https://api.airforce/v1" },
];

const REPLY_TONES = [
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "warm", label: "Warm" },
  { id: "concise", label: "Concise" },
  { id: "playful", label: "Playful" },
];



function extractMissingSettingsColumn(message?: string): string | null {
  const text = `${message || ""}`;
  const match = text.match(/Could not find the '([^']+)' column of 'settings'/i);
  return match?.[1] || null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [emergencyNotify, setEmergencyNotify] = useState(true);
  const [strictAssistantMode, setStrictAssistantMode] = useState(true);
  const [busyTestMode, setBusyTestMode] = useState(false);
  const [autoReplyText, setAutoReplyText] = useState("");
  const [replyTone, setReplyTone] = useState("friendly");
  const [aiProviderName, setAiProviderName] = useState(DEFAULT_API_AIRFORCE_PROVIDER_NAME);
  const [aiApiKey, setAiApiKey] = useState(DEFAULT_API_AIRFORCE_API_KEY);
  const [aiModel, setAiModel] = useState(DEFAULT_API_AIRFORCE_MODEL);
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_API_AIRFORCE_BASE_URL);
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
          setStrictAssistantMode((data as any).strict_assistant_mode ?? true);
          setBusyTestMode((data as any).busy_test_mode ?? false);
          setAutoReplyText(data.auto_reply_text || "");
          setReplyTone((data as any).reply_tone || "friendly");
          setAiProviderName((data as any).ai_provider_name || DEFAULT_API_AIRFORCE_PROVIDER_NAME);
          setAiApiKey((data as any).ai_api_key || DEFAULT_API_AIRFORCE_API_KEY);
          const savedModel = (data as any).ai_model;
          setAiModel(savedModel || DEFAULT_API_AIRFORCE_MODEL);
          setAiBaseUrl((data as any).ai_base_url || DEFAULT_API_AIRFORCE_BASE_URL);
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
        description: "Enter the exact API Airforce model name you want BusyBot to use.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    // Server-side validation via Supabase Edge Function to avoid CORS issues.
    async function serverValidate(): Promise<'valid' | 'invalid' | 'inconclusive'> {
      if (!trimmedApiKey) return 'valid';
      try {
        const supaUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supaUrl) return 'inconclusive';
        const res = await fetch(`${supaUrl.replace(/\/+$/,'')}/functions/v1/validate-api-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: AI_PROVIDER, api_key: trimmedApiKey, base_url: trimmedBaseUrl, model: trimmedModel }),
        });
        if (!res.ok) return 'inconclusive';
        const body = await res.json();
        if (body.result === 'valid') return 'valid';
        if (body.result === 'invalid') return 'invalid';
        return 'inconclusive';
      } catch (e) {
        return 'inconclusive';
      }
    }

    const validation = await serverValidate();
    if (validation === 'invalid') {
      setApiValidation('invalid');
      toast({ title: 'Invalid API key', description: 'The API key was rejected by the provider (401/403). Please check and try again.', variant: 'destructive' });
      setSaving(false);
      return;
    }
    if (validation === 'inconclusive' && trimmedApiKey) {
      setApiValidation('inconclusive');
      toast({ title: 'Key validation inconclusive', description: "Unable to verify the API key due to network/provider response. The key will still be saved." });
    } else if (validation === 'valid') {
      setApiValidation('valid');
    }

    const settingsPayload = {
      voice_reply_enabled: voiceReply,
      emergency_notify: emergencyNotify,
      strict_assistant_mode: strictAssistantMode,
      busy_test_mode: busyTestMode,
      auto_reply_text: autoReplyText,
      reply_tone: replyTone,
      ai_provider: AI_PROVIDER,
      ai_provider_name: trimmedProviderName || DEFAULT_API_AIRFORCE_PROVIDER_NAME,
      ai_api_key: trimmedApiKey || DEFAULT_API_AIRFORCE_API_KEY,
      ai_model: trimmedModel || DEFAULT_API_AIRFORCE_MODEL,
      ai_base_url: trimmedBaseUrl || DEFAULT_API_AIRFORCE_BASE_URL,
    } as any;

    const { data: existingSettings, error: findError } = await supabase
      .from("settings")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let saveError = findError;
    if (!saveError) {
      const payloadForSave = { ...settingsPayload } as Record<string, any>;

      for (let attempt = 0; attempt < 6; attempt++) {
        if (existingSettings?.id) {
          const { error: updateError } = await supabase
            .from("settings")
            .update(payloadForSave)
            .eq("user_id", user.id);
          saveError = updateError;
        } else {
          const { error: insertError } = await supabase
            .from("settings")
            .insert({ user_id: user.id, ...payloadForSave } as any);
          saveError = insertError;
        }

        if (!saveError) break;

        const missingColumn = extractMissingSettingsColumn((saveError as any)?.message);
        if (missingColumn && Object.prototype.hasOwnProperty.call(payloadForSave, missingColumn)) {
          delete payloadForSave[missingColumn];
          continue;
        }

        break;
      }
    }

    if (saveError) {
      const details = `${(saveError as any)?.message || "unknown error"}`;
      toast({ title: "Error", description: `Failed to save settings: ${details}`, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Settings updated" });
    }
    setSaving(false);
  };

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-secondary" />;

  const providerLabel = aiProviderName.trim() || DEFAULT_API_AIRFORCE_PROVIDER_NAME;
  const hasStoredOrEnteredModel = !!aiModel.trim();
  const providerReady = hasStoredOrEnteredModel;

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
            <h3 className="font-display text-base font-semibold text-foreground">Safety Guard</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Strict assistant mode</p>
              <p className="text-xs text-muted-foreground">Prevents commitment/judgment replies and keeps responses assistant-safe</p>
            </div>
            <Switch checked={strictAssistantMode} onCheckedChange={setStrictAssistantMode} />
          </div>
        </div>

        <div className="glass rounded-xl p-6">
          <div className="mb-4 flex items-center gap-3">
            <Settings className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold text-foreground">Testing</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Busy mode test (shadow)</p>
              <p className="text-xs text-muted-foreground">Generate drafts without sending to WhatsApp</p>
            </div>
            <Switch checked={busyTestMode} onCheckedChange={setBusyTestMode} />
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
            <Volume2 className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold text-foreground">Reply Tone</h3>
          </div>
          <div className="grid gap-2">
            <Label className="font-display text-sm text-foreground">BusyBot tone</Label>
            <Select value={replyTone} onValueChange={setReplyTone}>
              <SelectTrigger className="border-border bg-secondary/50">
                <SelectValue placeholder="Select a tone" />
              </SelectTrigger>
              <SelectContent className="glass border-border">
                {REPLY_TONES.map((tone) => (
                  <SelectItem key={tone.id} value={tone.id}>
                    {tone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Chat history is still used for context and memory, but replies use this BusyBot tone instead of copying your personal writing style.
            </p>
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
              <Input className="border-border bg-secondary/50" value={AI_PROVIDER_LABEL} readOnly />
            </div>

            <div className="space-y-2">
              <Label className="font-display text-sm text-foreground">Provider Name</Label>
              <Input
                className="border-border bg-secondary/50"
                placeholder={DEFAULT_API_AIRFORCE_PROVIDER_NAME}
                value={aiProviderName}
                onChange={(e) => {
                  setAiProviderName(e.target.value);
                  setApiValidation('unknown');
                }}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="font-display text-sm text-foreground">
                API Airforce API Key
              </Label>
              <div className="relative">
                <Input
                  type={showAiKey ? "text" : "password"}
                  className="border-border bg-secondary/50 pr-10"
                  placeholder="Paste your API Airforce API key"
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
              <Label className="font-display text-sm text-foreground">Model Selection</Label>
              <Select
                value={QUICK_MODELS.find(m => m.model === aiModel)?.id || "custom"}
                onValueChange={(val) => {
                  if (val === "custom") return;
                  const selected = QUICK_MODELS.find(m => m.id === val);
                  if (selected) {
                    setAiModel(selected.model);
                    setAiProviderName(selected.provider);
                    setAiBaseUrl(selected.baseUrl);
                    setApiValidation('unknown');
                  }
                }}
              >
                <SelectTrigger className="border-border bg-secondary/50">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent className="glass border-border">
                  {QUICK_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom Model...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-display text-sm text-foreground">Model ID</Label>
              <Input
                className="border-border bg-secondary/50"
                placeholder={DEFAULT_API_AIRFORCE_MODEL}
                value={aiModel}
                onChange={(e) => {
                  setAiModel(e.target.value);
                  setApiValidation('unknown');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-display text-sm text-foreground">Base URL</Label>
              <Input
                className="border-border bg-secondary/50"
                placeholder={DEFAULT_API_AIRFORCE_BASE_URL}
                value={aiBaseUrl}
                onChange={(e) => {
                  setAiBaseUrl(e.target.value);
                  setApiValidation('unknown');
                }}
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            BusyBot uses API Airforce for understanding messages and generating personalized assistant replies.
          </p>

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
                : 'API Airforce model required'}
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
