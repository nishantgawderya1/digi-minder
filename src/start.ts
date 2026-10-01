import {
  createStart,
  createCsrfMiddleware,
  createMiddleware,
} from "@tanstack/react-start";
import { clerkMiddleware } from "@clerk/tanstack-react-start/server";

import { renderErrorPage } from "./lib/error-page";

function trustedOrigin(value: string | undefined) {
  if (!value) return undefined;

  try {
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  } catch {
    return undefined;
  }
}

const authorizedParties = [
  trustedOrigin(process.env["APP_BASE_URL"]),
  trustedOrigin(process.env["VERCEL_PROJECT_PRODUCTION_URL"]),
  trustedOrigin(process.env["VERCEL_URL"]),
  ...(process.env["VERCEL"]
    ? []
    : ["http://127.0.0.1:5173", "http://localhost:5173"]),
].filter((origin): origin is string => Boolean(origin));

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [],
  requestMiddleware: [
    ...(process.env["CLERK_SECRET_KEY"]
      ? [
          clerkMiddleware({
            authorizedParties,
          }),
        ]
      : []),
    errorMiddleware,
    csrfMiddleware,
  ],
}));
