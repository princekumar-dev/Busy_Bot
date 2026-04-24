import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type SignUpStatus =
  | "confirmation_sent"
  | "already_registered"
  | "signed_in"
  | "unknown";

type AuthResult = {
  error: Error | null;
};

type SignUpResult = AuthResult & {
  status: SignUpStatus;
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const siteUrl = (import.meta.env.VITE_SITE_URL || window.location.origin).trim();
    const emailRedirectTo = new URL("/dashboard", siteUrl).toString();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { display_name: displayName },
      },
    });

    if (error) {
      return { error: error as Error, status: "unknown" };
    }

    if (data.session) {
      return { error: null, status: "signed_in" };
    }

    if ((data.user?.identities ?? []).length === 0) {
      return { error: null, status: "already_registered" };
    }

    if (data.user?.confirmation_sent_at) {
      return { error: null, status: "confirmation_sent" };
    }

    return { error: null, status: "unknown" };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
