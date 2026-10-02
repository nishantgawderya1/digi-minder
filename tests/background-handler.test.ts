import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/inngest.server", async () => {
  const { Inngest } = await import("inngest");
  return {
    inngest: new Inngest({
      id: "warrantly",
      isDev: false,
      signingKey: `signkey-test-${"a".repeat(64)}`,
    }),
  };
});
vi.mock("@/lib/background-functions.server", () => ({
  backgroundFunctions: [],
}));
import { Route } from "@/routes/api/inngest";

describe("Hosted worker authentication", () => {
  it.each([false, true])(
    "rejects unsigned or forged execution (forged: %s)",
    async (forged) => {
      const handler = Route.options.server!.handlers!.POST;
      if (typeof handler !== "function")
        throw new Error("Missing worker handler");
      const response = await handler({
        request: new Request(
          "https://warrantly.test/api/inngest?fnId=warrantly-process-document&stepId=step",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "warrantly.test",
              ...(forged
                ? {
                    "x-inngest-signature": `t=${Math.round(Date.now() / 1000)}&s=${"b".repeat(64)}`,
                  }
                : {}),
            },
            body: JSON.stringify({
              event: {
                name: "warrantly/document.queued",
                data: {
                  documentId: "ab096c6d-c5c6-42c7-959a-0f3d46591a4f",
                  generation: 1,
                },
              },
              steps: {},
            }),
          },
        ),
      } as Parameters<typeof handler>[0]);
      expect(response instanceof Response).toBe(true);
      expect((response as Response).status).toBe(401);
    },
  );
});
