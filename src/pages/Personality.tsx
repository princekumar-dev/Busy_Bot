import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Brain, Save, Sparkles } from "lucide-react";

export default function Personality() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tone, setTone] = useState("casual");
  const [avgLength, setAvgLength] = useState(15);
  const [emojiUsage, setEmojiUsage] = useState(true);
  const [commonPhrases, setCommonPhrases] = useState("");
  const [formality, setFormality] = useState(50);

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
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save personality", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Personality profile updated" });
    }
    setSaving(false);
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
          <p className="text-sm text-muted-foreground">Configure how BusyBot replies on your behalf</p>
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-6">
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
            placeholder="sure, okay, sounds good, got it"
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
  );
}
