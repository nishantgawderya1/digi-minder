import { test, expect, type Page } from "@playwright/test";
import { emptyBillFields, type Bill } from "../../src/lib/bills";

const ids = {
  active: "11111111-1111-4111-8111-111111111111",
  ending: "22222222-2222-4222-8222-222222222222",
  expired: "33333333-3333-4333-8333-333333333333",
  unknown: "44444444-4444-4444-8444-444444444444",
};

function relativeDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function savedBills(): Bill[] {
  const purchaseDate = relativeDate(-180);
  const entries = [
    {
      id: ids.active,
      name: "Desk monitor",
      retailer: "Circuit House",
      category: "Electronics",
      invoiceNumber: "MON-004",
      warrantyExpiresAt: relativeDate(120),
      purchasePrice: "18990.00",
      addedDaysAgo: 3,
    },
    {
      id: ids.ending,
      name: "Espresso machine",
      retailer: "Kitchen Corner",
      category: "Appliances",
      invoiceNumber: "COFFEE-002",
      warrantyExpiresAt: relativeDate(12),
      purchasePrice: "12400.00",
      addedDaysAgo: 1,
    },
    {
      id: ids.expired,
      name: "Bluetooth speaker",
      retailer: "Sound Store",
      category: "Electronics",
      invoiceNumber: "AUDIO-003",
      warrantyExpiresAt: relativeDate(-10),
      purchasePrice: "2499.00",
      addedDaysAgo: 2,
    },
    {
      id: ids.unknown,
      name: "Reading chair",
      retailer: "Home Studio",
      category: "Furniture",
      invoiceNumber: "HOME-001",
      warrantyExpiresAt: null,
      purchasePrice: "7990.00",
      addedDaysAgo: 4,
    },
  ];
  return entries.map(({ addedDaysAgo, ...entry }) => ({
    ...emptyBillFields(),
    ...entry,
    userId: "browser-test-user",
    purchaseDate,
    createdAt: new Date(Date.now() - addedDaysAgo * 86_400_000),
    updatedAt: new Date(),
  }));
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  const bills = savedBills();
  await page.addInitScript(
    ({ bills, reminders }) => {
      if (sessionStorage.getItem("test-vault")) return;
      sessionStorage.setItem(
        "test-vault",
        JSON.stringify({ bills, draft: null }),
      );
      sessionStorage.setItem("test-reminders", JSON.stringify(reminders));
      sessionStorage.setItem(
        "test-preferences",
        JSON.stringify({
          emailReminders: false,
          timezone: "Asia/Kolkata",
          reminderHour: 9,
          email: null,
        }),
      );
    },
    {
      bills,
      reminders: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          itemId: ids.ending,
          name: "Espresso machine",
          deadlineType: "warranty",
          remindAt: new Date(Date.now() - 3_600_000).toISOString(),
          snoozedUntil: null,
          status: "scheduled",
          warrantyExpiresAt: relativeDate(12),
          returnExpiresAt: null,
        },
      ],
    },
  );
});

