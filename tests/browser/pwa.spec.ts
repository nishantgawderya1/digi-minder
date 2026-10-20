import { test, expect, type Page } from "@playwright/test";

const preferenceKey = "warrantly:install-preference:v1";
const installButton = (page: Page) =>
  page.getByRole("button", { name: "Install app", exact: true });
const dismissButton = (page: Page) =>
  page.getByRole("button", { name: "Dismiss install app", exact: true });
const instructions = (page: Page) =>
  page.getByRole("dialog", { name: "Warrantly, one tap away" });

async function openHome(page: Page) {
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Hello, Test" }),
  ).toBeVisible();
}

async function promotionHidden(page: Page) {
  await expect(installButton(page)).toHaveCount(0);
  await expect(dismissButton(page)).toHaveCount(0);
}

async function storedPreference(page: Page, value: string) {
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe(value);
}

async function offerNativeInstall(
  page: Page,
  outcome: "accepted" | "dismissed",
  holdChoice = false,
) {
  await page.evaluate(
    ({ outcome, holdChoice }) => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          const count = Number(
            sessionStorage.getItem("install-prompt-count") || 0,
          );
          sessionStorage.setItem("install-prompt-count", String(count + 1));
        },
        userChoice: holdChoice
          ? new Promise((resolve) => {
              Object.assign(window, {
                resolveInstallChoice: () => resolve({ outcome }),
              });
            })
          : Promise.resolve({ outcome }),
      });
      window.dispatchEvent(event);
    },
    { outcome, holdChoice },
  );
}

test("install option explains the browser steps and closes accessibly", async ({
  page,
}, info) => {
  await openHome(page);
  const install = installButton(page);
  await expect(install.getByText("Install app", { exact: true })).toBeVisible();
  await install.click();
  const dialog = instructions(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("bills and AI tools still need internet");
  await expect(dialog).toContainText(
    info.project.name === "mobile" ? "tap Share" : "browser menu",
  );
  if (info.project.name === "mobile") {
    await expect(dialog).toContainText(
      "Turn on “Open as Web App” if shown, then tap “Add” to finish.",
    );
  }
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(install).toBeFocused();
  await install.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(install).toBeFocused();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), preferenceKey),
  ).toBeNull();
});

test("accepted native installation hides the promotion before appinstalled and persists", async ({
  page,
}) => {
  await openHome(page);
  await expect(installButton(page)).toBeVisible();
  await offerNativeInstall(page, "accepted");
  expect(
    await page.evaluate(() => sessionStorage.getItem("install-prompt-count")),
  ).toBeNull();
  await installButton(page).click();
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("install-prompt-count")),
    )
    .toBe("1");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await promotionHidden(page);
  await storedPreference(page, "accepted");
  await expect(
    page.getByRole("heading", { name: "Hello, Test" }),
  ).toBeFocused();
  await page.reload();
  await promotionHidden(page);
});

test("the browser appinstalled event records installation across reloads", async ({
  page,
}) => {
  await openHome(page);
  await expect(installButton(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await storedPreference(page, "installed");
  await promotionHidden(page);
  await page.reload();
  await promotionHidden(page);
});

test("dismissing the promotion stays hidden across routes and reloads", async ({
  page,
}) => {
  await openHome(page);
  const dismiss = dismissButton(page);
  await expect(dismiss).toBeVisible();
  const box = await dismiss.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await dismiss.click();
  await promotionHidden(page);
  await storedPreference(page, "dismissed");
  await expect(
    page.getByRole("heading", { name: "Hello, Test" }),
  ).toBeFocused();
  await page.getByRole("link", { name: "Vault", exact: true }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await promotionHidden(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "The vault" })).toBeVisible();
  await promotionHidden(page);
});

test("Already installed acknowledges installation and closes the instructions accessibly", async ({
  page,
}) => {
  await openHome(page);
  await installButton(page).click();
  await instructions(page)
    .getByRole("button", { name: "Already installed" })
    .click();
  await expect(instructions(page)).not.toBeVisible();
  await promotionHidden(page);
  await storedPreference(page, "acknowledged");
  await expect(
    page.getByRole("heading", { name: "Hello, Test" }),
  ).toBeFocused();
  await page.reload();
  await promotionHidden(page);
});

test("a dismissed native prompt does not reappear after another browser offer or reload", async ({
  page,
}) => {
  await openHome(page);
  await expect(installButton(page)).toBeVisible();
  await offerNativeInstall(page, "dismissed");
  await installButton(page).click();
  await storedPreference(page, "dismissed");
  await promotionHidden(page);
  await offerNativeInstall(page, "accepted");
  await promotionHidden(page);
  expect(
    await page.evaluate(() => sessionStorage.getItem("install-prompt-count")),
  ).toBe("1");
  await page.reload();
  await promotionHidden(page);
});

test("rapid repeated install clicks open only one native prompt", async ({
  page,
}) => {
  await openHome(page);
  await expect(installButton(page)).toBeVisible();
  await offerNativeInstall(page, "accepted", true);
  await installButton(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("install-prompt-count")),
    )
    .toBe("1");
  await expect(instructions(page)).not.toBeVisible();
  await page.evaluate(() => {
    (
      window as Window & { resolveInstallChoice: () => void }
    ).resolveInstallChoice();
  });
  await promotionHidden(page);
  await storedPreference(page, "accepted");
});

