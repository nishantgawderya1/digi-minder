import { auth } from "@clerk/tanstack-react-start/server";
import { redirect } from "@tanstack/react-router";
import { getDatabase } from "@/db/index.server";
import { appUsers } from "@/db/schema";

export async function getAuthenticatedUserId() {
  if (
    !process.env["CLERK_SECRET_KEY"] ||
    !process.env["VITE_CLERK_PUBLISHABLE_KEY"]
  ) {
    throw redirect({ to: "/auth" });
  }

  const { userId } = await auth();
  if (!userId) throw redirect({ to: "/auth" });

  await getDatabase()
    .insert(appUsers)
    .values({ id: userId })
    .onConflictDoNothing({ target: appUsers.id });

  return userId;
}
