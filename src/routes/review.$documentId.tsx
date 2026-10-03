import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  FileText,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/phone-shell";
import { BillForm } from "@/components/bill-form";
import { DocumentPreview } from "@/components/document-preview";
import {
  getDocumentLink,
  loadReview,
  removeDraft,
  saveBill,
  unwrap,
  queueReading,
} from "@/lib/bill-functions";
import { prepareDocument, readPreparedDocument } from "@/lib/document-client";
import { requireCurrentUser } from "@/lib/route-auth";
import type { BillFields } from "@/lib/bills";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";

export const Route = createFileRoute("/review/$documentId")({
  beforeLoad: () => requireCurrentUser(),
  loader: async ({ params }) => {
    const data = unwrap(await loadReview({ data: { id: params.documentId } }));
    if (data.itemId)
      throw redirect({ to: "/item/$itemId", params: { itemId: data.itemId } });
    return data;
  },
  head: () => ({
    meta: [
      { title: "Review bill - Warrantly" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewScreen,
});

function ReviewScreen() {
  const data = Route.useLoaderData();
  return <ReviewEditor key={data.id} />;
}
function ReviewEditor() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const autosave = useDraftAutosave(data.id, data.revision);
  const processing =
    data.backgroundAvailable &&
    data.job &&
    ["queued", "reading", "extracting"].includes(data.job.status);
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void router.invalidate(), 2500);
    return () => clearInterval(timer);
  }, [processing, router]);
  const lowConfidence = data.pages.some(
    (page) => page.confidence !== null && Number(page.confidence) < 0.8,
  );
  const persist = async (fields: BillFields) => {
    setSaving(true);
    setError(null);
    try {
      await autosave.flush();
      const saved = unwrap(
        await saveBill({ data: { id: data.id, documentId: data.id, fields } }),
      );
      await navigate({ to: "/item/$itemId", params: { itemId: saved.id } });
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The bill couldn't be saved. Your edits are still here.",
      );
    } finally {
      setSaving(false);
    }
  };
  const retry = async () => {
    setReading(true);
    setError(null);
    try {
      await autosave.flush();
      unwrap(await queueReading({ data: { id: data.id } }));
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Reading couldn't be queued.",
      );
    } finally {
      setReading(false);
    }
  };
  const readLocally = async () => {
    setReading(true);
    setError(null);
    setProgress("Opening original");
    let prepared;
    try {
      await autosave.flush();
      const { url } = unwrap(
        await getDocumentLink({ data: { id: data.id, download: false } }),
      );
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok)
        throw new Error("The original couldn't be opened. Please try again.");
      prepared = await prepareDocument(
        new File([await response.blob()], data.filename, {
          type: data.contentType,
        }),
      );
      await readPreparedDocument(data.id, prepared, setProgress);
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Reading failed. You can enter the details manually.",
      );
    } finally {
      prepared?.dispose();
      setReading(false);
    }
  };
  const discard = async () => {
    if (!window.confirm("Delete this unfinished bill and its original file?"))
      return;
    setSaving(true);
    setError(null);
    try {
      unwrap(await removeDraft({ data: { id: data.id } }));
      await autosave.discard();
      await navigate({ to: "/vault" });
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't delete the draft.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <PhoneShell>
      <header className="flex items-center gap-3 border-b border-border px-5 py-4 lg:px-8">
        <Link
          to="/vault"
          aria-label="Back to vault"
          title="Back to vault"
          className="grid h-9 w-9 place-items-center rounded-sm border border-border"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="flex-1 text-base font-extrabold">Check the details</h1>
        <button
          onClick={discard}
          disabled={saving || reading}
          aria-label="Delete unfinished bill"
          title="Delete unfinished bill"
          className="grid h-9 w-9 place-items-center rounded-sm border border-border text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>
      <div className="grid min-w-0 gap-7 px-5 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
        <div className="min-w-0 space-y-4">
          <DocumentPreview
            url={data.previewUrl}
            filename={data.filename}
            contentType={data.contentType}
          />
          <details className="border-y border-border py-3">
            <summary className="cursor-pointer text-sm font-bold">
              <FileText className="mr-2 inline h-4 w-4" />
              Extracted text (
              {data.pages.filter((page) => page.status === "complete").length}/
              {data.pageCount} pages)
            </summary>
            <div className="mt-3 max-h-96 space-y-4 overflow-auto">
              {data.pages.map((page) => (
                <section key={page.pageIndex}>
                  <p className="mb-2 text-xs font-bold text-muted-foreground">
                    Page {page.pageIndex + 1}
                    {page.confidence !== null
                      ? ` · ${Math.round(Number(page.confidence) * 100)}% average OCR confidence`
                      : ""}
                  </p>
                  <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {page.text || "No text extracted."}
                  </pre>
                </section>
              ))}
              {!data.pages.length ? (
                <p className="text-sm text-muted-foreground">
                  No text extracted yet.
                </p>
              ) : null}
            </div>
          </details>
          {data.status !== "pending" ? (
            <button
              onClick={retry}
              disabled={reading || saving || !!processing}
              className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {reading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {reading ? progress || "Queueing" : "Retry reading"}
            </button>
          ) : (
            <Link
              to="/scan"
              className="inline-flex items-center gap-2 text-sm font-bold text-primary"
            >
              <RotateCcw className="h-4 w-4" />
              Upload again
            </Link>
          )}
          {(data.status === "failed" ||
            (!data.backgroundAvailable && data.status !== "pending")) &&
          !processing ? (
            <button
              type="button"
              onClick={() => void readLocally()}
              disabled={reading || saving}
              className="ml-3 text-sm font-semibold text-primary"
            >
              Read on this device
            </button>
          ) : null}
        </div>
        <div className="min-w-0 space-y-5">
          {processing ? (
            <div
              role="status"
              className="flex items-center gap-2 border-b border-border pb-3 text-sm"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {data.job?.status === "queued"
                ? "Queued for reading"
                : data.job?.status === "extracting"
                  ? "Extracting bill details"
                  : `Reading pages (${data.job?.completedPages}/${data.pageCount})`}
              <span className="ml-auto text-xs text-muted-foreground">
                You can return later
              </span>
            </div>
          ) : null}
          {data.extractionMethod === "nvidia-llm" ? (
            <p className="text-xs font-semibold text-primary">
              AI-extracted details · Awaiting your review
            </p>
          ) : null}
          <p className="border-l-2 border-primary pl-3 text-sm leading-relaxed text-muted-foreground">
            {data.status === "pending"
              ? "The original hasn't finished uploading. Upload it again before saving."
              : data.error ||
                (data.status !== "review"
                  ? "Automatic reading hasn't completed. Retry or enter the details from your original."
                  : lowConfidence
                    ? "Some text was difficult to read. Check the suggested values against your original."
                    : "Check the extracted values against your original. Missing details are left blank.")}
          </p>
          <BillForm
            key={data.id}
            initial={data.fields}
            onSave={persist}
            saving={saving}
            error={error}
            disabled={reading || data.status === "pending"}
            onChange={autosave.change}
            evidence={data.evidence}
            draftPatch={data.draftPatch}
            warnMissingName={data.status === "review" && !data.fields.name}
            missingNameMessage={
              data.nameIssue === "ambiguous"
                ? "Choose the purchased item from the invoice and enter its name."
                : data.nameIssue === "rejected"
                  ? "The suggested name could not be verified against the source. Enter the item name from the original."
                  : data.nameIssue === "unreadable"
                    ? "The item description was difficult to read. Check the original and enter its name."
                    : data.nameIssue === "absent"
                      ? "No item name was found on the invoice. Enter the purchased item's name."
                      : "Item name not found in the extracted details."
            }
          />
          <p role="status" className="text-xs text-muted-foreground">
            {autosave.status}
          </p>
          {autosave.error ? (
            <div role="alert" className="text-sm text-destructive">
              {autosave.error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => void autosave.flush().catch(() => {})}
              >
                Retry saving
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </PhoneShell>
  );
}
