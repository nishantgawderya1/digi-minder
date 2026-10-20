import { createServerFn } from "@tanstack/react-start";

export const requireCurrentUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getSessionUserId } = await import("@/lib/auth.server");
    return { userId: await getSessionUserId() };
  },
);
