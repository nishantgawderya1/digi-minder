import type { AssistantRequest } from "@/lib/assistant";

export async function askAssistant({ data }: { data: AssistantRequest }) {
  sessionStorage.setItem("test-chat-request", JSON.stringify(data));
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (sessionStorage.getItem("chat-unavailable") === "true")
    return {
      ok: false as const,
      error: "NVIDIA assistant timed out. Please retry shortly.",
    };
  const { bills } = JSON.parse(sessionStorage.getItem("test-vault")!);
  const bill = bills.find(
    (bill: { id: string }) => !data.itemId || bill.id === data.itemId,
  );
  return {
    ok: true as const,
    data: {
      answer:
        "The recorded price is INR 120.00. No warranty end date is recorded.",
      sources: [{ id: bill.id, name: bill.name }],
    },
  };
}
