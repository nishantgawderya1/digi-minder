import { test, expect, type Page } from "@playwright/test";
import { emptyBillFields } from "../../src/lib/bills";

const id = "33333333-3333-4333-8333-333333333333";
async function seed(page: Page, processing = false) {
  await page.addInitScript(
    ({ id, fields, processing }) => {
      if (sessionStorage.getItem("test-vault")) return;
      sessionStorage.setItem(
        "test-vault",
        JSON.stringify({
          bills: [],
          draft: {
            id,
            filename: "stability-receipt.png",
            contentType: "image/png",
            pageCount: 1,
            status: processing ? "processing" : "review",
            fields,
            revision: 0,
            draftPatch: {},
            pages: [],
            previewUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=",
            job: processing
              ? { status: "extracting", completedPages: 0, error: null }
              : null,
          },
        }),
      );
    },
    {
      id,
      fields: { ...emptyBillFields(), name: "Stability lamp" },
      processing,
    },
  );
}

test("deleting from Bills in progress does not leave a deleted page in Back history", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/home");
  await page
    .getByRole("region", { name: "Bills in progress" })
    .getByRole("link", { name: /stability-receipt/ })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete unfinished bill" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("region", { name: "Bills in progress" }),
  ).toHaveCount(0);
});

for (const resource of ["review", "item"]) {
  test(`opening a deleted ${resource} is recoverable without crashing navigation`, async ({
    page,
  }) => {
    await page.goto(`/${resource}/${id}`);
    await expect(
      page.getByRole("heading", { name: "This bill is no longer available" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Back to vault", exact: true })
      .click();
    await expect(page.getByText("No saved bills yet.")).toBeVisible();
  });
}

test("slow deletion pauses background polling until navigation completes", async ({
  page,
}) => {
  await seed(page, true);
  await page.goto(`/review/${id}`);
  await page.evaluate(() => sessionStorage.setItem("delete-delay", "4000"));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete unfinished bill" }).click();
  await expect(page).toHaveURL(/\/vault$/, { timeout: 10000 });
  expect(
    await page.evaluate(() =>
      Number(sessionStorage.getItem("missing-review-loads") || 0),
    ),
  ).toBe(0);
});

test("failed deletion preserves unsaved edits and resumes autosave", async ({
  page,
}) => {
  await seed(page);
  await page.goto(`/review/${id}`);
  await page.evaluate(() => sessionStorage.setItem("delete-failure", "true"));
  await page.getByLabel("Bill / item name").fill("Keep my correction");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete unfinished bill" }).click();
  await expect(page.getByRole("alert")).toContainText("Deletion unavailable");
  await expect(page.getByLabel("Bill / item name")).toHaveValue(
    "Keep my correction",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("test-vault")!).draft.draftPatch
            .name,
      ),
    )
    .toBe("Keep my correction");
  await page.reload();
  await expect(page.getByLabel("Bill / item name")).toHaveValue(
    "Keep my correction",
  );
});

test("temporary vault failure keeps navigation available and retries successfully", async ({
  page,
}) => {
  await page.goto("/home");
  await page.evaluate(() => sessionStorage.setItem("vault-failure", "true"));
  await page.goto("/vault");
  await expect(
    page.getByRole("heading", { name: "This page couldn't be loaded" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "Today", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem("vault-failure"));
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No saved bills yet.")).toBeVisible();
});

test("deletion waits for an in-flight autosave before removing its document", async ({
  page,
}) => {
  await seed(page);
  await page.goto(`/review/${id}`);
  await page.evaluate(() => sessionStorage.setItem("autosave-delay", "1500"));
  await page.getByLabel("Bill / item name").fill("Slow saved edit");
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("autosave-started")))
    .toBe("true");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete unfinished bill" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("autosave-after-delete")),
  ).toBeNull();
});

test("cancelled deletion preserves the draft and editable fields", async ({
  page,
}) => {
  await seed(page);
  await page.goto(`/review/${id}`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete unfinished bill" }).click();
  await expect(page.getByLabel("Bill / item name")).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Bill / item name")).toHaveValue(
    "Stability lamp",
  );
});

test("deleting a saved bill does not restore the deleted page through Back", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/home");
  await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem("test-vault")!);
    data.bills = [
      {
        ...data.draft.fields,
        id: data.draft.id,
        userId: "browser-test-user",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    data.draft = null;
    sessionStorage.setItem("test-vault", JSON.stringify(data));
  });
  await page.reload();
  await page
    .getByRole("link", { name: /Stability lamp/ })
    .first()
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete bill", exact: true }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("link", { name: /Stability lamp/ })).toHaveCount(
    0,
  );
});
