import { expect, test } from "@playwright/test";

test("slow navigation shows a responsive loading screen until the page is ready", async ({
  page,
}) => {
  await page.goto("/agent");
  await expect(
    page.getByRole("heading", { name: "Your bills, answered", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem("test-service-latency", "1000");
    sessionStorage.setItem("test-request-counts", "{}");
  });
  await page
    .getByRole("link", { name: "Today", exact: true })
    .evaluate((link) => (link as HTMLAnchorElement).click());
  const loading = page.getByRole("main", { name: "Loading page" });
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute("aria-busy", "true");
  expect(
    await loading.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Hello, Test", exact: true }),
  ).toBeVisible();
  await expect(loading).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("test-request-counts") || "{}"),
    ),
  ).toEqual({ vault: 1 });
});

test("navigation avoids a separate authorization round trip", async ({
  page,
}) => {
  await page.goto("/agent");
  await expect(
    page.getByRole("heading", { name: "Your bills, answered", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem("test-service-latency", "250");
    sessionStorage.setItem("test-request-counts", "{}");
  });
  // Observe the DOM commit directly so Playwright's retry polling is not part of the metric.
  const timing = await page
    .getByRole("link", { name: "Today", exact: true })
    .evaluate(
      (link) =>
        new Promise<{ elapsedMs: number; feedbackMs: number | null }>(
          (resolve) => {
            const started = performance.now();
            let feedbackMs: number | null = null;
            const observer = new MutationObserver(() => {
              if (
                feedbackMs === null &&
                document.body.textContent?.includes("Opening Today")
              ) {
                feedbackMs = performance.now() - started;
              }
              if (document.querySelector("h1")?.textContent !== "Hello, Test")
                return;
              observer.disconnect();
              resolve({ elapsedMs: performance.now() - started, feedbackMs });
            });
            observer.observe(document.body, { childList: true, subtree: true });
            (link as HTMLAnchorElement).click();
          },
        ),
    );
  const requests = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("test-request-counts") || "{}"),
  );
  await test.info().attach("navigation-timing", {
    body: JSON.stringify({ serviceLatencyMs: 250, ...timing, requests }),
    contentType: "application/json",
  });
  expect(requests).toEqual({ vault: 1 });
  expect(timing.feedbackMs).not.toBeNull();
  expect(timing.feedbackMs!).toBeLessThan(timing.elapsedMs);
  console.log(
    JSON.stringify({ project: test.info().project.name, ...timing, requests }),
  );
});

test("vault filter buttons update locally without another service request", async ({
  page,
}) => {
  await page.goto("/vault");
  const filter = page.getByRole("button", { name: /^Ending soon/ });
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    sessionStorage.setItem("test-service-latency", "1000");
    sessionStorage.setItem("test-request-counts", "{}");
  });
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/vault\?status=ending$/);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("test-request-counts") || "{}"),
    ),
  ).toEqual({});
  await page.goBack();
  await expect(filter).toHaveAttribute("aria-pressed", "false");
});

test("intent preloading revalidates server data on navigation", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Hover intent is a desktop input; touch navigation is covered separately.",
  );
  await page.goto("/agent");
  await expect(
    page.getByRole("heading", { name: "Your bills, answered" }),
  ).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem("test-request-counts", "{}"),
  );
  const today = page.getByRole("link", { name: "Today", exact: true });
  await today.hover();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("test-request-counts") || "{}")
            .vault || 0,
      ),
    )
    .toBe(1);
  await today.click();
  await expect(
    page.getByRole("heading", { name: "Hello, Test" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("test-request-counts") || "{}"),
    ),
  ).toEqual({ vault: 2 });
});
