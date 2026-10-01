import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  Check,
  FileUp,
  Images,
  Pencil,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { PhoneShell } from "@/components/phone-shell";
import { requireCurrentUser } from "@/lib/route-auth";

export const Route = createFileRoute("/scan")({
  beforeLoad: () => requireCurrentUser(),
  head: () => ({
    meta: [
      { title: "Scan a bill — Warrantly" },
      {
        name: "description",
        content:
          "Capture a bill or warranty card and check the details we read from it.",
      },
      { property: "og:title", content: "Scan a bill — Warrantly" },
      {
        property: "og:description",
        content:
          "Capture a bill or warranty card and check the details we read from it.",
      },
    ],
  }),
  component: ScanScreen,
});

const readFields = [
  ["Item", "FrontLoad 7kg Washing Machine"],
  ["Brand", "Bosch"],
  ["Purchase date", "12 Apr 2026"],
  ["Amount", "₹34,990"],
  ["Serial / model", "BSH-WM-7741-2026"],
  ["Warranty", "6 months · till 12 Oct 2026"],
  ["Seller", "Croma, Andheri West"],
];

function ScanScreen() {
  const [step, setStep] = useState<"capture" | "reading" | "review">("capture");

  return (
    <PhoneShell>
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border px-5 py-4">
        <Link
          to="/home"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-extrabold">
          {step === "review" ? "Check the details" : "Add a document"}
        </h1>
      </header>

      {step !== "review" ? (
        <div className="grid gap-5 px-5 pt-5 lg:grid-cols-[minmax(300px,460px)_minmax(0,1fr)] lg:items-start lg:px-8">
          <div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-foreground bg-foreground lg:min-h-[560px]">
            <div className="hatch absolute inset-0 opacity-30" />
            <div className="absolute inset-6 rounded-sm border-2 border-dashed border-background/50" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-background/70">
                {step === "reading"
                  ? "Reading with Nemotron OCR..."
                  : "Fit the bill in the frame"}
              </p>
            </div>
            {step === "reading" ? (
              <div className="absolute inset-x-6 top-1/3 h-0.5 animate-pulse bg-accent" />
            ) : null}
          </div>

          <div className="lg:sticky lg:top-6 lg:pt-2">
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <Secondary icon={Images} label="Gallery" />
              <button
                onClick={() => {
                  setStep("reading");
                  setTimeout(() => setStep("review"), 1400);
                }}
                className="grid place-items-center rounded-sm bg-primary py-4 text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-foreground)] lg:min-h-24"
              >
                <Camera className="h-6 w-6" strokeWidth={2.2} />
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wider">
                  Capture
                </span>
              </button>
              <Secondary icon={FileUp} label="PDF" />
            </div>

            <p className="mt-5 rounded-sm border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
              Shoot the full page in good light. Warranty cards work best flat,
              with the purchase date visible.
            </p>
            <div className="mt-3 hidden rounded-sm border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground lg:block">
              Desktop uploads can use camera imports, images or PDFs. Nemotron
              OCR reads the document, then the review screen keeps the original
              beside extracted details.
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 px-5 pt-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1fr)] lg:items-start lg:px-8">
          <div className="hidden overflow-hidden rounded-sm border border-foreground bg-foreground lg:block">
            <div className="relative aspect-[3/4]">
              <div className="hatch absolute inset-0 opacity-30" />
              <div className="absolute inset-8 rounded-sm border-2 border-dashed border-background/50" />
              <p className="absolute inset-x-0 bottom-6 text-center text-xs font-bold uppercase tracking-[0.18em] text-background/70">
                Captured invoice preview
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-sm border border-primary bg-primary/10 p-3">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs font-semibold">
                7 details read by Nemotron OCR from 1 page. Tap any line to
                correct it.
              </p>
            </div>

            <dl className="divide-y divide-border rounded-sm border border-border bg-card">
              {readFields.map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold">
                      {value}
                    </dd>
                  </div>
                  <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              ))}
            </dl>

            <div className="rounded-sm border border-border bg-card p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Remind me
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["30 days before", "7 days before", "On the last day"].map(
                  (r, i) => (
                    <span
                      key={r}
                      className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1.5 text-xs font-semibold ${
                        i < 2
                          ? "bg-foreground text-background"
                          : "border border-border text-muted-foreground"
                      }`}
                    >
                      {i < 2 ? <Check className="h-3 w-3" /> : null}
                      {r}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("capture")}
                className="rounded-sm border border-foreground px-4 py-3 text-sm font-bold"
              >
                Retake
              </button>
              <Link
                to="/home"
                className="flex-1 rounded-sm bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-foreground)]"
              >
                Save to vault
              </Link>
            </div>
          </div>
        </div>
      )}
    </PhoneShell>
  );
}

function Secondary({
  icon: Icon,
  label,
}: {
  icon: typeof Camera;
  label: string;
}) {
  return (
    <button className="grid place-items-center rounded-sm border border-border bg-card py-4 active:bg-secondary">
      <Icon className="h-5 w-5" strokeWidth={2.2} />
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider">
        {label}
      </span>
    </button>
  );
}
