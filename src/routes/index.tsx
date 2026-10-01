import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bell, Bot, ScanLine, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Warrantly — never lose a bill or warranty again" },
      {
        name: "description",
        content:
          "Snap a bill, get the warranty read for you, and let the assistant chase support when something breaks.",
      },
      {
        property: "og:title",
        content: "Warrantly — bills and warranties, sorted",
      },
      {
        property: "og:description",
        content:
          "Snap, store, and escalate. Your warranty paperwork finally works for you.",
      },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    icon: ScanLine,
    title: "Snap it",
    body: "Point your camera at the bill or warranty card. Nemotron OCR reads the details.",
  },
  {
    icon: ShieldCheck,
    title: "We hold it",
    body: "Every item, serial number, price and cover date lives in one tidy vault.",
  },
  {
    icon: Bell,
    title: "We nudge you",
    body: "A reminder lands before cover ends, so nothing slips past the deadline.",
  },
  {
    icon: Bot,
    title: "We complain for you",
    body: "Describe the fault. The assistant writes the complaint and finds who to send it to.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-secondary">
      <div className="mx-auto w-full max-w-[1280px] border-x border-border bg-background pb-16">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 lg:px-10">
          <span className="font-display text-lg font-extrabold tracking-tight">
            Warrantly
          </span>
          <Link
            to="/auth"
            className="rounded-sm border border-foreground px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
          >
            Sign in
          </Link>
        </header>

        <section className="hatch grid gap-8 border-b border-border px-5 py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end lg:px-10 lg:py-16">
          <div>
            <p className="inline-flex rounded-sm bg-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-background">
              Built for your pocket
            </p>
            <h1 className="mt-4 max-w-3xl text-[34px] font-extrabold leading-[1.05] lg:text-6xl">
              Your bills and warranties, finally on your side.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground lg:text-lg">
              Washing machine died in month four of a six-month warranty?
              Warrantly already knows the dates, the invoice and who to shout
              at.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/scan"
              className="inline-flex items-center justify-between rounded-sm bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-foreground)]"
            >
              Scan your first bill
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/home"
              className="inline-flex items-center justify-center rounded-sm border border-foreground px-4 py-3 text-sm font-bold"
            >
              Look around first
            </Link>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="grid grid-cols-3 divide-x divide-border text-center">
            {[
              ["4", "items held"],
              ["₹3.2L", "value covered"],
              ["54d", "next deadline"],
            ].map(([big, small]) => (
              <div key={small} className="px-2 py-5">
                <p className="font-display text-xl font-extrabold">{big}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {small}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 py-8 lg:px-10">
          <h2 className="text-xl font-extrabold">How it works</h2>
          <ul className="mt-5 grid gap-3 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="rounded-sm border border-border bg-card p-4"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-foreground text-background">
                    <step.icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                  </span>
                  <h3 className="min-w-0 text-base font-bold">
                    <span className="text-muted-foreground">0{i + 1} · </span>
                    {step.title}
                  </h3>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-5 rounded-sm border border-foreground bg-foreground p-5 text-background lg:mx-10 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-background/60">
            One tap away
          </p>
          <p className="mt-2 text-lg font-bold leading-snug">
            “Fridge is leaking.” That sentence is enough — we handle the
            paperwork.
          </p>
          <Link
            to="/agent"
            className="mt-4 inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground lg:mt-0"
          >
            Meet the assistant
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <footer className="mt-10 px-5 text-center text-xs text-muted-foreground">
          Warrantly · demo screens · no documents are stored yet
        </footer>
      </div>
    </div>
  );
}