test("vault quick filters retain the selected status through browser history", async ({
  page,
}) => {
  await page.goto("/vault");
  const saved = page.getByRole("region", { name: "Saved bills", exact: true });
  const filters = page.getByRole("group", {
    name: "Filter by warranty status",
  });
  await expect(saved.getByRole("heading", { level: 3 })).toHaveCount(4);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("vault-populated.png"),
    fullPage: test.info().project.name === "desktop",
  });

  await filters.getByRole("button", { name: /^Ending soon/ }).click();
  await expect(page).toHaveURL(/\/vault\?status=ending$/);
  await expect(saved.getByRole("heading", { level: 3 })).toHaveText([
    "Espresso machine",
  ]);
  await expect(
    filters.getByRole("button", { name: /^Ending soon/ }),
  ).toHaveAttribute("aria-pressed", "true");

  await filters.getByRole("button", { name: /^Expired/ }).click();
  await expect(page).toHaveURL(/\/vault\?status=expired$/);
  await expect(saved.getByRole("heading", { level: 3 })).toHaveText([
    "Bluetooth speaker",
  ]);
  await page.goBack();
  await expect(page).toHaveURL(/\/vault\?status=ending$/);
  await expect(saved.getByRole("heading", { level: 3 })).toHaveText([
    "Espresso machine",
  ]);
  await expect(
    filters.getByRole("button", { name: /^Ending soon/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(saved.getByRole("heading", { level: 3 })).toHaveCount(4);
});

test("vault search, sorting and clear filters work together on saved purchases", async ({
  page,
}) => {
  await page.goto("/vault");
  const saved = page.getByRole("region", { name: "Saved bills", exact: true });
  const names = saved.getByRole("heading", { level: 3 });
  await page.getByLabel("Search bills", { exact: true }).fill("Circuit House");
  await expect(names).toHaveText(["Desk monitor"]);
  await page.getByLabel("Search bills", { exact: true }).fill("COFFEE-002");
  await expect(names).toHaveText(["Espresso machine"]);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.getByLabel("Search bills", { exact: true })).toHaveValue(
    "",
  );
  await expect(names).toHaveCount(4);

  await page.getByLabel("Sort bills", { exact: true }).selectOption("name");
  await expect(names).toHaveText([
    "Bluetooth speaker",
    "Desk monitor",
    "Espresso machine",
    "Reading chair",
  ]);
  await page.getByLabel("Sort bills", { exact: true }).selectOption("expiry");
  await expect(names).toHaveText([
    "Espresso machine",
    "Desk monitor",
    "Bluetooth speaker",
    "Reading chair",
  ]);

  await page.getByText("More filters", { exact: true }).click();
  await page.getByLabel("Category filter").selectOption("Electronics");
  await expect(names).toHaveText(["Desk monitor", "Bluetooth speaker"]);
  await page.getByLabel("Warranty filter").selectOption("active");
  await expect(names).toHaveText(["Desk monitor"]);
  await page
    .getByLabel("Search bills", { exact: true })
    .fill("No such receipt");
  await expect(
    saved.getByRole("heading", { name: "No bills match these filters." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.getByLabel("Search bills", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Category filter")).toHaveValue("");
  await expect(page.getByLabel("Warranty filter")).toHaveValue("");
  await expect(names).toHaveCount(4);
  await noOverflow(page);
});

test("Today warranty totals open matching vault results", async ({ page }) => {
  await page.goto("/home");
  const totals = page.getByRole("region", { name: "Vault totals" });
  await expect(totals.getByRole("link", { name: /Bills saved/ })).toHaveText(
    /Bills saved\s*4/,
  );
  await expect(
    totals.getByRole("link", { name: /Active warranties/ }),
  ).toHaveText(/Active warranties\s*1/);
  await expect(
    totals.getByRole("link", { name: /Ending in 30 days/ }),
  ).toHaveText(/Ending in 30 days\s*1/);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("home-populated.png"),
    fullPage: true,
  });

  await totals.getByRole("link", { name: /Active warranties/ }).click();
  await expect(page).toHaveURL(/\/vault\?status=active$/);
  const saved = page.getByRole("region", { name: "Saved bills", exact: true });
  await expect(saved.getByRole("status")).toHaveText("1 of 4 saved bills");
  await expect(saved.getByRole("heading", { level: 3 })).toHaveText([
    "Desk monitor",
  ]);

  await page.goBack();
  await totals.getByRole("link", { name: /Ending in 30 days/ }).click();
  await expect(page).toHaveURL(/\/vault\?status=ending$/);
  await expect(saved.getByRole("status")).toHaveText(
    "1 of 4 saved bills · Ending within 30 days",
  );
  await expect(saved.getByRole("heading", { level: 3 })).toHaveText([
    "Espresso machine",
  ]);
});

test("a saved bill support action opens its draft form with that purchase selected", async ({
  page,
}) => {
  await page.goto(`/item/${ids.active}`);
  await page.getByRole("link", { name: "Draft a support request" }).click();
  await expect(page).toHaveURL(/\/agent\?.*tab=draft/);
  expect(new URL(page.url()).searchParams.get("itemId")).toBe(ids.active);
  await expect(
    page.getByRole("tab", { name: "Support draft" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Bill", { exact: true })).toHaveValue(
    ids.active,
  );
  await page
    .getByLabel("What went wrong?", { exact: true })
    .fill("The monitor no longer powers on after trying another cable.");
  await page.getByRole("button", { name: "Prepare draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Draft, not sent" }),
  ).toBeVisible();
  await expect(page.getByLabel("Support request draft")).toHaveValue(
    /Item: Desk monitor[\s\S]*Invoice: MON-004[\s\S]*The monitor no longer powers on/,
  );
  await noOverflow(page);
});

test("assistant starters populate the question without sending a request", async ({
  page,
}) => {
  await page.goto("/agent");
  await expect(
    page.getByRole("tab", { name: "Chat", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Which warranties end soon?" })
    .click();
  const question = page.getByLabel("Your question", { exact: true });
  await expect(question).toHaveValue(
    "Which of my saved bills have a warranty ending soon?",
  );
  await expect(question).toBeFocused();
  expect(
    await page.evaluate(() => sessionStorage.getItem("test-chat-request")),
  ).toBeNull();

  await page.getByLabel("Bills", { exact: true }).selectOption(ids.active);
  await expect(question).toHaveValue("");
  await page.getByRole("button", { name: "Product reference numbers" }).click();
  await expect(question).toHaveValue(
    "What invoice, serial and model numbers are saved for Desk monitor?",
  );
  await expect(question).toBeFocused();
  expect(
    await page.evaluate(() => sessionStorage.getItem("test-chat-request")),
  ).toBeNull();
  await expect(page.getByRole("log")).not.toContainText("Thinking...");
  await noOverflow(page);
});

test("reminders show the deadline before collapsed settings and keep settings usable", async ({
  page,
}) => {
  await page.goto("/reminders");
  await expect(
    page.getByRole("heading", { name: "1 upcoming reminder", exact: true }),
  ).toBeVisible();
  const reminders = page.getByRole("region", { name: "Your reminders" });
  await expect(reminders.getByRole("article")).toHaveCount(1);
  await expect(
    reminders.getByRole("link", { name: "Espresso machine", exact: true }),
  ).toBeVisible();
  await expect(reminders.getByText("Due now", { exact: true })).toBeVisible();
  const summary = page.getByText("Reminder settings", { exact: true });
  await expect(page.getByLabel("Reminder timezone")).not.toBeVisible();
  const listBox = await reminders.boundingBox();
  const settingsBox = await summary.boundingBox();
  expect(listBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();
  expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(settingsBox!.y);

  await summary.click();
  await expect(page.getByLabel("Reminder timezone")).toHaveValue(
    "Asia/Kolkata",
  );
  await page.getByLabel("Reminder timezone").selectOption("UTC");
  await page.getByLabel("Reminder time", { exact: true }).selectOption("10");
  await page.getByLabel("Email reminders", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("test-preferences")!),
    ),
  ).toMatchObject({ emailReminders: true, timezone: "UTC", reminderHour: 10 });
  await noOverflow(page);
});
