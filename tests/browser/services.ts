import { emptyBillFields, type Bill, type BillFields } from "@/lib/bills";
import { extractBillFields } from "@/lib/ocr";

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
  return ok({ ...draft, itemId: null, error: null });
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
  persist(current);
  return ok({ id });
};
export const readDocumentPage = async ({
  data,
}: {
  data: { pageIndex: number; imageDataUrl: string };
}) => {
  if (sessionStorage.getItem("ocr-failure") === "true")
    return { ok: false as const, error: "Reader unavailable" };
  if (!data.imageDataUrl.startsWith("data:image/jpeg;base64,"))
    throw new Error("Not a rasterized page");
  const current = state();
  current.draft!.pages.push({
    pageIndex: data.pageIndex,
    text: "Product name: Test lamp\nSerial number: 001234\nBarcode: 009988\nTotal: INR 120.00\nInvoice date: 01/10/2026",
    status: "complete",
    confidence: "0.95",
  });
  persist(current);
  return ok({ pageIndex: data.pageIndex });
};
export const finishReading = async () => {
  const current = state();
  current.draft!.status = "review";
  current.draft!.fields = extractBillFields(
    current.draft!.pages.map((page) => page.text).join("\n"),
  );
  persist(current);
  return ok({ id });
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
