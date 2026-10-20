export const INSTALL_PREFERENCE_KEY = "warrantly:install-preference:v1";

export type InstallPreference =
  "dismissed" | "accepted" | "acknowledged" | "installed";

export function readInstallPreference(): InstallPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(INSTALL_PREFERENCE_KEY);
    return value === "dismissed" ||
      value === "accepted" ||
      value === "acknowledged" ||
      value === "installed"
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Keep a confirmed installation when another tab dismisses an older prompt. */
export function rememberInstallPreference(
  next: InstallPreference,
): InstallPreference {
  const preference =
    readInstallPreference() === "installed" ? "installed" : next;
  if (typeof window === "undefined") return preference;
  try {
    window.localStorage.setItem(INSTALL_PREFERENCE_KEY, preference);
  } catch {
    // The caller still keeps this preference for the current page.
  }
  return preference;
}

/** Unsupported, blocked or slow platform detection must not delay the app. */
export async function detectInstalledRelatedApp(
  timeoutMs = 800,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined")
      return false;
    const platformNavigator = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<unknown>;
    };
    if (typeof platformNavigator.getInstalledRelatedApps !== "function")
      return false;

    const manifestUrl = new URL(
      "/manifest.webmanifest",
      window.location.origin,
    );
    const appId = new URL("/", window.location.origin);
    const apps = await Promise.race([
      platformNavigator.getInstalledRelatedApps(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), Math.max(0, timeoutMs));
      }),
    ]);
    if (!Array.isArray(apps)) return false;
    return apps.some((app: unknown) => {
      if (typeof app !== "object" || app === null) return false;
      const related = app as {
        platform?: unknown;
        url?: unknown;
        id?: unknown;
      };
      if (
        related.platform !== "webapp" ||
        typeof related.url !== "string" ||
        !related.url.trim()
      )
        return false;
      try {
        if (new URL(related.url, manifestUrl).href !== manifestUrl.href)
          return false;
        // Android may omit the app id; a supplied id must agree with ours.
        return (
          related.id === undefined ||
          (typeof related.id === "string" &&
            Boolean(related.id.trim()) &&
            new URL(related.id, appId).href === appId.href)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
