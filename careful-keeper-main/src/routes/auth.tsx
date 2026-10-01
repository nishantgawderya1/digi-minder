import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Warrantly" },
      {
        name: "description",
        content: "Sign in to reach your bills, warranty cards and reminders.",
      },
      { property: "og:title", content: "Sign in — Warrantly" },
      {
        property: "og:description",
        content: "Sign in to reach your bills, warranty cards and reminders.",
      },
    ],
  }),
  component: AuthScreen,
});

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="min-h-screen bg-secondary">
      <div className="mx-auto flex min-h-screen w-full max-w-[960px] flex-col border-x border-border bg-background">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4 lg:px-8">
          <Link
            to="/"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="font-display text-base font-extrabold">Warrantly</span>
        </header>

        <main className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="hatch border-b border-border px-5 py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-12">
            <h1 className="max-w-lg text-[28px] font-extrabold leading-tight lg:text-5xl">
              {mode === "signin" ? "Welcome back." : "Let's set up your vault."}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground lg:text-base">
              {mode === "signin"
                ? "Your documents and reminders are waiting."
                : "Takes a minute. Your first bill can go in right after."}
            </p>
            <div className="mt-8 hidden rounded-sm border border-foreground bg-card p-4 lg:block">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Google only
              </p>
              <p className="mt-2 text-sm font-semibold">
                One identity provider keeps account recovery, device changes and sharing
                rules simpler for this kind of personal vault.
              </p>
            </div>
          </div>

        <div className="px-5 py-6 lg:px-8 lg:py-10">
          <div className="grid grid-cols-2 gap-1 rounded-sm border border-border p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-sm py-2 text-xs font-bold uppercase tracking-wider transition ${
                  mode === m
                    ? "bg-foreground text-background"
                    : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {mode === "signup" ? (
              <Field label="Your name" type="text" placeholder="Nishant Gawderya" />
            ) : null}
            <Field label="Email" type="email" placeholder="you@email.com" />
            <Field label="Password" type="password" placeholder="••••••••" />

            <button
              type="submit"
              className="w-full rounded-sm bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-foreground)]"
            >
              {mode === "signin" ? "Sign in" : "Create my vault"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <button className="flex w-full items-center justify-center gap-2 rounded-sm border border-foreground px-4 py-3 text-sm font-bold">
            <Mail className="h-4 w-4" />
            Continue with Google
          </button>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            These are demo screens, so nothing is saved. By continuing you'd agree to the
            terms and privacy notice.
          </p>

          <Link
            to="/home"
            className="mt-6 block text-center text-sm font-bold text-primary underline"
          >
            Skip to the dashboard
          </Link>
        </div>
        </main>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  placeholder,
}: {
  label: string;
  type: string;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-sm border border-input bg-card px-3.5 py-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}
