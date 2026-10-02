import { Inngest } from "inngest";

const localJobs = process.env["INNGEST_DEV"] === "1" && !process.env["VERCEL"];
export const inngest = new Inngest({
  id: "warrantly",
  isDev: localJobs,
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(3000),
      ]),
    }),
});
export const backgroundConfigured = () =>
  Boolean(
    (process.env["INNGEST_EVENT_KEY"] && process.env["INNGEST_SIGNING_KEY"]) ||
    localJobs,
  );
