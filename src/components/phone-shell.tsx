import { Link } from "@tanstack/react-router";
import { Bell, Bot, Home, Plus, Wallet } from "lucide-react";
import { UserButton } from "@clerk/tanstack-react-start";
import type { ReactNode } from "react";

const tabs = [
  { to: "/home", label: "Today", icon: Home },
  { to: "/vault", label: "Vault", icon: Wallet },
  { to: "/agent", label: "Assistant", icon: Bot },
  { to: "/reminders", label: "Reminders", icon: Bell },
] as const;

export function PhoneShell({
  children,
  showTabs = true,
}: {
  children: ReactNode;
  showTabs?: boolean;
}) {
  return (
    <div className="min-h-screen bg-secondary">
      <div className="mx-auto grid min-h-screen w-full max-w-[1280px] bg-background lg:grid-cols-[260px_minmax(0,1fr)] lg:border-x lg:border-border">
        {showTabs ? <DesktopRail /> : null}
        <div className="mx-auto flex min-h-screen w-full max-w-[760px] flex-col border-x border-border bg-background lg:max-w-none lg:border-x-0">
          <div className="min-w-0 flex-1 pb-28 lg:pb-8">{children}</div>
        </div>
        {showTabs ? <TabBar /> : null}
      </div>
    </div>
  );
}

function DesktopRail() {
  return (
    <aside className="sticky top-0 hidden h-screen border-r border-border bg-card/55 px-4 py-5 lg:flex lg:flex-col">
      <Link
        to="/"
        className="font-display text-xl font-extrabold tracking-tight"
      >
        Warrantly
      </Link>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Bills, warranty cards and support records in one searchable vault.
      </p>
      <nav className="mt-8 space-y-1">
        {tabs.map((tab) => (
          <RailLink key={tab.to} {...tab} />
        ))}
        <Link
          to="/scan"
          className="mt-4 flex items-center gap-3 rounded-sm bg-foreground px-3 py-3 text-sm font-bold text-background"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          Add a bill
        </Link>
      </nav>
      <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
        <UserButton />
        <p className="text-xs text-muted-foreground">Your private vault</p>
      </div>
    </aside>
  );
}

function TabBar() {
  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[760px] -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-[1fr_auto_1fr_1fr_1fr] items-end gap-1 px-2 pb-5 pt-2">
        <TabLink {...tabs[0]} />
        <Link
          to="/scan"
          className="mx-1 grid h-14 w-14 shrink-0 translate-y-[-14px] place-items-center rounded-full bg-foreground text-background shadow-[0_6px_0_0_var(--color-primary)] transition active:translate-y-[-10px] active:shadow-[0_2px_0_0_var(--color-primary)]"
          aria-label="Add a bill"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </Link>
        <TabLink {...tabs[1]} />
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
      activeProps={{ className: "bg-primary text-primary-foreground" }}
      inactiveProps={{
        className:
          "text-muted-foreground hover:bg-secondary hover:text-foreground",
      }}
      className="flex items-center gap-3 rounded-sm px-3 py-3 text-sm font-bold transition"
    >
      <Icon className="h-4 w-4" strokeWidth={2.2} />
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
      activeProps={{ className: "text-primary" }}
      inactiveProps={{ className: "text-muted-foreground" }}
      className="flex min-w-0 flex-col items-center gap-1 rounded-sm py-1 text-[10px] font-semibold uppercase tracking-normal"
    >
      <Icon className="h-5 w-5" strokeWidth={2.2} />
      {label}
    </Link>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-border px-5 pb-4 pt-8 lg:px-8 lg:pt-10">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-1 break-words text-2xl font-extrabold">{title}</h1>
      </div>
      {right}
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
    active: "bg-primary text-primary-foreground",
    ending: "bg-accent text-accent-foreground",
    expired: "bg-secondary text-muted-foreground",
    unknown: "bg-secondary text-muted-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${styles}`}
    >
      {children}
    </span>
  );
}
