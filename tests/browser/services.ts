import { emptyBillFields, type Bill, type BillFields } from "@/lib/bills";
import { extractBillFields } from "@/lib/ocr";
import { prepareDocument, readPreparedDocument } from "@/lib/document-client";
import type { DraftPatch } from "@/lib/review";

const id = "ab096c6d-c5c6-42c7-959a-0f3d46591a4f";
const picture =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=";
type Draft = {
  id: string;
  filename: string;
  contentType: string;
  pageCount: number;
  status: string;
  fields: BillFields;
  pages: {
    pageIndex: number;
    text: string;
    status: string;
    confidence: string;
  }[];
  previewUrl: string;
  revision?: number;
  draftPatch?: DraftPatch;
  job?: { status: string; completedPages: number; error: string | null };
  error?: string | null;
};
type State = { bills: Bill[]; draft: Draft | null };
const state = (): State =>
  JSON.parse(
    sessionStorage.getItem("test-vault") || '{"bills":[],"draft":null}',
  );
const persist = (value: State) =>
  sessionStorage.setItem("test-vault", JSON.stringify(value));
const ok = <T>(data: T) => ({ ok: true as const, data });
export function unwrap<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
) {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
export const loadVault = async () => {
  const data = state();
  return ok({
    bills: data.bills,
    drafts: data.draft ? [data.draft] : [],
    dueReminders: [],
  });
};
export const loadBill = async ({ data }: { data: { id: string } }) => {
  const bill = state().bills.find((entry) => entry.id === data.id);
  if (!bill) throw new Error("Bill not found");
  return ok({
    bill,
    documents: [
      {
        id: bill.id,
        filename: "test-original.png",
        contentType: "image/png",
        status: "complete",
      },
    ],
  });
};
export const loadReview = async () => {
  const draft = state().draft;
  if (!draft) throw new Error("Draft missing");
  return ok({
    ...draft,
    fields: { ...draft.fields, ...draft.draftPatch },
    itemId: null,
    error: draft.error ?? null,
    revision: draft.revision ?? 0,
    draftPatch: draft.draftPatch ?? {},
    evidence:
      draft.status === "review"
        ? { serialNumber: { quote: "Serial number: 001234", page: 0 } }
        : {},
    job: draft.job ?? null,
    backgroundAvailable: true,
  });
};
export const beginUpload = async ({
  data,
}: {
  data: { filename: string; contentType: string; pageCount: number };
}) => {
  const current = state();
  current.draft = {
    ...data,
    id,
    status: "pending",
    fields: emptyBillFields(),
    pages: [],
    previewUrl: picture,
  };
  persist(current);
  return ok({
    id,
    uploadUrl: "/test-original-upload",
    ocrAvailable: sessionStorage.getItem("ocr-unavailable") !== "true",
  });
};
export const completeUpload = async () => {
  const current = state();
  current.draft!.status = "processing";
  current.draft!.job = { status: "queued", completedPages: 0, error: null };
  persist(current);
  const backgroundAvailable =
    sessionStorage.getItem("background-disabled") !== "true";
  if (backgroundAvailable) setTimeout(() => void runWorker(), 50);
  return ok({ id, backgroundAvailable });
};
async function runWorker() {
  while (sessionStorage.getItem("worker-paused") === "true")
    await new Promise((resolve) => setTimeout(resolve, 50));
  const draft = state().draft;
  if (!draft) return;
  let prepared;
  try {
    const original = await (await fetch(draft.previewUrl)).blob();
    prepared = await prepareDocument(
      new File([original], draft.filename, { type: draft.contentType }),
    );
    await readPreparedDocument(draft.id, prepared, () => {});
  } catch (cause) {
    const current = state();
    if (!current.draft) return;
    current.draft.status = "failed";
    current.draft.error =
      cause instanceof Error ? cause.message : "Reading failed";
    current.draft.job = {
      status: "failed",
      completedPages: current.draft.pages.length,
      error: current.draft.error,
    };
    persist(current);
  } finally {
    prepared?.dispose();
  }
}
export const queueReading = async () => completeUpload();
export const autosaveReview = async ({
  data,
}: {
  data: { id: string; revision: number; patch: DraftPatch };
}) => {
  await new Promise((resolve) =>
    setTimeout(resolve, Number(sessionStorage.getItem("autosave-delay") || 0)),
  );
  if (sessionStorage.getItem("autosave-failure") === "true")
    return {
      ok: false as const,
      error: "Changes couldn't be saved. Please retry.",
    };
  const current = state();
  const draft = current.draft;
  if (!draft || (draft.revision ?? 0) !== data.revision)
    return {
      ok: false as const,
      error:
        "These details changed in another window. Refresh before editing again.",
    };
  draft.draftPatch = { ...draft.draftPatch, ...data.patch };
  draft.revision = (draft.revision ?? 0) + 1;
  persist(current);
  return ok({ revision: draft.revision });
};
export const readDocumentPage = async ({
  data,
}: {
  data: { pageIndex: number; imageDataUrl: string };
}) => {
  if (
    sessionStorage.getItem("ocr-failure") === "true" ||
    sessionStorage.getItem("ocr-unavailable") === "true"
  )
    return { ok: false as const, error: "Reader unavailable" };
  if (!/^data:image\/(?:jpeg|png);base64,/.test(data.imageDataUrl))
    throw new Error("Not a rasterized page");
  const current = state();
  current.draft!.pages.push({
    pageIndex: data.pageIndex,
    text: "Product name: Test lamp\nSerial number: 001234\nBarcode: 009988\nTotal: INR 120.00\nInvoice date: 01/10/2026",
    status: "complete",
    confidence: "0.95",
  });
  current.draft!.job = {
    status: "reading",
    completedPages: current.draft!.pages.length,
    error: null,
  };
  persist(current);
  return ok({ pageIndex: data.pageIndex });
};
export const finishReading = async () => {
  const current = state();
  current.draft!.status = "review";
  current.draft!.fields = extractBillFields(
    current.draft!.pages.map((page) => page.text).join("\n"),
  );
  current.draft!.job = {
    status: "complete",
    completedPages: current.draft!.pageCount,
    error: null,
  };
  persist(current);
  return ok({ id });
};
export const acceptLocalPage = async ({
  data,
}: {
  data: { pageIndex: number; text: string; confidence: number | null };
}) => {
  const current = state();
  current.draft!.pages.push({
    pageIndex: data.pageIndex,
    text: data.text,
    confidence: String(data.confidence),
    status: "complete",
  });
  persist(current);
  return ok({ pageIndex: data.pageIndex });
};
export const saveBill = async ({
  data,
}: {
  data: { id: string; fields: BillFields };
}) => {
  const current = state();
  current.bills = current.bills.filter((bill) => bill.id !== data.id);
  current.bills.push({
    ...data.fields,
    id: data.id,
    userId: "browser-test-user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  current.draft = null;
  persist(current);
  return ok({ id: data.id });
};
export const removeBill = async ({ data }: { data: { id: string } }) => {
  const current = state();
  current.bills = current.bills.filter((bill) => bill.id !== data.id);
  persist(current);
  return ok(data);
};
export const removeDraft = async () => {
  const current = state();
  current.draft = null;
  persist(current);
  return ok({ id });
};
export const getDocumentLink = async () => ok({ url: picture });
