import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

async function controlled(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    }
  });
}

async function waitingUpdate(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await navigator.serviceWorker.getRegistration())?.waiting?.state,
      ),
    )
    .toBe("installed");
}

test("production install assets and private navigation work offline without caching account pages", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(
    page.getByRole("button", { name: "Install Warrantly" }),
  ).toBeVisible();
  const response = await page.request.get("/manifest.webmanifest");
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/home");
  for (const icon of manifest.icons) {
    const result = await page.request.get(icon.src);
    expect(result.ok()).toBe(true);
    expect(result.headers()["content-type"]).toContain("image/png");
  }
  const script = await (await page.request.get("/sw.js")).text();
  expect(script).not.toContain("__WARRANTLY_BUILD_ID__");
  await controlled(page);
  const auth = await page.goto("/auth", { waitUntil: "domcontentloaded" });
  expect(auth?.headers()["cache-control"]).toContain("no-store");
  await context.setOffline(true);
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /reconnected/i }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Reconnect");
  const stored = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith("warrantly-public-"),
    );
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(stored).toContain("/offline.html");
  expect(
    stored.some((path) =>
      /^\/(?:home|auth|vault|review|item|api|_server)/.test(path),
    ),
  ).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("pwa-offline-mobile.png"),
  });
});

test("a new release waits for an explicit reload and can be deferred", async ({
  page,
}) => {
  const workerFile = new URL("../../.output/public/sw.js", import.meta.url);
  const original = await readFile(workerFile, "utf8");
  try {
    await page.goto("/");
    await controlled(page);
    await expect(
      page.getByRole("status", { name: "App update available" }),
    ).not.toBeVisible();
    await page.evaluate(() => {
      document.documentElement.dataset["unsavedWorkTest"] = "keep this";
    });
    const changed = original.replace(
      /warrantly-public-v1-([a-f0-9]{16})/,
      "warrantly-public-v1-test-$1",
    );
    expect(changed).not.toBe(original);
    await writeFile(
      workerFile,
      changed + "\n// Browser update lifecycle regression test\n",
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await waitingUpdate(page);
    const update = page.getByRole("status", { name: "App update available" });
    await expect(update).toBeVisible({ timeout: 15_000 });
    await expect(update).toContainText("Save your edits");
    expect(
      await page.evaluate(
        () => document.documentElement.dataset["unsavedWorkTest"],
      ),
    ).toBe("keep this");
    await update.getByRole("button", { name: "Later", exact: true }).click();
    await expect(update).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.dataset["unsavedWorkTest"],
      ),
    ).toBe("keep this");
  } finally {
    await writeFile(workerFile, original);
  }
});

test("updating one tab preserves another tab's state and old public modules", async ({
  page,
  context,
}) => {
  const workerFile = new URL("../../.output/public/sw.js", import.meta.url);
  const original = await readFile(workerFile, "utf8");
  const other = await context.newPage();
  try {
    await page.goto("/");
    await controlled(page);
    await other.goto("/");
    await controlled(other);
    for (const tab of [page, other]) {
      await expect(
        tab.getByRole("status", { name: "App update available" }),
      ).not.toBeVisible();
    }
    await other.evaluate(async () => {
      document.documentElement.dataset["unsavedWorkTest"] = "keep this";
      (
        window as Window & { originalController?: ServiceWorker | null }
      ).originalController = navigator.serviceWorker.controller;
      const name = (await caches.keys()).find((key) =>
        key.startsWith("warrantly-public-"),
      );
      if (!name) throw new Error("Public app cache not created");
      await (
        await caches.open(name)
      ).put(
        "/assets/previous-release-12345678.js",
        new Response("export const version = 'previous-release'", {
          headers: { "Content-Type": "application/javascript" },
        }),
      );
    });
    await writeFile(
      workerFile,
      original.replace(
        /warrantly-public-v1-([a-f0-9]{16})/,
        "warrantly-public-v1-test-$1",
      ) + "\n// Multi-tab update regression test\n",
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await waitingUpdate(page);
    await waitingUpdate(other);
    const update = page.getByRole("status", { name: "App update available" });
    const otherUpdate = other.getByRole("status", {
      name: "App update available",
    });
    await expect(update).toBeVisible({ timeout: 15_000 });
    await expect(otherUpdate).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      update.getByRole("button", { name: "Reload app", exact: true }).click(),
    ]);
    await expect
      .poll(() =>
        other.evaluate(
          () =>
            navigator.serviceWorker.controller !==
            (window as Window & { originalController?: ServiceWorker | null })
              .originalController,
        ),
      )
      .toBe(true);
    expect(
      await other.evaluate(
        async () =>
          (await navigator.serviceWorker.getRegistration())?.waiting === null,
      ),
    ).toBe(true);
    expect(
      await other.evaluate(
        () => document.documentElement.dataset["unsavedWorkTest"],
      ),
    ).toBe("keep this");
    await context.setOffline(true);
    expect(
      await other.evaluate(async () =>
        (await fetch("/assets/previous-release-12345678.js")).text(),
      ),
    ).toContain("previous-release");
    await context.setOffline(false);
    // The other tab may still display the prompt after its worker activated.
    // An explicit reload must honor that choice even when registration.waiting is null.
    await Promise.all([
      other.waitForEvent("domcontentloaded"),
      otherUpdate
        .getByRole("button", { name: "Reload app", exact: true })
        .click(),
    ]);
    expect(
      await other.evaluate(
        () => document.documentElement.dataset["unsavedWorkTest"],
      ),
    ).toBeUndefined();
  } finally {
    await context.setOffline(false);
    await writeFile(workerFile, original);
    await other.close();
  }
});
