import { z } from "zod";

export const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export const assistantRequestSchema = z.object({
  itemId: z.string().uuid().nullable(),
  messages: z
    .array(assistantMessageSchema)
    .min(1)
    .max(10)
    .refine(
      (messages) => messages.at(-1)?.role === "user",
      "End with a question.",
    )
    .refine(
      (messages) =>
        messages.reduce((sum, message) => sum + message.content.length, 0) <=
        20_000,
      "Start a new chat to continue.",
    ),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantReply = {
  answer: string;
  sources: { id: string; name: string }[];
};
