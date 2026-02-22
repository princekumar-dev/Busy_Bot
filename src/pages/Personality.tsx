import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Brain, Save, Sparkles, Zap, MessageCircle, Loader2, CheckCircle2, Users, User } from "lucide-react";

export default function Personality() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState("");
  const [tone, setTone] = useState("casual");
  const [avgLength, setAvgLength] = useState(15);
  const [emojiUsage, setEmojiUsage] = useState(true);
  const [commonPhrases, setCommonPhrases] = useState("");
  const [formality, setFormality] = useState(50);
  const [learnedStyle, setLearnedStyle] = useState<any>(null);
  const [lastTrained, setLastTrained] = useState<string | null>(null);
  const [trainingMsgCount, setTrainingMsgCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("personality_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setTone(data.tone);
          setAvgLength(data.avg_length);
          setEmojiUsage(data.emoji_usage);
          setCommonPhrases((data.common_phrases || []).join(", "));
          setFormality(Math.round((data.formality_score || 0.5) * 100));
          setLearnedStyle((data as any).learned_style || null);
          setLastTrained((data as any).last_trained_at || null);
          setTrainingMsgCount((data as any).training_message_count || 0);
        }
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("personality_profiles")
      .update({
        tone,
        avg_length: avgLength,
        emoji_usage: emojiUsage,
        common_phrases: commonPhrases.split(",").map((p) => p.trim()).filter(Boolean),
        formality_score: formality / 100,
      } as any)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save personality", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Personality profile updated" });
    }
    setSaving(false);
  };

  const handleTrain = async () => {
    if (!user) return;
    setTraining(true);
    setTrainingStep("Analyzing your messages...");
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Brief delay so the user sees the step
      setTimeout(() => setTrainingStep("Learning your global style..."), 2000);
      setTimeout(() => setTrainingStep("Analyzing per-contact patterns..."), 5000);
      setTimeout(() => setTrainingStep("Building personality model..."), 8000);

      const res = await fetch(`${supabaseUrl}/functions/v1/train-personality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Training Issue",
          description: data.error || "Training failed",
          variant: "destructive",
        });
      } else {
        setLearnedStyle(data.learned_style);
        setTrainingMsgCount(data.messages_analyzed);
        setLastTrained(new Date().toISOString());
        const contactCount = data.contacts_analyzed || 0;
        toast({
          title: "🧠 Training Complete!",
          description: `Analyzed ${data.messages_analyzed} messages across ${contactCount} contacts. Your AI now knows your style!`,
        });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to train AI", variant: "destructive" });
    }
    setTraining(false);
    setTrainingStep("");
  };

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-secondary" />;

  return (
    <div className="animate-slide-up max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-lg bg-primary/10 p-2">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Personality<span className="text-primary">.</span>
          </h1>
          <p className="text-sm text-muted-foreground">Train BusyBot to reply like you — your style, your vibe</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── AI Training Section ── */}
        <div className="glass rounded-xl p-6 border-2 border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold text-foreground">AI Personality Training</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            BusyBot learns from your real WhatsApp messages when it's turned OFF. The more you chat naturally,
            the better it mimics your style — your greetings, slang, emojis, and phrases.
          </p>

          <div className="flex items-center gap-4 mb-4">
            <Button
              onClick={handleTrain}
              disabled={training}
              className="gradient-primary font-display font-semibold text-primary-foreground glow"
            >
              {training ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {trainingStep || "Training AI..."}
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Train AI on My Messages
                </>
              )}
            </Button>
            {lastTrained && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                Last trained {new Date(lastTrained).toLocaleDateString()} • {trainingMsgCount} messages
              </div>
            )}
          </div>

          {/* Learned Patterns Display */}
          {learnedStyle && Object.keys(learnedStyle).length > 0 && (
            <div className="rounded-lg bg-secondary/50 p-4 border border-border space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-display font-semibold text-primary">Learned Patterns</span>
              </div>
              <div className="grid gap-2 text-xs">
                {learnedStyle.greetings?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Your greetings:</span>
                    <div className="flex flex-wrap gap-1">
                      {learnedStyle.greetings.map((g: string, i: number) => (
                        <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {learnedStyle.affirmatives?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">You say yes as:</span>
                    <div className="flex flex-wrap gap-1">
                      {learnedStyle.affirmatives.map((a: string, i: number) => (
                        <span key={i} className="rounded-full bg-green-500/10 px-2 py-0.5 text-green-500">{a}</span>
                      ))}
                    </div>
                  </div>
                )}
                {learnedStyle.negatives?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">You say no as:</span>
                    <div className="flex flex-wrap gap-1">
                      {learnedStyle.negatives.map((n: string, i: number) => (
                        <span key={i} className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-500">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
                {learnedStyle.emoji_favorites?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Fav emojis:</span>
                    <span className="text-lg">{learnedStyle.emoji_favorites.join(" ")}</span>
                  </div>
                )}
                {learnedStyle.signature_phrases?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Signature phrases:</span>
                    <div className="flex flex-wrap gap-1">
                      {learnedStyle.signature_phrases.map((p: string, i: number) => (
                        <span key={i} className="rounded-full bg-purple-500/10 px-2 py-0.5 text-purple-400">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {learnedStyle.fillers?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Fillers:</span>
                    <div className="flex flex-wrap gap-1">
                      {learnedStyle.fillers.map((f: string, i: number) => (
                        <span key={i} className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-yellow-500">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {learnedStyle.closings?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Closings:</span>
                    <div className="flex flex-wrap gap-1">
                      {learnedStyle.closings.map((c: string, i: number) => (
                        <span key={i} className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-500">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {learnedStyle.tone_summary && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Your vibe:</span>
                    <span className="text-foreground italic">{learnedStyle.tone_summary}</span>
                  </div>
                )}
                {learnedStyle.detected_languages?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Languages:</span>
                    <div className="flex flex-wrap gap-1">
                      {learnedStyle.detected_languages.map((l: string, i: number) => (
                        <span key={i} className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400 capitalize">{l}</span>
                      ))}
                    </div>
                  </div>
                )}
                {learnedStyle.primary_language && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Primary lang:</span>
                    <span className="text-foreground capitalize font-medium">{learnedStyle.primary_language}</span>
                  </div>
                )}
                {learnedStyle.language_mix && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Lang style:</span>
                    <span className="text-foreground">{learnedStyle.language_mix}</span>
                  </div>
                )}
                {learnedStyle.abbreviation_style && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Abbreviations:</span>
                    <span className="text-foreground italic">{learnedStyle.abbreviation_style}</span>
                  </div>
                )}
                {learnedStyle.code_switching_pattern && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[120px]">Code switching:</span>
                    <span className="text-foreground italic">{learnedStyle.code_switching_pattern}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!learnedStyle || Object.keys(learnedStyle || {}).length === 0 ? (
            <div className="rounded-lg bg-secondary/30 p-4 border border-dashed border-border text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                No learned patterns yet. Chat with BusyBot OFF, then hit "Train AI" to learn your style!
              </p>
            </div>
          ) : null}

          {/* Per-Contact Learned Styles */}
          {learnedStyle?.per_contact && Object.keys(learnedStyle.per_contact).length > 0 && (
            <div className="rounded-lg bg-secondary/50 p-4 border border-border space-y-3 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs font-display font-semibold text-primary">
                  Per-Contact Styles ({learnedStyle.contacts_analyzed || Object.keys(learnedStyle.per_contact).length} contacts)
                </span>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                BusyBot knows you talk differently to different people
              </p>
              <div className="space-y-3">
                {Object.entries(learnedStyle.per_contact).map(([key, val]: [string, any]) => (
                  <div key={key} className="rounded-lg bg-background/50 p-3 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-display font-semibold text-foreground">{val.contact_name || key}</span>
                      {val.relationship_hint && (
                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
                          {val.relationship_hint}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">{val.messages_analyzed} msgs</span>
                    </div>
                    <div className="grid gap-1.5 text-xs">
                      {val.tone && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground min-w-[80px]">Tone:</span>
                          <span className="text-foreground">{val.tone}</span>
                        </div>
                      )}
                      {val.language && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground min-w-[80px]">Language:</span>
                          <span className="text-foreground">{val.language}</span>
                        </div>
                      )}
                      {val.emoji_usage && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground min-w-[80px]">Emojis:</span>
                          <span className="text-foreground">{val.emoji_usage}</span>
                        </div>
                      )}
                      {val.sample_replies?.length > 0 && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground min-w-[80px]">Example:</span>
                          <div className="flex flex-wrap gap-1">
                            {val.sample_replies.slice(0, 3).map((r: string, i: number) => (
                              <span key={i} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground italic">"{r}"</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {val.unique_patterns && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground min-w-[80px]">Unique:</span>
                          <span className="text-foreground italic">{val.unique_patterns}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Manual Personality Config ── */}
        <div className="glass rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold text-foreground">Manual Personality Overrides</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            Fine-tune settings manually. AI training will auto-update some of these.
          </p>

          {/* Tone */}
          <div className="space-y-3">
            <Label className="text-foreground font-display text-sm">Reply Tone</Label>
            <div className="flex gap-2">
              {["casual", "formal", "friendly", "professional"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-all ${
                    tone === t
                      ? "gradient-primary text-primary-foreground glow"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Formality */}
          <div className="space-y-3">
            <Label className="text-foreground font-display text-sm">Formality Level</Label>
            <Slider
              value={[formality]}
              onValueChange={([v]) => setFormality(v)}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Very Casual</span>
              <span>{formality}%</span>
              <span>Very Formal</span>
            </div>
          </div>

          {/* Average Length */}
          <div className="space-y-3">
            <Label className="text-foreground font-display text-sm">Average Reply Length (words)</Label>
            <Slider
              value={[avgLength]}
              onValueChange={([v]) => setAvgLength(v)}
              min={5}
              max={100}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">~{avgLength} words per reply</p>
          </div>

          {/* Emoji */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-foreground font-display text-sm">Use Emojis</Label>
              <p className="text-xs text-muted-foreground">Include emojis in auto-replies</p>
            </div>
            <Switch checked={emojiUsage} onCheckedChange={setEmojiUsage} />
          </div>

          {/* Common Phrases */}
          <div className="space-y-2">
            <Label className="text-foreground font-display text-sm">Common Phrases</Label>
            <Input
              placeholder="sure, okay, sounds good, got it, acha, hmm"
              value={commonPhrases}
              onChange={(e) => setCommonPhrases(e.target.value)}
              className="bg-secondary/50 border-border"
            />
            <p className="text-xs text-muted-foreground">Comma-separated phrases BusyBot will naturally use</p>
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-secondary/50 p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-display font-semibold text-primary">AI Prompt Preview</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              "Reply in a {tone} tone, keep responses around {avgLength} words,
              {emojiUsage ? " use emojis naturally" : " avoid emojis"}
              {commonPhrases && `, use phrases like: ${commonPhrases}`}.
              Formality: {formality}%."
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary font-display font-semibold text-primary-foreground glow">
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Personality
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