for (const passiveFocus of ["install button", "instructions dialog"] as const) {
  test(`dismissal synchronizes to another tab with its ${passiveFocus} focused`, async ({
    page,
    context,
  }) => {
    await openHome(page);
    await expect(installButton(page)).toBeVisible();
    const other = await context.newPage();
    try {
      await openHome(other);
      await expect(installButton(other)).toBeVisible();
      if (passiveFocus === "instructions dialog") {
        await installButton(other).click();
        await expect(instructions(other)).toBeVisible();
      } else {
        await installButton(other).focus();
        await expect(installButton(other)).toBeFocused();
      }
      await dismissButton(page).click();
      await promotionHidden(page);
      await promotionHidden(other);
      await expect(instructions(other)).not.toBeVisible();
      await expect(
        other.getByRole("heading", { name: "Hello, Test" }),
      ).toBeFocused();
      await other.reload();
      await promotionHidden(other);
    } finally {
      await other.close();
    }
  });
}

test("storage failure still keeps a dismissed promotion hidden during navigation", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Storage disabled", "SecurityError");
      return original.call(this, name, value);
    };
  }, preferenceKey);
  await openHome(page);
  await dismissButton(page).click();
  await promotionHidden(page);
  await page.getByRole("link", { name: "Vault", exact: true }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await promotionHidden(page);
});

test("a saved preference prevents the promotion from flashing on page load", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "dismissed");
    new MutationObserver(() => {
      if (
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Install app",
        )
      )
        sessionStorage.setItem("install-promotion-flashed", "yes");
    }).observe(document, { childList: true, subtree: true });
  }, preferenceKey);
  await openHome(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await promotionHidden(page);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("install-promotion-flashed"),
    ),
  ).toBeNull();
});

test("related-app detection hides an installed Warrantly without showing the promotion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: async () => [
        {
          platform: "webapp",
          url: new URL("/manifest.webmanifest", location.origin).href,
          id: location.origin + "/",
        },
      ],
    });
    new MutationObserver(() => {
      if (
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Install app",
        )
      )
        sessionStorage.setItem("install-promotion-flashed", "yes");
    }).observe(document, { childList: true, subtree: true });
  });
  await openHome(page);
  await storedPreference(page, "installed");
  await promotionHidden(page);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("install-promotion-flashed"),
    ),
  ).toBeNull();
});

for (const detection of ["unrelated", "rejected", "pending"] as const) {
  test(`the install option remains available when related-app detection is ${detection}`, async ({
    page,
  }) => {
    await page.addInitScript((detection) => {
      Object.defineProperty(navigator, "getInstalledRelatedApps", {
        configurable: true,
        value: async () => {
          if (detection === "rejected")
            throw new Error("Detection unsupported");
          if (detection === "pending") return new Promise(() => {});
          return [
            {
              platform: "webapp",
              url: "https://example.com/manifest.webmanifest",
              id: "https://example.com/",
            },
          ];
        },
      });
    }, detection);
    await openHome(page);
    await expect(installButton(page)).toBeVisible();
    await expect(dismissButton(page)).toBeVisible();
  });
}

test("standalone installation stays recorded after returning to browser mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    const displayMode = original("(min-width: 0px)");
    let standalone = true;
    Object.defineProperty(displayMode, "matches", { get: () => standalone });
    window.matchMedia = (query) =>
      query === "(display-mode: standalone)" ? displayMode : original(query);
    Object.assign(window, {
      exitStandalone: () => {
        standalone = false;
        displayMode.dispatchEvent(new Event("change"));
      },
    });
  });
  await openHome(page);
  await promotionHidden(page);
  await storedPreference(page, "installed");
  await page.evaluate(() => {
    (window as Window & { exitStandalone: () => void }).exitStandalone();
  });
  await promotionHidden(page);
  await storedPreference(page, "installed");
});
