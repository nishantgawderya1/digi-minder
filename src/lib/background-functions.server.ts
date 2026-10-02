import { z } from "zod";
import { inngest } from "./inngest.server";
import {
  dispatchPendingJobs,
  processingDocument,
  failJob,
} from "./processing.server";
import {
  processPage,
  extractProcessedDocument,
} from "./document-worker.server";
import { dueEmailIds, deliverReminder } from "./reminder-delivery.server";

const documentEvent = z.object({
  documentId: z.string().uuid(),
  generation: z.number().int().positive(),
});
export const processDocument = inngest.createFunction(
  {
    id: "process-document",
    triggers: [{ event: "warrantly/document.queued" }],
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.documentId" }, { limit: 5 }],
    onFailure: async ({ event }) => {
      const data = documentEvent.safeParse(event.data.event.data);
      if (data.success)
        await failJob(data.data.documentId, data.data.generation);
    },
  },
  async ({ event, step }) => {
    const { documentId, generation } = documentEvent.parse(event.data);
    const pageCount = await step.run(
      "load-document",
      async () =>
        (await processingDocument(documentId, generation))?.pageCount ?? 0,
    );
    for (let page = 0; page < pageCount; page++)
      await step.run(`read-page-${page}`, async () => {
        await processPage(documentId, generation, page);
        return { page };
      });
    if (pageCount)
      await step.run("extract-fields", async () => {
        await extractProcessedDocument(documentId, generation);
        return { complete: true };
      });
    return { documentId };
  },
);
export const recoverDispatches = inngest.createFunction(
  {
    id: "recover-document-dispatches",
    triggers: [{ cron: "*/2 * * * *" }],
    concurrency: 1,
  },
  async ({ step }) => step.run("dispatch-queued", dispatchPendingJobs),
);
export const scheduleEmails = inngest.createFunction(
  {
    id: "schedule-reminder-emails",
    triggers: [{ cron: "*/5 * * * *" }],
    concurrency: 1,
  },
  async ({ step }) => {
    const ids = await step.run("find-due", dueEmailIds);
    if (ids.length)
      await step.sendEvent(
        "dispatch-emails",
        ids.map((id) => ({ name: "warrantly/reminder.due", data: { id } })),
      );
    return { count: ids.length };
  },
);
export const sendReminder = inngest.createFunction(
  {
    id: "send-reminder-email",
    triggers: [{ event: "warrantly/reminder.due" }],
    retries: 4,
    concurrency: { limit: 1, key: "event.data.id" },
  },
  async ({ event, step }) => {
    const id = z.string().uuid().parse(event.data["id"]);
    return step.run("deliver-email", () => deliverReminder(id));
  },
);
export const backgroundFunctions = [
  processDocument,
  recoverDispatches,
  scheduleEmails,
  sendReminder,
];
