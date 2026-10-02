import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, FilePenLine, MessageSquare, Plus } from "lucide-react";
import { z } from "zod";
import { PhoneShell, ScreenHeader } from "@/components/phone-shell";
import { requireCurrentUser } from "@/lib/route-auth";
import { loadVault, unwrap } from "@/lib/bill-functions";
import { supportDraft } from "@/lib/support-draft";
import { AssistantChat } from "@/components/assistant-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/agent")({
  validateSearch: z.object({
    itemId: z.string().uuid().optional().catch(undefined),
  }),
  beforeLoad: () => requireCurrentUser(),
  loader: async () => unwrap(await loadVault()),
  component: AgentScreen,
});
function AgentScreen() {
  const { bills } = Route.useLoaderData();
  const { itemId } = Route.useSearch();
  const [selected, setSelected] = useState(itemId ?? "");
  const [issue, setIssue] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bill = bills.find((entry) => entry.id === selected);
  return (
    <PhoneShell>
      <ScreenHeader eyebrow="Assistant" title="Your bills, answered" />
      <Tabs defaultValue="chat" className="p-5 lg:p-8">
        <TabsList className="mb-5">
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="draft" className="gap-2">
            <FilePenLine className="h-4 w-4" />
            Support draft
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat">
          <AssistantChat bills={bills} itemId={itemId} />
        </TabsContent>
        <TabsContent value="draft">
          <div className="space-y-6">
            {!bills.length ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No saved bills yet.
                </p>
                <Link
                  to="/scan"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary"
                >
                  <Plus className="h-4 w-4" />
                  Add a bill
                </Link>
              </div>
            ) : (
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (bill && issue.trim()) {
                    setDraft(supportDraft(bill, issue));
                    setCopied(false);
                    setError(null);
                  }
                }}
              >
                <label
                  htmlFor="support-bill"
                  className="block text-xs font-semibold"
                >
                  Bill
                  <select
                    id="support-bill"
                    required
                    value={selected}
                    onChange={(event) => {
                      setSelected(event.target.value);
                      setDraft("");
                    }}
                    className="mt-2 block h-12 w-full min-w-0 rounded-sm border border-input bg-card px-3 text-sm"
                  >
                    <option value="">Select a saved bill</option>
                    {bills.map((entry) => (
                      <option value={entry.id} key={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  htmlFor="support-issue"
                  className="block text-xs font-semibold"
                >
                  What went wrong?
                  <textarea
                    id="support-issue"
                    required
                    maxLength={4000}
                    rows={5}
                    value={issue}
                    onChange={(event) => {
                      setIssue(event.target.value);
                      setDraft("");
                    }}
                    className="mt-2 block w-full rounded-sm border border-input bg-card p-3 text-sm"
                  />
                </label>
                <button
                  disabled={!bill || !issue.trim()}
                  className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  <FilePenLine className="h-4 w-4" />
                  Prepare draft
                </button>
              </form>
            )}
            {draft ? (
              <section className="border-t border-border pt-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">Draft, not sent</h2>
                  <button
                    type="button"
                    aria-label={copied ? "Copied" : "Copy draft"}
                    title={copied ? "Copied" : "Copy draft"}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(draft)
                        .then(() => setCopied(true))
                        .catch(() =>
                          setError(
                            "Clipboard access failed. Select the draft text to copy it.",
                          ),
                        );
                    }}
                    className="grid h-10 w-10 place-items-center border border-border"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <textarea
                  aria-label="Support request draft"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setCopied(false);
                  }}
                  rows={18}
                  className="mt-4 block w-full rounded-sm border border-input bg-card p-4 text-sm leading-relaxed"
                />
                {error ? (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </PhoneShell>
  );
}
