import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  ArrowUpRight,
  FileText,
  LoaderCircle,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { Bill } from "@/lib/bills";
import type { AssistantMessage, AssistantReply } from "@/lib/assistant";
import { askAssistant } from "@/lib/assistant-functions";
import { unwrap } from "@/lib/bill-functions";

type Message = AssistantMessage & { sources?: AssistantReply["sources"] };

export function AssistantChat({
  bills,
  itemId,
}: {
  bills: Bill[];
  itemId: string | undefined;
}) {
  const [selected, setSelected] = useState(
    bills.some((bill) => bill.id === itemId) ? itemId! : "",
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const selectedBill = bills.find((bill) => bill.id === selected);
  const suggestions = selectedBill
    ? [
        {
          label: "Warranty & return dates",
          question: `What warranty and return dates are recorded for ${selectedBill.name}?`,
        },
        {
          label: "Purchase price & store",
          question: `How much did I pay for ${selectedBill.name}, and where did I buy it?`,
        },
        {
          label: "Product reference numbers",
          question: `What invoice, serial and model numbers are saved for ${selectedBill.name}?`,
        },
      ]
    : [
        {
          label: "Which warranties end soon?",
          question: "Which of my saved bills have a warranty ending soon?",
        },
        {
          label: "Find my return deadlines",
          question:
            "What return deadlines are recorded for my saved purchases?",
        },
        {
          label: "Review purchase amounts",
          question:
            "What amounts and stores are recorded for my saved purchases?",
        },
      ];
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending]);
  function reset() {
    generation.current++;
    setMessages([]);
    setQuestion("");
    setPending(null);
    setError(null);
  }
  async function submit() {
    const content = question.trim();
    if (!content || pending) return;
    const current = ++generation.current;
    const conversation: AssistantMessage[] = [
      ...messages.slice(-4).map(({ role, content }) => ({ role, content })),
      { role: "user", content },
    ];
    setPending(content);
    setError(null);
    try {
      const result = unwrap(
        await askAssistant({
          data: { itemId: selected || null, messages: conversation },
        }),
      );
      if (generation.current !== current) return;
      setMessages((previous) => [
        ...previous,
        { role: "user", content },
        { role: "assistant", content: result.answer, sources: result.sources },
      ]);
      setQuestion("");
    } catch (cause) {
      if (generation.current === current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The assistant is unavailable. Please retry.",
        );
    } finally {
      if (generation.current === current) setPending(null);
    }
  }
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-end gap-3 border-b border-border pb-4">
        <div className="min-w-0 flex-1 text-xs font-semibold">
          <label htmlFor="chat-bill">Bills</label>
          <select
            id="chat-bill"
            value={selected}
            disabled={!!pending}
            onChange={(event) => {
              reset();
              setSelected(event.target.value);
            }}
            className="mt-2 block h-11 w-full min-w-0 rounded-sm border border-input bg-card px-3 text-sm"
          >
            <option value="">
              {bills.length > 50 ? "Latest 50 saved bills" : "All saved bills"}
            </option>
            {bills.map((bill) => (
              <option key={bill.id} value={bill.id}>
                {bill.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          title="New chat"
          aria-label="New chat"
          onClick={reset}
          disabled={!!pending}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-border disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div
        role="log"
        aria-label="Assistant conversation"
        aria-live="polite"
        aria-busy={!!pending}
        className="min-h-64 max-h-[55dvh] space-y-5 overflow-y-auto py-5 pr-1 lg:min-h-80"
      >
        {!messages.length && !pending ? (
          <div className="mx-auto max-w-lg py-5 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold">
              {bills.length
                ? selectedBill
                  ? "Ask about this purchase"
                  : "Find answers in your bills"
                : "Save your first bill"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {bills.length
                ? "Find recorded prices, reference numbers and deadlines. Answers use the saved details in the bills you choose."
                : "No saved bills yet."}
            </p>
            {bills.length ? (
              <div className="mt-5 grid gap-2 text-left">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => {
                      setQuestion(suggestion.question);
                      setError(null);
                      questionInput.current?.focus();
                    }}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {suggestion.label}
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            ) : (
              <Link
                to="/scan"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
                Add a bill
              </Link>
            )}
          </div>
        ) : null}
        {messages.map((message, index) => (
          <article
            key={index}
            className={
              message.role === "user"
                ? "ml-6 rounded-xl bg-secondary p-4 sm:ml-16"
                : "rounded-xl border border-border bg-card p-4"
            }
          >
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {message.role === "user" ? "You" : "Warrantly"}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
              {message.content}
            </p>
            {message.sources?.length ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {message.sources.map((source) => (
                  <Link
                    key={source.id}
                    to="/item/$itemId"
                    params={{ itemId: source.id }}
                    className="inline-flex min-w-0 max-w-full items-start gap-1.5 text-xs font-semibold text-primary"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="break-words [overflow-wrap:anywhere]">
                      {source.name}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {pending ? (
          <div className="space-y-4">
            <p className="ml-6 whitespace-pre-wrap break-words text-sm sm:ml-16">
              {pending}
            </p>
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Thinking...
            </p>
          </div>
        ) : null}
        <div ref={end} />
      </div>
      <form
        className="border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label
          htmlFor="assistant-question"
          className="mb-2 block text-xs font-semibold"
        >
          Your question
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="assistant-question"
            ref={questionInput}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            required
            maxLength={4000}
            rows={3}
            placeholder={
              selectedBill
                ? "Ask about this purchase..."
                : "Ask about your saved bills..."
            }
            disabled={!!pending || !bills.length}
            className="block min-w-0 flex-1 resize-y rounded-sm border border-input bg-card p-3 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send question"
            title="Send question"
            disabled={!!pending || !question.trim() || !bills.length}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground disabled:opacity-40"
          >
            {pending ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Answers reference saved bill details. Open a source to check the
          original record.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
