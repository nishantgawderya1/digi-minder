import { useEffect, useId, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { usePwa } from "@/lib/pwa-context";
import { isAppleMobile } from "@/lib/pwa";
import { cn } from "@/lib/utils";

export function InstallApp({ className }: { className?: string }) {
  const {
    installReady,
    installSuppressed,
    installing,
    requestInstall,
    dismissInstall,
    acknowledgeInstalled,
  } = usePwa();
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const focusWithin = useRef(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const hidden = !installReady || installSuppressed;

  function focusPage() {
    const target =
      container.current?.closest("header")?.querySelector("h1") ??
      document.querySelector("h1") ??
      document.querySelector("main");
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
      target.addEventListener(
        "blur",
        () => target.removeAttribute("tabindex"),
        {
          once: true,
        },
      );
    }
    target.focus({ preventScroll: true });
  }

  function hidePromotion(acknowledged = false) {
    dialog.current?.close();
    setShowInstructions(false);
    focusPage();
    if (acknowledged) acknowledgeInstalled();
    else dismissInstall();
  }

  useEffect(() => {
    if (showInstructions && !hidden) {
      setAppleMobile(isAppleMobile());
      dialog.current?.showModal();
    } else {
      const wasOpen = dialog.current?.open;
      dialog.current?.close();
      if (hidden && (wasOpen || focusWithin.current)) {
        focusWithin.current = false;
        focusPage();
      }
    }
  }, [showInstructions, hidden]);

  return (
    <>
      <div
        ref={container}
        onFocusCapture={() => {
          focusWithin.current = true;
        }}
        onBlurCapture={(event) => {
          focusWithin.current =
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget);
        }}
        className={cn(
          "inline-flex min-w-0 shrink-0 items-stretch rounded-xl border border-primary/20 bg-primary/10 text-primary",
          className,
          hidden && "hidden",
        )}
      >
        {!hidden && (
          <>
            <button
              type="button"
              title="Install Warrantly"
              disabled={installing}
              aria-busy={installing || undefined}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-l-xl px-3 text-sm font-semibold transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
              onClick={async () => {
                const result = await requestInstall();
                if (result === "unavailable") setShowInstructions(true);
                else if (result !== "busy") focusPage();
              }}
            >
              <Download className="size-4 shrink-0" aria-hidden="true" />
              <span>Install app</span>
            </button>
            <button
              type="button"
              aria-label="Dismiss install app"
              title="Don't show again in this browser"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-r-xl border-l border-primary/20 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => hidePromotion()}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-3xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/40"
        onClose={() => setShowInstructions(false)}
      >
        <h2 id={titleId} className="text-xl font-semibold tracking-tight">
          Warrantly, one tap away
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          Add Warrantly to your home screen for a dedicated app window. Your
          bills and AI tools still need internet.
        </p>
        <p className="mt-4 rounded-2xl bg-muted p-4 text-sm leading-relaxed">
          {appleMobile
            ? "Open this site in Safari, tap Share, then “Add to Home Screen”. Turn on “Open as Web App” if shown, then tap “Add” to finish."
            : "Open your browser menu and choose “Install Warrantly” or “Add to Home screen”. On a computer, look for the install icon in the address bar. If no option appears, try Chrome, Edge or Safari."}
        </p>
        <button
          type="button"
          className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          onClick={() => setShowInstructions(false)}
        >
          Got it
        </button>
        <div className="mt-1 flex flex-wrap justify-between gap-x-2">
          <button
            type="button"
            className="min-h-11 rounded-xl px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => hidePromotion(true)}
          >
            Already installed
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl px-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => hidePromotion()}
          >
            Don’t show again
          </button>
        </div>
      </dialog>
    </>
  );
}
