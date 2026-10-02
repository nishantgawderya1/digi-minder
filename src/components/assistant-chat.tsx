import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, FileText, LoaderCircle, Plus, RotateCcw } from "lucide-react";
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
        <label
          className="min-w-0 flex-1 text-xs font-semibold"
          htmlFor="chat-bill"
        >
          Bills
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
        </label>
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
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {bills.length
                ? "What would you like to know?"
                : "No saved bills yet."}
            </p>
            {!bills.length ? (
              <Link
                to="/scan"
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary"
              >
                <Plus className="h-4 w-4" />
                Add a bill
              </Link>
            ) : null}
          </div>
        ) : null}
        {messages.map((message, index) => (
          <article
            key={index}
            className={
              message.role === "user"
                ? "ml-6 border-l-2 border-border pl-4 sm:ml-16"
                : "border-l-2 border-primary pl-4"
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
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            required
            maxLength={4000}
            rows={3}
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
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
