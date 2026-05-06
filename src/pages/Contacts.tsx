import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Users, 
  Search, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  Eye, 
  Trash2, 
  Plus, 
  MoreVertical,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ContactRule {
  id: string;
  contact_number: string;
  contact_name: string | null;
  relationship_style: string;
  behavior: string;
  updated_at: string;
}

export default function Contacts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<ContactRule[]>([]);
  const [search, setSearch] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!user) return;
    fetchRules();
  }, [user]);

  const fetchRules = async () => {
    const { data, error } = await supabase
      .from("contact_rules")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load contact rules", variant: "destructive" });
    } else {
      setRules(data || []);
    }
    setLoading(false);
  };

  const handleAddRule = async () => {
    if (!user || !newNumber) return;
    
    // Normalize number
    const normalized = newNumber.replace(/\D/g, "");
    
    const { error } = await supabase.from("contact_rules").upsert({
      user_id: user.id,
      contact_number: normalized,
      contact_name: newName || null,
      behavior: "auto_reply",
      relationship_style: "friend"
    }, { onConflict: "user_id, contact_number" });

    if (error) {
      toast({ title: "Error", description: "Failed to add contact", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Contact added to BusyBot" });
      setNewNumber("");
      setNewName("");
      fetchRules();
    }
  };

  const updateBehavior = async (id: string, behavior: string) => {
    const { error } = await supabase
      .from("contact_rules")
      .update({ behavior } as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Update failed", variant: "destructive" });
    } else {
      setRules(rules.map(r => r.id === id ? { ...r, behavior } : r));
      toast({ title: "Updated", description: `Behavior set to ${behavior.replace("_", " ")}` });
    }
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase.from("contact_rules").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    } else {
      setRules(rules.filter(r => r.id !== id));
      toast({ title: "Deleted", description: "Rule removed" });
    }
  };

  const filteredRules = rules.filter(r => 
    r.contact_number.includes(search) || 
    (r.contact_name?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-secondary" />;

  return (
    <div className="animate-slide-up space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Contacts<span className="text-primary">.</span>
            </h1>
            <p className="text-sm text-muted-foreground">Manage who BusyBot talks to and how it behaves</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Add Contact */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass rounded-xl p-6 border-2 border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold text-foreground">Add Contact Rule</h2>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input 
                  placeholder="e.g. 919876543210" 
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Name (Optional)</Label>
                <Input 
                  placeholder="e.g. Preethi" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-background/50"
                />
              </div>
              <Button 
                onClick={handleAddRule} 
                disabled={!newNumber}
                className="w-full gradient-primary font-display font-semibold glow"
              >
                <Plus className="mr-2 h-4 w-4" /> Add to BusyBot
              </Button>
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h3 className="font-display font-bold text-sm text-foreground uppercase tracking-wider">Quick Info</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-green-500/10 p-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Auto-Reply:</span> BusyBot can reply using your selected tone and saved chat context.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-red-500/10 p-1">
                  <XCircle className="h-3 w-3 text-red-500" />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Ignore:</span> Bot will stay silent and just store the message.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-amber-500/10 p-1">
                  <Clock className="h-3 w-3 text-amber-500" />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Manual:</span> Bot drafts a reply but waits for your approval.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Contact List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search contacts by name or number..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary/30 border-border h-12 text-base"
            />
          </div>

          <div className="grid gap-3">
            {filteredRules.length > 0 ? (
              filteredRules.map((rule) => (
                <div key={rule.id} className="glass group rounded-xl p-4 border border-border/50 hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center font-display font-bold text-primary-foreground text-lg">
                        {(rule.contact_name || rule.contact_number).substring(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-foreground">
                            {rule.contact_name || "Unknown Contact"}
                          </h3>
                          <span className="text-xs text-muted-foreground font-mono">+{rule.contact_number}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {rule.behavior === "auto_reply" && <ShieldCheck className="h-3 w-3 text-green-500" />}
                            {rule.behavior === "ignore" && <ShieldAlert className="h-3 w-3 text-red-500" />}
                            {rule.behavior === "manual_review" && <Eye className="h-3 w-3 text-amber-500" />}
                            {rule.behavior.replace("_", " ")}
                          </span>
                          <span className="h-1 w-1 rounded-full bg-border" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {rule.relationship_style}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="hidden group-hover:flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`h-8 px-2 text-[11px] ${rule.behavior === "auto_reply" ? "bg-primary/10 text-primary" : ""}`}
                          onClick={() => updateBehavior(rule.id, "auto_reply")}
                        >
                          Auto
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`h-8 px-2 text-[11px] ${rule.behavior === "ignore" ? "bg-red-500/10 text-red-500" : ""}`}
                          onClick={() => updateBehavior(rule.id, "ignore")}
                        >
                          Ignore
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`h-8 px-2 text-[11px] ${rule.behavior === "manual_review" ? "bg-amber-500/10 text-amber-500" : ""}`}
                          onClick={() => updateBehavior(rule.id, "manual_review")}
                        >
                          Review
                        </Button>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="glass border-border">
                          <DropdownMenuItem onClick={() => deleteRule(rule.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Rule
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-20 glass rounded-xl border border-dashed border-border">
                <Users className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
                <h3 className="text-lg font-display font-bold text-foreground mb-1">No contacts found</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Add numbers on the left to start controlling how BusyBot replies to your friends and family.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
