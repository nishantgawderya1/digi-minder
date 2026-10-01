import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";

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
              Your document vault starts with Google.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground lg:text-base">
              One sign-in path keeps account recovery, device changes and future sharing rules
              simpler for a personal paperwork vault.
            </p>
            <ul className="mt-8 hidden space-y-3 lg:block">
              {[
                "Encrypted file storage for invoices, cards and service letters.",
                "Extracted purchase dates, serial numbers and warranty deadlines.",
                "Assistant access controlled by the same account identity.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm font-semibold">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-center px-5 py-6 lg:px-8 lg:py-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Sign in or create account
            </p>
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm border border-foreground px-4 py-3.5 text-sm font-bold shadow-[0_4px_0_0_var(--color-primary)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-primary)]">
              <Mail className="h-4 w-4" />
              Continue with Google
            </button>

            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
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
