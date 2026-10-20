import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { pwaAssets } from "../scripts/pwa-assets";

const publicDirectory = new URL("../public/", import.meta.url);
const workerSource = readFileSync(new URL("sw.js", publicDirectory), "utf8");
const origin = "https://warrantly.example";

function createWorker() {
  type WorkerEvent = {
    data?: unknown;
    waitUntil: (task: Promise<unknown>) => void;
    request?: { url: string; method: string; mode: string };
    respondWith?: (task: Promise<Response>) => void;
  };
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const keyFor = (request: string | { url: string }) =>
    new URL(typeof request === "string" ? request : request.url, origin).href;
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {
        put: async (request: string | Request, response: Response) => {
          entries.set(keyFor(request), response.clone());
        },
        match: async (request: string | Request) =>
          entries.get(keyFor(request))?.clone(),
        keys: async () => [...entries.keys()].map((url) => new Request(url)),
        delete: async (request: string | Request) =>
          entries.delete(keyFor(request)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const network = vi.fn(
    async (_request: unknown, _options?: unknown) =>
      new Response("public resource", {
        headers: { "Content-Type": "application/octet-stream" },
      }),
  );
  const skipWaiting = vi.fn();
  const claim = vi.fn();
  runInContext(
    workerSource,
    createContext({
      self: {
        location: { origin },
        addEventListener: (
          name: string,
          handler: (event: WorkerEvent) => void,
        ) => handlers.set(name, handler),
        skipWaiting,
        clients: { claim },
      },
      caches,
      fetch: network,
      URL,
      Response,
    }),
  );
  return {
    stores,
    network,
    skipWaiting,
    claim,
    async lifecycle(name: string, data?: unknown) {
      const tasks: Promise<unknown>[] = [];
      handlers.get(name)?.({
        data,
        waitUntil: (task: Promise<unknown>) => tasks.push(task),
      });
      await Promise.all(tasks);
    },
    async request(
      path: string,
      options: { method?: string; mode?: string } = {},
    ) {
      const tasks: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      handlers.get("fetch")?.({
        request: {
          url: new URL(path, origin).href,
          method: options.method ?? "GET",
          mode: options.mode ?? "cors",
        },
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
        waitUntil: (task: Promise<unknown>) => tasks.push(task),
      });
      const result = await response;
      await Promise.all(tasks);
      return result;
    },
    cachedPaths() {
      return [...stores.values()].flatMap((entries) =>
        [...entries.keys()].map((url) => new URL(url).pathname),
      );
    },
  };
}

describe("installable app assets", () => {
  it("uses real sized PNG icons and valid existing app shortcuts", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("manifest.webmanifest", publicDirectory), "utf8"),
    );
    expect(manifest).toMatchObject({
      id: "/",
      start_url: "/home",
      scope: "/",
      display: "standalone",
    });
    expect(
      manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url),
    ).toEqual(["/scan", "/vault"]);
    for (const icon of manifest.icons) {
      const png = readFileSync(new URL(icon.src.slice(1), publicDirectory));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(
        icon.sizes,
      );
    }
    const apple = readFileSync(
      new URL("icons/apple-touch-icon.png", publicDirectory),
    );
    expect([apple.readUInt32BE(16), apple.readUInt32BE(20)]).toEqual([
      180, 180,
    ]);
  });

  it("prepares only public offline resources without automatically activating an update", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");
    expect(worker.cachedPaths()).toContain("/offline.html");
    expect(worker.cachedPaths()).toHaveLength(7);
    expect(
      worker.network.mock.calls.every(
        ([, options]) =>
          (options as { credentials: string }).credentials === "omit",
      ),
    ).toBe(true);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    await worker.lifecycle("message", { type: "SOMETHING_ELSE" });
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    await worker.lifecycle("message", { type: "SKIP_WAITING" });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe("PWA cache privacy and freshness", () => {
  it("rejects an offline resource marked private during worker installation", async () => {
    const worker = createWorker();
    worker.network.mockResolvedValueOnce(
      new Response("private HTML", {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/html",
        },
      }),
    );
    await expect(worker.lifecycle("install")).rejects.toThrow(
      "offline resource",
    );
    expect(worker.cachedPaths()).not.toContain("/offline.html");
  });

  it("never intercepts API, authentication, signed files, non-GET or cross-origin requests", async () => {
    const worker = createWorker();
    for (const path of [
      "/api/bills",
      "/_server/functions/getBill",
      "/__clerk/token",
      "/uploads/receipt.png",
      "/assets/receipt-abcdefgh.png?signature=secret",
      "https://clerk.example/token",
      "https://storage.example/private/invoice.pdf",
    ]) {
      expect(await worker.request(path)).toBeUndefined();
    }
    expect(
      await worker.request("/api/export", { mode: "navigate" }),
    ).toBeUndefined();
    expect(
      await worker.request("/assets/app-abcdefgh.js", { method: "POST" }),
    ).toBeUndefined();
    expect(worker.network).not.toHaveBeenCalled();
    expect(worker.cachedPaths()).toEqual([]);
  });

  it("serves fingerprinted public assets from cache after the first successful request", async () => {
    const worker = createWorker();
    await worker.request("/assets/app-abcdefgh.js");
    await worker.request("/assets/app-abcdefgh.js");
    expect(worker.network).toHaveBeenCalledOnce();
    expect(worker.cachedPaths()).toEqual(["/assets/app-abcdefgh.js"]);
  });

  it("does not store private, no-store, HTML or redirected responses masquerading as an asset", async () => {
    const worker = createWorker();
    for (const response of [
      new Response("private", {
        headers: { "Cache-Control": "private, max-age=60" },
      }),
      new Response("secret", { headers: { "Cache-Control": "no-store" } }),
      new Response("<html>sign in</html>", {
        headers: { "Content-Type": "text/html" },
      }),
      new Response("redirect"),
    ]) {
      if ((await response.clone().text()) === "redirect")
        Object.defineProperty(response, "redirected", { value: true });
      worker.network.mockResolvedValueOnce(response);
      await worker.request("/assets/app-abcdefgh.js");
    }
    expect(worker.cachedPaths()).toEqual([]);
  });

  it("fetches account pages fresh and falls back to a generic offline page without retaining account HTML", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");
    worker.network.mockResolvedValueOnce(
      new Response("private bill details", {
        headers: { "Content-Type": "text/html" },
      }),
    );
    const online = await worker.request("/item/private-id", {
      mode: "navigate",
    });
    expect(await online!.text()).toBe("private bill details");
    worker.network.mockRejectedValueOnce(new TypeError("Offline"));
    const offline = await worker.request("/item/private-id", {
      mode: "navigate",
    });
    expect(await offline!.text()).toBe("public resource");
    expect(worker.cachedPaths()).not.toContain("/item/private-id");
  });

  it("bounds cached build assets and preserves the offline resources", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");
    for (let index = 0; index < 100; index += 1)
      await worker.request(`/assets/chunk${index}-abcdefgh.js`);
    expect(
      worker.cachedPaths().filter((path) => path.startsWith("/assets/")),
    ).toHaveLength(96);
    expect(worker.cachedPaths()).toContain("/offline.html");
    worker.stores.set("warrantly-public-oldest", new Map());
    worker.stores.set("warrantly-public-previous-two", new Map());
    worker.stores.set("warrantly-public-previous-one", new Map());
    worker.stores.set("another-app-cache", new Map());
    await worker.lifecycle("activate");
    expect(worker.stores.has("warrantly-public-oldest")).toBe(false);
    expect(worker.stores.has("warrantly-public-previous-two")).toBe(true);
    expect(worker.stores.has("warrantly-public-previous-one")).toBe(true);
    expect(worker.stores.has("another-app-cache")).toBe(true);
    expect(worker.claim).toHaveBeenCalledOnce();
  });

  it("keeps cached fingerprinted assets usable for a tab on the previous release", async () => {
    const worker = createWorker();
    const previousAsset = `${origin}/assets/review-previous123.js`;
    worker.stores.set(
      "warrantly-public-previous",
      new Map([
        [previousAsset, new Response("previous review module")],
        [`${origin}/manifest.webmanifest`, new Response("old manifest")],
      ]),
    );
    await worker.lifecycle("install");
    await worker.lifecycle("activate");
    worker.network.mockClear();
    const response = await worker.request(previousAsset);
    expect(await response!.text()).toBe("previous review module");
    expect(worker.network).not.toHaveBeenCalled();
    const manifest = await worker.request("/manifest.webmanifest");
    expect(await manifest!.text()).toBe("public resource");
    expect(worker.stores.has("warrantly-public-previous")).toBe(true);
  });
});

describe("PWA release stamping", () => {
  it("changes the output worker when app code changes while leaving the source template untouched", async () => {
    const plugin = pwaAssets();
    (plugin.configResolved as (config: unknown) => void)({
      publicDir: fileURLToPath(publicDirectory),
    });
    const emitFile = vi.fn();
    const handler = (
      plugin.generateBundle as {
        handler: (
          this: { emitFile: typeof emitFile },
          options: unknown,
          bundle: unknown,
        ) => Promise<void>;
      }
    ).handler;
    const build = async (code: string) => {
      await handler.call(
        { emitFile },
        {},
        { "assets/app-abcdefgh.js": { type: "chunk", code } },
      );
      const emitted = emitFile.mock.lastCall![0];
      expect(emitted).toMatchObject({ type: "asset", fileName: "sw.js" });
      return emitted.source as string;
    };
    const first = await build("app version one");
    const same = await build("app version one");
    const changed = await build("app version two");
    expect(first).not.toContain("__WARRANTLY_BUILD_ID__");
    expect(first).toBe(same);
    expect(first).not.toBe(changed);
    expect(readFileSync(new URL("sw.js", publicDirectory), "utf8")).toBe(
      workerSource,
    );
  });
});
