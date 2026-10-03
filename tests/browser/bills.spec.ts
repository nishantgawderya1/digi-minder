import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
async function receiptImage(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = "black";
    ctx.font = "24px sans-serif";
    [
      "TEST RECEIPT",
      "Product name: Test lamp",
      "Serial number: 001234",
      "Barcode: 009988",
      "Total: INR 120.00",
      "Invoice date: 01/10/2026",
    ].forEach((line, index) => ctx.fillText(line, 35, 80 + index * 65));
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  return Buffer.from(data, "base64");
}
async function interceptUpload(page: Page, beforeFulfill?: Promise<void>) {
  await page.route("**/test-original-upload", async (route) => {
    const body = route.request().postDataBuffer()!;
    const url = `data:${route.request().headers()["content-type"]};base64,${body.toString("base64")}`;
    await page.evaluate((previewUrl) => {
      const state = JSON.parse(sessionStorage.getItem("test-vault")!);
      state.draft.previewUrl = previewUrl;
      sessionStorage.setItem("test-vault", JSON.stringify(state));
    }, url);
    await beforeFulfill;
    await route.fulfill({ status: 200 });
  });
}
async function upload(page: Page) {
  await interceptUpload(page);
  await page.getByLabel("Choose a bill image").setInputFiles({
    name: "bill.png",
    mimeType: "image/png",
    buffer: await receiptImage(page),
  });
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible();
  await expect(page.getByText("You can return later")).not.toBeVisible({
    timeout: 110_000,
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
async function unobscured(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(
    await button.evaluate((element) => {
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
test("Today has one compact bill action and keeps Assistant in navigation", async ({
  page,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/home");
  const actions = page.getByRole("region", { name: "Bill actions" });
  await expect(
    actions.getByRole("link", { name: "Add a bill", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("link", { name: "Ask assistant", exact: true }),
  ).toHaveCount(0);
  expect((await actions.boundingBox())!.height).toBeLessThanOrEqual(48);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("today-actions.png"),
    fullPage: true,
  });
  await actions.getByRole("link", { name: "Add a bill", exact: true }).click();
  await expect(page).toHaveURL(/\/scan$/);
  await page.getByRole("link", { name: "Back to Today" }).click();
  await page
    .getByRole("link", { name: "Assistant", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/agent$/);
});
test("Today resumes an unfinished bill directly from its progress list", async ({
  page,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/scan");
  await upload(page);
  await page.goto("/home");
  const queue = page.getByRole("region", { name: "Bills in progress" });
  await expect(queue.getByText("Ready to review")).toBeVisible();
  await expect(queue.getByRole("link", { name: /bill.png/ })).toBeInViewport();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("home-progress.png"),
    fullPage: true,
  });
  await queue.getByRole("link", { name: /bill.png/ }).click();
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible();
});
test("upload controls remain reachable while short mobile pages scroll", async ({
  page,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/scan");
  for (const name of ["Camera", "Image", "Document"])
    await unobscured(page, name);
  await page.getByLabel("Choose a bill document").setInputFiles({
    name: "unsafe.html",
    mimeType: "text/html",
    buffer: Buffer.from("bad file"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("alert").scrollIntoViewIfNeeded();
  const alert = await page.getByRole("alert").boundingBox();
  const options = await page
    .getByRole("group", { name: "Bill upload options" })
    .boundingBox();
  if (test.info().project.name === "mobile")
    expect(alert!.y + alert!.height).toBeLessThanOrEqual(options!.y);
  for (const name of ["Camera", "Image", "Document"])
    await unobscured(page, name);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("upload-controls.png"),
    fullPage: true,
  });
});
test("review highlights a missing product name and clears the hint after correction", async ({
  page,
}) => {
  await page.goto("/scan");
  await upload(page);
  await page.evaluate(() => {
    const state = JSON.parse(sessionStorage.getItem("test-vault")!);
    state.draft.fields.name = "";
    sessionStorage.setItem("test-vault", JSON.stringify(state));
  });
  await page.reload();
  const name = page.getByLabel("Bill / item name");
  await expect(name).toHaveValue("");
  await expect(name).toHaveAccessibleDescription(
    "Item name not found in the extracted details.",
  );
  await name.fill("Corrected reading lamp");
  await expect(
    page.getByText("Item name not found in the extracted details."),
  ).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue("Corrected reading lamp");
});
test("review explains a rejected name and keeps the correction after reload", async ({
  page,
}) => {
  await page.goto("/scan");
  await upload(page);
  await page.evaluate(() => {
    const state = JSON.parse(sessionStorage.getItem("test-vault")!);
    state.draft.fields.name = "";
    state.draft.nameIssue = "rejected";
    sessionStorage.setItem("test-vault", JSON.stringify(state));
  });
  await page.reload();
  const name = page.getByLabel("Bill / item name");
  await expect(name).toHaveAccessibleDescription(
    "The suggested name could not be verified against the source. Enter the item name from the original.",
  );
  await name.fill("Acme phone cover");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue("Acme phone cover");
  await expect(name).not.toHaveAttribute("aria-describedby");
});

test("uploads automatically read and fill review when hosted jobs are disabled", async ({
  page,
}) => {
  await page.goto("/scan");
  await page.evaluate(() =>
    sessionStorage.setItem("background-disabled", "true"),
  );
  await upload(page);
  await expect(page.getByLabel("Bill / item name")).toHaveValue("Test lamp");
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue("001234");
  await expect(page.getByLabel("Amount paid")).toHaveValue("120.00");
});
test("upload progress stays above mobile controls and prevents duplicate uploads", async ({
  page,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 568 });
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto("/scan");
  await interceptUpload(page, paused);
  await page.getByLabel("Choose a bill image").setInputFiles({
    name: "bill.png",
    mimeType: "image/png",
    buffer: await receiptImage(page),
  });
  await expect(page.getByRole("status")).toContainText("Uploading original");
  for (const name of ["Camera", "Image", "Document"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  if (test.info().project.name === "mobile") {
    await expect
      .poll(async () => {
        const progress = await page.getByRole("status").boundingBox();
        const options = await page
          .getByRole("group", { name: "Bill upload options" })
          .boundingBox();
        return progress!.y >= 0 && progress!.y + progress!.height <= options!.y;
      })
      .toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("upload-progress.png"),
  });
  release();
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible();
});
test("PDF decoder assets are served as binaries, not the app HTML fallback", async ({
  request,
}) => {
  for (const file of ["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"]) {
    const response = await request.get(`/pdf-assets/wasm/${file}`);
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0, 4)).toEqual(
      Buffer.from([0, 97, 115, 109]),
    );
  }
  const fallback = await request.get(
    "/pdf-assets/wasm/jbig2_nowasm_fallback.js",
  );
  expect(fallback.headers()["content-type"]).toContain("javascript");
});
test("empty accounts never display sample records", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByText("Your vault is empty.")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("home-empty.png"),
    fullPage: true,
  });
});
test("assistant asks scoped questions, shows sources, and recovers from provider errors", async ({
  page,
}) => {
  await page.goto("/scan");
  await upload(page);
  await page.getByRole("button", { name: "Save to vault" }).click();
  await page.goto("/agent");
  await page
    .getByLabel("Your question")
    .fill("What is the price and warranty end date?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log")).toContainText(
    "No warranty end date is recorded.",
  );
  await expect(
    page.getByRole("log").getByRole("link", { name: "Test lamp" }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("assistant-chat.png"),
    fullPage: true,
  });
  await page.evaluate(() => sessionStorage.setItem("chat-unavailable", "true"));
  await page.getByLabel("Your question").fill("What is the serial number?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("alert")).toContainText("timed out");
  await expect(page.getByLabel("Your question")).toHaveValue(
    "What is the serial number?",
  );
  await page.evaluate(() => sessionStorage.removeItem("chat-unavailable"));
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByLabel("Your question")).toHaveValue("");
  const request = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("test-chat-request")!),
  );
  expect(request.messages).toHaveLength(3);
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("log")).not.toContainText("recorded price");
  await page.getByRole("tab", { name: "Support draft" }).click();
  await expect(
    page.getByRole("button", { name: "Prepare draft" }),
  ).toBeVisible();
});
test("digital PDF text preserves exact identifiers without OCR", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const document = pdf.addPage([500, 700]);
  [
    "Product name: Exact PDF item",
    "Invoice number: PDF-00123",
    "Serial number: 00001002",
    "Total: INR 170.00",
    "Invoice date: 07/04/2026",
  ].forEach((line, index) =>
    document.drawText(line, { x: 30, y: 600 - index * 40, font, size: 16 }),
  );
  await page.goto("/scan");
  await page.evaluate(() => {
    sessionStorage.setItem("ocr-failure", "true");
    sessionStorage.setItem("tesseract-unavailable", "true");
  });
  await interceptUpload(page);
  await page.getByLabel("Choose a bill document").setInputFiles({
    name: "digital.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible();
  await expect(page.getByText("You can return later")).not.toBeVisible({
    timeout: 110_000,
  });
  await expect(page.getByLabel("Bill / item name")).toHaveValue(
    "Exact PDF item",
  );
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue("00001002");
  await expect(page.getByLabel("Purchase date", { exact: true })).toHaveValue(
    "2026-04-07",
  );
});
test("image upload, OCR review, correction, persistence, editing, filtering and deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/scan");
  await upload(page);
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue("001234");
  await expect(page.getByLabel("Barcode / EAN / UPC")).toHaveValue("009988");
  await expect(page.getByLabel("Amount paid")).toHaveValue("120.00");
  expect(
    await page
      .getByRole("img", { name: "Original document: bill.png" })
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth === 600,
      ),
  ).toBe(true);
  await page
    .getByLabel("Bill / item name")
    .fill("A real reviewed bill with a long descriptive product name");
  await page.getByLabel("Warranty (months)", { exact: true }).fill("12");
  await expect(page.getByLabel("Warranty ends", { exact: true })).toHaveValue(
    "2027-10-01",
  );
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save to vault" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A real reviewed bill with a long descriptive product name",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("001234", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit bill", exact: true }).click();
  await page.getByLabel("Amount paid").fill("125.50");
  await page.getByRole("button", { name: "Save to vault" }).click();
  await expect(page.getByText("₹125.50", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to vault" }).click();
  await expect(page.getByText("1 of 1 saved bills")).toBeVisible();
  await page.getByLabel("Search bills").fill("missing");
  await expect(page.getByText("No bills match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("vault.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: /A real reviewed bill/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete bill", exact: true }).click();
  await expect(page.getByText("No saved bills yet.")).toBeVisible();
  expect(errors).toEqual([]);
});
test("OCR unavailable leaves unknown details blank and allows a manual save", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("tesseract-unavailable", "true"),
  );
  await page.goto("/scan");
  await page.evaluate(() => sessionStorage.setItem("ocr-unavailable", "true"));
  await upload(page);
  await expect(page.getByLabel("Bill / item name")).toHaveValue("");
  await expect(page.getByLabel("Amount paid")).toHaveValue("");
  await expect(page.getByLabel("Purchase date", { exact: true })).toHaveValue(
    "",
  );
  await page.getByLabel("Bill / item name").fill("Manually reviewed bill");
  await page.getByRole("button", { name: "Save to vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Manually reviewed bill" }),
  ).toBeVisible();
});
test("Tesseract reads a real image locally when NVIDIA OCR fails", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/scan");
  await page.evaluate(() => sessionStorage.setItem("ocr-failure", "true"));
  await interceptUpload(page);
  await page.getByLabel("Choose a bill image").setInputFiles({
    name: "local-ocr.png",
    mimeType: "image/png",
    buffer: await receiptImage(page),
  });
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible({ timeout: 110_000 });
  await expect(page.getByText("You can return later")).not.toBeVisible({
    timeout: 110_000,
  });
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue("001234");
  await expect(page.getByLabel("Bill / item name")).toHaveValue("Test lamp");
  await noOverflow(page);
});
test("invalid formats are rejected before creating a draft", async ({
  page,
}) => {
  await page.goto("/scan");
  await page.getByLabel("Choose a bill document").setInputFiles({
    name: "unsafe.html",
    mimeType: "text/html",
    buffer: Buffer.from("<script></script>"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Choose a JPEG, PNG, WebP or PDF",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("test-vault")),
  ).toBeNull();
});
test("camera denial has a useful recovery message", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("/scan");
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera access was blocked",
  );
  await expect(
    page.getByRole("button", { name: "Document", exact: true }),
  ).toBeEnabled();
});
test("background review preserves edits, shows source evidence, and survives navigation", async ({
  page,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/scan");
  await page.evaluate(() => sessionStorage.setItem("worker-paused", "true"));
  await interceptUpload(page);
  await page.getByLabel("Choose a bill image").setInputFiles({
    name: "bill.png",
    mimeType: "image/png",
    buffer: await receiptImage(page),
  });
  await expect(page.getByText("You can return later")).toBeVisible();
  await page.getByLabel("Bill / item name").fill("My corrected lamp");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to vault", exact: true }).click();
  await expect(page.getByText("Reading in background")).toBeVisible();
  await page.getByRole("link", { name: /bill.png/ }).click();
  await page.evaluate(() => sessionStorage.removeItem("worker-paused"));
  await expect(page.getByText("You can return later")).not.toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("Bill / item name")).toHaveValue(
    "My corrected lamp",
  );
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue("001234");
  await page.getByText("From original · Page 1", { exact: true }).click();
  await expect(
    page.getByText("Serial number: 001234", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Bill / item name")).toHaveValue(
    "My corrected lamp",
  );
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("review-evidence.png"),
    fullPage: true,
  });
});
test("autosave errors preserve changes and retry the latest values", async ({
  page,
}) => {
  await page.goto("/scan");
  await upload(page);
  await page.evaluate(() => sessionStorage.setItem("autosave-failure", "true"));
  await page.getByLabel("Bill / item name").fill("First correction");
  await expect(page.getByRole("alert")).toContainText(
    "Changes couldn't be saved",
  );
  await page.getByLabel("Bill / item name").fill("Latest correction");
  await page.evaluate(() => sessionStorage.removeItem("autosave-failure"));
  await page.getByRole("button", { name: "Retry saving" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Bill / item name")).toHaveValue(
    "Latest correction",
  );
});
test("email preferences persist and reminders can be snoozed and dismissed", async ({
  page,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/reminders");
  await page.getByLabel("Email reminders", { exact: true }).check();
  await page.getByLabel("Reminder timezone").selectOption("Asia/Kolkata");
  await page.getByLabel("Reminder time", { exact: true }).selectOption("10");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Email reminders", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Reminder timezone")).toHaveValue(
    "Asia/Kolkata",
  );
  await expect(page.getByLabel("Reminder time", { exact: true })).toHaveValue(
    "10",
  );
  await page.evaluate(() =>
    sessionStorage.setItem(
      "test-reminders",
      JSON.stringify([
        {
          id: "f22b16c3-687a-436f-87ae-1a1bdfe68503",
          itemId: "ab096c6d-c5c6-42c7-959a-0f3d46591a4f",
          name: "My lamp",
          deadlineType: "warranty",
          remindAt: new Date().toISOString(),
          snoozedUntil: null,
          status: "scheduled",
          warrantyExpiresAt: "2099-10-01",
          returnExpiresAt: null,
        },
      ]),
    ),
  );
  await page.reload();
  await page.getByLabel("Snooze My lamp").selectOption("1");
  await expect(page.getByText("No reminders in this view.")).toBeVisible();
  await page.getByRole("tab", { name: "Snoozed" }).click();
  await expect(
    page.getByRole("link", { name: "My lamp", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("reminders.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dismiss My lamp" }).click();
  await expect(page.getByText("No reminders in this view.")).toBeVisible();
});
test("discarding a draft with failed autosave leaves review without losing the delete", async ({
  page,
}) => {
  await page.goto("/scan");
  await upload(page);
  await page.evaluate(() => sessionStorage.setItem("autosave-failure", "true"));
  await page.getByLabel("Bill / item name").fill("Discard this edit");
  await expect(page.getByRole("alert")).toContainText(
    "Changes couldn't be saved",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete unfinished bill" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.getByText("No saved bills yet.")).toBeVisible();
});
test("multi-page PDFs are rasterized page by page, and oversized page counts are rejected", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++)
    pdf
      .addPage([500, 700])
      .drawText(`Receipt page ${i + 1}`, { x: 40, y: 600, font, size: 22 });
  await page.goto("/scan");
  await interceptUpload(page);
  await page.getByLabel("Choose a bill document").setInputFiles({
    name: "two-pages.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Extracted text (2/2 pages)")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Serial number / IMEI")).toHaveValue("001234");
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("pdf-review.png"),
    fullPage: true,
  });
  await page.goto("/scan");
  for (let i = 2; i < 11; i++) pdf.addPage([500, 700]);
  await page.getByLabel("Choose a bill document").setInputFiles({
    name: "too-many-pages.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.getByRole("alert")).toContainText("at most 10 pages");
});
test("camera capture creates a review and stops the camera tracks", async ({
  page,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "black";
      ctx.font = "30px sans-serif";
      ctx.fillText("CAMERA TEST RECEIPT", 30, 80);
      const stream = canvas.captureStream(5);
      (
        window as unknown as { cameraTestTracks: MediaStreamTrack[] }
      ).cameraTestTracks = stream.getTracks();
      return stream;
    };
  });
  await page.goto("/scan");
  await interceptUpload(page);
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeEnabled();
  await unobscured(page, "Take photo");
  if (test.info().project.name === "mobile") {
    await page.setViewportSize({ width: 568, height: 320 });
    await unobscured(page, "Take photo");
    await unobscured(page, "Image");
    await unobscured(page, "Document");
    const landscapeShutter = await page
      .getByRole("button", { name: "Take photo", exact: true })
      .boundingBox();
    const landscapeOptions = await page
      .getByRole("group", { name: "Bill upload options" })
      .boundingBox();
    expect(landscapeShutter!.y + landscapeShutter!.height).toBeLessThanOrEqual(
      landscapeOptions!.y,
    );
    await page.setViewportSize({ width: 320, height: 568 });
  }
  const preview = await page.getByLabel("Live camera preview").boundingBox();
  const shutter = await page
    .getByRole("button", { name: "Take photo", exact: true })
    .boundingBox();
  expect(shutter!.y).toBeGreaterThanOrEqual(preview!.y + preview!.height);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("camera-shutter.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check the details" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { cameraTestTracks: MediaStreamTrack[] }
      ).cameraTestTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
});
