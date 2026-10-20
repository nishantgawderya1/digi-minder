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
import {
  INSTALL_PREFERENCE_KEY,
  detectInstalledRelatedApp,
  readInstallPreference,
  rememberInstallPreference,
  type InstallPreference,
} from "@/lib/pwa-install-preferences";

export function PwaProvider({ children }: { children: ReactNode }) {
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const reloadRequested = useRef(false);
  const preferenceRef = useRef<InstallPreference | null>(null);
  const installingRef = useRef(false);
  const [preference, setPreference] = useState<InstallPreference | null>(null);
  const [installReady, setInstallReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  const rememberPreference = useCallback((reason: InstallPreference) => {
    const next = rememberInstallPreference(
      preferenceRef.current === "installed" ? "installed" : reason,
    );
    preferenceRef.current = next;
    setPreference(next);
    deferredPrompt.current = null;
    setCanPromptInstall(false);
  }, []);
  const dismissInstall = useCallback(
    () => rememberPreference("dismissed"),
    [rememberPreference],
  );
  const acknowledgeInstalled = useCallback(
    () => rememberPreference("acknowledged"),
    [rememberPreference],
  );

  useEffect(() => {
    let active = true;
    let checkingInstalled = false;
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncPreference = () => {
      const saved = readInstallPreference();
      if (saved && preferenceRef.current !== "installed") {
        preferenceRef.current = saved;
        setPreference(saved);
        deferredPrompt.current = null;
        setCanPromptInstall(false);
      }
    };
    const updateInstalled = () => {
      if (isStandalone()) rememberPreference("installed");
    };
    const checkInstalled = async () => {
      syncPreference();
      updateInstalled();
      // Remembered choices render without waiting for browser discovery.
      if (preferenceRef.current) setInstallReady(true);
      if (checkingInstalled) return;
      checkingInstalled = true;
      const detected = await detectInstalledRelatedApp();
      checkingInstalled = false;
      if (!active) return;
      if (detected) rememberPreference("installed");
      setInstallReady(true);
    };
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      if (preferenceRef.current) return;
      deferredPrompt.current = event as InstallPromptEvent;
      setCanPromptInstall(true);
    };
    const appInstalled = () => rememberPreference("installed");
    const storageChanged = (event: StorageEvent) => {
      if (event.key === INSTALL_PREFERENCE_KEY || event.key === null)
        syncPreference();
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "visible") void checkInstalled();
    };
    const controllerChanged = () => {
      if (reloadRequested.current) window.location.reload();
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    window.addEventListener("storage", storageChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    displayMode.addEventListener("change", updateInstalled);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    const cancelRegistration = schedulePwaRegistration((registration) => {
      setDismissedUpdate(false);
      setUpdate(registration);
    });
    void checkInstalled();
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
      window.removeEventListener("storage", storageChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
      displayMode.removeEventListener("change", updateInstalled);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      cancelRegistration();
    };
  }, [rememberPreference]);

  const requestInstall = useCallback(async () => {
    if (installingRef.current || preferenceRef.current) return "busy" as const;
    const prompt = deferredPrompt.current;
    if (!prompt) return "unavailable" as const;
    deferredPrompt.current = null;
    setCanPromptInstall(false);
    installingRef.current = true;
    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      rememberPreference(outcome);
      return outcome;
    } catch {
      return "unavailable" as const;
    } finally {
      installingRef.current = false;
      setInstalling(false);
    }
  }, [rememberPreference]);

  const value = useMemo(
    () => ({
      installed: preference === "installed",
      installReady,
      installSuppressed: preference !== null,
      installing,
      canPromptInstall,
      requestInstall,
      dismissInstall,
      acknowledgeInstalled,
    }),
    [
      preference,
      installReady,
      installing,
      canPromptInstall,
      requestInstall,
      dismissInstall,
      acknowledgeInstalled,
    ],
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
