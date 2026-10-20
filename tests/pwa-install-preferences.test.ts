import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSTALL_PREFERENCE_KEY,
  detectInstalledRelatedApp,
  readInstallPreference,
  rememberInstallPreference,
  type InstallPreference,
} from "../src/lib/pwa-install-preferences";

const origin = "https://warrantly.example";

function browser() {
  const data = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
  };
  const window = { localStorage: storage, location: { origin } };
  vi.stubGlobal("window", window);
  vi.stubGlobal("navigator", {});
  return { data, storage, window };
}

function installedApps(apps: unknown) {
  browser();
  const getInstalledRelatedApps = vi.fn(async () => apps);
  vi.stubGlobal("navigator", { getInstalledRelatedApps });
  return getInstalledRelatedApps;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("install promotion preferences", () => {
  it("uses a versioned, app-specific storage key", () => {
    expect(INSTALL_PREFERENCE_KEY).toBe("warrantly:install-preference:v1");
  });

  it.each<InstallPreference>([
    "dismissed",
    "accepted",
    "acknowledged",
    "installed",
  ])("remembers a %s preference across reads", (preference) => {
    browser();
    expect(rememberInstallPreference(preference)).toBe(preference);
    expect(readInstallPreference()).toBe(preference);
  });

  it.each([null, "", "true", "false", "unknown", '"installed"'])(
    "ignores an unrecognized stored preference %j",
    (value) => {
      const { data } = browser();
      if (value !== null) data.set(INSTALL_PREFERENCE_KEY, value);
      expect(readInstallPreference()).toBeNull();
    },
  );

  it.each<InstallPreference>(["dismissed", "accepted", "acknowledged"])(
    "does not overwrite a confirmed installation with %s",
    (preference) => {
      browser();
      rememberInstallPreference("installed");
      expect(rememberInstallPreference(preference)).toBe("installed");
      expect(readInstallPreference()).toBe("installed");
    },
  );

  it("upgrades a dismissed preference to confirmed installation", () => {
    browser();
    rememberInstallPreference("dismissed");
    expect(rememberInstallPreference("installed")).toBe("installed");
    expect(readInstallPreference()).toBe("installed");
  });

  it("is safe during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(readInstallPreference()).toBeNull();
    expect(rememberInstallPreference("dismissed")).toBe("dismissed");
  });

  it("keeps the current-page preference when storage is unavailable", () => {
    const { window } = browser();
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    expect(readInstallPreference()).toBeNull();
    expect(rememberInstallPreference("acknowledged")).toBe("acknowledged");
  });

  it("handles storage read and write failures independently", () => {
    const { storage } = browser();
    storage.getItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    expect(readInstallPreference()).toBeNull();
    expect(rememberInstallPreference("accepted")).toBe("accepted");
    storage.getItem.mockReturnValue("installed");
    storage.setItem.mockImplementation(() => {
      throw new Error("Storage full");
    });
    expect(rememberInstallPreference("dismissed")).toBe("installed");
  });
});

describe("installed related PWA detection", () => {
  it("declares its own manifest and stable id without preferring a native app", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../public/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    );
    expect(manifest.prefer_related_applications).toBe(false);
    expect(manifest.related_applications).toEqual([
      { platform: "webapp", url: "/manifest.webmanifest", id: "/" },
    ]);
  });

  it.each([
    { platform: "webapp", url: "/manifest.webmanifest", id: "/" },
    {
      platform: "webapp",
      url: `${origin}/manifest.webmanifest`,
      id: `${origin}/`,
    },
    { platform: "webapp", url: "manifest.webmanifest", id: "/" },
    { platform: "webapp", url: "/manifest.webmanifest" },
  ])(
    "recognizes only this PWA from relative or absolute data %j",
    async (app) => {
      installedApps([app]);
      expect(await detectInstalledRelatedApp()).toBe(true);
    },
  );

  it.each([
    { platform: "play", url: "/manifest.webmanifest", id: "/" },
    { platform: "windows", url: "/manifest.webmanifest", id: "/" },
    {
      platform: "webapp",
      url: "https://other.example/manifest.webmanifest",
      id: "/",
    },
    { platform: "webapp", url: "/different.webmanifest", id: "/" },
    { platform: "webapp", url: "/manifest.webmanifest?other", id: "/" },
    { platform: "webapp", url: "/manifest.webmanifest#other", id: "/" },
    { platform: "webapp", url: "/manifest.webmanifest", id: "/different" },
    {
      platform: "webapp",
      url: "/manifest.webmanifest",
      id: "https://other.example/",
    },
    { platform: "webapp", url: "/manifest.webmanifest", id: "" },
    { platform: "webapp", url: "/manifest.webmanifest", id: null },
    { platform: "webapp", url: "/manifest.webmanifest", id: "/#other" },
    { platform: "webapp", url: "https://[invalid", id: "/" },
    { platform: "webapp", id: "/" },
    { platform: "webapp", url: "" },
    null,
    "webapp",
  ])("rejects another app or malformed result %j", async (app) => {
    installedApps([app]);
    expect(await detectInstalledRelatedApp()).toBe(false);
  });

  it.each([[], null, {}, "installed"])(
    "does not infer installation from missing or malformed data %j",
    async (apps) => {
      installedApps(apps);
      expect(await detectInstalledRelatedApp()).toBe(false);
    },
  );

  it("is safe in unsupported browsers and during server rendering", async () => {
    browser();
    expect(await detectInstalledRelatedApp()).toBe(false);
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", undefined);
    expect(await detectInstalledRelatedApp()).toBe(false);
  });

  it("catches denied detection and a blocked platform API getter", async () => {
    const getApps = installedApps([]);
    getApps.mockRejectedValueOnce(new Error("Denied"));
    expect(await detectInstalledRelatedApp()).toBe(false);
    vi.stubGlobal(
      "navigator",
      Object.defineProperty({}, "getInstalledRelatedApps", {
        get: () => {
          throw new DOMException("Blocked", "SecurityError");
        },
      }),
    );
    expect(await detectInstalledRelatedApp()).toBe(false);
  });

  it("bounds slow detection and clears its timeout", async () => {
    vi.useFakeTimers();
    browser();
    vi.stubGlobal("navigator", {
      getInstalledRelatedApps: () => new Promise(() => {}),
    });
    const detection = detectInstalledRelatedApp();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(await detection).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timeout after successful or rejected detection", async () => {
    vi.useFakeTimers();
    const getApps = installedApps([
      { platform: "webapp", url: "/manifest.webmanifest", id: "/" },
    ]);
    expect(await detectInstalledRelatedApp()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    getApps.mockRejectedValueOnce(new Error("Denied"));
    expect(await detectInstalledRelatedApp()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
