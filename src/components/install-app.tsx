import { useEffect, useId, useRef, useState } from "react";
import { Download } from "lucide-react";
import { usePwa } from "@/lib/pwa-context";
import { isAppleMobile } from "@/lib/pwa";
import { cn } from "@/lib/utils";

export function InstallApp({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { installed, requestInstall } = usePwa();
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);

  useEffect(() => {
    if (showInstructions) {
      setAppleMobile(isAppleMobile());
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [showInstructions]);

  if (installed) return null;
  return (
    <>
      <button
        type="button"
        title="Install Warrantly"
        aria-label="Install Warrantly"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={async () => {
          if ((await requestInstall()) === "unavailable")
            setShowInstructions(true);
        }}
      >
        <Download className="size-4" aria-hidden="true" />
        {!compact && <span>Install app</span>}
      </button>
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
      </dialog>
    </>
  );
}
