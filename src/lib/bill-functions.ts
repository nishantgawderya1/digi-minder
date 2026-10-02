import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  acceptedFileTypes,
  MAX_FILE_BYTES,
  MAX_PAGES,
  saveBillSchema,
} from "./bills";
import { autosaveSchema } from "./review";

const idSchema = z.object({ id: z.string().uuid() });
export const loadVault = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./bill-service.server")).loadVault(),
);
export const loadBill = createServerFn({ method: "GET" })
  .validator(idSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).loadBill(data.id),
  );
export const loadReview = createServerFn({ method: "GET" })
  .validator(idSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).loadReview(data.id),
  );
export const beginUpload = createServerFn({ method: "POST" })
  .validator(
    z.object({
      filename: z.string().trim().min(1).max(255),
      contentType: z.enum(acceptedFileTypes),
      byteSize: z.number().int().positive().max(MAX_FILE_BYTES),
      pageCount: z.number().int().min(1).max(MAX_PAGES),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).beginUpload(data),
  );
export const completeUpload = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).completeUpload(data.id),
  );
export const queueReading = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) =>
    (await import("./processing.server")).queueReading(data.id),
  );
export const autosaveReview = createServerFn({ method: "POST" })
  .validator(autosaveSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).autosaveReview(data),
  );
export const readDocumentPage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      pageIndex: z
        .number()
        .int()
        .min(0)
        .max(MAX_PAGES - 1),
      imageDataUrl: z
        .string()
        .max(2_500_000)
        .regex(/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).readDocumentPage(data),
  );
export const finishReading = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).finishReading(data.id),
  );
export const acceptLocalPage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      pageIndex: z
        .number()
        .int()
        .min(0)
        .max(MAX_PAGES - 1),
      text: z.string().trim().min(1).max(100_000),
      confidence: z.number().min(0).max(1).nullable(),
      source: z.enum(["tesseract", "pdf-text"]),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).acceptLocalPage(data),
  );
export const saveBill = createServerFn({ method: "POST" })
  .validator(saveBillSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).saveBill(data),
  );
export const removeBill = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).removeBill(data.id),
  );
export const removeDraft = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).removeDraft(data.id),
  );
export const getDocumentLink = createServerFn({ method: "GET" })
  .validator(
    z.object({ id: z.string().uuid(), download: z.boolean().default(false) }),
  )
  .handler(async ({ data }) =>
    (await import("./bill-service.server")).getDocumentLink(
      data.id,
      data.download,
    ),
  );

export function unwrap<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
