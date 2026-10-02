import { ExternalLink, FileText } from "lucide-react";

export function DocumentPreview({
  url,
  contentType,
  filename,
}: {
  url: string | null;
  contentType: string;
  filename: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-semibold" title={filename}>
          {filename}
        </p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open original document"
            title="Open original document"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      <div className="relative h-64 overflow-hidden rounded-sm border border-border bg-secondary sm:h-80 lg:aspect-[3/4] lg:h-auto">
        {!url ? (
          <div className="absolute inset-0 grid place-content-center gap-3 p-5 text-center text-muted-foreground">
            <FileText className="mx-auto h-9 w-9" />
            <p className="text-sm">Original upload incomplete</p>
          </div>
        ) : contentType === "application/pdf" ? (
          <object
            data={url}
            type="application/pdf"
            className="absolute inset-0 h-full w-full"
          >
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex h-full items-center justify-center gap-2 p-5 text-sm font-semibold text-primary"
            >
              <FileText className="h-5 w-5" />
              Open PDF
            </a>
          </object>
        ) : (
          <img
            src={url}
            alt={`Original document: ${filename}`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
    </section>
  );
}
