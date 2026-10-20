import { Link } from "@tanstack/react-router";
import { Bell, Bot, Home, Plus, ShieldCheck, Wallet } from "lucide-react";
import { UserButton } from "@clerk/tanstack-react-start";
import type { ReactNode } from "react";
import { InstallApp } from "@/components/install-app";

const tabs = [
  { to: "/home", label: "Today", icon: Home },
  { to: "/vault", label: "Vault", icon: Wallet },
  { to: "/agent", label: "Assistant", icon: Bot },
  { to: "/reminders", label: "Reminders", icon: Bell },
] as const;

export function PhoneShell({
  children,
  showTabs = true,
  showMobileTabs = true,
}: {
  children: ReactNode;
  showTabs?: boolean;
  showMobileTabs?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-sm bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <div
        className={`mx-auto grid min-h-dvh w-full max-w-[1440px] ${showTabs ? "lg:grid-cols-[232px_minmax(0,1fr)]" : ""}`}
      >
        {showTabs ? <DesktopRail /> : null}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex min-h-dvh w-full min-w-0 max-w-[760px] flex-col lg:max-w-none"
        >
          <div
            className={`min-w-0 flex-1 ${showMobileTabs ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-[calc(8rem+env(safe-area-inset-bottom))]"} lg:pb-8`}
          >
            {children}
          </div>
        </main>
        {showTabs && showMobileTabs ? <TabBar /> : null}
      </div>
    </div>
  );
}

function DesktopRail() {
  return (
    <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-border bg-sidebar px-5 py-8 lg:flex lg:flex-col">
      <Link
        to="/home"
        className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight"
      >
        <span className="grid h-10 w-10 place-items-center rounded-sm bg-primary text-primary-foreground">
          <ShieldCheck className="h-6 w-6" />
        </span>
        Warrantly
      </Link>
      <p className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Your workspace
      </p>
      <nav aria-label="Main navigation" className="mt-3 space-y-1.5">
        {tabs.map((tab) => (
          <RailLink key={tab.to} {...tab} />
        ))}
        <Link
          to="/scan"
          className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-sm bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add a bill
        </Link>
      </nav>
      <div className="mt-auto">
        <InstallApp className="mb-3 w-full justify-start" />
        <div className="mb-5 rounded-sm bg-secondary/65 p-3.5">
          <ShieldCheck className="mb-2 h-5 w-5 text-primary" />
          <p className="text-xs font-semibold">A little less paperwork.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Your receipts and warranty dates, ready when you need them.
          </p>
        </div>
        <div className="flex items-center gap-3 border-t border-border pt-5">
          <UserButton />
          <div>
            <p className="text-xs font-semibold">Personal account</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Your private vault
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TabBar() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-[760px] -translate-x-1/2 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="grid grid-cols-5 items-center gap-1 px-2 py-2">
        <TabLink {...tabs[0]} />
        <TabLink {...tabs[1]} />
        <Link
          to="/scan"
          className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-primary"
          aria-label="Add a bill"
        >
          <span className="grid h-9 w-11 place-items-center rounded-sm bg-primary text-primary-foreground">
            <Plus className="h-5 w-5" />
          </span>
          Add bill
        </Link>
        <TabLink {...tabs[2]} />
        <TabLink {...tabs[3]} />
      </div>
    </nav>
  );
}

function RailLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Home;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-secondary text-primary" }}
      inactiveProps={{
        className: "text-muted-foreground hover:bg-muted hover:text-foreground",
      }}
      className="flex min-h-11 items-center gap-3 rounded-sm px-3 py-3 text-sm font-semibold transition"
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      {label}
    </Link>
  );
}

function TabLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Home;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "text-primary bg-secondary/60" }}
      inactiveProps={{ className: "text-muted-foreground" }}
      className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-sm px-0.5 text-[10px] font-semibold"
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />
      {label}
    </Link>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  right,
  description,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
  description?: string;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 pb-2 pt-7 lg:px-8 lg:pt-9">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-1.5 break-words text-[28px] font-bold tracking-tight lg:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <InstallApp compact className="lg:hidden" />
        {right}
      </div>
    </header>
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: "active" | "ending" | "expired" | "unknown";
  children: ReactNode;
}) {
  const styles = {
    active: "bg-primary/10 text-primary",
    ending: "bg-accent/20 text-foreground",
    expired: "bg-destructive/10 text-destructive",
    unknown: "bg-secondary text-muted-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      {children}
    </span>
  );
}
