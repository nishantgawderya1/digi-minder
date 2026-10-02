import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/index.server";
import { documentPages } from "@/db/schema";
import { processingDocument, jobProgress } from "./processing.server";
import { readStoredOriginal } from "./storage.server";
import { prepareServerPage } from "./document-render.server";
import {
  acceptLocalPageForOwner,
  readDocumentPageForOwner,
  finishReadingForOwner,
} from "./bill-service.server";
import { readWithServerTesseract } from "./tesseract.server";
import type { Result } from "./service-error.server";
function unwrap<T>(result: Result<T>) {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function processPage(
  documentId: string,
  generation: number,
  pageIndex: number,
) {
  const document = await processingDocument(documentId, generation);
  if (!document) return;
  const [prior] = await getDatabase()
    .select()
    .from(documentPages)
    .where(
      and(
        eq(documentPages.documentId, documentId),
        eq(documentPages.userId, document.userId),
        eq(documentPages.pageIndex, pageIndex),
      ),
    );
  if (prior?.status !== "complete") {
    await jobProgress(documentId, generation, "reading", pageIndex);
    const page = await prepareServerPage(
      await readStoredOriginal(document.storageKey!, document.contentType),
      document.contentType,
      pageIndex,
    );
    if (page.text)
      unwrap(
        await acceptLocalPageForOwner(document.userId, {
          id: documentId,
          pageIndex,
          text: page.text,
          confidence: null,
          source: "pdf-text",
        }),
      );
    else {
      if (!page.imageDataUrl || page.imageDataUrl.length > 2_500_000)
        throw new Error("Page image exceeds the OCR limit.");
      try {
        unwrap(
          await readDocumentPageForOwner(document.userId, {
            id: documentId,
            pageIndex,
            imageDataUrl: page.imageDataUrl,
          }),
        );
      } catch {
        const result = await readWithServerTesseract(
          Buffer.from(page.imageDataUrl.split(",")[1]!, "base64"),
        );
        unwrap(
          await acceptLocalPageForOwner(document.userId, {
            id: documentId,
            pageIndex,
            ...result,
            source: "tesseract",
          }),
        );
      }
    }
  }
  await jobProgress(documentId, generation, "reading", pageIndex + 1);
}

export async function extractProcessedDocument(
  documentId: string,
  generation: number,
) {
  const document = await processingDocument(documentId, generation);
  if (!document) return;
  await jobProgress(documentId, generation, "extracting", document.pageCount);
  unwrap(await finishReadingForOwner(document.userId, documentId));
  await jobProgress(documentId, generation, "complete", document.pageCount);
}
