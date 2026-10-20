import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PwaContext, type InstallPromptEvent } from "@/lib/pwa-context";
import { isStandalone, schedulePwaRegistration } from "@/lib/pwa";

export function PwaProvider({ children }: { children: ReactNode }) {
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const reloadRequested = useRef(false);
  const [installed, setInstalled] = useState(false);
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => setInstalled(isStandalone());
    updateInstalled();
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as InstallPromptEvent;
      setCanPromptInstall(true);
    };
    const appInstalled = () => {
      deferredPrompt.current = null;
      setCanPromptInstall(false);
      setInstalled(true);
    };
    const controllerChanged = () => {
      if (reloadRequested.current) window.location.reload();
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    displayMode.addEventListener("change", updateInstalled);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    const cancelRegistration = schedulePwaRegistration((registration) => {
      setDismissedUpdate(false);
      setUpdate(registration);
    });
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
      displayMode.removeEventListener("change", updateInstalled);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      cancelRegistration();
    };
  }, []);

  const requestInstall = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return "unavailable" as const;
    deferredPrompt.current = null;
    setCanPromptInstall(false);
    try {
      await prompt.prompt();
      return (await prompt.userChoice).outcome;
    } catch {
      return "unavailable" as const;
    }
  }, []);

  const value = useMemo(
    () => ({ installed, canPromptInstall, requestInstall }),
    [installed, canPromptInstall, requestInstall],
  );

  return (
    <PwaContext.Provider value={value}>
      {children}
      {update && !dismissedUpdate && (
        <section
          role="status"
          aria-label="App update available"
          className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg md:inset-x-auto md:bottom-5 md:right-5"
        >
          <p className="text-sm font-semibold text-foreground">
            An update is ready
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Save your edits before reloading Warrantly.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              onClick={() => {
                if (!update.waiting) {
                  // Another tab may already have activated this update.
                  // This tab still reloads only after its own explicit click.
                  window.location.reload();
                  return;
                }
                reloadRequested.current = true;
                update.waiting.postMessage({ type: "SKIP_WAITING" });
              }}
            >
              Reload app
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground"
              onClick={() => setDismissedUpdate(true)}
            >
              Later
            </button>
          </div>
        </section>
      )}
    </PwaContext.Provider>
  );
}
