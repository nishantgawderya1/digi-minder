import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest } from "@/lib/inngest.server";
import { backgroundFunctions } from "@/lib/background-functions.server";

const handler = serve({ client: inngest, functions: backgroundFunctions });
export const Route = createFileRoute("/api/inngest")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
      PUT: ({ request }) => handler(request),
    },
  },
});
