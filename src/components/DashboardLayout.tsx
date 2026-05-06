import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Bot, LayoutDashboard, MessageSquare, BarChart3, Workflow, Settings } from "lucide-react";

const mobileNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Chats", url: "/conversations", icon: MessageSquare },
  { title: "Ops", url: "/operations", icon: Workflow },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function DashboardLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) return;

    if (localStorage.getItem(`busybot_onboarded_${user.id}`)) {
      setChecked(true);
      return;
    }

    supabase
      .from("settings")
      .select("id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) {
          setShowOnboarding(true);
        } else {
          localStorage.setItem(`busybot_onboarded_${user.id}`, "1");
        }
        setChecked(true);
      });
  }, [user]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  return (
    <>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          {/* Sidebar — hidden on mobile */}
          <div className="hidden md:block">
            <AppSidebar />
          </div>

          <main className="flex-1 overflow-auto pb-20 md:pb-0">
            {/* Header */}
            <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 backdrop-blur-md px-3 md:px-4 gap-3">
              {/* Sidebar trigger — desktop only */}
              <div className="hidden md:block">
                <SidebarTrigger />
              </div>
              {/* Mobile logo */}
              <div className="flex md:hidden items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-primary">
                  <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <span className="font-display text-base font-bold text-foreground">
                  Busy<span className="text-primary">Bot</span>
                </span>
              </div>
            </header>

            {/* Page content */}
            <div className="p-3 sm:p-4 md:p-6">
              <Outlet />
            </div>
          </main>
        </div>

        {checked && showOnboarding && (
          <OnboardingWizard open={showOnboarding} onComplete={handleOnboardingComplete} />
        )}
      </SidebarProvider>

      {/* ─── Mobile bottom navigation ───────────────────────────────────
          MUST be outside <SidebarProvider> — SidebarProvider applies CSS
          transforms that break position:fixed for all descendants.
      ──────────────────────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[9999] flex md:hidden items-center justify-around border-t border-border bg-background/98 backdrop-blur-lg h-16"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {mobileNavItems.map((item) => {
          const isActive =
            location.pathname === item.url ||
            location.pathname.startsWith(item.url + "/");
          return (
            <NavLink
              key={item.url}
              to={item.url}
              className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-all duration-200 ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon
                className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                  isActive ? "text-primary scale-110" : ""
                }`}
              />
              <span className="truncate leading-tight">{item.title}</span>
              {isActive && (
                <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
