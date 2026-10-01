import { createServerFn } from "@tanstack/react-start";

export const requireCurrentUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getAuthenticatedUserId } = await import("@/lib/auth.server");
    return { userId: await getAuthenticatedUserId() };
  },
);
