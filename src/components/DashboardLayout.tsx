import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function DashboardLayout() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Skip if already onboarded (localStorage fast check)
    if (localStorage.getItem(`busybot_onboarded_${user.id}`)) {
      setChecked(true);
      return;
    }

    // Check if user has a settings row — if not, show onboarding
    supabase
      .from("settings")
      .select("id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) {
          setShowOnboarding(true);
        } else {
          // Has settings, mark as onboarded
          localStorage.setItem(`busybot_onboarded_${user.id}`, "1");
        }
        setChecked(true);
      });
  }, [user]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 backdrop-blur-md px-4">
            <SidebarTrigger />
          </header>
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {checked && showOnboarding && (
        <OnboardingWizard open={showOnboarding} onComplete={handleOnboardingComplete} />
      )}
    </SidebarProvider>
  );
}
