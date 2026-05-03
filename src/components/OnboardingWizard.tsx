import { useState } from "react";
import { Bot, Wifi, Key, Sparkles, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EvoQRConnector } from "@/components/EvoQRConnector";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  { icon: Bot, title: "Welcome to BusyBot", sub: "Your AI WhatsApp assistant" },
  { icon: Wifi, title: "Connect WhatsApp", sub: "Link your number to get started" },
  { icon: Key, title: "AI Provider", sub: "Power up with an LLM" },
  { icon: Sparkles, title: "Your Style", sub: "How should BusyBot sound?" },
  { icon: CheckCircle2, title: "All Set!", sub: "You're ready to go" },
];

interface Props { open: boolean; onComplete: () => void; }

const AI_PROVIDER = "api_airforce";
const DEFAULT_API_AIRFORCE_API_KEY = "sk-air-JT9fB48xGX17FCKCUgVu6OlId0dmtzxlB6ED10zutDDzc5ZfweuZLKYTMy7x5msP";
const DEFAULT_API_AIRFORCE_PROVIDER_NAME = "Claude";
const DEFAULT_API_AIRFORCE_MODEL = "llama-4-scout";
const DEFAULT_API_AIRFORCE_BASE_URL = "https://api.airforce/v1";

function extractMissingSettingsColumn(message?: string): string | null {
  const text = `${message || ""}`;
  const match = text.match(/Could not find the '([^']+)' column of 'settings'/i);
  return match?.[1] || null;
}

