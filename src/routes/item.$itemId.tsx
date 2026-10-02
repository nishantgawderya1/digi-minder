import { useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeft, Download, FileText, Pencil, Trash2, X } from "lucide-react";
import { PhoneShell, ScreenHeader, StatusChip } from "@/components/phone-shell";
import { BillForm } from "@/components/bill-form";
import { requireCurrentUser } from "@/lib/route-auth";
import {
  getDocumentLink,
  loadBill,
  removeBill,
  saveBill,
  unwrap,
} from "@/lib/bill-functions";
import {
  billFieldsSchema,
  displayDate,
  money,
  warrantyState,
  type BillFields,
} from "@/lib/bills";

export const Route = createFileRoute("/item/$itemId")({
  beforeLoad: () => requireCurrentUser(),
  loader: async ({ params }) =>
    unwrap(await loadBill({ data: { id: params.itemId } })),
  component: ItemScreen,
});
function ItemScreen() {
  const { bill, documents } = Route.useLoaderData();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const navigate = useNavigate();
  const cover = warrantyState(bill);
  const initial = billFieldsSchema.strip().parse(bill);
  async function save(fields: BillFields) {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await saveBill({ data: { id: bill.id, documentId: null, fields } }),
      );
      await router.invalidate();
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't save this bill.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        `Delete "${bill.name}" and its original documents? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await removeBill({ data: { id: bill.id } }));
      await navigate({ to: "/vault" });
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't delete this bill.",
      );
      setBusy(false);
    }
  }
  async function download(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { url } = unwrap(
        await getDocumentLink({ data: { id, download: true } }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener";
      anchor.click();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't open the original.",
      );
    } finally {
      setBusy(false);
    }
  }
  const details = [
    ["Store / retailer", bill.retailer],
    ["Brand", bill.brand],
    ["Invoice number", bill.invoiceNumber],
    ["Serial / IMEI", bill.serialNumber],
    ["Model number", bill.modelNumber],
    ["Barcode / EAN / UPC", bill.barcode],
    ["Category", bill.category],
    ["Purchased", displayDate(bill.purchaseDate)],
    ["Amount paid", money(bill.purchasePrice, bill.currency)],
    ["Warranty ends", displayDate(bill.warrantyExpiresAt)],
    ["Return deadline", displayDate(bill.returnExpiresAt)],
  ];
  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow="Saved bill"
        title={bill.name}
        right={
          <Link
            to="/vault"
            title="Back to vault"
            aria-label="Back to vault"
            className="grid h-10 w-10 place-items-center border border-border"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <div className="space-y-6 p-5 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusChip tone={cover.status}>{cover.label}</StatusChip>
          <div className="flex gap-2">
            <button
              aria-label={editing ? "Cancel editing" : "Edit bill"}
              title={editing ? "Cancel editing" : "Edit bill"}
              disabled={busy}
              onClick={() => {
                setEditing(!editing);
                setError(null);
              }}
              className="grid h-10 w-10 place-items-center border border-border disabled:opacity-50"
            >
              {editing ? (
                <X className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
            </button>
            <button
              aria-label="Delete bill"
              title="Delete bill"
              disabled={busy}
              onClick={() => void remove()}
              className="grid h-10 w-10 place-items-center border border-destructive/30 text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        {editing ? (
          <BillForm
            initial={initial}
            onSave={(fields) => void save(fields)}
            saving={busy}
            error={error}
          />
        ) : (
          <>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <dl className="grid gap-x-6 gap-y-5 border-y border-border py-6 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold">
                    {value || "Not recorded"}
                  </dd>
                </div>
              ))}
            </dl>
            {bill.notes ? (
              <section>
                <h2 className="text-sm font-bold">Notes</h2>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {bill.notes}
                </p>
              </section>
            ) : null}
            <section>
              <h2 className="text-sm font-bold">Original documents</h2>
              <div className="mt-3 divide-y divide-border">
                {documents.map((file) => (
                  <div className="flex items-center gap-3 py-3" key={file.id}>
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 break-words text-sm">
                      {file.filename}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Download ${file.filename}`}
                      title="Download original"
                      onClick={() => void download(file.id)}
                      className="grid h-10 w-10 shrink-0 place-items-center border border-border disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {!documents.length ? (
                  <p className="text-sm text-muted-foreground">
                    No original document attached.
                  </p>
                ) : null}
              </div>
            </section>
            <Link
              to="/agent"
              search={{ itemId: bill.id }}
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
            >
              <Pencil className="h-4 w-4" />
              Draft a support request
            </Link>
          </>
        )}
      </div>
    </PhoneShell>
  );
}
