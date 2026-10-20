import { test, expect, type Locator, type Page } from "@playwright/test";
import { emptyBillFields, type BillFields } from "../../src/lib/bills";
import type { FieldIssues } from "../../src/lib/review";

const documentId = "33333333-3333-4333-8333-333333333333";
const picture =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=";
const priceMessage =
  "The final amount wasn’t clear. Check the total paid, including tax.";
const brandMessage =
  "Brand wasn’t clear. Add it from the item or leave it blank.";
const fields: BillFields = {
  ...emptyBillFields(),
  name: "Reading lamp",
  retailer: "Corner Electronics",
  serialNumber: "SN009988",
  warrantyMonths: 24,
  notes: "Gift receipt; keep the original",
};
const fieldIssues: FieldIssues = {
  brand: "ambiguous",
  purchasePrice: "rejected",
  purchaseDate: "rejected",
  invoiceNumber: "rejected",
};

async function openReview(
  page: Page,
  options: { processing?: boolean; issues?: FieldIssues } = {},
) {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(
    ({ documentId, picture, fields, fieldIssues, processing }) => {
      if (sessionStorage.getItem("test-vault")) return;
      sessionStorage.setItem(
        "test-vault",
        JSON.stringify({
          bills: [],
          draft: {
            id: documentId,
            filename: "photographed-receipt.png",
            contentType: "image/png",
            pageCount: 1,
            status: processing ? "processing" : "review",
            fields,
            fieldIssues,
            revision: 0,
            draftPatch: {},
            evidence: {
              retailer: { quote: "Sold by: Corner Electronics", page: 0 },
              serialNumber: { quote: "Serial number: SN009988", page: 0 },
            },
            pages: [
              {
                pageIndex: 0,
                text: "Sold by: Corner Electronics\nItem: Reading lamp\nSerial number: SN009988\nOrder number: ORDER-619\nSubtotal: 799.00\nTax: unclear\nDate: unreadable",
                confidence: "0.76",
                status: "complete",
              },
            ],
            previewUrl: picture,
            job: processing
              ? { status: "extracting", completedPages: 1, error: null }
              : null,
          },
        }),
      );
    },
    {
      documentId,
      picture,
      fields,
      fieldIssues: options.issues ?? fieldIssues,
      processing: options.processing ?? false,
    },
  );
  await page.goto(`/review/${documentId}`);
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible();
}

async function fieldHint(input: Locator) {
  await expect(input).toHaveAttribute("aria-describedby", /\S+/);
  await expect(input).toHaveAccessibleDescription(/\S+/);
}

async function correction(input: Locator) {
  await expect(
    input.locator("..").getByText("Your correction", { exact: true }),
  ).toBeVisible();
}

async function savedPatch(page: Page, expected: Partial<BillFields>) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(sessionStorage.getItem("test-vault")!);
        return data.draft?.draftPatch ?? {};
      }),
    )
    .toMatchObject(expected);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

test("uncertain receipt columns stay blank with accessible guidance and an immediately editable brand", async ({
  page,
}) => {
  await openReview(page);
  const brand = page.getByLabel("Brand", { exact: true });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveValue("");
  expect(
    await brand.evaluate((element) => element.closest("details") === null),
  ).toBe(true);
  await fieldHint(brand);
  const amount = page.getByLabel("Amount paid", { exact: true });
  await expect(amount).toHaveValue("");
  await expect(amount).toHaveAccessibleDescription(priceMessage);
  for (const label of ["Purchase date", "Invoice / receipt number"]) {
    const input = page.getByLabel(label, { exact: true });
    await expect(input).toHaveValue("");
    await fieldHint(input);
  }
  await expect(page.getByLabel("Store / retailer")).toHaveValue(
    "Corner Electronics",
  );
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue("SN009988");
  const retailer = page.getByLabel("Store / retailer").locator("..");
  await retailer.getByText("From original · Page 1", { exact: true }).click();
  await expect(
    retailer.getByText("Sold by: Corner Electronics", { exact: true }),
  ).toBeVisible();
  await brand.scrollIntoViewIfNeeded();
  const box = await brand.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("uncertain-receipt-fields.png"),
    fullPage: true,
  });
  await page
    .getByRole("heading", { name: "Purchase details", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("receipt-fields-viewport.png"),
  });
});

