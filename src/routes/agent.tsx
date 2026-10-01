import { createFileRoute } from "@tanstack/react-router";
import { Bot, Check, Paperclip, Pencil, Send, Sparkles } from "lucide-react";
import { PhoneShell, ScreenHeader } from "@/components/phone-shell";
import { agentThread, quickAsks } from "@/lib/demo-data";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Assistant — Warrantly" },
      {
        name: "description",
        content:
          "Describe the fault and the assistant pulls your paperwork and drafts the complaint.",
      },
      { property: "og:title", content: "Assistant — Warrantly" },
      {
        property: "og:description",
        content:
          "Describe the fault and the assistant pulls your paperwork and drafts the complaint.",
      },
    ],
  }),
  component: AgentScreen,
});

function AgentScreen() {
  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow="Always on"
        title="Assistant"
        right={
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" strokeWidth={2.2} />
          </span>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 px-5 py-5 lg:px-8 lg:pb-36">
        {agentThread.map((m, i) =>
          m.from === "user" ? (
            <p
              key={i}
              className="ml-auto max-w-[85%] rounded-sm rounded-br-none bg-foreground px-3.5 py-2.5 text-sm text-background"
            >
              {m.text}
            </p>
          ) : (
            <div key={i} className="max-w-[92%] space-y-2 lg:max-w-[760px]">
              <p className="rounded-sm rounded-bl-none border border-border bg-card px-3.5 py-2.5 text-sm">
                {m.text}
              </p>

              {m.facts ? (
                <ul className="space-y-1 rounded-sm border border-primary bg-primary/10 p-3">
                  {m.facts.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs font-semibold">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              ) : null}

              {m.draft ? (
                <div className="rounded-sm border border-foreground bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em]">
                      Draft email · not sent
                    </p>
                  </div>
                  <div className="space-y-2 px-3 py-3 text-xs">
                    <p className="truncate text-muted-foreground">
                      <span className="font-bold text-foreground">To </span>
                      {m.draft.to}
                    </p>
                    <p className="font-bold">{m.draft.subject}</p>
                    <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                      {m.draft.body}
                    </p>
                  </div>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-border p-3">
                    <button className="inline-flex items-center gap-1.5 rounded-sm border border-foreground px-3 py-2 text-xs font-bold">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button className="inline-flex items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
                      <Send className="h-3.5 w-3.5" />
                      Approve and send
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>

      <div className="fixed bottom-[88px] left-1/2 w-full max-w-[420px] -translate-x-1/2 border-t border-border bg-background px-5 py-3 lg:bottom-0 lg:left-[calc(50%+130px)] lg:max-w-[1020px] lg:px-8">
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
          {quickAsks.map((q) => (
            <button
              key={q}
              className="shrink-0 rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
        >
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-border"
            aria-label="Attach"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            placeholder="What's gone wrong?"
            className="min-w-0 rounded-sm border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-foreground text-background"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </PhoneShell>
  );
}
