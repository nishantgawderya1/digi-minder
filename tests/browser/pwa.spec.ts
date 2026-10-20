import { test, expect } from "@playwright/test";

test("install option explains the browser steps and closes accessibly", async ({
  page,
}, info) => {
  await page.goto("/home");
  await page
    .getByRole("button", { name: "Install Warrantly", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Warrantly, one tap away" });
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
  await expect(
    page.getByRole("button", { name: "Install Warrantly", exact: true }),
  ).toBeFocused();
});

test("native install is user-initiated and the option disappears after installation", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(
    page.getByRole("button", { name: "Install Warrantly", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        sessionStorage.setItem("install-prompted", "yes");
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  expect(
    await page.evaluate(() => sessionStorage.getItem("install-prompted")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Install Warrantly", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("install-prompted")))
    .toBe("yes");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page.getByRole("button", { name: "Install Warrantly", exact: true }),
  ).toHaveCount(0);
});

test("installed standalone mode does not offer installation again", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      original(
        query === "(display-mode: standalone)" ? "(min-width: 0px)" : query,
      );
  });
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Hello, Test" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Install Warrantly", exact: true }),
  ).toHaveCount(0);
});
