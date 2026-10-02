import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Show, SignIn } from "@clerk/tanstack-react-start";

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
  const clerkConfigured = Boolean(
    import.meta.env["VITE_CLERK_PUBLISHABLE_KEY"],
  );

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
          <span className="font-display text-base font-extrabold">
            Warrantly
          </span>
        </header>

        <main className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="hatch border-b border-border px-5 py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-12">
            <h1 className="max-w-lg text-[28px] font-extrabold leading-tight lg:text-5xl">
              Your document vault starts with Google.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground lg:text-base">
              Keep your original bills, purchase details and warranty dates
              together in your private account.
            </p>
            <ul className="mt-8 hidden space-y-3 lg:block">
              {[
                "Private file storage for invoices, cards and service letters.",
                "Extracted purchase dates, serial numbers and warranty deadlines.",
                "Assistant access controlled by the same account identity.",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm font-semibold"
                >
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
            {clerkConfigured ? (
              <>
                <Show when="signed-in">
                  <Navigate to="/home" />
                </Show>
                <SignIn
                  routing="hash"
                  forceRedirectUrl="/home"
                  appearance={{
                    elements: {
                      rootBox: "mt-4 w-full",
                      card: "w-full border border-foreground rounded-sm shadow-[0_4px_0_0_var(--color-primary)]",
                    },
                  }}
                />
              </>
            ) : (
              <p className="mt-4 border border-border bg-secondary p-4 text-sm leading-relaxed text-muted-foreground">
                Add the Clerk publishable and secret keys to your local
                environment to enable sign-in.
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