export function OnboardingWizard({ open, onComplete }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // AI provider state
  const [aiApiKey, setAiApiKey] = useState(DEFAULT_API_AIRFORCE_API_KEY);
  const [aiModel, setAiModel] = useState(DEFAULT_API_AIRFORCE_MODEL);
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_API_AIRFORCE_BASE_URL);

  // Style state
  const [tone, setTone] = useState("friendly");
  const [emojiLevel, setEmojiLevel] = useState("moderate");
  const [replyLength, setReplyLength] = useState("medium");

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const finish = async () => {
    if (!user) return;
    setSaving(true);

    // Save settings in a way that works even if ON CONFLICT(user_id) is not available.
    const settingsPayload = {
      ai_provider: AI_PROVIDER,
      ai_provider_name: DEFAULT_API_AIRFORCE_PROVIDER_NAME,
      ai_api_key: aiApiKey.trim() || DEFAULT_API_AIRFORCE_API_KEY,
      ai_model: aiModel.trim() || DEFAULT_API_AIRFORCE_MODEL,
      ai_base_url: aiBaseUrl.trim() || DEFAULT_API_AIRFORCE_BASE_URL,
      busy_mode: false,
      busy_test_mode: false,
      emergency_notify: true,
      strict_assistant_mode: true,
      voice_reply_enabled: false,
    } as any;

    const { data: existingSettings } = await supabase
      .from("settings")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const payloadForSave = { ...settingsPayload } as Record<string, any>;
    for (let attempt = 0; attempt < 6; attempt++) {
      let saveError: any = null;

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

      const missingColumn = extractMissingSettingsColumn(saveError?.message);
      if (missingColumn && Object.prototype.hasOwnProperty.call(payloadForSave, missingColumn)) {
        delete payloadForSave[missingColumn];
        continue;
      }

      throw saveError;
    }

    // Upsert personality
    const avgLen = replyLength === "short" ? 12 : replyLength === "long" ? 40 : 24;
    await supabase.from("personality_profiles").upsert({
      user_id: user.id,
      tone,
      emoji_usage: emojiLevel !== "none",
      avg_length: avgLen,
    } as any, { onConflict: "user_id" });

    // Mark onboarding done
    localStorage.setItem(`busybot_onboarded_${user.id}`, "1");

    toast({ title: "Setup complete!", description: "BusyBot is ready. Toggle Busy Mode when you need it." });
    setSaving(false);
    onComplete();
  };

  const StepIcon = STEPS[step].icon;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg p-0 border-border bg-background overflow-hidden [&>button]:hidden" onInteractOutside={e => e.preventDefault()}>
        {/* Progress bar */}
        <div className="h-1 bg-secondary">
          <div className="h-1 gradient-primary transition-all duration-500 ease-out" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-primary" : i < step ? "w-2 bg-primary/50" : "w-2 bg-secondary"}`} />
          ))}
        </div>

        {/* Step header */}
        <div className="text-center px-6 pt-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <StepIcon className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">{STEPS[step].title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{STEPS[step].sub}</p>
        </div>

        {/* Step content */}
        <div className="px-6 pb-2 min-h-[200px]">
          {step === 0 && (
            <div className="space-y-4 text-center py-4 animate-slide-up">
              <p className="text-sm text-muted-foreground leading-relaxed">
                BusyBot auto-replies to your WhatsApp messages when you're busy — in <strong className="text-foreground">your style</strong>, with safety guardrails built in.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[["🤖","AI Replies","Context-aware responses"],["🛡️","Safety First","Review risky messages"],["📊","Full Audit","Track every decision"]].map(([emoji, title, desc]) => (
                  <div key={title} className="rounded-lg bg-secondary/50 p-3 text-center">
                    <span className="text-2xl">{emoji}</span>
                    <p className="text-xs font-semibold text-foreground mt-1">{title}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="py-2 animate-slide-up">
              <EvoQRConnector />
              <p className="text-xs text-muted-foreground text-center mt-3">
                You can also do this later from Settings. Feel free to skip ahead.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 py-4 animate-slide-up">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">API Airforce API Key</Label>
                <Input className="border-border bg-secondary/50" placeholder="Paste your API Airforce API key" value={aiApiKey} onChange={e => setAiApiKey(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Used as BusyBot's only LLM provider</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Model</Label>
                <Input className="border-border bg-secondary/50" placeholder={DEFAULT_API_AIRFORCE_MODEL} value={aiModel} onChange={e => setAiModel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Base URL</Label>
                <Input className="border-border bg-secondary/50" placeholder={DEFAULT_API_AIRFORCE_BASE_URL} value={aiBaseUrl} onChange={e => setAiBaseUrl(e.target.value)} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 py-4 animate-slide-up">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="border-border bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly 😊</SelectItem>
                    <SelectItem value="casual">Casual 🤙</SelectItem>
                    <SelectItem value="formal">Formal 🎩</SelectItem>
                    <SelectItem value="professional">Professional 💼</SelectItem>
                    <SelectItem value="witty">Witty 😏</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Emoji Level</Label>
                <Select value={emojiLevel} onValueChange={setEmojiLevel}>
                  <SelectTrigger className="border-border bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="heavy">Heavy 🎉🔥</SelectItem>
                    <SelectItem value="moderate">Moderate 👍</SelectItem>
                    <SelectItem value="low">Minimal</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Reply Length</Label>
                <Select value={replyLength} onValueChange={setReplyLength}>
                  <SelectTrigger className="border-border bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (1-2 lines)</SelectItem>
                    <SelectItem value="medium">Medium (2-3 lines)</SelectItem>
                    <SelectItem value="long">Detailed (3+ lines)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-6 animate-slide-up">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 animate-pulse-glow">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You're all set! Head to the <strong className="text-foreground">Dashboard</strong> to toggle Busy Mode and start letting BusyBot handle your messages.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-3">You can tweak everything later in Settings and Personality pages.</p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={prev} className="gap-1 text-muted-foreground"><ChevronLeft className="h-4 w-4" />Back</Button>
          ) : <div />}

          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={next} className="gap-1 gradient-primary text-primary-foreground glow">Next<ChevronRight className="h-4 w-4" /></Button>
          ) : (
            <Button size="sm" onClick={finish} disabled={saving} className="gap-1 gradient-primary text-primary-foreground glow">
              {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> : <>Go to Dashboard<ChevronRight className="h-4 w-4" /></>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
