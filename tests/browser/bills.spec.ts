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
async function interceptUpload(page: Page) {
  await page.route("**/test-original-upload", async (route) => {
    const body = route.request().postDataBuffer()!;
    const url = `data:${route.request().headers()["content-type"]};base64,${body.toString("base64")}`;
    await page.evaluate((previewUrl) => {
      const state = JSON.parse(sessionStorage.getItem("test-vault")!);
      state.draft.previewUrl = previewUrl;
      sessionStorage.setItem("test-vault", JSON.stringify(state));
    }, url);
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
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("empty accounts never display sample records", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByText("Your vault is empty.")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("home-empty.png"),
    fullPage: true,
  });
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
test("multi-page PDFs are rasterized page by page, and oversized page counts are rejected", async ({
  page,
}) => {
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
  ).toBeVisible();
  await expect(page.getByText("Extracted text (2/2 pages)")).toBeVisible();
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
