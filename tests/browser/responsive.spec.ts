import { test, expect, type Locator, type Page } from "@playwright/test";
import { emptyBillFields } from "../../src/lib/bills";

const itemId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const longName =
  "Premium wireless noise cancelling headphones with charging case and extended protection";
const sizes = [
  { name: "small-phone", width: 320, height: 568 },
  { name: "android-phone", width: 360, height: 640 },
  { name: "iphone", width: 390, height: 844 },
  { name: "large-phone", width: 430, height: 932 },
  { name: "short-landscape", width: 568, height: 320 },
  { name: "wide-landscape", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
];

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

async function reachable(page: Page, control: Locator) {
  await control.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  const size = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
  expect(
    await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      );
    }),
  ).toBe(true);
}

test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name !== "mobile",
    "Responsive matrix uses the touch-enabled mobile project.",
  );
  const fields = {
    ...emptyBillFields(),
    name: longName,
    retailer: "A retailer with a long business and trading name",
    serialNumber: "SN" + "0123456789".repeat(14),
    invoiceNumber: "INV" + "0123456789".repeat(14),
    notes: "Reference-" + "0123456789".repeat(30),
    purchasePrice: "9999999999.99",
    purchaseDate: "2026-01-01",
    warrantyExpiresAt: "2099-01-01",
  };
  await page.addInitScript(
    ({ fields, itemId, documentId }) => {
      if (sessionStorage.getItem("test-vault")) return;
      sessionStorage.setItem(
        "test-vault",
        JSON.stringify({
          bills: [
            {
              ...fields,
              id: itemId,
              userId: "responsive-test",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          draft: {
            id: documentId,
            filename:
              "receipt-with-a-long-original-filename-and-reference-number.png",
            contentType: "image/png",
            pageCount: 1,
            status: "review",
            fields,
            pages: [
              {
                pageIndex: 0,
                text: "Serial number: 001234",
                confidence: "0.95",
                status: "complete",
              },
            ],
            previewUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=",
          },
        }),
      );
      sessionStorage.setItem(
        "test-reminders",
        JSON.stringify([
          {
            id: "33333333-3333-4333-8333-333333333333",
            itemId,
            name: fields.name,
            deadlineType: "warranty",
            remindAt: new Date().toISOString(),
            snoozedUntil: null,
            status: "scheduled",
            warrantyExpiresAt: fields.warrantyExpiresAt,
            returnExpiresAt: null,
          },
        ]),
      );
    },
    { fields, itemId, documentId },
  );
});

for (const size of sizes) {
  test(`main flows fit ${size.name} ${size.width}x${size.height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const url of [
      "/home",
      "/vault",
      `/item/${itemId}`,
      "/agent",
      "/reminders",
      `/review/${documentId}`,
    ]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noOverflow(page);
      const navigation = page.getByRole("navigation", {
        name: "Mobile navigation",
      });
      await expect(navigation).toBeVisible();
      for (const label of [
        "Today",
        "Vault",
        "Add a bill",
        "Assistant",
        "Reminders",
      ]) {
        const link = navigation.getByRole("link", { name: label, exact: true });
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        await reachable(page, link);
      }
      if (url === "/vault") {
        await page.getByText("More filters", { exact: true }).click();
        await reachable(page, page.getByLabel("Category filter"));
        await noOverflow(page);
      } else if (url.startsWith("/item/")) {
        await reachable(
          page,
          page.getByRole("link", { name: "Draft a support request" }),
        );
        await page
          .getByRole("button", { name: "Edit bill", exact: true })
          .click();
        await noOverflow(page);
        await reachable(
          page,
          page.getByRole("button", { name: "Save to vault" }),
        );
      } else if (url === "/agent") {
        await reachable(page, page.getByLabel("Your question"));
        await page.getByRole("tab", { name: "Support draft" }).click();
        await page.getByLabel("Bill", { exact: true }).selectOption(itemId);
        await page
          .getByLabel("What went wrong?", { exact: true })
          .fill("The product no longer powers on.");
        await reachable(
          page,
          page.getByRole("button", { name: "Prepare draft" }),
        );
        await noOverflow(page);
      } else if (url === "/reminders") {
        await reachable(page, page.getByLabel(`Snooze ${longName}`));
        await page.getByText("Reminder settings", { exact: true }).click();
        await reachable(
          page,
          page.getByRole("button", { name: "Save preferences" }),
        );
        await noOverflow(page);
      } else if (url.startsWith("/review/")) {
        const input = page.getByLabel("Bill / item name");
        expect(
          await input.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize),
          ),
        ).toBeGreaterThanOrEqual(16);
        await reachable(page, input);
        await reachable(
          page,
          page.getByRole("button", { name: "Save to vault" }),
        );
        await noOverflow(page);
      }
    }
    await page.goto("/scan");
    for (const name of ["Camera", "Image", "Document"])
      await reachable(page, page.getByRole("button", { name, exact: true }));
    await noOverflow(page);
    if (size.name === "small-phone" || size.name === "short-landscape") {
      await page.screenshot({
        path: test.info().outputPath(`${size.name}-capture.png`),
      });
    }
  });
}

for (const size of [sizes[0]!, sizes[4]!, sizes[5]!]) {
  test(`camera preview and shutter remain usable on ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "white";
        context.fillRect(0, 0, 640, 480);
        return canvas.captureStream(5);
      };
    });
    await page.goto("/scan");
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Take photo", exact: true }),
    ).toBeEnabled();
    const preview = await page.getByLabel("Live camera preview").boundingBox();
    expect(preview!.height).toBeGreaterThanOrEqual(120);
    await reachable(
      page,
      page.getByRole("button", { name: "Take photo", exact: true }),
    );
    await reachable(
      page,
      page.getByRole("button", { name: "Close camera", exact: true }),
    );
    await noOverflow(page);
    const shutter = await page
      .getByRole("button", { name: "Take photo", exact: true })
      .boundingBox();
    const options = await page
      .getByRole("group", { name: "Bill upload options" })
      .boundingBox();
    expect(shutter!.y + shutter!.height).toBeLessThanOrEqual(options!.y);
    expect(preview!.y + preview!.height).toBeLessThanOrEqual(options!.y);
    if (size.name === "short-landscape")
      await page.screenshot({
        path: test.info().outputPath("landscape-camera.png"),
      });
    await page
      .getByRole("button", { name: "Close camera", exact: true })
      .click();
    await expect(page.getByLabel("Live camera preview")).not.toBeVisible();
  });
}

test("reminder tab labels and large counts fit a 320px phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/reminders");
  await page.evaluate(() => {
    const template = JSON.parse(sessionStorage.getItem("test-reminders")!)[0];
    sessionStorage.setItem(
      "test-reminders",
      JSON.stringify(
        Array.from({ length: 105 }, (_, i) => ({
          ...template,
          id: `reminder-${i}`,
        })),
      ),
    );
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "105 upcoming reminders" }),
  ).toBeVisible();
  const dimensions = await page
    .getByRole("tablist", { name: "Reminder views" })
    .getByRole("tab")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.textContent,
        fits: element.scrollWidth <= element.clientWidth,
      })),
    );
  expect(dimensions).toEqual(
    dimensions.map((entry) => ({ ...entry, fits: true })),
  );
  await noOverflow(page);
});
