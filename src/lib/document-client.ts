import { acceptedFileTypes, MAX_FILE_BYTES, MAX_PAGES } from "./bills";
import { encodeOcrImage, ocrImageSize, pdfOcrScale } from "./ocr-image";
import {
  beginUpload,
  completeUpload,
  readDocumentPage,
  finishReading,
  acceptLocalPage,
  unwrap,
} from "./bill-functions";

export type PreparedDocument = {
  file: File;
  pageCount: number;
  renderPage: (index: number) => Promise<string>;
  readText?: (index: number) => Promise<string | null>;
  dispose: () => void;
};

export async function prepareDocument(source: File): Promise<PreparedDocument> {
  const inferredType =
    source.type || (/\.pdf$/i.test(source.name) ? "application/pdf" : "");
  if (!acceptedFileTypes.some((type) => type === inferredType))
    throw new Error("Choose a JPEG, PNG, WebP or PDF file.");
  if (!source.size || source.size > MAX_FILE_BYTES)
    throw new Error("Choose a file smaller than 15 MB.");
  const file = source.type
    ? source
    : new File([source], source.name, { type: inferredType });
  if (inferredType === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
      wasmUrl: "/pdf-assets/wasm/",
      standardFontDataUrl: "/pdf-assets/standard_fonts/",
      cMapUrl: "/pdf-assets/cmaps/",
      cMapPacked: true,
    });
    let pdf;
    try {
      pdf = await task.promise;
    } catch {
      await task.destroy();
      throw new Error(
        "This PDF could not be opened. Use an unlocked PDF or upload images of its pages.",
      );
    }
    if (pdf.numPages > MAX_PAGES) {
      await task.destroy();
      throw new Error(`Upload a PDF with at most ${MAX_PAGES} pages.`);
    }
    return {
      file,
      pageCount: pdf.numPages,
      readText: async (index) => {
        const page = await pdf.getPage(index + 1);
        const content = await page.getTextContent();
        const text = content.items
          .flatMap((item) =>
            "str" in item ? [item.str + (item.hasEOL ? "\n" : " ")] : [],
          )
          .join("")
          .trim();
        // Sparse text may be a watermark over a scan; send those pages through OCR.
        return text.length >= 100 &&
          /\p{L}/u.test(text) &&
          !text.includes("\uFFFD")
          ? text.slice(0, 100_000)
          : null;
      },
      dispose: () => {
        void task.destroy();
      },
      renderPage: async (index) => {
        const page = await pdf.getPage(index + 1);
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: pdfOcrScale(original.width, original.height),
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({ canvas, viewport, background: "white" }).promise;
          return encodeOcrImage(canvas);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      },
    };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      "This image could not be opened. Try a JPEG or PNG version.",
    );
  }
  if (image.width * image.height > 60_000_000) {
    URL.revokeObjectURL(url);
    throw new Error("Choose an image smaller than 60 megapixels.");
  }
  return {
    file,
    pageCount: 1,
    dispose: () => URL.revokeObjectURL(url),
    renderPage: async () => {
      const size = ocrImageSize(image.width, image.height);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Image processing is unavailable in this browser.");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      try {
        return encodeOcrImage(canvas);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
  };
}

export async function readPreparedDocument(
  id: string,
  prepared: PreparedDocument,
  onProgress: (message: string) => void,
) {
  for (let index = 0; index < prepared.pageCount; index++) {
    onProgress(`Reading page ${index + 1} of ${prepared.pageCount}`);
    const embeddedText = await prepared.readText?.(index).catch(() => null);
    if (embeddedText) {
      unwrap(
        await acceptLocalPage({
          data: {
            id,
            pageIndex: index,
            text: embeddedText,
            confidence: null,
            source: "pdf-text",
          },
        }),
      );
      continue;
    }
    const imageDataUrl = await prepared.renderPage(index);
    try {
      unwrap(
        await readDocumentPage({
          data: { id, pageIndex: index, imageDataUrl },
        }),
      );
    } catch (cause) {
      onProgress(`Reading page ${index + 1} locally with Tesseract`);
      try {
        const { readWithTesseract } = await import("./tesseract-client");
        const result = await readWithTesseract(imageDataUrl, onProgress);
        unwrap(
          await acceptLocalPage({
            data: { id, pageIndex: index, ...result, source: "tesseract" },
          }),
        );
      } catch {
        throw new Error(
          `${cause instanceof Error ? cause.message : "NVIDIA OCR failed."} Local OCR could not recover this page. Retry or enter the details manually.`,
        );
      }
    }
  }
  onProgress("Extracting bill details");
  unwrap(await finishReading({ data: { id } }));
}

export async function uploadDocument(
  prepared: PreparedDocument,
  onProgress: (message: string) => void,
) {
  onProgress("Uploading original");
  const upload = unwrap(
    await beginUpload({
      data: {
        filename: prepared.file.name,
        contentType: prepared.file.type as (typeof acceptedFileTypes)[number],
        byteSize: prepared.file.size,
        pageCount: prepared.pageCount,
      },
    }),
  );
  let backgroundAvailable = false;
  try {
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": prepared.file.type },
      body: prepared.file,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error("The file upload failed. Please try again.");
    backgroundAvailable = unwrap(
      await completeUpload({ data: { id: upload.id } }),
    ).backgroundAvailable;
  } catch {
    return {
      id: upload.id,
      error:
        "The original hasn't finished uploading. Please retry from Add bill.",
    };
  }
  if (!backgroundAvailable) {
    try {
      await readPreparedDocument(upload.id, prepared, onProgress);
    } catch (cause) {
      return {
        id: upload.id,
        error:
          cause instanceof Error
            ? cause.message
            : "Reading couldn't finish. Complete the details manually.",
      };
    }
  }
  return { id: upload.id, error: null };
}
