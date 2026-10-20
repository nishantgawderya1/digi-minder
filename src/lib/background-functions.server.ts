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
import {
  prepareEmailPreviews,
  deliverEmailPreview,
} from "./email-preview.server";
import {
  pendingWelcomeUserIds,
  deliverWelcome,
} from "./welcome-delivery.server";

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
    const users = await step.run("find-welcome-emails", pendingWelcomeUserIds);
    if (users.length)
      await step.sendEvent(
        "dispatch-welcome-emails",
        users.map((userId) => ({
          name: "warrantly/welcome.due",
          data: { userId },
        })),
      );
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
export const sendWelcome = inngest.createFunction(
  {
    id: "send-welcome-email",
    triggers: [{ event: "warrantly/welcome.due" }],
    retries: 4,
    concurrency: { limit: 1, key: "event.data.userId" },
  },
  async ({ event, step }) => {
    const userId = z.string().min(1).parse(event.data["userId"]);
    return step.run("deliver-welcome", () => deliverWelcome(userId));
  },
);
export const sendEmailPreviews = inngest.createFunction(
  {
    id: "send-email-previews",
    triggers: [{ event: "warrantly/email.preview" }],
    retries: 4,
    idempotency: "event.data.requestId",
    concurrency: 1,
  },
  async ({ event, step }) => {
    const { requestId, itemId } = z
      .object({ requestId: z.string().uuid(), itemId: z.string().uuid() })
      .parse(event.data);
    const preview = await step.run("prepare-preview", () =>
      prepareEmailPreviews(itemId),
    );
    const welcome = await step.run("send-welcome-preview", () =>
      deliverEmailPreview(
        preview.welcome,
        `warrantly-preview/${requestId}/welcome`,
        preview.preparedAt,
      ),
    );
    const reminder = await step.run("send-reminder-preview", () =>
      deliverEmailPreview(
        preview.reminder,
        `warrantly-preview/${requestId}/reminder`,
        preview.preparedAt,
      ),
    );
    return { welcome, reminder };
  },
);
export const backgroundFunctions = [
  processDocument,
  recoverDispatches,
  scheduleEmails,
  sendReminder,
  sendWelcome,
  sendEmailPreviews,
];