test("an unreadable brand can stay blank while saving directly to the vault", async ({
  page,
}) => {
  await openReview(page, { issues: {} });
  const brand = page.getByLabel("Brand", { exact: true });
  await expect(brand).toHaveValue("");
  await expect(brand).toHaveAccessibleDescription(brandMessage);
  let nativeDialog = false;
  page.on("dialog", async (dialog) => {
    nativeDialog = true;
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Save to vault", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reading lamp", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/item/${documentId}$`));
  expect(nativeDialog).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("test-vault")!).bills[0],
  );
  expect(saved).toMatchObject(fields);
  expect(saved.brand).toBeNull();
  expect(saved.invoiceNumber).toBeNull();
});

test("correcting uncertain columns autosaves without changing the other receipt details", async ({
  page,
}) => {
  await openReview(page);
  const brand = page.getByLabel("Brand", { exact: true });
  const amount = page.getByLabel("Amount paid", { exact: true });
  const date = page.getByLabel("Purchase date", { exact: true });
  await brand.fill("Luma");
  await amount.fill("943.00");
  await date.fill("2026-10-01");
  await page.getByLabel("Invoice / receipt number").fill("INV-271");
  const patch = {
    brand: "Luma",
    purchasePrice: "943.00",
    purchaseDate: "2026-10-01",
    invoiceNumber: "INV-271",
  };
  await savedPatch(page, patch);
  for (const input of [brand, amount, date]) {
    await correction(input);
    await expect(input).not.toHaveAttribute("aria-describedby");
  }
  await expect(page.getByText(priceMessage)).toHaveCount(0);
  await page.reload();
  for (const [label, value] of [
    ["Brand", "Luma"],
    ["Amount paid", "943.00"],
    ["Purchase date", "2026-10-01"],
    ["Invoice / receipt number", "INV-271"],
  ]) {
    const input = page.getByLabel(label!, { exact: true });
    await expect(input).toHaveValue(value!);
    await correction(input);
    await expect(input).not.toHaveAttribute("aria-describedby");
  }
  await expect(page.getByLabel("Bill / item name")).toHaveValue(fields.name);
  await expect(page.getByLabel("Store / retailer")).toHaveValue(
    fields.retailer!,
  );
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue(
    fields.serialNumber!,
  );
  await expect(page.getByLabel("Warranty (months)")).toHaveValue("24");
  await expect(page.getByLabel("Currency", { exact: true })).toHaveValue("INR");
  await expect(page.getByLabel("Notes", { exact: false })).toHaveValue(
    fields.notes!,
  );
});

test("late background extraction fills untouched fields while preserving the user's corrections", async ({
  page,
}) => {
  await openReview(page, { processing: true });
  await expect(page.getByText("You can return later")).toBeVisible();
  const brand = page.getByLabel("Brand", { exact: true });
  const amount = page.getByLabel("Amount paid", { exact: true });
  await brand.fill("Luma");
  await amount.fill("943.00");
  await savedPatch(page, { brand: "Luma", purchasePrice: "943.00" });
  await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem("test-vault")!);
    data.draft.status = "review";
    data.draft.fields = {
      ...data.draft.fields,
      brand: "A different OCR suggestion",
      purchasePrice: "799.00",
      modelNumber: "LM-24",
      purchaseDate: "2026-10-01",
    };
    data.draft.job = { status: "complete", completedPages: 1, error: null };
    data.draft.fieldIssues = {};
    sessionStorage.setItem("test-vault", JSON.stringify(data));
  });
  await expect(page.getByText("You can return later")).not.toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByLabel("Model number", { exact: true })).toHaveValue(
    "LM-24",
  );
  await expect(page.getByLabel("Purchase date", { exact: true })).toHaveValue(
    "2026-10-01",
  );
  await expect(brand).toHaveValue("Luma");
  await expect(amount).toHaveValue("943.00");
  await correction(brand);
  await correction(amount);
  await page.reload();
  await expect(brand).toHaveValue("Luma");
  await expect(amount).toHaveValue("943.00");
  await expect(page.getByLabel("Model number", { exact: true })).toHaveValue(
    "LM-24",
  );
});
