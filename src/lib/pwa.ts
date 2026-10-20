export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function isAppleMobile() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Register after initial rendering; keep development HMR free of a worker. */
export function schedulePwaRegistration(
  onUpdate: (registration: ServiceWorkerRegistration) => void,
) {
  if (
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  ) {
    return () => {};
  }

  let cancelled = false;
  const cleanup: Array<() => void> = [];
  const observedWorkers = new WeakSet<ServiceWorker>();
  const announcedWorkers = new WeakSet<ServiceWorker>();
  let currentRegistration: ServiceWorkerRegistration | undefined;
  let currentController = navigator.serviceWorker.controller;
  let changedBeforeObservation = false;
  const announce = (
    registration: ServiceWorkerRegistration,
    worker: ServiceWorker | null,
  ) => {
    if (cancelled || !worker || announcedWorkers.has(worker)) return;
    announcedWorkers.add(worker);
    onUpdate(registration);
  };
  const controllerChanged = () => {
    const previous = currentController;
    currentController = navigator.serviceWorker.controller;
    if (!previous || !currentController || previous === currentController)
      return;
    if (currentRegistration) announce(currentRegistration, currentController);
    else changedBeforeObservation = true;
  };
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    controllerChanged,
  );
  cleanup.push(() =>
    navigator.serviceWorker.removeEventListener(
      "controllerchange",
      controllerChanged,
    ),
  );

  const observe = (registration: ServiceWorkerRegistration) => {
    if (cancelled || currentRegistration === registration) return;
    currentRegistration = registration;
    const notifyWaiting = () => {
      // First installation briefly appears in `waiting` before activating.
      // Only a page with an existing controller has an older app to update.
      if (navigator.serviceWorker.controller) {
        announce(registration, registration.waiting);
      }
    };
    notifyWaiting();
    if (changedBeforeObservation) {
      announce(registration, navigator.serviceWorker.controller);
      changedBeforeObservation = false;
    }
    const watchUpdate = () => {
      const worker = registration.installing;
      if (!worker || observedWorkers.has(worker)) return;
      observedWorkers.add(worker);
      const stateChanged = () => {
        // A statechange may arrive before registration.waiting is populated.
        // An existing controller distinguishes an update from first install.
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          announce(registration, worker);
        }
        notifyWaiting();
      };
      worker.addEventListener("statechange", stateChanged);
      cleanup.push(() =>
        worker.removeEventListener("statechange", stateChanged),
      );
      stateChanged();
    };
    registration.addEventListener("updatefound", watchUpdate);
    watchUpdate();
    cleanup.push(() =>
      registration.removeEventListener("updatefound", watchUpdate),
    );
    let lastUpdate = Date.now();
    const checkUpdate = () => {
      if (document.visibilityState !== "visible") return;
      notifyWaiting();
      if (Date.now() - lastUpdate < 60_000) return;
      lastUpdate = Date.now();
      void registration
        .update()
        .then(notifyWaiting)
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", checkUpdate);
    cleanup.push(() =>
      document.removeEventListener("visibilitychange", checkUpdate),
    );
  };

  // Existing installs can be observed without waiting for an idle callback.
  // This also covers a background tab while another tab installs an update.
  void navigator.serviceWorker
    .getRegistration("/")
    .then((registration) => {
      if (registration) observe(registration);
    })
    .catch(() => {});

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      observe(registration);
    } catch {
      // Install is optional: a disabled worker or offline visit must not block bills.
    }
  };

  const idleId = window.requestIdleCallback?.(() => void register(), {
    timeout: 3000,
  });
  const timeoutId =
    idleId === undefined
      ? window.setTimeout(() => void register(), 1000)
      : undefined;
  return () => {
    cancelled = true;
    if (idleId !== undefined) window.cancelIdleCallback(idleId);
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    cleanup.forEach((dispose) => dispose());
  };
}
