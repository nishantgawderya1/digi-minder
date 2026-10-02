import { createServerFn } from "@tanstack/react-start";
import { assistantRequestSchema } from "./assistant";

export const askAssistant = createServerFn({ method: "POST" })
  .validator(assistantRequestSchema)
  .handler(async ({ data }) =>
    (await import("./assistant-service.server")).askAssistant(data),
  );
